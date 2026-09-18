<?php

declare(strict_types=1);

namespace App\Analytics\Screens;

use App\Analytics\Blocks;
use App\Analytics\Period;
use App\Analytics\Where;
use App\Core\Database;
use App\Core\HttpError;
use App\Core\Request;

/**
 * Funnels (spec 4.4): every step counts unique people — visitors (browser tracking) or applications/leads
 * (database). A unit counts at a step only if it also reached every earlier step of the same kind.
 * When a funnel switches from visitors to database records (courses), the two parts cannot be linked
 * (tracking never stores who a visitor is), so each part is sequential on its own.
 */
final class Funnels extends Screen
{
    public const FILTERS = ['source', 'medium', 'campaign', 'device', 'country', 'state', 'category'];
    public const DEFINITIONS = ['funnel.application', 'funnel.sales', 'funnel.portal', 'funnel.courses'];
    public const IDS = ['application', 'sales', 'portal', 'courses'];

    private const LABELS = [
        'application' => ['visited' => 'Visited', 'form_opened' => 'Opened idea form', 'draft_saved' => 'Draft saved', 'reached_payment' => 'Reached payment', 'fee_paid' => 'Fee paid or transfer reported', 'submitted' => 'Submitted'],
        'sales' => ['submitted' => 'Submitted', 'reviewed' => 'Reviewed', 'quote_sent' => 'Quote sent', 'quote_accepted' => 'Quote accepted', 'project_started' => 'Project started', 'delivered' => 'Delivered'],
        'portal' => ['tracker_search' => 'Tracker search', 'code_requested' => 'Code requested', 'code_verified' => 'Code verified (signed in)', 'returned' => 'Returned within 30 days'],
        'courses' => ['course_viewed' => 'Course viewed', 'course_clicked' => 'Course clicked', 'enquiry' => 'Enquiry / request', 'contacted' => 'Contacted', 'enrolled' => 'Enrolled'],
    ];

    /** Which `by` dimensions each funnel supports. */
    private const BY = [
        'application' => ['source', 'device'],
        'sales' => ['source', 'category'],
        'portal' => ['source', 'device'],
        'courses' => ['source', 'device', 'category'],
    ];

    public static function data(Period $p, array $viewer, Request $r): array
    {
        $id = $r->params['id'] ?? 'application';
        if (!in_array($id, self::IDS, true)) {
            throw HttpError::notFound('Unknown funnel. Use application, sales, portal or courses.');
        }
        $by = $r->query('by') ?: 'source';
        if (!in_array($by, ['source', 'device', 'category'], true)) {
            throw HttpError::validation(['by' => 'Use source, device or category.']);
        }
        $segments = match ($id) {
            'application' => self::application($p),
            'sales' => self::sales($p),
            'portal' => self::portal($p),
            'courses' => self::courses($p),
        };
        $result = self::evaluate($segments, self::LABELS[$id], in_array($by, self::BY[$id], true) ? $by : null);
        $result['funnel'] = $id;
        $result['by'] = $by;
        $result['notes'] = self::notes($id, $by);
        return $result;
    }

    /* ---------------- funnel definitions ---------------- */

