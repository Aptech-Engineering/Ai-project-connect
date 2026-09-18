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
use App\Support\Presenter;
use App\Support\Wallet;

/** Ideas inbox: admins and project leads review submissions; admins register them (AD-07). */
final class IdeasController
{
    private const STATUSES = 'DRAFT,NEW,REVIEWING,QUOTE_SENT,ACCEPTED,DECLINED';

    /**
     * Drafts (unsubmitted applications) are hidden unless an admin asks for ?status=DRAFT or ?includeDrafts=1.
     * ?payment=UNPAID|PENDING|AWAITING_CONFIRMATION|PAID|FAILED filters by the current commitment fee status.
     */
    public static function index(Request $r): void
    {
        $user = Auth::requireStaff(['admin', 'lead']);
        $sql = 'SELECT i.*, p.code AS project_code FROM ideas i LEFT JOIN projects p ON p.id = i.project_id WHERE 1 = 1';
        $params = [];
        $status = $r->query('status');
        $wantsDrafts = $status === 'DRAFT' || $r->query('includeDrafts') === '1';
        if ($wantsDrafts && $user['role'] !== 'admin') {
            throw HttpError::forbidden('Only admins can see draft applications.');
        }
        if ($status) {
            if (!in_array($status, explode(',', self::STATUSES), true)) {
                throw HttpError::validation(['status' => 'Unknown status.']);
            }
            $sql .= ' AND i.status = :status';
            $params['status'] = $status;
        } elseif (!$wantsDrafts) {
            $sql .= " AND i.status <> 'DRAFT'";
        }
        if ($q = trim((string) $r->query('q'))) {
            $sql .= ' AND (i.title LIKE :q1 OR i.name LIKE :q2 OR i.ref LIKE :q3 OR i.state LIKE :q4 OR i.country LIKE :q5 OR i.category LIKE :q6)';
            $like = '%' . str_replace(['%', '_'], ['\\%', '\\_'], $q) . '%';
            $params += ['q1' => $like, 'q2' => $like, 'q3' => $like, 'q4' => $like, 'q5' => $like, 'q6' => $like];
        }
        $sql .= ' ORDER BY COALESCE(i.submitted_at, i.created_at) DESC LIMIT 500';
        $ideas = array_map([Presenter::class, 'idea'], Database::all($sql, $params));
        if ($payment = $r->query('payment')) {
            if (!in_array($payment, ['UNPAID', 'PENDING', 'AWAITING_CONFIRMATION', 'PAID', 'FAILED'], true)) {
                throw HttpError::validation(['payment' => 'Unknown payment status.']);
            }
            $ideas = array_values(array_filter($ideas, static fn (array $i) => $i['paymentStatus'] === $payment));
        }
        Response::json($ideas);
    }

    public static function show(Request $r): void
    {
        $user = Auth::requireStaff(['admin', 'lead']);
        Response::json(Presenter::idea(self::findFor((int) $r->params['id'], $user)));
    }

