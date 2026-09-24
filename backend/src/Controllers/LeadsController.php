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

/** Course leads queue for counsellors and admins (LS-04, LS-05). */
final class LeadsController
{
    private const SELECT = 'SELECT l.*, p.code AS project_code, p.title AS project_title, c.title AS course_title
        FROM leads l LEFT JOIN projects p ON p.id = l.project_id LEFT JOIN courses c ON c.id = l.course_id';

    public static function index(Request $r): void
    {
        Auth::requireStaff(['admin', 'counsellor']);
        $sql = self::SELECT . ' WHERE 1 = 1';
        $params = [];
        if ($status = $r->query('status')) {
            if (!in_array($status, ['NEW', 'CONTACTED', 'ENROLLED', 'NOT_INTERESTED'], true)) {
                throw HttpError::validation(['status' => 'Unknown status.']);
            }
            $sql .= ' AND l.status = :status';
            $params['status'] = $status;
        }
        $sql .= ' ORDER BY l.created_at DESC LIMIT 500';
        $rows = Database::all($sql, $params);
        $byLead = self::messagesFor(array_map(static fn ($row) => (int) $row['id'], $rows));
        $leads = array_map(static fn ($row) => Presenter::lead($row, $byLead[(int) $row['id']] ?? []), $rows);

        $stats = Database::one("SELECT COUNT(*) AS total, SUM(status = 'NEW') AS waiting, SUM(status = 'ENROLLED') AS enrolled FROM leads");
        $byCourse = Database::all(
            "SELECT c.id, c.title, COUNT(l.id) AS leads, SUM(l.status = 'ENROLLED') AS enrolled
             FROM courses c LEFT JOIN leads l ON l.course_id = c.id GROUP BY c.id, c.title HAVING leads > 0 ORDER BY leads DESC",
        );
        Response::json([
            'leads' => $leads,
            'stats' => [
                'total' => (int) $stats['total'],
                'waiting' => (int) $stats['waiting'],
                'enrolled' => (int) $stats['enrolled'],
                'conversionPercent' => (int) $stats['total'] ? (int) round((int) $stats['enrolled'] / (int) $stats['total'] * 100) : 0,
                'byCourse' => array_map(static fn ($c) => ['courseId' => $c['id'], 'title' => $c['title'], 'leads' => (int) $c['leads'], 'enrolled' => (int) $c['enrolled']], $byCourse),
            ],
        ]);
    }

    public static function update(Request $r): void
    {
        $user = Auth::requireStaff(['admin', 'counsellor']);
        $lead = Database::one('SELECT * FROM leads WHERE id = ?', [(int) $r->params['id']]);
        if ($lead === null) {
            throw HttpError::notFound('Lead not found.');
        }
        $data = Validator::validate($r->input(), [
            'status' => 'nullable|in:NEW,CONTACTED,ENROLLED,NOT_INTERESTED',
            'notes' => 'nullable|string|max:5000',
        ]);
        $changes = [];
        if (!empty($data['status'])) {
            $changes['status'] = $data['status'];
            $changes['counsellor_id'] = (int) $user['id'];
            // For analytics: when the lead was first contacted (first move away from NEW) and when it enrolled.
            // (only once the analytics migration has added these columns)
            if (array_key_exists('contacted_at', $lead) && $data['status'] !== 'NEW' && $lead['contacted_at'] === null) {
                $changes['contacted_at'] = date('Y-m-d H:i:s');
            }
            if (array_key_exists('enrolled_at', $lead) && $data['status'] === 'ENROLLED' && $lead['enrolled_at'] === null) {
                $changes['enrolled_at'] = date('Y-m-d H:i:s');
            }
        }
        if (array_key_exists('notes', $data)) {
            $changes['notes'] = $data['notes'];
        }
        Database::update('leads', $changes, ['id' => (int) $lead['id']]);
        if (isset($changes['status']) && $changes['status'] !== $lead['status']) {
            Activity::staff($user, "Marked course lead #{$lead['id']} ({$lead['client_name']}) as {$changes['status']}");
        }
        Response::json(self::present((int) $lead['id']));
    }

