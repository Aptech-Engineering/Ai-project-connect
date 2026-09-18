<?php

declare(strict_types=1);

namespace App\Support;

use App\Core\Activity;
use App\Core\Auth;
use App\Core\Database;
use App\Core\HttpError;
use App\Core\Notifier;

/** Project lookups, access rules and the actions that notify clients. */
final class Projects
{
    public static function findByCode(string $code): ?array
    {
        return Database::one('SELECT * FROM projects WHERE code = ?', [Codes::normaliseProjectCode($code)]);
    }

    /** A client may only open projects they own. Returns 404 for others so IDs can't be probed. */
    public static function forClient(string $code, int $clientId): array
    {
        $project = self::findByCode($code);
        if ($project === null || (int) $project['client_id'] !== $clientId) {
            throw HttpError::notFound('Project not found.');
        }
        return $project;
    }

    /**
     * Staff access (PRD section 09): admins see every project; leads and engineers see projects
     * they lead or are assigned to; counsellors don't see project status.
     */
    public static function forStaff(string $code, array $user): array
    {
        $project = self::findByCode($code);
        if ($project === null || !self::staffCanView($project, $user)) {
            throw HttpError::notFound('Project not found.');
        }
        return $project;
    }

    public static function staffCanView(array $project, array $user): bool
    {
        if ($user['role'] === 'admin') {
            return true;
        }
        if ($user['role'] === 'counsellor') {
            return false;
        }
        if ((int) $project['lead_id'] === (int) $user['id']) {
            return true;
        }
        return (bool) Database::value('SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?', [(int) $project['id'], (int) $user['id']]);
    }

    /** Admin, or the lead of this project. */
    public static function requireLeadOf(array $project, array $user): void
    {
        if ($user['role'] === 'admin') {
            return;
        }
        if ($user['role'] === 'lead' && (int) $project['lead_id'] === (int) $user['id']) {
            return;
        }
        throw HttpError::forbidden('Only the project lead or an admin can do that.');
    }

    /** SQL fragment + params restricting a project list to what the user may see. */
    public static function visibilityFilter(array $user, string $alias = 'p'): array
    {
        if ($user['role'] === 'admin') {
            return ['1 = 1', []];
        }
        if ($user['role'] === 'counsellor') {
            return ['1 = 0', []];
        }
        return [
            "({$alias}.lead_id = :viewer OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = {$alias}.id AND pm.user_id = :viewer2))",
            ['viewer' => (int) $user['id'], 'viewer2' => (int) $user['id']],
        ];
    }

    public static function client(array $project): array
    {
        return Database::one('SELECT * FROM clients WHERE id = ?', [(int) $project['client_id']]);
    }

    public static function lead(array $project): ?array
    {
        return $project['lead_id'] ? Database::one('SELECT * FROM users WHERE id = ?', [(int) $project['lead_id']]) : null;
    }

    public static function timelineStep(array $project): int
    {
        return $project['stage'] === 'ON_HOLD' ? (int) ($project['paused_at_step'] ?? 0) : Stages::ALL[$project['stage']]['step'];
    }

    public static function portalUrl(): string
    {
        return Links::portal();
    }

    /** Marks a project delivered after the client signs the handover (no staff actor). */
    public static function markDelivered(array $project, string $reason): void
    {
        $now = date('Y-m-d H:i:s');
        Database::update('projects', ['stage' => 'DELIVERED', 'progress' => 100, 'hold_reason' => null, 'paused_at_step' => null, 'delivered_at' => $project['delivered_at'] ?? $now], ['id' => (int) $project['id']]);
        \App\Analytics\StageHistory::record((int) $project['id'], (string) $project['stage'], 'DELIVERED', null, $now);
        $lead = self::lead($project);
        Database::insert('updates', [
            'project_id' => (int) $project['id'],
            'author_id' => $lead ? (int) $lead['id'] : null,
            'author_name' => $lead['name'] ?? 'Aptech team',
            'author_role' => $lead ? Presenter::roleLabel($lead['role']) : 'Team',
            'kind' => 'stage',
            'title' => 'Your product is delivered!',
            'body' => Stages::meaning('DELIVERED'),
            'published_at' => $now,
        ]);
        Activity::system("Changed stage from " . Stages::label($project['stage']) . " to Delivered ({$reason})", (int) $project['id']);
        Notifier::client(self::client($project), "{$project['title']} is delivered", Stages::meaning('DELIVERED'), (int) $project['id']);
    }

