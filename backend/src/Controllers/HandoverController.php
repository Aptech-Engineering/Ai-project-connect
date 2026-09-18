<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Activity;
use App\Core\Auth;
use App\Core\Database;
use App\Core\HttpError;
use App\Core\Notifier;
use App\Core\Request;
use App\Core\Response;
use App\Core\Validator;
use App\Support\Projects;
use App\Support\SiteContent;
use App\Support\Stages;

/**
 * Delivery handover (build journey step 7): the team completes a checklist,
 * requests sign-off, and the client signs and picks a support plan, which marks the project delivered.
 */
final class HandoverController
{
    public const DEFAULT_ITEMS = [
        'Source code and repository access handed over',
        'Admin logins and passwords shared securely',
        'Hosting, domain and app store accounts transferred',
        'User guide and documentation delivered',
        'Training session with your team completed',
    ];

    public static function addItems(Request $r): void
    {
        $user = Auth::requireStaff(['admin', 'lead', 'engineer']);
        $project = Projects::forStaff($r->params['code'], $user);
        self::assertNotSigned($project);
        $data = Validator::validate($r->input(), [
            'title' => 'nullable|string|min:3|max:160',
            'useDefaults' => 'nullable|bool',
        ]);
        $titles = !empty($data['useDefaults']) ? self::DEFAULT_ITEMS : (isset($data['title']) ? [$data['title']] : []);
        if ($titles === []) {
            throw HttpError::validation(['title' => 'Enter a checklist item.']);
        }
        $existing = array_column(Database::all('SELECT title FROM handover_items WHERE project_id = ?', [(int) $project['id']]), 'title');
        $sort = (int) Database::value('SELECT COALESCE(MAX(sort_order), 0) FROM handover_items WHERE project_id = ?', [(int) $project['id']]);
        $added = 0;
        foreach ($titles as $title) {
            if (in_array($title, $existing, true)) {
                continue;
            }
            Database::insert('handover_items', ['project_id' => (int) $project['id'], 'title' => $title, 'sort_order' => ++$sort]);
            $added++;
        }
        Activity::staff($user, "Added {$added} handover checklist item" . ($added === 1 ? '' : 's'), (int) $project['id']);
        Response::json(['added' => $added], 201);
    }

    public static function updateItem(Request $r): void
    {
        $user = Auth::requireStaff(['admin', 'lead', 'engineer']);
        [$item, $project] = self::itemWithProject((int) $r->params['id'], $user);
        self::assertNotSigned($project);
        $data = Validator::validate($r->input(), ['done' => 'required|bool']);
        Database::update('handover_items', [
            'done_at' => $data['done'] ? ($item['done_at'] ?? date('Y-m-d H:i:s')) : null,
            'done_by' => $data['done'] ? $user['name'] : null,
        ], ['id' => (int) $item['id']]);
        Activity::staff($user, ($data['done'] ? 'Completed' : 'Reopened') . " handover item \"{$item['title']}\"", (int) $project['id']);
        Response::json(['id' => (int) $item['id'], 'done' => $data['done']]);
    }

    public static function deleteItem(Request $r): void
    {
        $user = Auth::requireStaff(['admin', 'lead']);
        [$item, $project] = self::itemWithProject((int) $r->params['id'], $user);
        Projects::requireLeadOf($project, $user);
        self::assertNotSigned($project);
        Database::run('DELETE FROM handover_items WHERE id = ?', [(int) $item['id']]);
        Response::noContent();
    }

    public static function requestSignOff(Request $r): void
    {
        $user = Auth::requireStaff(['admin', 'lead']);
        $project = Projects::forStaff($r->params['code'], $user);
        Projects::requireLeadOf($project, $user);
        self::assertNotSigned($project);
        if (!in_array($project['stage'], ['DEPLOYMENT', 'DELIVERED'], true)) {
            throw HttpError::badRequest('Move the project to Deployment before requesting handover sign-off.');
        }
        $counts = Database::one('SELECT COUNT(*) AS total, SUM(done_at IS NOT NULL) AS done FROM handover_items WHERE project_id = ?', [(int) $project['id']]);
        if ((int) $counts['total'] === 0 || (int) $counts['done'] < (int) $counts['total']) {
            throw HttpError::badRequest('Complete every handover checklist item first.');
        }
        Database::update('projects', ['handover_requested_at' => date('Y-m-d H:i:s')], ['id' => (int) $project['id']]);
        Activity::staff($user, 'Requested handover sign-off from the client', (int) $project['id']);
        Notifier::client(Projects::client($project), "Your product is ready for handover: {$project['title']}", "Everything on the handover checklist is done. Sign in with your Project ID {$project['code']} to review it, choose a support plan and sign off.", (int) $project['id']);
        Response::json(['requestedAt' => date('c')]);
    }

