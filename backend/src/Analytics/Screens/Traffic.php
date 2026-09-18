<?php

declare(strict_types=1);

namespace App\Analytics\Screens;

use App\Analytics\Blocks;
use App\Analytics\Metrics;
use App\Analytics\Period;
use App\Analytics\Rollup;
use App\Analytics\Where;
use App\Core\Database;
use App\Core\HttpError;
use App\Core\Request;

/** Traffic — how many people visit, from where, on what device (spec 4.2). */
final class Traffic extends Screen
{
    public const FILTERS = ['source', 'medium', 'campaign', 'device', 'country', 'state'];
    public const DEFINITIONS = ['visitors', 'newVisitors', 'returningVisitors', 'sessions', 'pageviews', 'pagesPerSession', 'avgSessionDuration', 'bounceRate', 'heatmap'];

    private const KPI_FORMATS = [
        'visitors' => 'number', 'sessions' => 'number', 'pageviews' => 'number',
        'pagesPerSession' => 'number', 'avgSessionDuration' => 'duration', 'bounceRate' => 'percent',
    ];

    /** Breakdown dimension => analytics_sessions column (page is event-based). */
    public const DIMENSIONS = [
        'source' => 'source', 'medium' => 'medium', 'campaign' => 'campaign', 'referrer' => 'referrer_host',
        'landing_page' => 'landing_path', 'page' => null, 'device' => 'device', 'browser' => 'browser', 'os' => 'os',
        'country' => 'country', 'state' => 'state',
    ];

    public static function data(Period $p, array $viewer, Request $r): array
    {
        $prev = $p->previous();
        $cur = Metrics::trafficValues($p);
        $old = $prev ? Metrics::trafficValues($prev) : [];
        $kpis = [];
        foreach (self::KPI_FORMATS as $key => $format) {
            $kpis[] = Blocks::kpi($key, $cur[$key], $prev ? $old[$key] : null, $format);
        }

        [$w, $params] = Where::forSessions($p);
        $nr = Database::one(
            "SELECT COALESCE(SUM(v.first_seen >= ?), 0) AS new_v, COALESCE(SUM(v.first_seen < ?), 0) AS returning_v
             FROM (SELECT DISTINCT s.visitor_id FROM analytics_sessions s WHERE {$w}) x JOIN analytics_visitors v ON v.visitor_id = x.visitor_id",
            array_merge([$p->start(), $p->start()], $params),
        );

        $heatmap = array_fill(0, 7, array_fill(0, 24, 0));
        foreach (Database::all("SELECT WEEKDAY(s.started_at) AS d, HOUR(s.started_at) AS h, COUNT(*) AS n FROM analytics_sessions s WHERE {$w} GROUP BY d, h", $params) as $row) {
            $heatmap[(int) $row['d']][(int) $row['h']] = (int) $row['n'];
        }

        return [
            'kpis' => $kpis,
            'newVsReturning' => ['new' => (int) $nr['new_v'], 'returning' => (int) $nr['returning_v']],
            'heatmap' => $heatmap,
        ];
    }

    /** GET /traffic/timeseries?metric= */
    public static function timeseries(Period $p, Request $r): array
    {
        $metric = $r->query('metric') ?: 'visitors';
        if (!in_array($metric, ['visitors', 'sessions', 'pageviews', 'bounce_rate', 'duration'], true)) {
            throw HttpError::validation(['metric' => 'Use visitors, sessions, pageviews, bounce_rate or duration.']);
        }
        $prev = $p->previous();
        return ['series' => Blocks::series($metric, $p, Metrics::sessionSeries($p, $metric), $prev ? Metrics::sessionSeries($prev, $metric) : null)];
    }

    /** GET /traffic/breakdown?dimension=&limit= */
    public static function breakdownFromRequest(Period $p, Request $r): array
    {
        $dimension = $r->query('dimension') ?: 'source';
        if (!array_key_exists($dimension, self::DIMENSIONS)) {
            throw HttpError::validation(['dimension' => 'Unknown dimension.']);
        }
        $limit = (int) ($r->query('limit') ?: 50);
        if ($limit < 1 || $limit > 500) {
            throw HttpError::validation(['limit' => 'Use a limit between 1 and 500.']);
        }
        return self::breakdown($p, $dimension, $limit);
    }

    public static function breakdown(Period $p, string $dimension, int $limit = 50): array
    {
        $prev = $p->previous();
        $cur = self::dimensionValues($p, $dimension);
        $old = $prev ? self::dimensionValues($prev, $dimension) : null;

        $values = array_map(static fn ($v) => $v['visitors'], $cur['rows']);
        $previous = $old ? array_map(static fn ($v) => $v['visitors'], $old['rows']) : null;
        $extra = [];
        $labels = [];
        foreach ($cur['rows'] as $key => $v) {
            $extra[$key] = $v['extra'];
            $labels[$key] = $v['label'];
        }
        return [
            'dimension' => $dimension,
            'rows' => Blocks::rows($values, $previous, $extra, $labels, $limit, $cur['total']),
            'total' => $cur['total'],
        ];
    }

