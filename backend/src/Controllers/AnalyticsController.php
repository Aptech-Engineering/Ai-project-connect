<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Analytics\Definitions;
use App\Analytics\Export;
use App\Analytics\Metrics;
use App\Analytics\Period;
use App\Analytics\Screens;
use App\Core\Activity;
use App\Core\Auth;
use App\Core\HttpError;
use App\Core\Request;
use App\Core\Response;

/**
 * Analytics dashboard API (spec section 9). Read-only; every endpoint checks the staff session and
 * analytics access; Revenue and Team are admin-only.
 */
final class AnalyticsController
{
    /** view => screen class, in navigation order (spec 9.2 `sections`). */
    public const SCREENS = [
        'overview' => Screens\Overview::class,
        'traffic' => Screens\Traffic::class,
        'engagement' => Screens\Engagement::class,
        'funnels' => Screens\Funnels::class,
        'revenue' => Screens\Revenue::class,
        'projects' => Screens\Projects::class,
        'pipeline' => Screens\Pipeline::class,
        'clients' => Screens\Clients::class,
        'courses' => Screens\Courses::class,
        'team' => Screens\Team::class,
        'operations' => Screens\Operations::class,
        'realtime' => Screens\Realtime::class,
    ];

    /* ---------------- access ---------------- */

    /** Signed-in staff (401) with analytics access (403). */
    public static function viewer(): array
    {
        $user = Auth::requireStaff();
        if (!self::canView($user)) {
            throw HttpError::forbidden("Your account doesn't have access to Analytics. Ask an admin to turn it on.");
        }
        return $user;
    }

    public static function canView(array $user): bool
    {
        return $user['role'] === 'admin' || (bool) ($user['can_view_analytics'] ?? false);
    }

    /** @return list<string> sections this user may open */
    public static function sections(array $user): array
    {
        if (!self::canView($user)) {
            return [];
        }
        return array_values(array_filter(array_keys(self::SCREENS), static fn (string $s) => $user['role'] === 'admin' || !self::SCREENS[$s]::ADMIN_ONLY));
    }

    private static function screenFor(string $view, array $user): string
    {
        $class = self::SCREENS[$view] ?? null;
        if ($class === null) {
            throw HttpError::validation(['view' => 'Unknown screen.']);
        }
        if ($class::ADMIN_ONLY && $user['role'] !== 'admin') {
            throw HttpError::forbidden('Only admins can see this section.');
        }
        return $class;
    }

    /* ---------------- endpoints ---------------- */

    public static function me(Request $r): void
    {
        $user = Auth::requireStaff();
        $can = self::canView($user);
        // Audit: one "opened Analytics" entry per session.
        if ($can && empty($_SESSION['analytics_opened'])) {
            $_SESSION['analytics_opened'] = true;
            Activity::staff($user, 'Signed in to Analytics');
        }
        Response::json([
            'user' => ['id' => (int) $user['id'], 'name' => $user['name'], 'role' => $user['role']],
            'canViewAnalytics' => $can,
            'sections' => self::sections($user),
            'timezone' => 'Africa/Lagos',
            'currency' => 'NGN',
            'trackingSince' => $can ? Metrics::trackingSince() : null,
        ]);
    }

    /** GET /api/analytics/{view} for every screen. */
    public static function screen(Request $r): void
    {
        $view = self::viewFromRoute($r);
        $user = self::viewer();
        $class = self::screenFor($view, $user);
        $p = Period::fromRequest($r, $class::FILTERS);
        Response::json(self::envelope($p, $class::FILTERS, $class::DEFINITIONS, $class::data($p, $user, $r)), 200, $view === 'realtime' ? 'no-store' : 'private, max-age=60');
    }

    public static function trafficTimeseries(Request $r): void
    {
        $user = self::viewer();
        $p = Period::fromRequest($r, Screens\Traffic::FILTERS);
        Response::json(self::envelope($p, Screens\Traffic::FILTERS, Screens\Traffic::DEFINITIONS, Screens\Traffic::timeseries($p, $r)), 200, 'private, max-age=60');
    }

    public static function trafficBreakdown(Request $r): void
    {
        $user = self::viewer();
        $p = Period::fromRequest($r, Screens\Traffic::FILTERS);
        Response::json(self::envelope($p, Screens\Traffic::FILTERS, array_merge(Screens\Traffic::DEFINITIONS, ['source', 'conversion']), Screens\Traffic::breakdownFromRequest($p, $r)), 200, 'private, max-age=60');
    }

