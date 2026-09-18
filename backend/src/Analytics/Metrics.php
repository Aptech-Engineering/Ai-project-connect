<?php

declare(strict_types=1);

namespace App\Analytics;

use App\Core\Database;

/** Reusable metric queries shared by several screens. Each is one grouped query. */
final class Metrics
{
    /** @return array{visitors:int, sessions:int, pageviews:int, duration:int, bounces:int} */
    public static function sessionTotals(Period $p): array
    {
        [$w, $params] = Where::forSessions($p);
        $r = Database::one(
            "SELECT COUNT(*) AS sessions, COUNT(DISTINCT s.visitor_id) AS visitors, COALESCE(SUM(s.page_views), 0) AS pageviews,
                    COALESCE(SUM(TIMESTAMPDIFF(SECOND, s.started_at, s.ended_at)), 0) AS duration, COALESCE(SUM(s.is_bounce), 0) AS bounces
             FROM analytics_sessions s WHERE {$w}",
            $params,
        );
        return array_map('intval', $r);
    }

    /** The six traffic KPI values from session totals. @return array<string, float|int|null> */
    public static function trafficValues(Period $p): array
    {
        $t = self::sessionTotals($p);
        return [
            'visitors' => $t['visitors'],
            'sessions' => $t['sessions'],
            'pageviews' => $t['pageviews'],
            'pagesPerSession' => $t['sessions'] ? round($t['pageviews'] / $t['sessions'], 2) : null,
            'avgSessionDuration' => $t['sessions'] ? round($t['duration'] / $t['sessions'], 1) : null,
            'bounceRate' => $t['sessions'] ? round($t['bounces'] / $t['sessions'], 4) : null,
        ];
    }

    /**
     * A session-based metric per interval bucket.
     * @param 'visitors'|'sessions'|'pageviews'|'bounce_rate'|'duration' $metric
     * @return array<string, float|int>
     */
    public static function sessionSeries(Period $p, string $metric): array
    {
        [$w, $params] = Where::forSessions($p);
        $bucket = Period::bucketSql('s.started_at', $p->interval);
        $rows = Database::all(
            "SELECT {$bucket} AS t, COUNT(*) AS sessions, COUNT(DISTINCT s.visitor_id) AS visitors, COALESCE(SUM(s.page_views), 0) AS pageviews,
                    COALESCE(SUM(s.is_bounce), 0) AS bounces, COALESCE(SUM(TIMESTAMPDIFF(SECOND, s.started_at, s.ended_at)), 0) AS duration
             FROM analytics_sessions s WHERE {$w} GROUP BY t",
            $params,
        );
        $out = [];
        foreach ($rows as $r) {
            $s = (int) $r['sessions'];
            $out[(string) $r['t']] = match ($metric) {
                'visitors' => (int) $r['visitors'],
                'sessions' => $s,
                'pageviews' => (int) $r['pageviews'],
                'bounce_rate' => $s ? round((int) $r['bounces'] / $s, 4) : 0,
                'duration' => $s ? round((int) $r['duration'] / $s, 1) : 0,
            };
        }
        return $out;
    }

    /** Distinct visitors with a given event (and optional name) in the period. */
    public static function eventVisitors(Period $p, string $event, ?string $name = null): int
    {
        [$w, $params] = Where::forEvents($p);
        $sql = "SELECT COUNT(DISTINCT e.visitor_id) FROM analytics_events e WHERE {$w} AND e.event = ?";
        $params[] = $event;
        if ($name !== null) {
            $sql .= ' AND e.name = ?';
            $params[] = $name;
        }
        return (int) Database::value($sql, $params);
    }

    /** Ideas submitted in the period, optionally per interval bucket. */
    public static function ideasSubmitted(Period $p, bool $series = false, array $extraWhere = []): array|int
    {
        $sql = "FROM ideas i WHERE i.status <> 'DRAFT' AND i.submitted_at >= ? AND i.submitted_at < ?";
        $params = [$p->start(), $p->endExclusive()];
        [$sql, $params] = self::ideaFilters($p, $sql, $params);
        if (!$series) {
            return (int) Database::value('SELECT COUNT(*) ' . $sql, $params);
        }
        $bucket = Period::bucketSql('i.submitted_at', $p->interval);
        return array_map('intval', array_column(Database::all("SELECT {$bucket} AS t, COUNT(*) AS n {$sql} GROUP BY t", $params), 'n', 't'));
    }

