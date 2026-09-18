<?php

declare(strict_types=1);

namespace App\Analytics;

use App\Core\Database;

/**
 * Daily rollups of event-level counts (analytics_daily) and the raw/rollup stitcher (spec 8.3 "query strategy").
 *
 * compute() is the single definition of every rolled-up number: the nightly job stores its output, and live
 * queries run the very same SQL over raw events, so a stitched range always adds up to the raw total.
 *
 * Stored metrics (dimension / value_key), each twice — as-is (staff traffic excluded) and with an "@all" suffix
 * (staff traffic included):
 *   event   / name                  / event name
 *   target  / <event>               / cta id, step, course id, kind, host, depth, code (see Tracking::targetSql)
 *   page    / path                  / cleaned path (first 160 characters)
 *   prop    / tracker_search.result / found | not_found | rate_limited | error
 *   prop    / scroll_home.depth     / 25 | 50 | 75 | 100 (home page "/" only)
 *   _rolled / day                   / "" (marker: this day has been rolled up)
 *
 * Session-level numbers (visitors, sessions, bounce, duration, sources, devices…) are not rolled up here: they come
 * from analytics_sessions, which is itself an incrementally maintained, one-row-per-session aggregate that keeps
 * exact distinct counts for any filter combination.
 */
final class Rollup
{
    /**
     * Counts for a day range straight from raw events.
     * @param array<string, string> $filters traffic filters (source, medium, campaign, device, country, state)
     * @return list<array{0:string,1:string,2:string,3:string,4:int}> [day, metric, dimension, key, value]
     */
    public static function compute(string $fromDay, string $toDay, array $filters, bool $includeInternal): array
    {
        [$where, $params] = Where::events($fromDay . ' 00:00:00', date('Y-m-d', strtotime($toDay . ' +1 day')) . ' 00:00:00', $filters, $includeInternal, 'e');
        $target = Tracking::targetSql('e');
        $parts = [
            "SELECT DATE(e.occurred_at) AS d, 'event' AS m, 'name' AS dim, e.event AS k, COUNT(*) AS v FROM analytics_events e WHERE {$where} GROUP BY DATE(e.occurred_at), e.event",
            "SELECT DATE(e.occurred_at), 'target', e.event, LEFT(COALESCE({$target}, ''), 160), COUNT(*) FROM analytics_events e WHERE {$where} AND e.event <> 'page_view' GROUP BY DATE(e.occurred_at), e.event, LEFT(COALESCE({$target}, ''), 160)",
            "SELECT DATE(e.occurred_at), 'page', 'path', LEFT(COALESCE(e.path, ''), 160), COUNT(*) FROM analytics_events e WHERE {$where} AND e.event = 'page_view' GROUP BY DATE(e.occurred_at), LEFT(COALESCE(e.path, ''), 160)",
            "SELECT DATE(e.occurred_at), 'prop', 'tracker_search.result', COALESCE(JSON_UNQUOTE(JSON_EXTRACT(e.props, '$.result')), ''), COUNT(*) FROM analytics_events e WHERE {$where} AND e.event = 'tracker_search' GROUP BY DATE(e.occurred_at), COALESCE(JSON_UNQUOTE(JSON_EXTRACT(e.props, '$.result')), '')",
            "SELECT DATE(e.occurred_at), 'prop', 'scroll_home.depth', COALESCE(JSON_UNQUOTE(JSON_EXTRACT(e.props, '$.depth')), ''), COUNT(*) FROM analytics_events e WHERE {$where} AND e.event = 'scroll_depth' AND e.path = '/' GROUP BY DATE(e.occurred_at), COALESCE(JSON_UNQUOTE(JSON_EXTRACT(e.props, '$.depth')), '')",
        ];
        $rows = Database::all(implode(' UNION ALL ', $parts), array_merge($params, $params, $params, $params, $params));
        return array_map(static fn (array $r) => [(string) $r['d'], (string) $r['m'], (string) $r['dim'], (string) $r['k'], (int) $r['v']], $rows);
    }

