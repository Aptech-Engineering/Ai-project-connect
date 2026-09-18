<?php

declare(strict_types=1);

namespace App\Analytics;

use App\Controllers\AnalyticsController;
use App\Core\Activity;
use App\Core\Database;
use App\Core\Notifier;
use App\Core\Request;
use App\Support\Links;

/**
 * Scheduled analytics reports (spec 10.3): due-time rules, rolling ranges and the email itself.
 * Sends at 07:00 Lagos — daily, Mondays (weekly) or the 1st (monthly). CSV/XLSX are attached; the PDF format is
 * sent as an HTML summary with a link to the screen (PDFs are produced in the browser, spec 10.1).
 */
final class Reports
{
    public const RANGES = ['yesterday', 'last_7_days', 'last_30_days', 'last_month', 'this_month'];

    public static function defaultRange(string $frequency): string
    {
        return match ($frequency) {
            'daily' => 'yesterday',
            'monthly' => 'last_month',
            default => 'last_7_days',
        };
    }

    /** @return array{0:string, 1:string} from, to for a rolling range, relative to $today */
    public static function rangeDates(string $range, ?string $today = null): array
    {
        $today ??= date('Y-m-d');
        $yesterday = date('Y-m-d', strtotime($today . ' -1 day'));
        return match ($range) {
            'yesterday' => [$yesterday, $yesterday],
            'last_30_days' => [date('Y-m-d', strtotime($yesterday . ' -29 days')), $yesterday],
            'last_month' => [date('Y-m-01', strtotime(date('Y-m-01', strtotime($today)) . ' -1 month')), date('Y-m-t', strtotime(date('Y-m-01', strtotime($today)) . ' -1 month'))],
            'this_month' => [date('Y-m-01', strtotime($today)), $today],
            default => [date('Y-m-d', strtotime($yesterday . ' -6 days')), $yesterday],
        };
    }

    /** The most recent scheduled send time at or before $now. */
    public static function lastSlot(string $frequency, int $now): int
    {
        $today7 = strtotime(date('Y-m-d 07:00:00', $now));
        return match ($frequency) {
            'daily' => $today7 <= $now ? $today7 : $today7 - 86400,
            'monthly' => (static function () use ($now): int {
                $slot = strtotime(date('Y-m-01 07:00:00', $now));
                return $slot <= $now ? $slot : strtotime(date('Y-m-01 07:00:00', strtotime(date('Y-m-01', $now) . ' -1 month')));
            })(),
            default => (static function () use ($now): int {
                $slot = strtotime('monday this week 07:00:00', $now);
                return $slot <= $now ? $slot : $slot - 7 * 86400;
            })(),
        };
    }

    public static function nextSlot(string $frequency, int $now): int
    {
        $last = self::lastSlot($frequency, $now);
        return match ($frequency) {
            'daily' => $last + 86400,
            'monthly' => strtotime(date('Y-m-01 07:00:00', strtotime(date('Y-m-01', $last) . ' +1 month'))),
            default => $last + 7 * 86400,
        };
    }

    public static function isDue(array $schedule, int $now): bool
    {
        if (!(int) $schedule['active']) {
            return false;
        }
        $slot = self::lastSlot((string) $schedule['frequency'], $now);
        $since = max(strtotime((string) $schedule['created_at']), $schedule['last_sent_at'] ? strtotime((string) $schedule['last_sent_at']) : 0);
        return $slot > $since;
    }