    /**
     * A counsellor emails the person behind the lead (LS-05). The message is kept with
     * the lead so whoever picks it up next sees what was already said, and a lead that
     * was still NEW counts as contacted from here on.
     */
    public static function sendMessage(Request $r): void
    {
        $user = Auth::requireStaff(['admin', 'counsellor']);
        $lead = Database::one('SELECT * FROM leads WHERE id = ?', [(int) $r->params['id']]);
        if ($lead === null) {
            throw HttpError::notFound('Lead not found.');
        }
        $email = trim((string) ($lead['email'] ?? ''));
        if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw HttpError::validation(['email' => 'This lead has no email address, so it can only be reached by phone.']);
        }
        RateLimiter::hit('lead-message:' . $user['id'], 60, 3600);
        $data = Validator::validate($r->input(), [
            'subject' => 'required|string|min:2|max:150',
            'body' => 'required|string|min:2|max:5000',
        ]);

        Notifier::email('lead', $email, $data['subject'], $data['body']);
        $notificationId = Database::value('SELECT id FROM notifications WHERE recipient = ? ORDER BY id DESC LIMIT 1', [$email]);
        Database::insert('lead_messages', [
            'lead_id' => (int) $lead['id'],
            'staff_id' => (int) $user['id'],
            'staff_name' => $user['name'],
            'recipient' => $email,
            'subject' => $data['subject'],
            'body' => $data['body'],
            'notification_id' => $notificationId ? (int) $notificationId : null,
        ]);

        $changes = ['counsellor_id' => (int) $user['id']];
        if ($lead['status'] === 'NEW') {
            $changes['status'] = 'CONTACTED';
            if (array_key_exists('contacted_at', $lead) && $lead['contacted_at'] === null) {
                $changes['contacted_at'] = date('Y-m-d H:i:s');
            }
        }
        Database::update('leads', $changes, ['id' => (int) $lead['id']]);
        Activity::staff($user, "Emailed course lead #{$lead['id']} ({$lead['client_name']}): {$data['subject']}");
        Response::json(self::present((int) $lead['id']), 201);
    }

    /** An admin removes a lead entirely — the follow-ups sent on it go with it. */
    public static function destroy(Request $r): void
    {
        $admin = Auth::requireStaff(['admin']);
        $lead = Database::one('SELECT * FROM leads WHERE id = ?', [(int) $r->params['id']]);
        if ($lead === null) {
            throw HttpError::notFound('Lead not found.');
        }
        Database::run('DELETE FROM leads WHERE id = ?', [(int) $lead['id']]);
        Activity::staff($admin, "Deleted course lead #{$lead['id']} ({$lead['client_name']})");
        Response::noContent();
    }

    private static function present(int $id): array
    {
        return Presenter::lead(Database::one(self::SELECT . ' WHERE l.id = ?', [$id]), self::messagesFor([$id])[$id] ?? []);
    }

    /**
     * Follow-ups for the given leads, oldest first, keyed by lead id.
     *
     * @param list<int> $ids
     * @return array<int, list<array<string, mixed>>>
     */
    private static function messagesFor(array $ids): array
    {
        if ($ids === []) {
            return [];
        }
        $in = implode(',', array_fill(0, count($ids), '?'));
        $rows = Database::all(
            "SELECT m.*, n.status AS delivery FROM lead_messages m
             LEFT JOIN notifications n ON n.id = m.notification_id
             WHERE m.lead_id IN ({$in}) ORDER BY m.created_at",
            $ids,
        );
        $out = [];
        foreach ($rows as $row) {
            $out[(int) $row['lead_id']][] = [
                'id' => (int) $row['id'],
                'at' => Presenter::iso($row['created_at']),
                'by' => $row['staff_name'],
                'to' => $row['recipient'],
                'subject' => $row['subject'],
                'body' => $row['body'],
                // queued / sent / failed / logged — what the outbox did with it
                'delivery' => $row['delivery'] ?? 'queued',
            ];
        }
        return $out;
    }
}
