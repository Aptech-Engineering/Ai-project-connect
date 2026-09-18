<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Activity;
use App\Core\Auth;
use App\Core\Database;
use App\Core\HttpError;
use App\Core\Notifier;
use App\Core\RateLimiter;
use App\Core\Request;
use App\Core\Response;
use App\Core\Validator;
use App\Support\Presenter;
use App\Support\Projects;

/**
 * Scope changes (PRD risk: scope creep). Client or team raises a request,
 * the lead quotes the cost/time impact, the client approves or declines.
 */
final class ChangeRequestsController
{
    /* ---------------- client ---------------- */

    public static function clientCreate(Request $r): void
    {
        $clientId = Auth::requireClient();
        $project = Projects::forClient($r->params['code'], $clientId);
        RateLimiter::hit('change-request:' . $clientId, 10, 86400);
        $data = Validator::validate($r->input(), [
            'title' => 'required|string|min:3|max:160',
            'description' => 'required|string|min:10|max:5000',
        ]);
        $client = Projects::client($project);
        $id = Database::insert('change_requests', [
            'project_id' => (int) $project['id'],
            'title' => $data['title'],
            'description' => $data['description'],
            'requested_by' => 'client',
            'requester_name' => $client['name'],
        ]);
        Activity::client($client, "Requested a change: \"{$data['title']}\"", (int) $project['id']);
        if ($lead = Projects::lead($project)) {
            Notifier::staff($lead['email'], "Change request on {$project['title']}: {$data['title']}", $data['description'] . "\n\nReview it and share the cost and time impact in the Engineering Panel.", (int) $project['id']);
        }
        Response::json(self::present(self::find($id)), 201);
    }

    public static function clientRespond(Request $r): void
    {
        $clientId = Auth::requireClient();
        $cr = self::find((int) $r->params['id']);
        $project = Database::one('SELECT * FROM projects WHERE id = ?', [(int) $cr['project_id']]);
        if ($project === null || (int) $project['client_id'] !== $clientId) {
            throw HttpError::notFound('Change request not found.');
        }
        $decision = $r->params['decision'];
        if (!in_array($decision, ['approve', 'decline'], true)) {
            throw HttpError::notFound('Endpoint not found.');
        }
        if ($cr['status'] !== 'QUOTED') {
            throw HttpError::badRequest('This change request is not waiting for your decision.');
        }
        $data = Validator::validate($r->input(), ['note' => 'nullable|string|max:1000']);
        $client = Projects::client($project);
        $now = date('Y-m-d H:i:s');

        Database::transaction(static function () use ($cr, $project, $decision, $data, $client, $now) {
            Database::update('change_requests', [
                'status' => $decision === 'approve' ? 'APPROVED' : 'DECLINED',
                'decided_at' => $now,
                'response_note' => trim(($cr['response_note'] ?? '') . (!empty($data['note']) ? "\n\nClient: {$data['note']}" : '')) ?: null,
            ], ['id' => (int) $cr['id']]);

            if ($decision === 'approve' && (int) $cr['impact_days'] > 0 && $project['target_date']) {
                $newTarget = date('Y-m-d', (int) strtotime($project['target_date'] . ' +' . (int) $cr['impact_days'] . ' days'));
                Database::update('projects', ['target_date' => $newTarget], ['id' => (int) $project['id']]);
                Activity::client($client, "Target delivery moved from {$project['target_date']} to {$newTarget} (change request \"{$cr['title']}\")", (int) $project['id']);
            }
            Activity::client($client, ($decision === 'approve' ? 'Approved' : 'Declined') . " change request \"{$cr['title']}\"", (int) $project['id']);
        });

        if ($lead = Projects::lead($project)) {
            Notifier::staff($lead['email'], "Change request " . ($decision === 'approve' ? 'approved' : 'declined') . ": {$cr['title']}", "{$client['name']} " . ($decision === 'approve' ? 'approved' : 'declined') . " the change on {$project['title']}." . (!empty($data['note']) ? "\n\nNote: {$data['note']}" : ''), (int) $project['id']);
        }
        Response::json(self::present(self::find((int) $cr['id'])));
    }

    /* ---------------- staff ---------------- */

    public static function staffIndex(Request $r): void
    {
        $user = Auth::requireStaff(['admin', 'lead', 'engineer']);
        [$where, $params] = Projects::visibilityFilter($user);
        $sql = "SELECT cr.*, p.code AS project_code, p.title AS project_title FROM change_requests cr JOIN projects p ON p.id = cr.project_id WHERE {$where}";
        if ($status = $r->query('status')) {
            $sql .= ' AND cr.status = :status';
            $params['status'] = $status;
        }
        $sql .= " ORDER BY FIELD(cr.status, 'SUBMITTED','REVIEWING','QUOTED','APPROVED','COMPLETED','DECLINED'), cr.created_at DESC";
        Response::json(array_map(static fn ($c) => self::present($c) + ['projectCode' => $c['project_code'], 'projectTitle' => $c['project_title']], Database::all($sql, $params)));
    }

    public static function staffCreate(Request $r): void
    {
        $user = Auth::requireStaff(['admin', 'lead', 'engineer']);
        $project = Projects::forStaff($r->params['code'], $user);
        $data = Validator::validate($r->input(), [
            'title' => 'required|string|min:3|max:160',
            'description' => 'required|string|min:10|max:5000',
        ]);
        $id = Database::insert('change_requests', [
            'project_id' => (int) $project['id'],
            'title' => $data['title'],
            'description' => $data['description'],
            'requested_by' => 'team',
            'requester_name' => $user['name'],
            'status' => 'REVIEWING',
        ]);
        Activity::staff($user, "Raised change request \"{$data['title']}\"", (int) $project['id']);
        Response::json(self::present(self::find($id)), 201);
    }