    public static function clientSign(Request $r): void
    {
        $clientId = Auth::requireClient();
        $project = Projects::forClient($r->params['code'], $clientId);
        if (!$project['handover_requested_at']) {
            throw HttpError::badRequest('Your team has not requested handover sign-off yet.');
        }
        self::assertNotSigned($project);
        $plans = array_column(SiteContent::get()['supportPlans']['plans'] ?? [], 'name', 'id');
        $data = Validator::validate($r->input(), [
            'name' => 'required|string|min:2|max:120',
            'supportPlan' => 'required|string|max:80',
            'agree' => 'required|bool',
        ]);
        if (!$data['agree']) {
            throw HttpError::validation(['agree' => 'Please confirm you have received everything on the checklist.']);
        }
        if (!isset($plans[$data['supportPlan']])) {
            throw HttpError::validation(['supportPlan' => 'Choose a support plan.']);
        }

        $client = Projects::client($project);
        $now = date('Y-m-d H:i:s');
        Database::transaction(static function () use ($project, $data, $client, $now, $plans) {
            Database::update('projects', [
                'handover_signed_at' => $now,
                'handover_signed_name' => $data['name'],
                'support_plan' => $data['supportPlan'],
            ], ['id' => (int) $project['id']]);
            Activity::client($client, "Signed off the handover as {$data['name']} and chose the {$plans[$data['supportPlan']]} support plan", (int) $project['id']);
            if ($project['stage'] !== 'DELIVERED') {
                Projects::markDelivered($project, "Handover signed by {$data['name']}");
            }
        });

        if ($lead = Projects::lead($project)) {
            Notifier::staff($lead['email'], "Handover signed: {$project['title']}", "{$data['name']} signed off the handover and chose the {$plans[$data['supportPlan']]} support plan. The project is now delivered.", (int) $project['id']);
        }
        Response::json(['signedAt' => date('c', strtotime($now)), 'supportPlan' => $data['supportPlan'], 'stage' => 'DELIVERED']);
    }

    /* ---------------- helpers ---------------- */

    private static function assertNotSigned(array $project): void
    {
        if ($project['handover_signed_at']) {
            throw HttpError::badRequest('The handover has already been signed.');
        }
    }

    /** @return array{0: array, 1: array} */
    private static function itemWithProject(int $id, array $user): array
    {
        $item = Database::one('SELECT h.*, p.code FROM handover_items h JOIN projects p ON p.id = h.project_id WHERE h.id = ?', [$id]);
        if ($item === null) {
            throw HttpError::notFound('Checklist item not found.');
        }
        return [$item, Projects::forStaff($item['code'], $user)];
    }

    public static function present(array $project): array
    {
        $plans = array_column(SiteContent::get()['supportPlans']['plans'] ?? [], 'name', 'id');
        return [
            'requestedAt' => \App\Support\Presenter::iso($project['handover_requested_at']),
            'signedAt' => \App\Support\Presenter::iso($project['handover_signed_at']),
            'signedName' => $project['handover_signed_name'],
            'supportPlan' => $project['support_plan'],
            'supportPlanName' => $project['support_plan'] ? ($plans[$project['support_plan']] ?? $project['support_plan']) : null,
            'items' => array_map(static fn ($i) => [
                'id' => (int) $i['id'],
                'title' => $i['title'],
                'doneAt' => \App\Support\Presenter::iso($i['done_at']),
                'doneBy' => $i['done_by'],
            ], Database::all('SELECT * FROM handover_items WHERE project_id = ? ORDER BY sort_order, id', [(int) $project['id']])),
            'stageLabel' => Stages::label($project['stage']),
        ];
    }
}
