<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Activity;
use App\Core\Auth;
use App\Core\Database;
use App\Core\HttpError;
use App\Core\RateLimiter;
use App\Core\Request;
use App\Core\Response;
use App\Core\Validator;
use App\Support\Codes;
use App\Support\Digest;
use App\Support\Presenter;
use App\Support\Projects;
use App\Support\Stages;

/** Reports (RP-01, LS-05), course funnel tracking, weekly digests (NT-04) and the admin activity log. */
final class ReportsController
{
    public static function reports(Request $r): void
    {
        Auth::requireStaff(['admin']);
        $days = max(7, min(365, (int) ($r->query('days') ?? 90)));

        $byStage = array_column(Database::all('SELECT stage, COUNT(*) AS n FROM projects GROUP BY stage'), 'n', 'stage');
        $stages = array_map(static fn ($key) => ['stage' => $key, 'label' => Stages::label($key), 'count' => (int) ($byStage[$key] ?? 0)], array_keys(Stages::ALL));

        $overdue = array_map(static fn ($p) => [
            'code' => $p['code'], 'title' => $p['title'], 'lead' => $p['lead_name'], 'stage' => $p['stage'],
            'targetDate' => $p['target_date'], 'daysOverdue' => (int) $p['days_overdue'],
        ], Database::all(
            "SELECT p.code, p.title, p.stage, p.target_date, u.name AS lead_name, DATEDIFF(CURDATE(), p.target_date) AS days_overdue
             FROM projects p LEFT JOIN users u ON u.id = p.lead_id
             WHERE p.stage <> 'DELIVERED' AND p.target_date < CURDATE() ORDER BY p.target_date",
        ));
        $overdueMilestones = array_map(static fn ($m) => [
            'code' => $m['code'], 'project' => $m['project'], 'milestone' => $m['title'], 'due' => $m['due_date'], 'daysOverdue' => (int) $m['days_overdue'],
        ], Database::all(
            "SELECT p.code, p.title AS project, m.title, m.due_date, DATEDIFF(CURDATE(), m.due_date) AS days_overdue
             FROM milestones m JOIN projects p ON p.id = m.project_id
             WHERE m.completed_at IS NULL AND m.due_date < CURDATE() AND p.stage <> 'DELIVERED' ORDER BY m.due_date",
        ));

        $updateRows = Database::all(
            "SELECT p.code, p.title, p.stage,
                    (SELECT COUNT(*) FROM updates u WHERE u.project_id = p.id AND u.visibility = 'client' AND u.status = 'published' AND COALESCE(u.published_at, u.created_at) >= (NOW() - INTERVAL 30 DAY)) AS last30,
                    (SELECT MAX(COALESCE(u.published_at, u.created_at)) FROM updates u WHERE u.project_id = p.id AND u.visibility = 'client' AND u.status = 'published') AS last_at
             FROM projects p WHERE p.stage <> 'DELIVERED' ORDER BY p.title",
        );
        $frequency = array_map(static function ($row) {
            $since = $row['last_at'] ? (int) floor((time() - strtotime((string) $row['last_at'])) / 86400) : null;
            return [
                'code' => $row['code'], 'title' => $row['title'], 'stage' => $row['stage'],
                'updatesLast30Days' => (int) $row['last30'],
                'avgDaysBetweenUpdates' => (int) $row['last30'] > 0 ? round(30 / (int) $row['last30'], 1) : null,
                'daysSinceLastUpdate' => $since,
                'stale' => $since === null || $since >= Stages::STALE_DAYS,
            ];
        }, $updateRows);
        $sinceValues = array_filter(array_column($frequency, 'daysSinceLastUpdate'), static fn ($v) => $v !== null);

        $events = Database::all(
            "SELECT course_id, event, COUNT(*) AS n FROM course_events WHERE created_at >= (NOW() - INTERVAL :days DAY) AND course_id IS NOT NULL GROUP BY course_id, event",
            ['days' => $days],
        );
        $leads = Database::all(
            "SELECT course_id, type, status, COUNT(*) AS n FROM leads WHERE created_at >= (NOW() - INTERVAL :days DAY) AND course_id IS NOT NULL GROUP BY course_id, type, status",
            ['days' => $days],
        );
        $courses = [];
        foreach (Database::all('SELECT id, title FROM courses ORDER BY sort_order, title') as $c) {
            $courses[$c['id']] = ['courseId' => $c['id'], 'title' => $c['title'], 'views' => 0, 'clicks' => 0, 'leads' => 0, 'enrolRequests' => 0, 'enrolled' => 0, 'invites' => 0];
        }
        foreach ($events as $e) {
            if (!isset($courses[$e['course_id']])) {
                continue;
            }
            $key = ['view' => 'views', 'click' => 'clicks', 'invite' => 'invites'][$e['event']] ?? null;
            if ($key) {
                $courses[$e['course_id']][$key] += (int) $e['n'];
            }
        }
        foreach ($leads as $l) {
            if (!isset($courses[$l['course_id']])) {
                continue;
            }
            $courses[$l['course_id']]['leads'] += (int) $l['n'];
            if ($l['type'] === 'enrol') {
                $courses[$l['course_id']]['enrolRequests'] += (int) $l['n'];
            }
            if ($l['status'] === 'ENROLLED') {
                $courses[$l['course_id']]['enrolled'] += (int) $l['n'];
            }
        }
        $courseRows = array_values(array_filter($courses, static fn ($c) => $c['views'] + $c['clicks'] + $c['leads'] > 0));
        $totals = ['views' => 0, 'clicks' => 0, 'leads' => 0, 'enrolRequests' => 0, 'enrolled' => 0, 'invites' => 0];
        foreach ($courseRows as $row) {
            foreach ($totals as $k => $_) {
                $totals[$k] += $row[$k];
            }
        }

        $ideas = Database::one(
            "SELECT COUNT(*) AS submitted, SUM(status = 'QUOTE_SENT') AS quoted, SUM(status = 'ACCEPTED') AS accepted, SUM(status = 'DECLINED') AS declined
             FROM ideas WHERE status <> 'DRAFT' AND COALESCE(submitted_at, created_at) >= (NOW() - INTERVAL :days DAY)",
            ['days' => $days],
        );
        $quotes = Database::one("SELECT COUNT(*) AS sent, SUM(status = 'accepted') AS accepted, SUM(CASE WHEN status = 'accepted' THEN amount ELSE 0 END) AS accepted_value FROM quotes WHERE created_at >= (NOW() - INTERVAL :days DAY)", ['days' => $days]);
        $changes = Database::one("SELECT SUM(status IN ('SUBMITTED','REVIEWING','QUOTED')) AS open, SUM(status IN ('APPROVED','COMPLETED')) AS approved, SUM(CASE WHEN status IN ('APPROVED','COMPLETED') THEN COALESCE(impact_cost, 0) ELSE 0 END) AS approved_cost FROM change_requests");
        $rating = Database::one('SELECT AVG(rating_stars) AS avg, COUNT(rating_stars) AS n FROM projects WHERE rating_stars IS NOT NULL');

        Response::json([
            'periodDays' => $days,
            'projects' => [
                'total' => array_sum(array_map('intval', $byStage)),
                'active' => array_sum(array_map('intval', $byStage)) - (int) ($byStage['DELIVERED'] ?? 0),
                'delivered' => (int) ($byStage['DELIVERED'] ?? 0),
                'onHold' => (int) ($byStage['ON_HOLD'] ?? 0),
                'byStage' => $stages,
                'overdue' => $overdue,
                'overdueMilestones' => $overdueMilestones,
            ],
            'updates' => [
                'avgDaysSinceLastUpdate' => $sinceValues ? round(array_sum($sinceValues) / count($sinceValues), 1) : null,
                'staleProjects' => count(array_filter($frequency, static fn ($f) => $f['stale'])),
                'perProject' => $frequency,
            ],
            'courses' => ['totals' => $totals + ['conversionPercent' => $totals['clicks'] ? round($totals['enrolled'] / $totals['clicks'] * 100, 1) : 0], 'byCourse' => $courseRows],
            'ideas' => [
                'submitted' => (int) $ideas['submitted'], 'quoted' => (int) $ideas['quoted'], 'accepted' => (int) $ideas['accepted'], 'declined' => (int) $ideas['declined'],
                'quotesSent' => (int) $quotes['sent'], 'quotesAccepted' => (int) $quotes['accepted'], 'acceptedValue' => (float) $quotes['accepted_value'],
            ],
            'changeRequests' => ['open' => (int) $changes['open'], 'approved' => (int) $changes['approved'], 'approvedCost' => (float) $changes['approved_cost']],
            'satisfaction' => ['averageRating' => $rating['avg'] !== null ? round((float) $rating['avg'], 1) : null, 'ratings' => (int) $rating['n']],
        ]);
    }

