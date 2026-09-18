<?php

declare(strict_types=1);

namespace App\Analytics\Screens;

use App\Analytics\Blocks;
use App\Analytics\Metrics;
use App\Analytics\Period;
use App\Core\Database;
use App\Core\Request;

/** Courses — does "Learn the stack" turn into enrolments? (spec 4.9) */
final class Courses extends Screen
{
    public const FILTERS = [];
    public const DEFINITIONS = ['courseViews', 'courseClicksDb', 'enquiries', 'enrolled', 'viewToEnrolRate', 'estimatedCourseRevenue', 'timeToFirstContact'];

    public static function data(Period $p, array $viewer, Request $r): array
    {
        $prev = $p->previous();
        $cur = self::values($p);
        $old = $prev ? self::values($prev) : null;
        $admin = self::isAdmin($viewer);
        $kpis = [
            Blocks::kpi('courseViews', $cur['views'], $old['views'] ?? null),
            Blocks::kpi('courseClicksDb', $cur['clicks'], $old['clicks'] ?? null),
            Blocks::kpi('enquiries', $cur['enquiries'], $old['enquiries'] ?? null),
            Blocks::kpi('enrolled', $cur['enrolled'], $old['enrolled'] ?? null),
            Blocks::kpi('viewToEnrolRate', Blocks::ratio($cur['enrolled'], $cur['views']), $old ? Blocks::ratio($old['enrolled'], $old['views']) : null, 'percent'),
        ];
        // Money is admin-only: other viewers see the tile marked as restricted.
        $revenue = Blocks::kpi('estimatedCourseRevenue', self::estimatedRevenue($p), $prev ? self::estimatedRevenue($prev) : null, 'currency', 'estimate');
        $kpis[] = $admin ? $revenue : Blocks::restricted($revenue);

        $range = [$p->start(), $p->endExclusive()];
        $events = Database::all('SELECT course_id, event, COUNT(*) AS n FROM course_events WHERE course_id IS NOT NULL AND created_at >= ? AND created_at < ? GROUP BY course_id, event', $range);
        $leads = Database::all(
            "SELECT course_id, COUNT(*) AS enquiries, COALESCE(SUM(contacted_at IS NOT NULL), 0) AS contacted, COALESCE(SUM(status = 'ENROLLED'), 0) AS enrolled
             FROM leads WHERE course_id IS NOT NULL AND created_at >= ? AND created_at < ? GROUP BY course_id",
            $range,
        );
        $byCourse = [];
        foreach (Database::all('SELECT id, title FROM courses ORDER BY sort_order, title') as $c) {
            $byCourse[$c['id']] = ['courseId' => $c['id'], 'course' => $c['title'], 'views' => 0, 'clicks' => 0, 'enquiries' => 0, 'contacted' => 0, 'enrolled' => 0, 'conversion' => null];
        }
        foreach ($events as $e) {
            if (isset($byCourse[$e['course_id']]) && in_array($e['event'], ['view', 'click'], true)) {
                $byCourse[$e['course_id']][$e['event'] === 'view' ? 'views' : 'clicks'] = (int) $e['n'];
            }
        }
        foreach ($leads as $l) {
            if (isset($byCourse[$l['course_id']])) {
                $byCourse[$l['course_id']]['enquiries'] = (int) $l['enquiries'];
                $byCourse[$l['course_id']]['contacted'] = (int) $l['contacted'];
                $byCourse[$l['course_id']]['enrolled'] = (int) $l['enrolled'];
            }
        }
        foreach ($byCourse as &$row) {
            $row['conversion'] = Blocks::ratio($row['enrolled'], $row['views']);
        }
        unset($row);
        $byCourse = array_values(array_filter($byCourse, static fn ($row) => $row['views'] + $row['clicks'] + $row['enquiries'] > 0));
        usort($byCourse, static fn ($a, $b) => $b['views'] <=> $a['views']);

        $sources = array_map('intval', array_column(Database::all('SELECT source, COUNT(*) AS n FROM leads WHERE created_at >= ? AND created_at < ? GROUP BY source', $range), 'n', 'source'));
        $sources += ['portal' => 0, 'website' => 0, 'invite' => 0];

        return [
            'kpis' => $kpis,
            'byCourse' => $byCourse,
            'bySource' => Blocks::rows($sources, null, [], ['portal' => 'Client Portal', 'website' => 'Website', 'invite' => 'Invite']),
            'counsellors' => self::counsellors($p),
        ];
    }

    private static function values(Period $p): array
    {
        $range = [$p->start(), $p->endExclusive()];
        $e = Database::one("SELECT COALESCE(SUM(event = 'view'), 0) AS views, COALESCE(SUM(event = 'click'), 0) AS clicks FROM course_events WHERE created_at >= ? AND created_at < ?", $range);
        return [
            'views' => (int) $e['views'],
            'clicks' => (int) $e['clicks'],
            'enquiries' => (int) Database::value('SELECT COUNT(*) FROM leads WHERE created_at >= ? AND created_at < ?', $range),
            'enrolled' => (int) Database::value('SELECT COUNT(*) FROM leads WHERE enrolled_at >= ? AND enrolled_at < ?', $range),
        ];
    }

    /** Discounted course price of leads that enrolled in the range (an estimate; paid outside the platform). */
    public static function estimatedRevenue(Period $p): float
    {
        return round((float) Database::value(
            'SELECT COALESCE(SUM(c.price * (100 - COALESCE(c.discount_percent, 0)) / 100), 0)
             FROM leads l JOIN courses c ON c.id = l.course_id WHERE l.enrolled_at >= ? AND l.enrolled_at < ?',
            [$p->start(), $p->endExclusive()],
        ), 2);
    }

    private static function counsellors(Period $p): array
    {
        $rows = Database::all(
            "SELECT u.id, u.name, l.created_at, l.contacted_at, l.status
             FROM leads l JOIN users u ON u.id = l.counsellor_id
             WHERE l.contacted_at >= ? AND l.contacted_at < ?",
            [$p->start(), $p->endExclusive()],
        );
        $people = [];
        foreach ($rows as $row) {
            $id = (int) $row['id'];
            $people[$id] ??= ['name' => $row['name'], 'leadsHandled' => 0, 'waits' => [], 'enrolled' => 0];
            $people[$id]['leadsHandled']++;
            $people[$id]['waits'][] = max(0, strtotime((string) $row['contacted_at']) - strtotime((string) $row['created_at']));
            $people[$id]['enrolled'] += $row['status'] === 'ENROLLED' ? 1 : 0;
        }
        return array_values(array_map(static fn (array $c) => [
            'name' => $c['name'],
            'leadsHandled' => $c['leadsHandled'],
            'medianTimeToFirstContact' => Metrics::medianSeconds($c['waits']),
            'enrolmentRate' => Blocks::ratio($c['enrolled'], $c['leadsHandled']),
        ], $people));
    }
}
