<?php

declare(strict_types=1);

namespace App\Analytics\Screens;

use App\Analytics\Blocks;
use App\Analytics\Metrics;
use App\Analytics\Period;
use App\Core\Database;
use App\Core\Request;
use App\Support\Stages;

/** Projects — are we delivering on time? (spec 4.6) */
final class Projects extends Screen
{
    public const FILTERS = ['category'];
    public const DEFINITIONS = ['activeProjects', 'delivered', 'onTimeRate', 'cycleTime', 'timeInStage', 'overdueNow', 'staleProjects', 'updatesPerProject', 'avgClientRating'];
    private const ACTIVE_STAGES = ['APPROVED', 'DESIGN', 'DEVELOPMENT', 'TESTING', 'DEPLOYMENT', 'ON_HOLD'];

    public static function data(Period $p, array $viewer, Request $r): array
    {
        $prev = $p->previous();
        [$cat, $catParams] = self::categoryFilter($p);
        $cur = self::values($p, $cat, $catParams);
        $old = $prev ? self::values($prev, $cat, $catParams) : null;
        $today = date('Y-m-d');

        $overdue = (int) Database::value("SELECT COUNT(*) FROM projects p WHERE p.stage <> 'DELIVERED' AND p.target_date < ?{$cat}", array_merge([$today], $catParams));
        $kpis = [
            Blocks::kpi('activeProjects', $cur['active'], $old['active'] ?? null),
            Blocks::kpi('delivered', $cur['delivered'], $old['delivered'] ?? null),
            Blocks::kpi('onTimeRate', $cur['onTime'], $old['onTime'] ?? null, 'percent'),
            Blocks::kpi('cycleTime', $cur['cycle'], $old['cycle'] ?? null, 'duration'),
            Blocks::kpi('overdueNow', $overdue, null),
            Blocks::kpi('avgClientRating', $cur['rating'], $old['rating'] ?? null),
        ];

        $byStage = array_fill_keys(self::ACTIVE_STAGES, 0);
        foreach (Database::all("SELECT p.stage, COUNT(*) AS n FROM projects p WHERE p.stage <> 'DELIVERED'{$cat} GROUP BY p.stage", $catParams) as $row) {
            if (isset($byStage[$row['stage']])) {
                $byStage[$row['stage']] = (int) $row['n'];
            }
        }
        $stageRows = [];
        foreach ($byStage as $stage => $n) {
            $stageRows[] = ['key' => $stage, 'label' => Stages::label($stage), 'value' => $n];
        }

        return [
            'kpis' => $kpis,
            'byStage' => $stageRows,
            'timeInStage' => self::timeInStage($p, $cat, $catParams),
            'deliveryVsTarget' => array_map(static fn (array $row) => [
                'code' => $row['code'], 'title' => $row['title'],
                'daysEarlyOrLate' => $row['target_date'] !== null ? (int) ((strtotime($row['target_date']) - strtotime(substr((string) $row['delivered_at'], 0, 10))) / 86400) : null,
            ], Database::all("SELECT p.code, p.title, p.target_date, p.delivered_at FROM projects p WHERE p.delivered_at >= ? AND p.delivered_at < ?{$cat} ORDER BY p.delivered_at", array_merge([$p->start(), $p->endExclusive()], $catParams))),
            'updateFrequency' => self::updateFrequency($cat, $catParams),
            'table' => self::table($p, $cat, $catParams),
        ];
    }

    /** @return array{0:string, 1:list<mixed>} */
    private static function categoryFilter(Period $p): array
    {
        return isset($p->filters['category']) ? [' AND p.category = ?', [$p->filters['category']]] : ['', []];
    }

    private static function values(Period $p, string $cat, array $catParams): array
    {
        $end = $p->endExclusive();
        $active = (int) Database::value("SELECT COUNT(*) FROM projects p WHERE p.created_at < ? AND (p.delivered_at IS NULL OR p.delivered_at >= ?){$cat}", array_merge([$end, $end], $catParams));
        $rows = Database::all("SELECT p.delivered_at, p.target_date, p.start_date FROM projects p WHERE p.delivered_at >= ? AND p.delivered_at < ?{$cat}", array_merge([$p->start(), $end], $catParams));
        $onTime = 0;
        $cycle = [];
        foreach ($rows as $row) {
            if ($row['target_date'] !== null && substr((string) $row['delivered_at'], 0, 10) <= $row['target_date']) {
                $onTime++;
            }
            if ($row['start_date'] !== null) {
                $cycle[] = max(0, strtotime((string) $row['delivered_at']) - strtotime($row['start_date'] . ' 00:00:00'));
            }
        }
        $rating = Database::value("SELECT AVG(p.rating_stars) FROM projects p WHERE p.rated_at >= ? AND p.rated_at < ?{$cat}", array_merge([$p->start(), $end], $catParams));
        return [
            'active' => $active,
            'delivered' => count($rows),
            'onTime' => Blocks::ratio($onTime, count($rows)),
            'cycle' => Metrics::medianSeconds($cycle),
            'rating' => $rating !== null ? round((float) $rating, 2) : null,
        ];
    }