    public static function staffUpdate(Request $r): void
    {
        $user = Auth::requireStaff(['admin', 'lead']);
        $cr = self::find((int) $r->params['id']);
        $project = Database::one('SELECT code FROM projects WHERE id = ?', [(int) $cr['project_id']]);
        $project = Projects::forStaff($project['code'], $user);
        Projects::requireLeadOf($project, $user);

        $data = Validator::validate($r->input(), [
            'status' => 'required|in:REVIEWING,QUOTED,DECLINED,COMPLETED',
            'impactCost' => 'nullable|number|between:0,100000000000',
            'impactDays' => 'nullable|int|between:-365,730',
            'currency' => 'nullable|in:NGN,GHS,KES,ZAR,USD,GBP,EUR,INR,AED',
            'responseNote' => 'nullable|string|max:5000',
        ]);
        $allowed = [
            'SUBMITTED' => ['REVIEWING', 'QUOTED', 'DECLINED'],
            'REVIEWING' => ['QUOTED', 'DECLINED'],
            'QUOTED' => ['REVIEWING', 'DECLINED'],
            'APPROVED' => ['COMPLETED'],
            'DECLINED' => ['REVIEWING'],
            'COMPLETED' => [],
        ];
        if (!in_array($data['status'], $allowed[$cr['status']], true)) {
            throw HttpError::badRequest(sprintf("Can't move a %s request to %s.", strtolower($cr['status']), strtolower($data['status'])));
        }
        if ($data['status'] === 'QUOTED' && !isset($data['impactCost']) && !isset($data['impactDays'])) {
            throw HttpError::validation(['impactCost' => 'Add the extra cost, extra days, or both before sending to the client.']);
        }

        $changes = ['status' => $data['status']];
        foreach (['impactCost' => 'impact_cost', 'impactDays' => 'impact_days', 'currency' => 'currency', 'responseNote' => 'response_note'] as $in => $col) {
            if (array_key_exists($in, $data)) {
                $changes[$col] = $data[$in];
            }
        }
        if (in_array($data['status'], ['DECLINED', 'COMPLETED'], true)) {
            $changes['decided_at'] = $cr['decided_at'] ?? date('Y-m-d H:i:s');
        }
        Database::update('change_requests', $changes, ['id' => (int) $cr['id']]);
        Activity::staff($user, "Marked change request \"{$cr['title']}\" as " . strtolower($data['status']), (int) $project['id']);

        $client = Projects::client($project);
        $updated = self::find((int) $cr['id']);
        if ($data['status'] === 'QUOTED') {
            $impact = self::impactText($updated);
            Notifier::client($client, "Your change request needs a decision: {$cr['title']}", "We've reviewed \"{$cr['title']}\" on {$project['title']}.\n\nImpact: {$impact}\n" . (!empty($data['responseNote']) ? "\n{$data['responseNote']}\n" : '') . "\nSign in with your Project ID to approve or decline.", (int) $project['id']);
        } elseif ($data['status'] === 'DECLINED') {
            Notifier::email('client', $client['email'], "Update on your change request: {$cr['title']}", "We're not able to include \"{$cr['title']}\" in {$project['title']} right now." . (!empty($data['responseNote']) ? "\n\n{$data['responseNote']}" : ''), (int) $project['id']);
        } elseif ($data['status'] === 'COMPLETED') {
            Notifier::email('client', $client['email'], "Change completed: {$cr['title']}", "The change \"{$cr['title']}\" is now part of {$project['title']}.", (int) $project['id']);
        }
        Response::json(self::present($updated));
    }

    /* ---------------- helpers ---------------- */

    private static function find(int $id): array
    {
        $cr = Database::one('SELECT * FROM change_requests WHERE id = ?', [$id]);
        if ($cr === null) {
            throw HttpError::notFound('Change request not found.');
        }
        return $cr;
    }

    private static function impactText(array $cr): string
    {
        $parts = [];
        if ($cr['impact_cost'] !== null) {
            $parts[] = $cr['currency'] . ' ' . number_format((float) $cr['impact_cost']) . ' extra';
        }
        if ($cr['impact_days'] !== null) {
            $days = (int) $cr['impact_days'];
            $parts[] = $days === 0 ? 'no change to the delivery date' : ($days > 0 ? "{$days} more days" : abs($days) . ' days sooner');
        }
        return implode(', ', $parts) ?: 'No extra cost or time';
    }

    public static function present(array $c): array
    {
        return [
            'id' => (int) $c['id'],
            'title' => $c['title'],
            'description' => $c['description'],
            'requestedBy' => $c['requested_by'],
            'requesterName' => $c['requester_name'],
            'status' => $c['status'],
            'impactCost' => $c['impact_cost'] !== null ? (float) $c['impact_cost'] : null,
            'impactDays' => $c['impact_days'] !== null ? (int) $c['impact_days'] : null,
            'currency' => $c['currency'],
            'responseNote' => $c['response_note'],
            'createdAt' => Presenter::iso($c['created_at']),
            'decidedAt' => Presenter::iso($c['decided_at']),
        ];
    }
}
