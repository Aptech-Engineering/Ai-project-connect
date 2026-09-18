<?php

declare(strict_types=1);

namespace App\Analytics\Screens;

use App\Analytics\Blocks;
use App\Analytics\Metrics;
use App\Analytics\Period;
use App\Analytics\Rollup;
use App\Analytics\Tracking;
use App\Analytics\Where;
use App\Core\Database;
use App\Core\Request;

/** Engagement — what people click and use (spec 4.3). Event counts are stitched from rollups + raw events. */
final class Engagement extends Screen
{
    public const FILTERS = ['source', 'medium', 'campaign', 'device', 'country', 'state'];
    public const DEFINITIONS = ['ctaClicks', 'ctaClickThroughRate', 'trackerSearches', 'notFoundRate', 'ideaFormsOpened', 'courseClicks', 'outboundClicks', 'scrollDepth', 'downloads'];

    public static function data(Period $p, array $viewer, Request $r): array
    {
        $prev = $p->previous();
        $cur = self::counts($p);
        $old = $prev ? self::counts($prev) : null;

        $kpis = [
            Blocks::kpi('ctaClicks', $cur['events']['cta_click'] ?? 0, $old ? ($old['events']['cta_click'] ?? 0) : null),
            Blocks::kpi('trackerSearches', $cur['events']['tracker_search'] ?? 0, $old ? ($old['events']['tracker_search'] ?? 0) : null),
            Blocks::kpi('ideaFormsOpened', Metrics::eventVisitors($p, 'idea_form', 'opened'), $prev ? Metrics::eventVisitors($prev, 'idea_form', 'opened') : null),
            Blocks::kpi('courseClicks', $cur['events']['course_click'] ?? 0, $old ? ($old['events']['course_click'] ?? 0) : null),
            Blocks::kpi('outboundClicks', $cur['events']['outbound_click'] ?? 0, $old ? ($old['events']['outbound_click'] ?? 0) : null),
        ];

        $searches = array_sum($cur['targets']['tracker_search'] ?? []);
        $results = $cur['props']['tracker_search.result'] ?? [];
        $homeViews = $cur['pages']['/'] ?? 0;
        $scroll = [];
        foreach (['25', '50', '75', '100'] as $depth) {
            $scroll[$depth] = Blocks::ratio($cur['props']['scroll_home.depth'][$depth] ?? 0, $homeViews) ?? 0;
        }
        $downloads = [];
        foreach (['report', 'proposal', 'file'] as $kind) {
            $downloads[] = ['kind' => $kind, 'count' => $cur['targets']['download'][$kind] ?? 0];
        }

        return [
            'kpis' => $kpis,
            'interactions' => self::interactions($p),
            'trackerSearches' => [
                'byKind' => ['project' => $cur['targets']['tracker_search']['project'] ?? 0, 'idea' => $cur['targets']['tracker_search']['idea'] ?? 0],
                'byResult' => [
                    'found' => $results['found'] ?? 0, 'not_found' => $results['not_found'] ?? 0,
                    'rate_limited' => $results['rate_limited'] ?? 0, 'error' => $results['error'] ?? 0,
                ],
                'notFoundRate' => Blocks::ratio($results['not_found'] ?? 0, $searches),
            ],
            'scrollDepth' => $scroll,
            'downloads' => $downloads,
        ];
    }

    /** Stitched event counts. @return array{events:array, targets:array, pages:array, props:array} */
    private static function counts(Period $p): array
    {
        $rows = Rollup::read($p);
        return [
            'events' => Rollup::sum($rows, 'event', 'name'),
            'targets' => Rollup::sumAll($rows, 'target'),
            'pages' => Rollup::sum($rows, 'page', 'path'),
            'props' => Rollup::sumAll($rows, 'prop'),
        ];
    }

    /** event × target × page, with unique visitors and click-through vs that page's viewers. */
    private static function interactions(Period $p): array
    {
        [$w, $params] = Where::forEvents($p);
        $target = Tracking::targetSql('e');
        $passive = "'" . implode("','", Tracking::PASSIVE_EVENTS) . "'";
        $rows = Database::all(
            "SELECT e.event, {$target} AS target, COALESCE(e.path, '') AS path, COUNT(*) AS n, COUNT(DISTINCT e.visitor_id) AS visitors
             FROM analytics_events e WHERE {$w} AND e.event NOT IN ({$passive})
             GROUP BY e.event, target, path ORDER BY n DESC LIMIT 100",
            $params,
        );
        $pageVisitors = array_column(Database::all(
            "SELECT COALESCE(e.path, '') AS path, COUNT(DISTINCT e.visitor_id) AS n FROM analytics_events e WHERE {$w} AND e.event = 'page_view' GROUP BY path",
            $params,
        ), 'n', 'path');
        return array_map(static fn (array $r) => [
            'event' => $r['event'],
            'target' => $r['target'],
            'path' => $r['path'] !== '' ? $r['path'] : null,
            'count' => (int) $r['n'],
            'visitors' => (int) $r['visitors'],
            'ctr' => Blocks::ratio((int) $r['visitors'], (int) ($pageVisitors[$r['path']] ?? 0)),
        ], $rows);
    }
}