    /** Emails + SMS the client about a newly published update (NT-01). */
    public static function announceUpdate(array $project, string $title, string $body): void
    {
        Notifier::client(
            self::client($project),
            "New update on {$project['title']}: {$title}",
            $body . "\n\nSign in with your Project ID {$project['code']} at " . self::portalUrl() . ' to see more.',
            (int) $project['id'],
        );
    }

    /**
     * Changes stage and progress. Every stage change is logged and automatically posts a
     * client-visible update (PRD section 08 rule).
     */
    public static function changeStage(array $project, array $user, string $stage, ?int $progress, ?string $holdReason): array
    {
        Auth::requireStaff();
        self::requireLeadOf($project, $user);
        if ($stage === 'ON_HOLD' && mb_strlen(trim((string) $holdReason)) < 8) {
            throw HttpError::validation(['holdReason' => 'Tell the client why the project is paused.']);
        }

        $stageChanged = $stage !== $project['stage'];
        $newProgress = $progress ?? (int) $project['progress'];
        if ($stageChanged) {
            $newProgress = max($newProgress, Stages::ALL[$stage]['min']);
        }
        if ($stage === 'DELIVERED') {
            $newProgress = 100;
        }
        $newProgress = max(0, min(100, $newProgress));

        return Database::transaction(static function () use ($project, $user, $stage, $stageChanged, $newProgress, $holdReason) {
            $data = [
                'stage' => $stage,
                'progress' => $newProgress,
                'hold_reason' => $stage === 'ON_HOLD' ? trim((string) $holdReason) : null,
                'paused_at_step' => $stage === 'ON_HOLD' ? ($project['stage'] === 'ON_HOLD' ? $project['paused_at_step'] : self::timelineStep($project)) : null,
                'delivered_at' => $stage === 'DELIVERED' ? ($project['delivered_at'] ?? date('Y-m-d H:i:s')) : null,
            ];
            Database::update('projects', $data, ['id' => (int) $project['id']]);

            if ($stageChanged) {
                \App\Analytics\StageHistory::record((int) $project['id'], (string) $project['stage'], $stage, (int) $user['id']);
                $title = $stage === 'ON_HOLD' ? 'Project paused' : 'Stage changed to ' . Stages::label($stage);
                $body = $stage === 'ON_HOLD' ? trim((string) $holdReason) : Stages::meaning($stage);
                Database::insert('updates', [
                    'project_id' => (int) $project['id'],
                    'author_id' => (int) $user['id'],
                    'author_name' => $user['name'],
                    'author_role' => Presenter::roleLabel($user['role']),
                    'kind' => 'stage',
                    'visibility' => 'client',
                    'status' => 'published',
                    'title' => $title,
                    'body' => $body,
                    'published_at' => date('Y-m-d H:i:s'),
                ]);
                Activity::staff($user, sprintf('Changed stage from %s to %s', Stages::label($project['stage']), Stages::label($stage)), (int) $project['id']);
                Notifier::client(self::client($project), "{$project['title']} is now: " . Stages::label($stage), $body, (int) $project['id']);
            }
            if ($newProgress !== (int) $project['progress']) {
                Activity::staff($user, sprintf('Set progress from %d%% to %d%%', $project['progress'], $newProgress), (int) $project['id']);
            }
            return Database::one('SELECT * FROM projects WHERE id = ?', [(int) $project['id']]);
        });
    }
}