    /** Applies the category/state idea filters. @return array{0:string, 1:list<mixed>} */
    public static function ideaFilters(Period $p, string $sql, array $params, string $alias = 'i'): array
    {
        if (isset($p->filters['category'])) {
            $sql .= " AND {$alias}.category = ?";
            $params[] = $p->filters['category'];
        }
        return [$sql, $params];
    }

    /** Earliest tracked day (YYYY-MM-DD) or null when nothing has been tracked yet. */
    public static function trackingSince(): ?string
    {
        $first = Database::value('SELECT MIN(day) FROM (SELECT MIN(DATE(started_at)) AS day FROM analytics_sessions UNION ALL SELECT MIN(day) FROM analytics_daily) x');
        return $first ? (string) $first : null;
    }

    /** Active (not delivered) project ids as of the end of a period. */
    public static function activeProjectsAsOf(string $endExclusive): int
    {
        return (int) Database::value('SELECT COUNT(*) FROM projects WHERE created_at < ? AND (delivered_at IS NULL OR delivered_at >= ?)', [$endExclusive, $endExclusive]);
    }

    /** @return array{delivered:int, onTime:int, cycle:list<float>} */
    public static function deliveries(Period $p): array
    {
        $rows = Database::all(
            'SELECT delivered_at, target_date, start_date FROM projects WHERE delivered_at >= ? AND delivered_at < ?',
            [$p->start(), $p->endExclusive()],
        );
        $onTime = 0;
        $cycle = [];
        foreach ($rows as $r) {
            if ($r['target_date'] !== null && substr((string) $r['delivered_at'], 0, 10) <= $r['target_date']) {
                $onTime++;
            }
            if ($r['start_date'] !== null) {
                $cycle[] = max(0, strtotime((string) $r['delivered_at']) - strtotime($r['start_date'] . ' 00:00:00'));
            }
        }
        return ['delivered' => count($rows), 'onTime' => $onTime, 'cycle' => $cycle];
    }

    /** Commitment-fee cash in a period (naira). @return array{gross:float, refunded:float, net:float} */
    public static function feeCash(Period $p): array
    {
        [$mSql, $mParams] = self::methodFilter($p);
        $gross = (int) Database::value("SELECT COALESCE(SUM(pay.amount_kobo), 0) FROM idea_payments pay JOIN ideas i ON i.id = pay.idea_id WHERE pay.status = 'PAID' AND pay.paid_at >= ? AND pay.paid_at < ?{$mSql}", array_merge([$p->start(), $p->endExclusive()], $mParams));
        $refunded = (int) Database::value("SELECT COALESCE(SUM(pay.amount_kobo), 0) FROM idea_payments pay JOIN ideas i ON i.id = pay.idea_id WHERE pay.refund_status = 'REFUNDED' AND pay.refunded_at >= ? AND pay.refunded_at < ?{$mSql}", array_merge([$p->start(), $p->endExclusive()], $mParams));
        return ['gross' => $gross / 100, 'refunded' => $refunded / 100, 'net' => ($gross - $refunded) / 100];
    }

    /** Payment method / idea category filters for idea_payments (alias pay) joined to ideas (alias i). */
    public static function methodFilter(Period $p): array
    {
        $sql = '';
        $params = [];
        if (isset($p->filters['method'])) {
            $sql .= match ($p->filters['method']) {
                'paystack' => " AND pay.method = 'paystack'",
                'centre' => " AND pay.method = 'manual' AND pay.note = 'Paid at centre'",
                default => " AND pay.method = 'manual' AND (pay.note IS NULL OR pay.note <> 'Paid at centre')",
            };
        }
        if (isset($p->filters['category'])) {
            $sql .= ' AND i.category = ?';
            $params[] = $p->filters['category'];
        }
        return [$sql, $params];
    }

    /** Sum of accepted quote amounts (booked) in a period. */
    public static function contractValueWon(Period $p): float
    {
        [$sql, $params] = self::ideaFilters($p, " WHERE q.status = 'accepted' AND q.responded_at >= ? AND q.responded_at < ?", [$p->start(), $p->endExclusive()]);
        return (float) Database::value('SELECT COALESCE(SUM(q.amount), 0) FROM quotes q JOIN ideas i ON i.id = q.idea_id' . $sql, $params);
    }

    /** Median of a list, as an int number of seconds (or null). */
    public static function medianSeconds(array $values): ?int
    {
        $m = Blocks::median($values);
        return $m === null ? null : (int) round($m);
    }
}
