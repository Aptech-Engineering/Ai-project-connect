<?php

declare(strict_types=1);

namespace App\Analytics;

/** The building blocks inside `data` (spec 9.4) plus small statistics helpers. */
final class Blocks
{
    /**
     * A KPI value. `previous` is null when compare=none. Money KPIs carry a `kind`.
     * @param 'number'|'currency'|'percent'|'duration' $format duration = seconds, percent = ratio 0–1
     */
    public static function kpi(string $key, float|int|null $value, float|int|null $previous, string $format = 'number', ?string $kind = null, array $extra = []): array
    {
        $def = Definitions::get($key);
        return [
            'key' => $key,
            'label' => $def['label'],
            'value' => self::clean($value),
            'previous' => self::clean($previous),
            'change' => self::change($value, $previous),
            'format' => $format,
            'goodDirection' => $def['good'],
            'kind' => $kind,
        ] + $extra;
    }

    /** A KPI hidden from this viewer (money on shared screens for non-admins). */
    public static function restricted(array $kpi): array
    {
        return ['value' => null, 'previous' => null, 'change' => null, 'restricted' => true] + $kpi;
    }

    /** Relative change, rounded to 4 decimals. Null when there is nothing to compare with. */
    public static function change(float|int|null $value, float|int|null $previous): ?float
    {
        if ($value === null || $previous === null || (float) $previous == 0.0) {
            return null;
        }
        return round(((float) $value - (float) $previous) / abs((float) $previous), 4);
    }

    /**
     * A time series aligned to the period buckets; the comparison is aligned by position.
     * @param array<string, float|int> $values bucket => value
     * @param array<string, float|int>|null $previousValues bucket => value (comparison period)
     */
    public static function series(string $key, Period $p, array $values, ?array $previousValues = null, float|int|null $empty = 0): array
    {
        $buckets = $p->buckets();
        $prevBuckets = $previousValues !== null && $p->previous() ? $p->previous()->buckets() : [];
        $points = [];
        foreach ($buckets as $i => $b) {
            $point = ['t' => $b, 'value' => self::clean($values[$b] ?? $empty)];
            if ($previousValues !== null) {
                $pb = $prevBuckets[$i] ?? null;
                $point['previous'] = $pb !== null ? self::clean($previousValues[$pb] ?? $empty) : null;
            }
            $points[] = $point;
        }
        return ['key' => $key, 'points' => $points];
    }

    /**
     * Breakdown rows sorted by value, with share of the total and change vs the comparison.
     * @param array<string, float|int> $values key => value
     * @param array<string, float|int>|null $previous key => value
     * @param array<string, array> $extra key => extra fields
     * @param array<string, string> $labels key => label
     */
    public static function rows(array $values, ?array $previous = null, array $extra = [], array $labels = [], ?int $limit = null, float|int|null $total = null): array
    {
        arsort($values);
        $total ??= array_sum($values);
        $rows = [];
        foreach ($values as $key => $value) {
            $key = (string) $key;
            $rows[] = [
                'key' => $key,
                'label' => $labels[$key] ?? self::label($key),
                'value' => self::clean($value),
                'share' => $total ? round($value / $total, 4) : null,
                'change' => $previous !== null ? self::change($value, $previous[$key] ?? null) : null,
                'extra' => $extra[$key] ?? (object) [],
            ];
        }
        return $limit !== null ? array_slice($rows, 0, $limit) : $rows;
    }

    /** A funnel step. */
    public static function step(string $key, string $label, int $count, ?int $previousCount, int $startCount, ?float $medianSeconds = null): array
    {
        return [
            'key' => $key,
            'label' => $label,
            'count' => $count,
            'fromPrevious' => $previousCount === null ? null : ($previousCount ? round($count / $previousCount, 4) : null),
            'fromStart' => $startCount ? round($count / $startCount, 4) : null,
            'medianSecondsFromPrevious' => $medianSeconds !== null ? (int) round($medianSeconds) : null,
        ];
    }

    public static function ratio(float|int|null $a, float|int|null $b): ?float
    {
        return $b ? round((float) $a / (float) $b, 4) : null;
    }

    /** @param list<float|int> $values */
    public static function median(array $values): ?float
    {
        return self::percentile($values, 50);
    }

    /** Nearest-rank-with-interpolation percentile. @param list<float|int> $values */
    public static function percentile(array $values, float $p): ?float
    {
        $values = array_values(array_filter($values, static fn ($v) => $v !== null));
        if ($values === []) {
            return null;
        }
        sort($values);
        $pos = ($p / 100) * (count($values) - 1);
        $lo = (int) floor($pos);
        $hi = (int) ceil($pos);
        return round($values[$lo] + ($values[$hi] - $values[$lo]) * ($pos - $lo), 2);
    }

    public static function label(string $key): string
    {
        if ($key === '' || $key === '(none)') {
            return '(none)';
        }
        return ucfirst(str_replace(['_', '-'], ' ', $key));
    }

    private static function clean(float|int|null $v): float|int|null
    {
        if ($v === null) {
            return null;
        }
        if (is_float($v) && floor($v) == $v && abs($v) < 1e15) {
            return (int) $v;
        }
        return is_float($v) ? round($v, 4) : $v;
    }
}