    /** @return list<array{steps:list<string>, units:list<array{t:list<?string>, dims:array}>}> */
    private static function application(Period $p): array
    {
        [$w, $params] = Where::forEvents($p);
        $rows = Database::all(
            "SELECT e.visitor_id,
                    MIN(e.occurred_at) AS t0,
                    MIN(CASE WHEN e.event = 'idea_form' AND e.name = 'opened' THEN e.occurred_at END) AS t1,
                    MIN(CASE WHEN e.event = 'idea_form' AND e.name = 'draft_saved' THEN e.occurred_at END) AS t2,
                    MIN(CASE WHEN (e.event = 'idea_form' AND e.name = 'payment') OR (e.event = 'payment' AND e.name = 'started') THEN e.occurred_at END) AS t3,
                    MIN(CASE WHEN e.event = 'payment' AND e.name IN ('returned_success', 'transfer_reported') THEN e.occurred_at END) AS t4,
                    MIN(CASE WHEN e.event = 'idea_form' AND e.name = 'submitted' THEN e.occurred_at END) AS t5,
                    SUBSTRING_INDEX(GROUP_CONCAT(COALESCE(e.source, '') ORDER BY e.occurred_at SEPARATOR '|'), '|', 1) AS source,
                    SUBSTRING_INDEX(GROUP_CONCAT(COALESCE(e.device, '') ORDER BY e.occurred_at SEPARATOR '|'), '|', 1) AS device
             FROM analytics_events e WHERE {$w} GROUP BY e.visitor_id",
            $params,
        );
        return [['steps' => ['visited', 'form_opened', 'draft_saved', 'reached_payment', 'fee_paid', 'submitted'], 'units' => self::units($rows, 6, ['source', 'device']), 'dims' => ['source', 'device']]];
    }

    private static function sales(Period $p): array
    {
        $sql = "SELECT i.submitted_at AS t0, i.status, i.category, i.source, i.project_id, qa.first_quote, qa.accepted_at,
                       pr.created_at AS project_created, pr.start_date, pr.delivered_at
                FROM ideas i
                LEFT JOIN (SELECT idea_id, MIN(created_at) AS first_quote, MIN(CASE WHEN status = 'accepted' THEN responded_at END) AS accepted_at FROM quotes GROUP BY idea_id) qa ON qa.idea_id = i.id
                LEFT JOIN projects pr ON pr.id = i.project_id
                WHERE i.status <> 'DRAFT' AND i.submitted_at >= ? AND i.submitted_at < ?";
        $params = [$p->start(), $p->endExclusive()];
        if (isset($p->filters['category'])) {
            $sql .= ' AND i.category = ?';
            $params[] = $p->filters['category'];
        }
        $today = date('Y-m-d');
        $units = [];
        foreach (Database::all($sql, $params) as $r) {
            $reviewed = $r['status'] !== 'NEW' || $r['first_quote'] !== null || $r['project_id'] !== null;
            // Staff can mark an idea "quote sent" without a quote record; that counts, but has no time for the median.
            $quoteByStatus = $r['first_quote'] === null && in_array($r['status'], ['QUOTE_SENT', 'ACCEPTED'], true);
            $quoted = $r['first_quote'] ?? ($quoteByStatus || $r['project_id'] !== null ? $r['t0'] : null);
            $accepted = $r['accepted_at'] ?? ($r['project_id'] !== null ? $r['project_created'] : null);
            $started = $r['project_id'] !== null && $r['start_date'] !== null && $r['start_date'] <= $today ? $r['start_date'] . ' 00:00:00' : null;
            $units[] = [
                // Review has no timestamp, so it borrows the submission time and quote timing is measured from submission.
                't' => [$r['t0'], $reviewed ? $r['t0'] : null, $quoted, $accepted, $started, $r['delivered_at']],
                'dims' => ['source' => $r['source'], 'category' => $r['category']],
                'untimed' => $r['first_quote'] === null ? [2, 3] : [],
            ];
        }
        return [['steps' => ['submitted', 'reviewed', 'quote_sent', 'quote_accepted', 'project_started', 'delivered'], 'units' => $units, 'dims' => ['source', 'category'], 'noMedian' => ['reviewed']]];
    }