    /** Anonymous funnel events from the website and client portal (LS-05). */
    public static function trackCourseEvent(Request $r): void
    {
        RateLimiter::hit('course-event:' . $r->ip(), 200, 600);
        $data = Validator::validate($r->input(), [
            'event' => 'required|in:view,click',
            'courseId' => 'required|string|max:60',
            'techId' => 'nullable|string|max:60',
            'projectCode' => 'nullable|string|max:20',
        ]);
        if (!Database::value('SELECT 1 FROM courses WHERE id = ? AND published = 1', [$data['courseId']])) {
            throw HttpError::notFound('Course not found.');
        }
        $techId = !empty($data['techId']) && Database::value('SELECT 1 FROM technologies WHERE id = ?', [$data['techId']]) ? $data['techId'] : null;
        $projectId = null;
        if (!empty($data['projectCode']) && ($clientId = Auth::clientId())) {
            $project = Projects::findByCode($data['projectCode']);
            $projectId = $project && (int) $project['client_id'] === $clientId ? (int) $project['id'] : null;
        }
        self::recordEvent($data['event'], $data['courseId'], $techId, $projectId);
        Response::noContent();
    }

    public static function recordEvent(string $event, ?string $courseId, ?string $techId = null, ?int $projectId = null): void
    {
        Database::insert('course_events', ['event' => $event, 'course_id' => $courseId, 'technology_id' => $techId, 'project_id' => $projectId]);
    }

