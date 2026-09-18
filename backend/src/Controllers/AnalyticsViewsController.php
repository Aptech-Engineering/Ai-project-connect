<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Analytics\Reports;
use App\Core\Activity;
use App\Core\Database;
use App\Core\HttpError;
use App\Core\Request;
use App\Core\Response;
use App\Core\Validator;
use App\Support\Links;

/** Saved views (spec 10.2) and scheduled reports (spec 10.3). */
final class AnalyticsViewsController
{
    /** Query parameters a view or schedule may keep (dates are dropped from schedules: they use a rolling range). */
    private const PARAMS = ['view', 'from', 'to', 'compare', 'interval', 'source', 'medium', 'campaign', 'device', 'country', 'state', 'category', 'method', 'includeInternal', 'funnel', 'by', 'metric', 'dimension', 'limit', 'page'];

    /* ---------------- saved views ---------------- */

    public static function views(Request $r): void
    {
        $user = AnalyticsController::viewer();
        $rows = Database::all(
            'SELECT v.*, u.name AS owner_name FROM analytics_saved_views v JOIN users u ON u.id = v.user_id WHERE v.user_id = ? OR v.shared = 1 ORDER BY v.shared, v.name',
            [(int) $user['id']],
        );
        $allowed = AnalyticsController::sections($user);
        $out = [];
        foreach ($rows as $row) {
            $view = self::present($row, $user);
            if (in_array($view['view'], $allowed, true)) {
                $out[] = $view;
            }
        }
        Response::json($out);
    }

    public static function createView(Request $r): void
    {
        $user = AnalyticsController::viewer();
        $input = $r->input();
        $data = Validator::validate($input, ['name' => 'required|string|min:1|max:120', 'shared' => 'nullable|bool']);
        $query = self::query($input['query'] ?? null, $user, true);
        if (!empty($data['shared']) && $user['role'] !== 'admin') {
            throw HttpError::forbidden('Only admins can share views.');
        }
        $id = Database::insert('analytics_saved_views', [
            'user_id' => (int) $user['id'], 'name' => $data['name'],
            'query' => json_encode($query, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), 'shared' => !empty($data['shared']) ? 1 : 0,
        ]);
        Activity::staff($user, "Saved analytics view \"{$data['name']}\"" . (!empty($data['shared']) ? ' (shared)' : ''));
        Response::json(self::present(self::findView($id), $user), 201);
    }