    /** Builds and queues the report email for every recipient. Returns the number of emails queued. */
    public static function send(array $schedule): int
    {
        $owner = Database::one("SELECT * FROM users WHERE id = ? AND status = 'active'", [(int) $schedule['user_id']]);
        if ($owner === null || !AnalyticsController::canView($owner)) {
            Activity::system("Skipped scheduled analytics report \"{$schedule['name']}\": its owner no longer has analytics access");
            Database::update('analytics_schedules', ['last_sent_at' => date('Y-m-d H:i:s')], ['id' => (int) $schedule['id']]);
            return 0;
        }
        $query = json_decode((string) $schedule['query'], true) ?: [];
        $range = in_array($query['range'] ?? null, self::RANGES, true) ? $query['range'] : self::defaultRange((string) $schedule['frequency']);
        [$from, $to] = self::rangeDates($range);
        $view = (string) $schedule['view'];
        $class = AnalyticsController::SCREENS[$view];
        if ($class::ADMIN_ONLY && $owner['role'] !== 'admin') {
            return 0;
        }

        $params = array_merge(array_diff_key($query, ['range' => 1, 'view' => 1]), ['from' => $from, 'to' => $to]);
        $request = self::fakeRequest($params);
        $p = Period::fromRequest($request, $class::FILTERS);
        if ($view === 'funnels') {
            $request->params['id'] = $params['funnel'] ?? 'application';
        }
        $data = $class::data($p, $owner, $request);
        $url = Links::page('analytics', array_merge(['view' => $view], $params));
        $title = ucfirst($view);
        $period = date('j M', strtotime($from)) . ($from !== $to ? ' – ' . date('j M Y', strtotime($to)) : ' ' . date('Y', strtotime($to)));
        $subject = ucfirst((string) $schedule['frequency']) . " analytics: {$schedule['name']} ({$period})";

        $lines = self::summaryLines($data);
        $text = "{$schedule['name']} — {$title}, {$period} (Africa/Lagos)\n\n" . ($lines ? implode("\n", $lines) : 'No headline figures on this screen.')
            . "\n\nOpen the full report: {$url}\n\nConfidential — Aptech. You get this because you're a recipient of a scheduled report in AI Project Connect Analytics.";
        $html = null;
        $attachments = [];
        if ($schedule['format'] === 'pdf') {
            $html = self::html((string) $schedule['name'], $title, $period, $lines, $url);
        } else {
            $meta = [
                'title' => $title, 'range' => "{$from} to {$to}", 'filters' => AnalyticsController::filterText($p),
                'generatedAt' => date('c'), 'definitions' => Definitions::only($class::DEFINITIONS),
            ];
            $tables = $class::tables($data);
            $dir = APC_ROOT . '/storage/reports';
            if (!is_dir($dir)) {
                mkdir($dir, 0750, true);
            }
            $base = $dir . '/' . date('Ymd-His') . '-' . bin2hex(random_bytes(4)) . "-{$view}";
            if ($schedule['format'] === 'csv') {
                $first = array_key_first($tables);
                file_put_contents($base . '.csv', Export::csv($first !== null ? $tables[$first] : [], $meta + ['title' => $title . ($first ? " — {$first}" : '')]));
                $attachments[] = ['path' => $base . '.csv', 'name' => "analytics-{$view}-{$from}-to-{$to}.csv", 'mime' => 'text/csv'];
            } else {
                $xlsx = Export::xlsxAvailable();
                file_put_contents($base . ($xlsx ? '.xlsx' : '.xls'), $xlsx ? Export::xlsx($tables, $meta) : Export::xls($tables, $meta));
                $attachments[] = [
                    'path' => $base . ($xlsx ? '.xlsx' : '.xls'),
                    'name' => "analytics-{$view}-{$from}-to-{$to}" . ($xlsx ? '.xlsx' : '.xls'),
                    'mime' => $xlsx ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/vnd.ms-excel',
                ];
            }
        }

        $sent = 0;
        foreach ((array) json_decode((string) $schedule['recipients'], true) as $email) {
            // Recipients are re-checked at send time: only active staff who still have access.
            $recipient = Database::one("SELECT * FROM users WHERE email = ? AND status = 'active'", [strtolower((string) $email)]);
            if ($recipient === null || !AnalyticsController::canView($recipient) || ($class::ADMIN_ONLY && $recipient['role'] !== 'admin')) {
                continue;
            }
            Notifier::email('staff', (string) $recipient['email'], $subject, $text, null, $html, $attachments);
            $sent++;
        }
        Database::update('analytics_schedules', ['last_sent_at' => date('Y-m-d H:i:s')], ['id' => (int) $schedule['id']]);
        Activity::system("Sent scheduled analytics report \"{$schedule['name']}\" ({$view}, {$from} to {$to}) to {$sent} recipient(s)");
        return $sent;
    }