    /**
     * Rolls up the given days (idempotent: each day is deleted and rebuilt in one transaction).
     * @return int rows written
     */
    public static function rollDays(string $fromDay, string $toDay): int
    {
        $written = 0;
        for ($day = $fromDay; $day <= $toDay; $day = date('Y-m-d', strtotime($day . ' +1 day'))) {
            $rows = [];
            foreach ([false, true] as $all) {
                foreach (self::compute($day, $day, [], $all) as [$d, $m, $dim, $k, $v]) {
                    $rows[] = [$d, $all ? $m . '@all' : $m, $dim, $k, $v];
                }
            }
            $rows[] = [$day, '_rolled', 'day', '', 1];
            Database::transaction(static function () use ($day, $rows): void {
                Database::run('DELETE FROM analytics_daily WHERE day = ?', [$day]);
                foreach (array_chunk($rows, 300) as $chunk) {
                    $params = [];
                    foreach ($chunk as $r) {
                        array_push($params, ...$r);
                    }
                    Database::run('INSERT INTO analytics_daily (day, metric, dimension, value_key, value) VALUES ' . implode(',', array_fill(0, count($chunk), '(?,?,?,?,?)')), $params);
                }
            });
            $written += count($rows);
        }
        return $written;
    }

    /**
     * Counts for a period: rolled-up days older than yesterday come from analytics_daily, everything else
     * (yesterday, today, days never rolled up, or any request with a traffic filter) from raw events.
     * @return list<array{0:string,1:string,2:string,3:string,4:int}>
     */
    public static function read(Period $p): array
    {
        if ($p->hasTrafficFilter()) {
            return self::compute($p->from, $p->to, $p->filters, $p->includeInternal);
        }
        $yesterday = date('Y-m-d', strtotime('-1 day'));
        $lastRollable = min($p->to, date('Y-m-d', strtotime($yesterday . ' -1 day')));
        $rolled = $p->from <= $lastRollable
            ? array_flip(array_map('strval', array_column(Database::all("SELECT day FROM analytics_daily WHERE metric = '_rolled' AND day BETWEEN ? AND ?", [$p->from, $lastRollable]), 'day')))
            : [];

        $rows = [];
        if ($rolled !== []) {
            $suffix = $p->includeInternal ? '@all' : '';
            $days = array_keys($rolled);
            foreach (Database::all(
                'SELECT day, metric, dimension, value_key, value FROM analytics_daily WHERE day BETWEEN ? AND ? AND metric IN (?, ?, ?, ?)',
                [min($days), max($days), 'event' . $suffix, 'target' . $suffix, 'page' . $suffix, 'prop' . $suffix],
            ) as $r) {
                if (isset($rolled[(string) $r['day']])) {
                    $rows[] = [(string) $r['day'], str_replace('@all', '', (string) $r['metric']), (string) $r['dimension'], (string) $r['value_key'], (int) $r['value']];
                }
            }
        }
        // Live: contiguous runs of days that are not rolled up.
        $runStart = null;
        for ($day = $p->from; ; $day = date('Y-m-d', strtotime($day . ' +1 day'))) {
            $inRange = $day <= $p->to;
            if ($inRange && !isset($rolled[$day])) {
                $runStart ??= $day;
                continue;
            }
            if ($runStart !== null) {
                array_push($rows, ...self::compute($runStart, date('Y-m-d', strtotime($day . ' -1 day')), [], $p->includeInternal));
                $runStart = null;
            }
            if (!$inRange) {
                break;
            }
        }
        return $rows;
    }

    /**
     * Sums stitched rows by key for one metric/dimension.
     * @param list<array> $rows from read()
     * @return array<string, int> key => total
     */
    public static function sum(array $rows, string $metric, string $dimension): array
    {
        $out = [];
        foreach ($rows as [, $m, $dim, $k, $v]) {
            if ($m === $metric && $dim === $dimension) {
                $out[$k] = ($out[$k] ?? 0) + $v;
            }
        }
        return $out;
    }

    /** @return array<string, array<string, int>> dimension => key => total, for every dimension of a metric */
    public static function sumAll(array $rows, string $metric): array
    {
        $out = [];
        foreach ($rows as [, $m, $dim, $k, $v]) {
            if ($m === $metric) {
                $out[$dim][$k] = ($out[$dim][$k] ?? 0) + $v;
            }
        }
        return $out;
    }
}