    public static function updateView(Request $r): void
    {
        $user = AnalyticsController::viewer();
        $row = self::findView((int) $r->params['id']);
        self::assertOwner($row, $user);
        $input = $r->input();
        $data = Validator::validate($input, ['name' => 'nullable|string|min:1|max:120', 'shared' => 'nullable|bool']);
        $changes = [];
        if (!empty($data['name'])) {
            $changes['name'] = $data['name'];
        }
        if (array_key_exists('query', $input)) {
            $changes['query'] = json_encode(self::query($input['query'], $user, true), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        }
        if (array_key_exists('shared', $data) && $data['shared'] !== null) {
            if ($user['role'] !== 'admin') {
                throw HttpError::forbidden('Only admins can share views.');
            }
            $changes['shared'] = $data['shared'] ? 1 : 0;
        }
        Database::update('analytics_saved_views', $changes, ['id' => (int) $row['id']]);
        Activity::staff($user, "Updated analytics view \"" . ($changes['name'] ?? $row['name']) . '"');
        Response::json(self::present(self::findView((int) $row['id']), $user));
    }

    public static function deleteView(Request $r): void
    {
        $user = AnalyticsController::viewer();
        $row = self::findView((int) $r->params['id']);
        self::assertOwner($row, $user);
        Database::run('DELETE FROM analytics_saved_views WHERE id = ?', [(int) $row['id']]);
        Activity::staff($user, "Deleted analytics view \"{$row['name']}\"");
        Response::noContent();
    }

    /* ---------------- schedules ---------------- */

    public static function schedules(Request $r): void
    {
        $user = AnalyticsController::viewer();
        $rows = $user['role'] === 'admin'
            ? Database::all('SELECT s.*, u.name AS owner_name FROM analytics_schedules s JOIN users u ON u.id = s.user_id ORDER BY s.name')
            : Database::all('SELECT s.*, u.name AS owner_name FROM analytics_schedules s JOIN users u ON u.id = s.user_id WHERE s.user_id = ? ORDER BY s.name', [(int) $user['id']]);
        Response::json(array_map(static fn ($row) => self::presentSchedule($row, $user), $rows));
    }

    public static function createSchedule(Request $r): void
    {
        $user = AnalyticsController::viewer();
        $input = $r->input();
        $data = self::validateSchedule($input, $user, null);
        $id = Database::insert('analytics_schedules', $data + ['user_id' => (int) $user['id']]);
        Activity::staff($user, "Created scheduled analytics report \"{$data['name']}\" ({$data['frequency']}, {$data['view']}, {$data['format']})");
        Response::json(self::presentSchedule(self::findSchedule($id), $user), 201);
    }

    public static function updateSchedule(Request $r): void
    {
        $user = AnalyticsController::viewer();
        $row = self::findSchedule((int) $r->params['id']);
        self::assertOwner($row, $user);
        $data = self::validateSchedule($r->input(), $user, $row);
        Database::update('analytics_schedules', $data, ['id' => (int) $row['id']]);
        $what = implode(', ', array_keys($data));
        Activity::staff($user, "Updated scheduled analytics report \"" . ($data['name'] ?? $row['name']) . "\" ({$what})");
        Response::json(self::presentSchedule(self::findSchedule((int) $row['id']), $user));
    }

    public static function deleteSchedule(Request $r): void
    {
        $user = AnalyticsController::viewer();
        $row = self::findSchedule((int) $r->params['id']);
        self::assertOwner($row, $user);
        Database::run('DELETE FROM analytics_schedules WHERE id = ?', [(int) $row['id']]);
        Activity::staff($user, "Deleted scheduled analytics report \"{$row['name']}\"");
        Response::noContent();
    }

    /* ---------------- helpers ---------------- */

    /** @param array|null $existing null when creating (all required fields must be present) */
    private static function validateSchedule(array $input, array $user, ?array $existing): array
    {
        $creating = $existing === null;
        $req = $creating ? 'required' : 'nullable';
        $data = Validator::validate($input, [
            'name' => "{$req}|string|min:1|max:120",
            'view' => "{$req}|string|max:20",
            'frequency' => ($creating ? 'nullable' : 'nullable') . '|in:daily,weekly,monthly',
            'format' => 'nullable|in:pdf,csv,xlsx',
            'range' => 'nullable|in:' . implode(',', Reports::RANGES),
            'recipients' => "{$req}|array|max:20",
            'active' => 'nullable|bool',
        ]);
        $out = [];
        $view = $data['view'] ?? ($existing['view'] ?? null);
        if (isset($data['view'])) {
            if (!isset(AnalyticsController::SCREENS[$data['view']])) {
                throw HttpError::validation(['view' => 'Unknown screen.']);
            }
            $out['view'] = $data['view'];
        }
        $adminOnly = AnalyticsController::SCREENS[$view]::ADMIN_ONLY;
        if ($adminOnly && $user['role'] !== 'admin') {
            throw HttpError::forbidden('Only admins can schedule this section.');
        }
        foreach (['name', 'frequency', 'format'] as $f) {
            if (!empty($data[$f])) {
                $out[$f] = $data[$f];
            }
        }
        if ($creating) {
            $out['frequency'] ??= 'weekly';
            $out['format'] ??= 'pdf';
        }
        if (array_key_exists('active', $data) && $data['active'] !== null) {
            $out['active'] = $data['active'] ? 1 : 0;
        }

        if ($creating || array_key_exists('query', $input) || isset($data['range']) || isset($data['view'])) {
            $query = array_key_exists('query', $input) ? self::query($input['query'], $user, false) : (json_decode((string) ($existing['query'] ?? '{}'), true) ?: []);
            unset($query['from'], $query['to'], $query['view']);
            $query['range'] = $data['range'] ?? ($query['range'] ?? Reports::defaultRange($out['frequency'] ?? ($existing['frequency'] ?? 'weekly')));
            $out['query'] = json_encode($query, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        }

        if (isset($data['recipients'])) {
            $emails = [];
            $errors = [];
            foreach ($data['recipients'] as $i => $email) {
                $email = strtolower(trim((string) $email));
                $staff = filter_var($email, FILTER_VALIDATE_EMAIL) ? Database::one("SELECT * FROM users WHERE email = ? AND status = 'active'", [$email]) : null;
                if ($staff === null || !AnalyticsController::canView($staff)) {
                    $errors["recipients.{$i}"] = "{$email} isn't a staff member with analytics access.";
                } elseif ($adminOnly && $staff['role'] !== 'admin') {
                    $errors["recipients.{$i}"] = "{$email} can't receive this admin-only report.";
                } else {
                    $emails[] = $email;
                }
            }
            if ($emails === [] && $errors === []) {
                $errors['recipients'] = 'Add at least one recipient.';
            }
            if ($errors) {
                throw HttpError::validation($errors);
            }
            $out['recipients'] = json_encode(array_values(array_unique($emails)));
        }
        return $out;
    }

    /** Parses a query string or object into the kept parameters; the view must exist and be allowed. */
    private static function query(mixed $raw, array $user, bool $requireView): array
    {
        if (is_string($raw)) {
            parse_str(ltrim(trim($raw), '?'), $parsed);
            $raw = $parsed;
        }
        if ($raw === null) {
            $raw = [];
        }
        if (!is_array($raw)) {
            throw HttpError::validation(['query' => 'Send the query string, e.g. "view=revenue&from=2026-08-01&to=2026-08-31".']);
        }
        $query = [];
        foreach (self::PARAMS as $key) {
            if (isset($raw[$key]) && is_scalar($raw[$key]) && (string) $raw[$key] !== '') {
                $query[$key] = mb_substr((string) $raw[$key], 0, 120);
            }
        }
        if ($requireView) {
            $view = $query['view'] ?? null;
            if ($view === null || !isset(AnalyticsController::SCREENS[$view])) {
                throw HttpError::validation(['query' => 'The query must include a known view, e.g. view=traffic.']);
            }
            if (!in_array($view, AnalyticsController::sections($user), true)) {
                throw HttpError::forbidden('Only admins can save views of this section.');
            }
        }
        return $query;
    }

    private static function present(array $row, array $user): array
    {
        $query = self::ordered(json_decode((string) $row['query'], true) ?: []);
        return [
            'id' => (int) $row['id'],
            'name' => $row['name'],
            'view' => $query['view'] ?? null,
            'query' => (object) $query,
            'url' => '/analytics?' . http_build_query($query),
            'shared' => (bool) $row['shared'],
            'mine' => (int) $row['user_id'] === (int) $user['id'],
            'owner' => ['id' => (int) $row['user_id'], 'name' => $row['owner_name'] ?? null],
            'createdAt' => date('c', (int) strtotime((string) $row['created_at'])),
            'updatedAt' => date('c', (int) strtotime((string) $row['updated_at'])),
        ];
    }

    private static function presentSchedule(array $row, array $user): array
    {
        $query = self::ordered(json_decode((string) $row['query'], true) ?: []);
        $range = $query['range'] ?? Reports::defaultRange((string) $row['frequency']);
        [$from, $to] = Reports::rangeDates($range, date('Y-m-d', Reports::nextSlot((string) $row['frequency'], time())));
        return [
            'id' => (int) $row['id'],
            'name' => $row['name'],
            'view' => $row['view'],
            'query' => (object) array_diff_key($query, ['range' => 1]),
            'range' => $range,
            'frequency' => $row['frequency'],
            'recipients' => json_decode((string) $row['recipients'], true) ?: [],
            'format' => $row['format'],
            'active' => (bool) $row['active'],
            'lastSentAt' => $row['last_sent_at'] ? date('c', (int) strtotime((string) $row['last_sent_at'])) : null,
            'nextRunAt' => (int) $row['active'] ? date('c', Reports::nextSlot((string) $row['frequency'], time())) : null,
            'nextRange' => ['from' => $from, 'to' => $to],
            'owner' => ['id' => (int) $row['user_id'], 'name' => $row['owner_name'] ?? null],
            'mine' => (int) $row['user_id'] === (int) $user['id'],
            'url' => Links::page('analytics', array_merge(['view' => $row['view']], array_diff_key($query, ['range' => 1]))),
        ];
    }

    /** Parameters in a stable order (view first), whatever order the database returns them in. */
    private static function ordered(array $query): array
    {
        $out = [];
        foreach (array_merge(self::PARAMS, ['range']) as $key) {
            if (array_key_exists($key, $query)) {
                $out[$key] = $query[$key];
            }
        }
        return $out;
    }

    private static function assertOwner(array $row, array $user): void
    {
        if ((int) $row['user_id'] !== (int) $user['id'] && $user['role'] !== 'admin') {
            throw HttpError::forbidden('Only the owner or an admin can change this.');
        }
    }

    private static function findView(int $id): array
    {
        $row = Database::one('SELECT v.*, u.name AS owner_name FROM analytics_saved_views v JOIN users u ON u.id = v.user_id WHERE v.id = ?', [$id]);
        if ($row === null) {
            throw HttpError::notFound('Saved view not found.');
        }
        return $row;
    }

    private static function findSchedule(int $id): array
    {
        $row = Database::one('SELECT s.*, u.name AS owner_name FROM analytics_schedules s JOIN users u ON u.id = s.user_id WHERE s.id = ?', [$id]);
        if ($row === null) {
            throw HttpError::notFound('Scheduled report not found.');
        }
        return $row;
    }
}