    private static function portal(Period $p): array
    {
        [$w, $params] = Where::forEvents($p);
        $rows = Database::all(
            "SELECT e.visitor_id,
                    MIN(CASE WHEN e.event = 'tracker_search' THEN e.occurred_at END) AS t0,
                    MIN(CASE WHEN e.event = 'portal_signin' AND e.name = 'code_requested' THEN e.occurred_at END) AS t1,
                    MIN(CASE WHEN e.event = 'portal_signin' AND e.name = 'verified' THEN e.occurred_at END) AS t2,
                    SUBSTRING_INDEX(GROUP_CONCAT(COALESCE(e.source, '') ORDER BY e.occurred_at SEPARATOR '|'), '|', 1) AS source,
                    SUBSTRING_INDEX(GROUP_CONCAT(COALESCE(e.device, '') ORDER BY e.occurred_at SEPARATOR '|'), '|', 1) AS device
             FROM analytics_events e WHERE {$w} AND e.event IN ('tracker_search', 'portal_signin') GROUP BY e.visitor_id",
            $params,
        );
        // Returned: a later session by the same visitor within 30 days of first signing in (looks past the range end).
        $internal = $p->includeInternal ? '' : ' AND s.internal = 0';
        $returned = array_column(Database::all(
            "SELECT v.visitor_id, MIN(s.started_at) AS t3 FROM (
                 SELECT e.visitor_id, MIN(e.occurred_at) AS t2 FROM analytics_events e
                 WHERE {$w} AND e.event = 'portal_signin' AND e.name = 'verified' GROUP BY e.visitor_id
             ) v JOIN analytics_sessions s ON s.visitor_id = v.visitor_id AND s.started_at > v.t2 AND s.started_at <= DATE_ADD(v.t2, INTERVAL 30 DAY){$internal}
             GROUP BY v.visitor_id",
            $params,
        ), 't3', 'visitor_id');
        foreach ($rows as &$row) {
            $row['t3'] = $returned[$row['visitor_id']] ?? null;
        }
        unset($row);
        return [['steps' => ['tracker_search', 'code_requested', 'code_verified', 'returned'], 'units' => self::units($rows, 4, ['source', 'device']), 'dims' => ['source', 'device']]];
    }

    private static function courses(Period $p): array
    {
        [$w, $params] = Where::forEvents($p);
        $visitorRows = Database::all(
            "SELECT e.visitor_id,
                    MIN(CASE WHEN e.event = 'course_view' THEN e.occurred_at END) AS t0,
                    MIN(CASE WHEN e.event = 'course_click' THEN e.occurred_at END) AS t1,
                    SUBSTRING_INDEX(GROUP_CONCAT(COALESCE(e.source, '') ORDER BY e.occurred_at SEPARATOR '|'), '|', 1) AS source,
                    SUBSTRING_INDEX(GROUP_CONCAT(COALESCE(e.device, '') ORDER BY e.occurred_at SEPARATOR '|'), '|', 1) AS device,
                    SUBSTRING_INDEX(GROUP_CONCAT(e.name ORDER BY e.occurred_at SEPARATOR '|'), '|', 1) AS category
             FROM analytics_events e WHERE {$w} AND e.event IN ('course_view', 'course_click') GROUP BY e.visitor_id",
            $params,
        );
        $leadSql = 'SELECT l.created_at AS t0, l.contacted_at AS t1, l.enrolled_at AS t2, l.source, l.course_id AS category FROM leads l WHERE l.created_at >= ? AND l.created_at < ?';
        $leadRows = Database::all($leadSql, [$p->start(), $p->endExclusive()]);
        return [
            ['steps' => ['course_viewed', 'course_clicked'], 'units' => self::units($visitorRows, 2, ['source', 'device', 'category']), 'dims' => ['source', 'device', 'category']],
            ['steps' => ['enquiry', 'contacted', 'enrolled'], 'units' => self::units($leadRows, 3, ['source', 'category']), 'dims' => ['source', 'category']],
        ];
    }

    /* ---------------- engine ---------------- */

    /** @return list<array{t:list<?string>, dims:array}> */
    private static function units(array $rows, int $steps, array $dims): array
    {
        $out = [];
        foreach ($rows as $r) {
            $t = [];
            for ($i = 0; $i < $steps; $i++) {
                $t[] = $r['t' . $i] ?? null;
            }
            $d = [];
            foreach ($dims as $dim) {
                $d[$dim] = isset($r[$dim]) && $r[$dim] !== '' ? (string) $r[$dim] : '(unknown)';
            }
            $out[] = ['t' => $t, 'dims' => $d];
        }
        return $out;
    }

    private static function evaluate(array $segments, array $labels, ?string $by): array
    {
        $counts = [];
        $medians = [];
        $keys = [];
        foreach ($segments as $seg) {
            foreach ($seg['steps'] as $k => $key) {
                $keys[] = $key;
                $n = 0;
                $diffs = [];
                foreach ($seg['units'] as $u) {
                    if (!self::reached($u['t'], $k)) {
                        continue;
                    }
                    $n++;
                    if ($k > 0 && !in_array($k, $u['untimed'] ?? [], true)) {
                        $diffs[] = max(0, strtotime((string) $u['t'][$k]) - strtotime((string) $u['t'][$k - 1]));
                    }
                }
                $counts[$key] = $n;
                $medians[$key] = $k > 0 && !in_array($key, $seg['noMedian'] ?? [], true) ? Blocks::median($diffs) : null;
            }
        }

        $steps = [];
        $start = $counts[$keys[0]];
        foreach ($keys as $i => $key) {
            $steps[] = Blocks::step($key, $labels[$key], $counts[$key], $i > 0 ? $counts[$keys[$i - 1]] : null, $start, $medians[$key]);
        }

        $breakdown = [];
        if ($by !== null) {
            $groups = [];
            foreach ($segments as $s => $seg) {
                if (!in_array($by, $seg['dims'], true)) {
                    continue;
                }
                foreach ($seg['units'] as $u) {
                    $groups[$u['dims'][$by] ?? '(unknown)'][$s][] = $u;
                }
            }
            foreach ($groups as $value => $bySegment) {
                $row = [];
                $first = null;
                $prevCount = null;
                foreach ($segments as $s => $seg) {
                    $applies = in_array($by, $seg['dims'], true);
                    foreach ($seg['steps'] as $k => $key) {
                        if (!$applies) {
                            $row[] = ['key' => $key, 'label' => $labels[$key], 'count' => null, 'fromPrevious' => null, 'fromStart' => null, 'medianSecondsFromPrevious' => null];
                            $prevCount = null;
                            continue;
                        }
                        $n = 0;
                        foreach ($bySegment[$s] ?? [] as $u) {
                            $n += self::reached($u['t'], $k) ? 1 : 0;
                        }
                        $first ??= $n;
                        $row[] = Blocks::step($key, $labels[$key], $n, $prevCount, (int) $first);
                        $prevCount = $n;
                    }
                }
                $breakdown[] = ['key' => (string) $value, 'label' => $by === 'source' ? Traffic::label('source', (string) $value) : Blocks::label((string) $value), 'steps' => $row];
            }
            usort($breakdown, static fn ($a, $b) => ($b['steps'][0]['count'] ?? 0) <=> ($a['steps'][0]['count'] ?? 0));
        }

        return ['steps' => $steps, 'overall' => $start ? round($counts[$keys[count($keys) - 1]] / $start, 4) : null, 'breakdown' => $breakdown];
    }

    /** Sequential: step k is reached only when steps 0..k all have a time. */
    private static function reached(array $t, int $k): bool
    {
        for ($i = 0; $i <= $k; $i++) {
            if ($t[$i] === null) {
                return false;
            }
        }
        return true;
    }

    /** @return list<string> */
    private static function notes(string $id, string $by): array
    {
        $notes = [];
        if (!in_array($by, self::BY[$id], true)) {
            $notes[] = "The {$id} funnel can't be broken down by {$by}.";
        }
        if ($id === 'courses') {
            $notes[] = 'Course viewed and clicked count visitors (browser tracking); enquiry, contacted and enrolled count course leads created in the range. The two parts cannot be linked.';
            if ($by === 'source') {
                $notes[] = 'For leads, source is where the lead came from (portal, website, invite).';
            }
        }
        if ($id === 'sales') {
            $notes[] = 'Ideas have no review timestamp, so "Quote sent" timing is measured from submission.';
        }
        if ($id === 'portal') {
            $notes[] = '"Returned within 30 days" looks at visits after the range end, so recent sign-ins may still return.';
        }
        return $notes;
    }
}