    /** GET /api/analytics/export?view=&table=&format=csv|xlsx (+ the screen's usual parameters). */
    public static function export(Request $r): void
    {
        $user = self::viewer();
        $view = (string) $r->query('view');
        $class = self::screenFor($view, $user);
        $format = $r->query('format') ?: 'csv';
        if (!in_array($format, ['csv', 'xlsx'], true)) {
            throw HttpError::validation(['format' => 'Use csv or xlsx.']);
        }
        $p = Period::fromRequest($r, $class::FILTERS);
        if ($view === 'funnels') {
            $r->params['id'] = $r->query('funnel') ?: 'application';
        }
        $data = $class::data($p, $user, $r);
        if ($view === 'revenue') {
            $data['ledgerAll'] = Screens\Revenue::ledger($p, 1, true)[0];
        }
        if ($view === 'traffic') {
            $data['breakdown'] = Screens\Traffic::breakdown($p, $r->query('dimension') ?: 'source', 500)['rows'];
        }
        $tables = $class::tables($data);
        $table = $r->query('table');
        if ($table !== null && $table !== '') {
            if (!isset($tables[$table])) {
                throw HttpError::validation(['table' => 'Tables on this screen: ' . implode(', ', array_keys($tables)) . '.']);
            }
            $tables = [$table => $tables[$table]];
        } elseif ($format === 'csv') {
            if ($tables === []) {
                throw HttpError::validation(['table' => 'There is no table to export on this screen for this range.']);
            }
            $table = array_key_first($tables);
            $tables = [$table => $tables[$table]];
        }

        $meta = [
            'title' => ucfirst($view) . ($table ? ' — ' . $table : ''),
            'range' => $p->from . ' to ' . $p->to . ($p->compareRange() ? ' (compared with ' . implode(' to ', $p->compareRange()) . ')' : ''),
            'filters' => self::filterText($p),
            'generatedAt' => date('c'),
            'definitions' => Definitions::only($class::DEFINITIONS),
        ];
        $base = sprintf('analytics-%s%s-%s-to-%s', $view, $table ? '-' . preg_replace('/[^a-z0-9]+/i', '-', $table) : '', $p->from, $p->to);
        if ($format === 'csv') {
            $body = Export::csv(reset($tables) ?: [], $meta);
            $mime = 'text/csv; charset=utf-8';
            $filename = $base . '.csv';
        } elseif (Export::xlsxAvailable()) {
            $body = Export::xlsx($tables, $meta);
            $mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
            $filename = $base . '.xlsx';
        } else {
            $body = Export::xls($tables, $meta);
            $mime = 'application/vnd.ms-excel';
            $filename = $base . '.xls';
        }
        Activity::staff($user, "Exported analytics {$view}" . ($table ? " ({$table})" : '') . " as {$format}, {$p->from} to {$p->to}");

        http_response_code(200);
        header('Content-Type: ' . $mime);
        header('Content-Disposition: attachment; filename="' . $filename . '"');
        header('Content-Length: ' . strlen($body));
        header('Cache-Control: private, no-store');
        header('X-Export-Format: ' . pathinfo($filename, PATHINFO_EXTENSION));
        echo $body;
    }

    /* ---------------- helpers ---------------- */

    /** The spec 9.3 envelope. */
    public static function envelope(Period $p, array $filters, array $definitions, array $data): array
    {
        $compare = $p->compareRange();
        return [
            'range' => ['from' => $p->from, 'to' => $p->to, 'timezone' => 'Africa/Lagos', 'interval' => $p->interval],
            'compare' => $compare ? ['from' => $compare[0], 'to' => $compare[1]] : null,
            'generatedAt' => date('c'),
            'meta' => [
                'trackingSince' => Metrics::trackingSince(),
                'filters' => $filters,
                'appliedFilters' => (object) $p->filters,
                'includeInternal' => $p->includeInternal,
                'definitions' => (object) Definitions::only($definitions),
            ],
            'data' => $data,
        ];
    }

    public static function filterText(Period $p): string
    {
        $parts = [];
        foreach ($p->filters as $k => $v) {
            $parts[] = "{$k} = {$v}";
        }
        $parts[] = $p->includeInternal ? 'staff traffic included' : 'staff traffic excluded';
        return implode(', ', $parts);
    }

    private static function viewFromRoute(Request $r): string
    {
        if (isset($r->params['id'])) {
            return 'funnels';
        }
        return (string) preg_replace('#^/api/analytics/#', '', $r->path);
    }
}