    /* ---------------- weekly digest ---------------- */

    public static function digestPreview(Request $r): void
    {
        $user = Auth::requireStaff(['admin', 'lead', 'engineer']);
        $project = Projects::forStaff($r->params['code'], $user);
        $digest = Digest::build($project);
        Response::json($digest ?? ['subject' => null, 'body' => null, 'optedOut' => false, 'skipped' => 'Delivered projects do not get weekly emails.']);
    }

    public static function sendDigests(Request $r): void
    {
        $user = Auth::requireStaff(['admin']);
        RateLimiter::hit('digest-send:' . $user['id'], 3, 3600);
        $result = Digest::sendAll();
        Activity::staff($user, "Sent weekly progress emails ({$result['sent']} sent, {$result['skipped']} skipped)");
        Response::json($result);
    }

    /* ---------------- activity log ---------------- */

    public static function activity(Request $r): void
    {
        Auth::requireStaff(['admin']);
        [$where, $params] = self::activityFilters($r);
        $perPage = 50;
        $page = max(1, (int) ($r->query('page') ?? 1));
        $total = (int) Database::value("SELECT COUNT(*) FROM activity_log a LEFT JOIN projects p ON p.id = a.project_id WHERE {$where}", $params);
        $rows = Database::all(
            "SELECT a.*, p.code AS project_code, p.title AS project_title FROM activity_log a LEFT JOIN projects p ON p.id = a.project_id
             WHERE {$where} ORDER BY a.created_at DESC, a.id DESC LIMIT {$perPage} OFFSET " . (($page - 1) * $perPage),
            $params,
        );
        Response::json([
            'items' => array_map([self::class, 'presentActivity'], $rows),
            'page' => $page,
            'pages' => max(1, (int) ceil($total / $perPage)),
            'total' => $total,
        ]);
    }

    public static function activityCsv(Request $r): void
    {
        Auth::requireStaff(['admin']);
        [$where, $params] = self::activityFilters($r);
        $rows = Database::all(
            "SELECT a.*, p.code AS project_code, p.title AS project_title FROM activity_log a LEFT JOIN projects p ON p.id = a.project_id
             WHERE {$where} ORDER BY a.created_at DESC, a.id DESC LIMIT 10000",
            $params,
        );
        http_response_code(200);
        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="activity-log-' . date('Y-m-d') . '.csv"');
        $out = fopen('php://output', 'wb');
        fputcsv($out, ['Time', 'Actor type', 'Actor', 'Action', 'Project ID', 'Project', 'IP address']);
        foreach ($rows as $row) {
            // Prefix cells that spreadsheets would treat as formulas.
            $safe = static fn ($v) => is_string($v) && preg_match('/^[=+\-@]/', $v) ? "'" . $v : $v;
            fputcsv($out, array_map($safe, [$row['created_at'], $row['actor_type'], $row['actor_name'], $row['action'], $row['project_code'], $row['project_title'], $row['ip_address']]));
        }
        fclose($out);
    }

    /** @return array{0: string, 1: array} */
    private static function activityFilters(Request $r): array
    {
        $where = ['1 = 1'];
        $params = [];
        if ($type = $r->query('actorType')) {
            if (!in_array($type, ['staff', 'client', 'system'], true)) {
                throw HttpError::validation(['actorType' => 'Unknown actor type.']);
            }
            $where[] = 'a.actor_type = :type';
            $params['type'] = $type;
        }
        if ($code = $r->query('projectCode')) {
            $where[] = 'p.code = :code';
            $params['code'] = Codes::normaliseProjectCode($code);
        }
        if ($q = trim((string) $r->query('q'))) {
            $like = '%' . str_replace(['%', '_'], ['\\%', '\\_'], $q) . '%';
            $where[] = '(a.action LIKE :q1 OR a.actor_name LIKE :q2)';
            $params += ['q1' => $like, 'q2' => $like];
        }
        foreach (['from' => '>=', 'to' => '<='] as $key => $op) {
            if ($value = $r->query($key)) {
                if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $value)) {
                    throw HttpError::validation([$key => 'Use YYYY-MM-DD.']);
                }
                $where[] = "DATE(a.created_at) {$op} :{$key}";
                $params[$key] = $value;
            }
        }
        return [implode(' AND ', $where), $params];
    }

    private static function presentActivity(array $a): array
    {
        return [
            'id' => (int) $a['id'],
            'at' => Presenter::iso($a['created_at']),
            'actorType' => $a['actor_type'],
            'actor' => $a['actor_name'],
            'action' => $a['action'],
            'projectCode' => $a['project_code'],
            'projectTitle' => $a['project_title'],
            'ip' => $a['ip_address'],
        ];
    }
}