    /** Median days in each stage, for stays that ended in the range (consecutive stage-history rows). */
    private static function timeInStage(Period $p, string $cat, array $catParams): array
    {
        $rows = Database::all(
            "SELECT h.project_id, h.to_stage, h.changed_at FROM project_stage_history h JOIN projects p ON p.id = h.project_id
             WHERE h.changed_at < ?{$cat} ORDER BY h.project_id, h.changed_at, h.id",
            array_merge([$p->endExclusive()], $catParams),
        );
        $stays = [];
        for ($i = 0, $n = count($rows); $i < $n - 1; $i++) {
            $cur = $rows[$i];
            $next = $rows[$i + 1];
            if ($cur['project_id'] !== $next['project_id'] || (string) $next['changed_at'] < $p->start()) {
                continue;
            }
            $stays[$cur['to_stage']][] = (strtotime((string) $next['changed_at']) - strtotime((string) $cur['changed_at'])) / 86400;
        }
        $out = [];
        foreach (array_merge(self::ACTIVE_STAGES) as $stage) {
            $median = Blocks::median($stays[$stage] ?? []);
            $out[] = ['key' => $stage, 'label' => Stages::label($stage), 'medianDays' => $median !== null ? round($median, 1) : null, 'samples' => count($stays[$stage] ?? [])];
        }
        return $out;
    }

    /** Client-visible published updates per active project in the last 30 days (not range-bound). */
    private static function updateFrequency(string $cat, array $catParams): array
    {
        $since = date('Y-m-d H:i:s', strtotime('-30 days'));
        $rows = Database::all(
            "SELECT p.code, p.title,
                    COUNT(CASE WHEN COALESCE(u.published_at, u.created_at) >= ? THEN u.id END) AS updates,
                    MAX(COALESCE(u.published_at, u.created_at)) AS last_at
             FROM projects p LEFT JOIN updates u ON u.project_id = p.id AND u.visibility = 'client' AND u.status = 'published'
             WHERE p.stage <> 'DELIVERED'{$cat} GROUP BY p.id, p.code, p.title ORDER BY updates, p.code",
            array_merge([$since], $catParams),
        );
        return array_map(static function (array $row): array {
            $days = $row['last_at'] ? (int) floor((time() - strtotime((string) $row['last_at'])) / 86400) : null;
            return [
                'code' => $row['code'], 'title' => $row['title'], 'updates' => (int) $row['updates'],
                'daysSinceLastUpdate' => $days, 'stale' => $days === null || $days >= Stages::STALE_DAYS,
            ];
        }, $rows);
    }

    /** Active projects plus those delivered in the range. */
    private static function table(Period $p, string $cat, array $catParams): array
    {
        $today = date('Y-m-d');
        $rows = Database::all(
            "SELECT p.code, p.title, p.stage, p.progress, p.target_date, p.delivered_at, p.rating_stars, l.name AS lead_name,
                    (SELECT MAX(COALESCE(u.published_at, u.created_at)) FROM updates u WHERE u.project_id = p.id AND u.visibility = 'client' AND u.status = 'published') AS last_update
             FROM projects p LEFT JOIN users l ON l.id = p.lead_id
             WHERE (p.stage <> 'DELIVERED' OR (p.delivered_at >= ? AND p.delivered_at < ?)){$cat}
             ORDER BY p.stage = 'DELIVERED', p.target_date",
            array_merge([$p->start(), $p->endExclusive()], $catParams),
        );
        return array_map(static fn (array $row) => [
            'code' => $row['code'],
            'title' => $row['title'],
            'lead' => $row['lead_name'],
            'stage' => $row['stage'],
            'stageLabel' => Stages::label($row['stage']),
            'progress' => (int) $row['progress'],
            'targetDate' => $row['target_date'],
            'daysOverdue' => $row['stage'] !== 'DELIVERED' && $row['target_date'] !== null && $row['target_date'] < $today ? (int) ((strtotime($today) - strtotime($row['target_date'])) / 86400) : 0,
            'lastClientUpdate' => $row['last_update'] ? date('c', (int) strtotime((string) $row['last_update'])) : null,
            'rating' => $row['rating_stars'] !== null ? (int) $row['rating_stars'] : null,
        ], $rows);
    }
}