    public static function update(Request $r): void
    {
        $user = Auth::requireStaff(['admin', 'lead']);
        $idea = self::findFor((int) $r->params['id'], $user);
        $data = Validator::validate($r->input(), [
            'status' => 'nullable|in:NEW,REVIEWING,QUOTE_SENT,DECLINED',
            'notes' => 'nullable|string|max:5000',
        ]);
        if ($idea['status'] === 'ACCEPTED' && isset($data['status'])) {
            throw HttpError::badRequest('This idea is already registered as a project.');
        }
        if ($idea['status'] === 'DRAFT' && !empty($data['status'])) {
            throw new HttpError(409, "This application hasn't been submitted yet. The client must finish it and pay the commitment fee first.");
        }
        $payment = Wallet::current((int) $idea['id']);
        if (($data['status'] ?? null) === 'QUOTE_SENT' && $idea['status'] !== 'QUOTE_SENT') {
            Wallet::assertPaid($idea, 'sending a quote');
        }
        if (($data['status'] ?? null) === 'DECLINED' && $idea['status'] !== 'DECLINED' && $payment !== null && $payment['status'] === 'AWAITING_CONFIRMATION') {
            throw new HttpError(409, 'The client reported a bank transfer for the commitment fee. Confirm it or mark it as not received before declining, so any refund is handled.');
        }
        $changes = [];
        if (!empty($data['status'])) {
            $changes['status'] = $data['status'];
        }
        if (array_key_exists('notes', $data)) {
            $changes['notes'] = $data['notes'];
        }
        Database::update('ideas', $changes, ['id' => (int) $idea['id']]);
        if (isset($changes['status']) && $changes['status'] !== $idea['status']) {
            Activity::staff($user, "Marked idea {$idea['ref']} as {$changes['status']}");
            if ($changes['status'] === 'QUOTE_SENT') {
                Notifier::email('client', $idea['email'], "Your proposal for {$idea['title']}", "Hi {$idea['name']},\n\nWe've sent you a proposal and quote for {$idea['title']}. Reply to accept and we'll register your project.\n\nReference: {$idea['ref']}");
            } elseif ($changes['status'] === 'DECLINED') {
                $refund = Wallet::isPaid($payment) ? ' Your commitment fee will be refunded; we will email you when it is on its way.' : '';
                Notifier::email('client', $idea['email'], "About your idea {$idea['title']}", "Hi {$idea['name']},\n\nThank you for sharing {$idea['title']}. We're not able to take it on right now, but we'd love to hear from you again.{$refund}\n\nReference: {$idea['ref']}");
                if ($payment !== null && $payment['status'] === 'PAID') {
                    Wallet::queueRefund($payment, $idea, 'The idea was declined.');
                }
            }
            if ($idea['status'] === 'DECLINED') {
                Wallet::cancelQueuedRefund($idea, $user);
            }
        }
        Response::json(Presenter::idea(self::find((int) $idea['id'])));
    }

    /** Accept & convert: creates (or reuses) the client, registers the project and sends the Project ID. */
    public static function convert(Request $r): void
    {
        $user = Auth::requireStaff(['admin']);
        $idea = self::find((int) $r->params['id']);
        if ($idea['project_id'] !== null) {
            throw HttpError::badRequest('This idea is already registered as a project.');
        }
        if ($idea['status'] === 'DECLINED') {
            throw HttpError::badRequest('Reopen the idea before converting it.');
        }
        if ($idea['status'] === 'DRAFT') {
            throw new HttpError(409, "This application hasn't been submitted yet.");
        }
        Wallet::assertPaid($idea, 'registering it as a project');
        $data = Validator::validate($r->input(), [
            'leadId' => 'required|int',
            'targetDate' => 'required|date',
            'startDate' => 'nullable|date',
        ]);
        $lead = Database::one("SELECT * FROM users WHERE id = ? AND status = 'active' AND role IN ('admin','lead')", [$data['leadId']]);
        if ($lead === null) {
            throw HttpError::validation(['leadId' => 'Choose an active project lead.']);
        }

        $project = \App\Support\Ideas::register($idea, $lead, $data['targetDate'], $data['startDate'] ?? null, $user);

        Response::json(['projectCode' => $project['code'], 'idea' => Presenter::idea(self::find((int) $idea['id']))], 201);
    }

    /** Leads never see unsubmitted drafts. */
    private static function findFor(int $id, array $user): array
    {
        $idea = self::find($id);
        if ($idea['status'] === 'DRAFT' && $user['role'] !== 'admin') {
            throw HttpError::notFound('Idea not found.');
        }
        return $idea;
    }

    public static function find(int $id): array
    {
        $idea = Database::one('SELECT i.*, p.code AS project_code FROM ideas i LEFT JOIN projects p ON p.id = i.project_id WHERE i.id = ?', [$id]);
        if ($idea === null) {
            throw HttpError::notFound('Idea not found.');
        }
        return $idea;
    }
}
