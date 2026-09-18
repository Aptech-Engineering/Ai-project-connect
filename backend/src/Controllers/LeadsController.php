<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Database;
use App\Core\HttpError;
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
        $leads = array_map([Presenter::class, 'lead'], Database::all($sql, $params));

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
            \App\Core\Activity::staff($user, "Marked course lead #{$lead['id']} ({$lead['client_name']}) as {$changes['status']}");
        }
        Response::json(Presenter::lead(Database::one(self::SELECT . ' WHERE l.id = ?', [(int) $lead['id']])));
    }
}