    /** @return list<string> "Label: value (change)" for each KPI on the screen */
    private static function summaryLines(array $data): array
    {
        $kpis = array_merge($data['kpis'] ?? [], $data['cash']['kpis'] ?? [], $data['booked']['kpis'] ?? []);
        $lines = [];
        foreach ($kpis as $k) {
            if (!empty($k['restricted'])) {
                continue;
            }
            $value = $k['value'];
            $formatted = $value === null ? '—' : match ($k['format']) {
                'currency' => '₦' . number_format((float) $value),
                'percent' => number_format((float) $value * 100, 1) . '%',
                'duration' => self::duration((float) $value),
                default => number_format((float) $value, floor((float) $value) == (float) $value ? 0 : 2),
            };
            $change = $k['change'] !== null ? sprintf(' (%s%.1f%% vs previous)', $k['change'] >= 0 ? '▲' : '▼', abs($k['change'] * 100)) : '';
            $lines[] = "• {$k['label']}: {$formatted}{$change}" . ($k['kind'] ? " [{$k['kind']}]" : '');
        }
        return $lines;
    }

    private static function duration(float $seconds): string
    {
        $s = (int) round($seconds);
        return match (true) {
            $s >= 86400 => intdiv($s, 86400) . 'd ' . intdiv($s % 86400, 3600) . 'h',
            $s >= 3600 => intdiv($s, 3600) . 'h ' . intdiv($s % 3600, 60) . 'm',
            $s >= 60 => intdiv($s, 60) . 'm ' . ($s % 60) . 's',
            default => $s . 's',
        };
    }

    private static function html(string $name, string $title, string $period, array $lines, string $url): string
    {
        $e = static fn (string $s) => htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
        $items = implode('', array_map(static fn ($l) => '<li style="margin:4px 0">' . $e(ltrim($l, "• ")) . '</li>', $lines));
        return '<!doctype html><html><body style="font-family:Lato,Arial,sans-serif;color:#0b1f3a;background:#f3f5f9;padding:24px">'
            . '<div style="max-width:560px;margin:auto;background:#fff;border:1px solid #e3e8f0;border-radius:16px;padding:24px">'
            . '<p style="margin:0;color:#f26b22;font-weight:bold;font-size:12px;letter-spacing:.08em">AI PROJECT CONNECT · ANALYTICS</p>'
            . '<h1 style="font-size:20px;margin:8px 0">' . $e($name) . '</h1>'
            . '<p style="color:#5b6b82;margin:0 0 16px">' . $e($title . ' · ' . $period . ' · Africa/Lagos') . '</p>'
            . '<ul style="padding-left:18px">' . ($items ?: '<li>No headline figures on this screen.</li>') . '</ul>'
            . '<p style="margin:24px 0"><a href="' . $e($url) . '" style="background:#f26b22;color:#fff;padding:12px 18px;border-radius:12px;text-decoration:none;font-weight:bold">Open the full report</a></p>'
            . '<p style="color:#5b6b82;font-size:12px">Charts and the PDF are available on the screen itself. Confidential — Aptech.</p>'
            . '</div></body></html>';
    }

    /** A Request carrying query parameters for CLI use (the router isn't involved). */
    private static function fakeRequest(array $params): Request
    {
        $_GET = array_map('strval', $params);
        return new Request('GET', '/api/analytics/report');
    }
}
