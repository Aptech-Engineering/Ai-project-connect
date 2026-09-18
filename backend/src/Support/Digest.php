<?php

declare(strict_types=1);

namespace App\Support;

use App\Core\Config;
use App\Core\Database;
use App\Core\Notifier;

/** Weekly progress email to clients (NT-04). */
final class Digest
{
    /** @return array{subject: string, body: string, optedOut: bool}|null null when the project gets no digest */
    public static function build(array $project): ?array
    {
        if ($project['stage'] === 'DELIVERED') {
            return null;
        }
        $client = Database::one('SELECT name, email, digest_opt_out FROM clients WHERE id = ?', [(int) $project['client_id']]);
        $id = (int) $project['id'];

        $updates = Database::all(
            "SELECT title, COALESCE(published_at, created_at) AS at FROM updates
             WHERE project_id = ? AND visibility = 'client' AND status = 'published' AND COALESCE(published_at, created_at) >= (NOW() - INTERVAL 7 DAY)
             ORDER BY at DESC LIMIT 10",
            [$id],
        );
        $milestones = Database::all(
            'SELECT title, due_date, needs_client_approval FROM milestones WHERE project_id = ? AND completed_at IS NULL AND due_date <= (CURDATE() + INTERVAL 14 DAY) ORDER BY due_date LIMIT 5',
            [$id],
        );
        $decisions = Database::all("SELECT title FROM change_requests WHERE project_id = ? AND status = 'QUOTED'", [$id]);
        $unread = Database::value("SELECT COUNT(*) FROM messages WHERE project_id = ? AND sender = 'team' AND created_at >= (NOW() - INTERVAL 7 DAY)", [$id]);

        $lines = [];
        $lines[] = "Hi {$client['name']},";
        $lines[] = '';
        $lines[] = "Here's your weekly update on {$project['title']}.";
        $lines[] = '';
        $lines[] = 'Stage: ' . Stages::label($project['stage']) . " · {$project['progress']}% complete";
        $lines[] = $project['stage'] === 'ON_HOLD' && $project['hold_reason'] ? "Paused: {$project['hold_reason']}" : Stages::meaning($project['stage']);
        if ($project['target_date']) {
            $lines[] = 'Target delivery: ' . date('j M Y', (int) strtotime($project['target_date']));
        }
        $lines[] = '';
        $lines[] = $updates ? 'This week:' : 'No new updates this week — your team is heads-down building.';
        foreach ($updates as $u) {
            $lines[] = "\u{2022} " . date('D j M', (int) strtotime($u['at'])) . " \u{2014} " . $u['title'];
        }
        if ($milestones) {
            $lines[] = '';
            $lines[] = 'Coming up:';
            foreach ($milestones as $m) {
                $lines[] = "\u{2022} " . $m['title'] . " \u{2014} due " . date('j M', (int) strtotime($m['due_date'])) . ($m['needs_client_approval'] ? ' (needs your approval)' : '');
            }
        }
        if ($decisions) {
            $lines[] = '';
            $lines[] = 'Waiting for your decision: ' . implode(', ', array_column($decisions, 'title'));
        }
        if ((int) $unread > 0) {
            $lines[] = '';
            $lines[] = "You have {$unread} new message" . ((int) $unread === 1 ? '' : 's') . ' from your team.';
        }
        $lines[] = '';
        $lines[] = "Sign in with your Project ID {$project['code']} at " . Links::portal() . ' to see everything.';
        $lines[] = 'You can turn off these weekly emails in your portal.';

        return [
            'subject' => "Your weekly update: {$project['title']} is " . strtolower(Stages::label($project['stage'])) . " ({$project['progress']}%)",
            'body' => implode("\n", $lines),
            'optedOut' => (bool) $client['digest_opt_out'],
        ];
    }

    /** @return array{sent: int, skipped: int} */
    public static function sendAll(): array
    {
        $sent = 0;
        $skipped = 0;
        foreach (Database::all("SELECT * FROM projects WHERE stage <> 'DELIVERED'") as $project) {
            $digest = self::build($project);
            if ($digest === null || $digest['optedOut']) {
                $skipped++;
                continue;
            }
            $email = (string) Database::value('SELECT email FROM clients WHERE id = ?', [(int) $project['client_id']]);
            Notifier::email('client', $email, $digest['subject'], $digest['body'], (int) $project['id']);
            $sent++;
        }
        return ['sent' => $sent, 'skipped' => $skipped];
    }
}
