<?php

declare(strict_types=1);

namespace App\Analytics;

use App\Core\HttpError;
use App\Core\Request;

/**
 * The common query parameters (spec 9.1): range, comparison, interval, filters and staff traffic.
 * All dates are Africa/Lagos calendar days, inclusive. Database DATETIMEs are stored in Lagos time.
 */
final class Period
{
    public const FILTERS = ['source', 'medium', 'campaign', 'device', 'country', 'state', 'category', 'method'];
    private const MAX_DAYS = 731; // 2 years

    /** @param array<string, string> $filters */
    public function __construct(
        public readonly string $from,
        public readonly string $to,
        public readonly string $compare = 'previous',
        public readonly string $interval = 'day',
        public readonly array $filters = [],
        public readonly bool $includeInternal = false,
    ) {
    }

    /** @param list<string> $allowedFilters filters this screen understands (others are ignored) */
    public static function fromRequest(Request $r, array $allowedFilters = []): self
    {
        $errors = [];
        $today = date('Y-m-d');
        $to = $r->query('to') ?: $today;
        $from = $r->query('from') ?: date('Y-m-d', strtotime($to . ' -29 days'));
        foreach (['from' => $from, 'to' => $to] as $field => $value) {
            if (!self::isDate($value)) {
                $errors[$field] = 'Use a date like 2026-09-18.';
            }
        }
        if ($errors) {
            throw HttpError::validation($errors);
        }
        if ($from > $to) {
            throw HttpError::validation(['from' => 'The start date must be on or before the end date.']);
        }
        $days = self::daysBetween($from, $to);
        if ($days > self::MAX_DAYS) {
            throw HttpError::validation(['from' => 'The longest range is 2 years.']);
        }

        $compare = $r->query('compare') ?: 'previous';
        if (!in_array($compare, ['none', 'previous', 'year'], true)) {
            throw HttpError::validation(['compare' => 'Use none, previous or year.']);
        }

        $interval = $r->query('interval') ?: 'auto';
        if (!in_array($interval, ['auto', 'hour', 'day', 'week', 'month'], true)) {
            throw HttpError::validation(['interval' => 'Use auto, hour, day, week or month.']);
        }
        if ($interval === 'auto') {
            $interval = $days <= 2 ? 'hour' : ($days <= 90 ? 'day' : ($days <= 366 ? 'week' : 'month'));
        } elseif ($interval === 'hour' && $days > 7) {
            throw HttpError::validation(['interval' => 'Hourly figures are available for ranges of up to 7 days.']);
        }

        $filters = [];
        foreach ($allowedFilters as $name) {
            $value = $r->query($name);
            if ($value === null || trim($value) === '') {
                continue;
            }
            $value = trim($value);
            $ok = match ($name) {
                'device' => in_array($value, ['desktop', 'mobile', 'tablet'], true),
                'method' => in_array($value, ['paystack', 'manual', 'centre'], true),
                'country' => (bool) preg_match('/^[A-Za-z]{2}$/', $value),
                default => mb_strlen($value) <= 120,
            };
            if (!$ok) {
                throw HttpError::validation([$name => 'Unknown value for this filter.']);
            }
            $filters[$name] = $name === 'country' ? strtoupper($value) : ($name === 'source' ? strtolower($value) : $value);
        }

        return new self($from, $to, $compare, $interval, $filters, $r->query('includeInternal') === '1');
    }

    public static function isDate(string $value): bool
    {
        $d = \DateTimeImmutable::createFromFormat('!Y-m-d', $value);
        return $d !== false && $d->format('Y-m-d') === $value;
    }

    public static function daysBetween(string $from, string $to): int
    {
        return (int) (new \DateTimeImmutable($from))->diff(new \DateTimeImmutable($to))->days + 1;
    }

    public function days(): int
    {
        return self::daysBetween($this->from, $this->to);
    }

    public function start(): string
    {
        return $this->from . ' 00:00:00';
    }

    /** Exclusive upper bound: midnight after the last day. */
    public function endExclusive(): string
    {
        return date('Y-m-d', strtotime($this->to . ' +1 day')) . ' 00:00:00';
    }

    /** @return array{0:string,1:string}|null */
    public function compareRange(): ?array
    {
        return match ($this->compare) {
            'previous' => [date('Y-m-d', strtotime($this->from . ' -' . $this->days() . ' days')), date('Y-m-d', strtotime($this->from . ' -1 day'))],
            'year' => [date('Y-m-d', strtotime($this->from . ' -1 year')), date('Y-m-d', strtotime($this->to . ' -1 year'))],
            default => null,
        };
    }

    /** The comparison period as its own Period (same interval, filters and staff setting), or null. */
    public function previous(): ?self
    {
        $range = $this->compareRange();
        return $range ? new self($range[0], $range[1], 'none', $this->interval, $this->filters, $this->includeInternal) : null;
    }

    /** Same period with different dates (e.g. "as of" snapshots). */
    public function withRange(string $from, string $to): self
    {
        return new self($from, $to, $this->compare, $this->interval, $this->filters, $this->includeInternal);
    }

    public function withoutFilters(): self
    {
        return new self($this->from, $this->to, $this->compare, $this->interval, [], $this->includeInternal);
    }

    public function hasTrafficFilter(): bool
    {
        return array_intersect_key($this->filters, array_flip(['source', 'medium', 'campaign', 'device', 'country', 'state'])) !== [];
    }

    /** @return list<string> bucket labels covering the range, in order */
    public function buckets(): array
    {
        $out = [];
        if ($this->interval === 'hour') {
            for ($t = strtotime($this->start()); $t < strtotime($this->endExclusive()); $t += 3600) {
                $out[] = date('Y-m-d\TH:00', $t);
            }
            return $out;
        }
        for ($d = $this->from; $d <= $this->to; $d = date('Y-m-d', strtotime($d . ' +1 day'))) {
            $key = self::bucketOf($d, $this->interval);
            if (($out[count($out) - 1] ?? null) !== $key) {
                $out[] = $key;
            }
        }
        return $out;
    }

    /** PHP bucket label for a date or datetime string. */
    public static function bucketOf(string $datetime, string $interval): string
    {
        $t = strtotime($datetime);
        return match ($interval) {
            'hour' => date('Y-m-d\TH:00', $t),
            'week' => date('Y-m-d', strtotime('monday this week', $t)),
            'month' => date('Y-m', $t),
            default => date('Y-m-d', $t),
        };
    }

    /** SQL expression producing the same bucket labels as bucketOf(). */
    public static function bucketSql(string $column, string $interval): string
    {
        return match ($interval) {
            'hour' => "DATE_FORMAT({$column}, '%Y-%m-%dT%H:00')",
            'week' => "DATE_FORMAT(DATE_SUB(DATE({$column}), INTERVAL WEEKDAY({$column}) DAY), '%Y-%m-%d')",
            'month' => "DATE_FORMAT({$column}, '%Y-%m')",
            default => "DATE_FORMAT({$column}, '%Y-%m-%d')",
        };
    }
}