    /** @return array{total:int, rows: array<string, array{visitors:int, label:string, extra:array}>} */
    private static function dimensionValues(Period $p, string $dimension): array
    {
        $rows = [];
        if ($dimension === 'page') {
            [$w, $params] = Where::forEvents($p);
            $pageviews = Rollup::sum(Rollup::read($p), 'page', 'path');
            // Label each path with its most common page title.
            $titles = [];
            foreach (Database::all(
                "SELECT LEFT(COALESCE(e.path, ''), 160) AS k, JSON_UNQUOTE(JSON_EXTRACT(e.props, '$.title')) AS title, COUNT(*) AS n
                 FROM analytics_events e WHERE {$w} AND e.event = 'page_view' GROUP BY k, title ORDER BY n DESC",
                $params,
            ) as $t) {
                $titles[(string) $t['k']] ??= $t['title'];
            }
            foreach (Database::all(
                "SELECT LEFT(COALESCE(e.path, ''), 160) AS k, COUNT(DISTINCT e.visitor_id) AS visitors
                 FROM analytics_events e WHERE {$w} AND e.event = 'page_view' GROUP BY k",
                $params,
            ) as $r) {
                $key = (string) $r['k'];
                $title = $titles[$key] ?? null;
                $rows[$key] = [
                    'visitors' => (int) $r['visitors'],
                    'label' => $title ? $title . ' (' . $key . ')' : ($key !== '' ? $key : '(none)'),
                    'extra' => ['pageviews' => $pageviews[$key] ?? 0],
                ];
            }
            $total = (int) Database::value("SELECT COUNT(DISTINCT e.visitor_id) FROM analytics_events e WHERE {$w} AND e.event = 'page_view'", $params);
            return ['total' => $total, 'rows' => $rows];
        }

        $col = self::DIMENSIONS[$dimension];
        [$w, $params] = Where::forSessions($p);
        $conversions = array_column(Database::all(
            "SELECT COALESCE(s.{$col}, '') AS k, COUNT(DISTINCT e.visitor_id) AS n
             FROM analytics_events e JOIN analytics_sessions s ON s.session_id = e.session_id
             WHERE {$w} AND e.event = 'idea_form' AND e.name = 'submitted' GROUP BY k",
            $params,
        ), 'n', 'k');
        foreach (Database::all(
            "SELECT COALESCE(s.{$col}, '') AS k, COUNT(DISTINCT s.visitor_id) AS visitors, COUNT(*) AS sessions,
                    COALESCE(SUM(s.page_views), 0) AS pageviews, COALESCE(SUM(s.is_bounce), 0) AS bounces, MIN(s.medium) AS medium
             FROM analytics_sessions s WHERE {$w} GROUP BY k",
            $params,
        ) as $r) {
            $key = (string) $r['k'];
            $visitors = (int) $r['visitors'];
            $rows[$key] = [
                'visitors' => $visitors,
                'label' => self::label($dimension, $key, $r['medium'] !== null ? (string) $r['medium'] : null),
                'extra' => [
                    'sessions' => (int) $r['sessions'],
                    'pageviews' => (int) $r['pageviews'],
                    'bounceRate' => Blocks::ratio((int) $r['bounces'], (int) $r['sessions']),
                    'conversion' => Blocks::ratio((int) ($conversions[$key] ?? 0), $visitors),
                ],
            ];
        }
        $total = (int) Database::value("SELECT COUNT(DISTINCT s.visitor_id) FROM analytics_sessions s WHERE {$w}", $params);
        return ['total' => $total, 'rows' => $rows];
    }

    public static function label(string $dimension, string $key, ?string $medium = null): string
    {
        if ($key === '') {
            return $dimension === 'referrer' ? '(no referrer)' : '(unknown)';
        }
        if ($dimension === 'source') {
            if ($key === 'direct') {
                return 'Direct';
            }
            $name = match ($key) {
                'x' => 'X (Twitter)', 'linkedin' => 'LinkedIn', 'tiktok' => 'TikTok', 'whatsapp' => 'WhatsApp', 'youtube' => 'YouTube', 'duckduckgo' => 'DuckDuckGo', 'gmail' => 'Gmail',
                default => str_contains($key, '.') ? $key : ucfirst($key),
            };
            return $medium && $medium !== 'none' ? "{$name} ({$medium})" : $name;
        }
        return match ($dimension) {
            'device', 'medium' => ucfirst($key),
            default => $key,
        };
    }
}
