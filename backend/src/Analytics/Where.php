<?php

declare(strict_types=1);

namespace App\Analytics;

/** WHERE fragments (positional parameters) for the tracking tables. */
final class Where
{
    private const TRAFFIC_FILTERS = ['source', 'medium', 'campaign', 'device', 'country', 'state'];

    /** @return array{0:string, 1:list<mixed>} */
    public static function events(string $from, string $toExclusive, array $filters, bool $includeInternal, string $alias = 'e'): array
    {
        return self::build("{$alias}.occurred_at", $from, $toExclusive, $filters, $includeInternal, $alias);
    }

    /** Sessions are attributed to the day (and hour) they started; a session never crosses Lagos midnight. */
    public static function sessions(string $from, string $toExclusive, array $filters, bool $includeInternal, string $alias = 's'): array
    {
        return self::build("{$alias}.started_at", $from, $toExclusive, $filters, $includeInternal, $alias);
    }

    /** @return array{0:string, 1:list<mixed>} */
    public static function forEvents(Period $p, string $alias = 'e'): array
    {
        return self::events($p->start(), $p->endExclusive(), $p->filters, $p->includeInternal, $alias);
    }

    /** @return array{0:string, 1:list<mixed>} */
    public static function forSessions(Period $p, string $alias = 's'): array
    {
        return self::sessions($p->start(), $p->endExclusive(), $p->filters, $p->includeInternal, $alias);
    }

    /** @return array{0:string, 1:list<mixed>} */
    private static function build(string $timeColumn, string $from, string $to, array $filters, bool $includeInternal, string $alias): array
    {
        $sql = ["{$timeColumn} >= ?", "{$timeColumn} < ?"];
        $params = [$from, $to];
        if (!$includeInternal) {
            $sql[] = "{$alias}.internal = 0";
        }
        foreach (self::TRAFFIC_FILTERS as $f) {
            if (isset($filters[$f])) {
                $sql[] = "{$alias}.{$f} = ?";
                $params[] = $filters[$f];
            }
        }
        return [implode(' AND ', $sql), $params];
    }
}
