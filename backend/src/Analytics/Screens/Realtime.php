<?php

declare(strict_types=1);

namespace App\Analytics\Screens;

use App\Analytics\Blocks;
use App\Analytics\Period;
use App\Core\Database;
use App\Core\Request;

/** Realtime — what is happening right now (spec 4.12). Anonymised: no visitor ids, no IPs. */
final class Realtime extends Screen
{
    public const FILTERS = [];
    public const DEFINITIONS = ['activeVisitors'];

    public static function data(Period $p, array $viewer, Request $r): array
    {
        $internal = $p->includeInternal ? '' : ' AND e.internal = 0';
        $now = time();
        $since5 = date('Y-m-d H:i:s', $now - 300);
        $since30 = date('Y-m-d H:i:00', $now - 29 * 60);

        $perMinute = [];
        for ($i = 29; $i >= 0; $i--) {
            $perMinute[date('H:i', $now - $i * 60)] = 0;
        }
        foreach (Database::all("SELECT DATE_FORMAT(e.occurred_at, '%H:%i') AS m, COUNT(*) AS n FROM analytics_events e WHERE e.event = 'page_view' AND e.occurred_at >= ?{$internal} GROUP BY m", [$since30]) as $row) {
            if (isset($perMinute[$row['m']])) {
                $perMinute[$row['m']] = (int) $row['n'];
            }
        }

        $pages = array_map('intval', array_column(Database::all("SELECT COALESCE(e.path, '') AS k, COUNT(*) AS n FROM analytics_events e WHERE e.event = 'page_view' AND e.occurred_at >= ?{$internal} GROUP BY k ORDER BY n DESC LIMIT 10", [$since30]), 'n', 'k'));
        $sources = array_map('intval', array_column(Database::all("SELECT COALESCE(e.source, '') AS k, COUNT(DISTINCT e.visitor_id) AS n FROM analytics_events e WHERE e.occurred_at >= ?{$internal} GROUP BY k ORDER BY n DESC LIMIT 10", [$since30]), 'n', 'k'));
        $devices = array_map('intval', array_column(Database::all("SELECT COALESCE(e.device, '') AS k, COUNT(DISTINCT e.visitor_id) AS n FROM analytics_events e WHERE e.occurred_at >= ?{$internal} GROUP BY k", [$since30]), 'n', 'k'));
        $sourceLabels = [];
        foreach (array_keys($sources) as $k) {
            $sourceLabels[$k] = Traffic::label('source', (string) $k);
        }

        return [
            'activeVisitors' => (int) Database::value("SELECT COUNT(DISTINCT e.visitor_id) FROM analytics_events e WHERE e.occurred_at >= ?{$internal}", [$since5]),
            'perMinute' => array_map(static fn ($t, $v) => ['t' => $t, 'value' => $v], array_keys($perMinute), array_values($perMinute)),
            'topPages' => Blocks::rows($pages),
            'topSources' => Blocks::rows($sources, null, [], $sourceLabels),
            'devices' => Blocks::rows($devices),
            'feed' => array_map(static fn ($row) => [
                'at' => date('c', (int) strtotime((string) $row['occurred_at'])),
                'event' => $row['event'],
                'path' => $row['path'],
                'source' => $row['source'],
                'device' => $row['device'],
            ], Database::all("SELECT e.occurred_at, e.event, e.path, e.source, e.device FROM analytics_events e WHERE e.occurred_at >= ?{$internal} ORDER BY e.occurred_at DESC, e.id DESC LIMIT 50", [date('Y-m-d H:i:s', $now - 86400)])),
        ];
    }
}
