<?php

declare(strict_types=1);

namespace App\Analytics;

use App\Core\Config;
use App\Core\Database;
use App\Core\HttpError;

/**
 * First-party tracking (spec section 7): validates a tracker batch, cleans it and stores it.
 * Never stores IP addresses, names, emails, phone numbers, Project IDs, idea references or private link tokens.
 */
final class Tracking
{
    public const MAX_EVENTS = 20;
    public const MAX_BYTES = 32 * 1024;
    private const IDLE_SECONDS = 1800;
    private const CLOCK_SKEW_SECONDS = 600;

    /** Query parameters kept on paths; everything else (resume, token, reset, reference, ref, code, email…) is dropped. */
    private const KEEP_PARAMS = ['view', 'funnel', 'payment'];

    /**
     * The event catalogue (spec 7.3, as implemented by the site's tracker):
     *   props  => allowed prop keys and their values (list = enum, string = regex); anything else is dropped
     *   name   => which prop is stored in `name` (null = name stays empty)
     *   target => the identifying prop, required for the event to be kept
     * page_view has no props; its title comes from the event's top-level `title`.
     */
    private const EVENTS = [
        'page_view' => ['props' => [], 'name' => null, 'target' => null],
        'cta_click' => ['props' => ['id' => '/^[a-z0-9_]{1,60}$/'], 'name' => 'id', 'target' => 'id'],
        'tracker_search' => ['props' => ['kind' => ['project', 'idea'], 'result' => ['found', 'not_found', 'rate_limited', 'error']], 'name' => null, 'target' => 'kind'],
        'portal_signin' => ['props' => ['step' => ['code_requested', 'verified', 'failed']], 'name' => 'step', 'target' => 'step'],
        'idea_form' => ['props' => ['step' => ['opened', 'about_you', 'idea', 'budget', 'payment', 'draft_saved', 'resume_link_requested', 'submitted'], 'variant' => ['modal', 'page']], 'name' => 'step', 'target' => 'step'],
        'payment' => ['props' => ['step' => ['started', 'returned_success', 'returned_failed', 'transfer_reported'], 'method' => ['paystack', 'manual']], 'name' => 'step', 'target' => 'step'],
        'course_view' => ['props' => ['courseId' => '/^[a-z0-9-]{1,60}$/'], 'name' => 'courseId', 'target' => 'courseId'],
        'course_click' => ['props' => ['courseId' => '/^[a-z0-9-]{1,60}$/'], 'name' => 'courseId', 'target' => 'courseId'],
        'quote' => ['props' => ['step' => ['viewed', 'accepted', 'declined']], 'name' => 'step', 'target' => 'step'],
        'download' => ['props' => ['kind' => ['report', 'proposal', 'file']], 'name' => null, 'target' => 'kind'],
        'outbound_click' => ['props' => ['host' => '/^[a-z0-9.-]{1,120}$/'], 'name' => null, 'target' => 'host'],
        'scroll_depth' => ['props' => ['depth' => ['25', '50', '75', '100']], 'name' => null, 'target' => 'depth'],
        'client_error' => ['props' => ['code' => '/^[A-Za-z0-9_.-]{1,40}$/'], 'name' => null, 'target' => 'code'],
    ];

    /** SQL for an event's identifying value: its name, or the identifying prop for events without one. */
    public static function targetSql(string $alias = ''): string
    {
        $a = $alias !== '' ? $alias . '.' : '';
        return "CASE {$a}event
            WHEN 'tracker_search' THEN JSON_UNQUOTE(JSON_EXTRACT({$a}props, '$.kind'))
            WHEN 'download' THEN JSON_UNQUOTE(JSON_EXTRACT({$a}props, '$.kind'))
            WHEN 'outbound_click' THEN JSON_UNQUOTE(JSON_EXTRACT({$a}props, '$.host'))
            WHEN 'scroll_depth' THEN JSON_UNQUOTE(JSON_EXTRACT({$a}props, '$.depth'))
            WHEN 'client_error' THEN JSON_UNQUOTE(JSON_EXTRACT({$a}props, '$.code'))
            ELSE {$a}name END";
    }

    /** Events that do not count as an interaction for the bounce rate. */
    public const PASSIVE_EVENTS = ['page_view', 'scroll_depth', 'client_error'];

    private const BOT_PATTERN = '/bot|crawl|spider|slurp|headless|phantom|puppeteer|playwright|selenium|lighthouse|pagespeed|gtmetrix|curl\/|wget|python-|go-http|java\/|okhttp|axios|node-fetch|httpclient|libwww|facebookexternalhit|whatsapp\/|preview|monitor|pingdom|uptime|scanner|dataprovider/i';

    private const SEARCH = ['google' => 'google', 'bing' => 'bing', 'duckduckgo' => 'duckduckgo', 'yahoo' => 'yahoo', 'yandex' => 'yandex'];
    private const SOCIAL = [
        'facebook.com' => 'facebook', 'fb.com' => 'facebook', 'fb.me' => 'facebook', 'instagram.com' => 'instagram',
        'x.com' => 'x', 't.co' => 'x', 'twitter.com' => 'x', 'linkedin.com' => 'linkedin', 'lnkd.in' => 'linkedin',
        'tiktok.com' => 'tiktok', 'whatsapp.com' => 'whatsapp', 'wa.me' => 'whatsapp', 'youtube.com' => 'youtube', 'youtu.be' => 'youtube',
    ];
    private const EMAIL = ['mail.google.com' => 'gmail', 'outlook.live.com' => 'outlook', 'outlook.office.com' => 'outlook', 'outlook.office365.com' => 'outlook'];

    /* ---------------- request checks ---------------- */

    /** Origin (or Referer) must be our own site or an allowed CORS origin. Returns the allowed Origin to echo, or null. */
    public static function allowedOrigin(?string $origin, ?string $referer): ?string
    {
        $candidate = $origin ?: ($referer ? self::originOf($referer) : null);
        if ($candidate === null || $candidate === 'null') {
            throw HttpError::forbidden('Tracking is only accepted from this website.');
        }
        $host = strtolower((string) parse_url($candidate, PHP_URL_HOST));
        $allowed = in_array($candidate, (array) Config::get('cors.allowed_origins', []), true)
            || in_array($host, self::ownHosts(), true);
        if (!$allowed) {
            throw HttpError::forbidden('Tracking is only accepted from this website.');
        }
        return $origin ?: null;
    }

    public static function isBot(?string $userAgent): bool
    {
        return $userAgent === null || trim($userAgent) === '' || (bool) preg_match(self::BOT_PATTERN, $userAgent);
    }

    /** @return list<string> hosts that count as "us" (never a referral source) */
    public static function ownHosts(): array
    {
        $hosts = [];
        foreach ([Config::get('app.url'), Config::get('app.frontend_url')] as $url) {
            if ($url && ($h = parse_url((string) $url, PHP_URL_HOST))) {
                $hosts[] = strtolower($h);
            }
        }
        if (!empty($_SERVER['HTTP_HOST'])) {
            $hosts[] = strtolower((string) preg_replace('/:\d+$/', '', (string) $_SERVER['HTTP_HOST']));
        }
        foreach ((array) Config::get('cors.allowed_origins', []) as $o) {
            if ($h = parse_url((string) $o, PHP_URL_HOST)) {
                $hosts[] = strtolower($h);
            }
        }
        return array_values(array_unique($hosts));
    }

    /* ---------------- parsing ---------------- */

    /**
     * Validates the batch shape. Individual events with an unknown name or invalid property values are dropped.
     * @return array{visitorId:string, sessionId:string, referrerHost:?string, utm:array, events:list<array>}
     */
    public static function parse(array $body): array
    {
        $uuid = '/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i';
        $errors = [];
        foreach (['visitorId', 'sessionId'] as $field) {
            if (!is_string($body[$field] ?? null) || !preg_match($uuid, $body[$field])) {
                $errors[$field] = 'Must be a UUID v4.';
            }
        }
        $events = $body['events'] ?? null;
        if (!is_array($events) || !array_is_list($events) || $events === []) {
            $errors['events'] = 'Send between 1 and 20 events.';
        } elseif (count($events) > self::MAX_EVENTS) {
            $errors['events'] = 'Send at most 20 events per batch.';
        }
        if ($errors) {
            throw HttpError::validation($errors);
        }

        $utm = [];
        if (is_array($body['utm'] ?? null)) {
            foreach (['source', 'medium', 'campaign', 'term', 'content'] as $k) {
                $v = $body['utm'][$k] ?? null;
                if (is_string($v) && trim($v) !== '') {
                    $utm[$k] = mb_substr(trim($v), 0, 120);
                }
            }
        }

        $clean = [];
        foreach ($events as $e) {
            if (is_array($e) && ($event = self::cleanEvent($e)) !== null) {
                $clean[] = $event;
                // UTM tags on the first page (e.g. /?utm_source=…) count when the client didn't send them separately.
                if ($utm === [] && $event['event'] === 'page_view') {
                    $utm = $event['utm'];
                }
            }
        }

        $referrer = is_string($body['referrer'] ?? null) ? $body['referrer'] : null;
        return [
            'visitorId' => strtolower($body['visitorId']),
            'sessionId' => strtolower($body['sessionId']),
            'referrerHost' => self::referrerHost($referrer),
            'utm' => $utm,
            'events' => $clean,
        ];
    }

    /** @return array{event:string, name:?string, path:?string, props:array, at:string, utm:array}|null */
    private static function cleanEvent(array $e): ?array
    {
        $event = $e['event'] ?? null;
        if (!is_string($event) || !isset(self::EVENTS[$event])) {
            return null;
        }
        $spec = self::EVENTS[$event];
        $given = is_array($e['props'] ?? null) ? $e['props'] : [];
        // The identifying value may arrive as `name` instead of a prop (e.g. cta_click sends the id as name).
        if ($spec['name'] !== null && !isset($given[$spec['name']]) && isset($e['name'])) {
            $given[$spec['name']] = $e['name'];
        }
        $props = [];
        foreach ($spec['props'] as $key => $rule) {
            $value = $given[$key] ?? null;
            if ($value === null || $value === '') {
                continue;
            }
            if (is_int($value) || is_float($value)) {
                $value = (string) $value;
            }
            if (!is_string($value)) {
                return null;
            }
            $value = trim($value);
            $ok = is_array($rule) ? in_array($value, $rule, true) : (bool) preg_match($rule, $value);
            if (!$ok) {
                return null; // strict: an invalid value drops the whole event
            }
            $props[$key] = $value;
        }
        if ($spec['target'] !== null && !isset($props[$spec['target']])) {
            return null; // every non-page event needs its identifying property
        }
        if ($event === 'page_view' && is_string($e['title'] ?? null) && trim($e['title']) !== '') {
            $props['title'] = mb_substr(trim(strip_tags($e['title'])), 0, 120);
        }

        [$path, $utm] = self::cleanPath(is_string($e['path'] ?? null) ? $e['path'] : null);
        return [
            'event' => $event,
            'name' => $spec['name'] !== null ? mb_substr($props[$spec['name']], 0, 80) : null,
            'path' => $path,
            'props' => $props,
            'at' => self::clampTime($e['at'] ?? null),
            'utm' => $utm,
        ];
    }

    /**
     * Keeps only the path and the whitelisted query parameters (utm_*, view, funnel, payment).
     * @return array{0:?string, 1:array} cleaned path and any UTM values found on it
     */
    public static function cleanPath(?string $raw): array
    {
        if ($raw === null || trim($raw) === '') {
            return [null, []];
        }
        $parts = parse_url(trim($raw));
        if ($parts === false) {
            return [null, []];
        }
        $path = '/' . ltrim((string) ($parts['path'] ?? '/'), '/');
        $path = (string) preg_replace('#/{2,}#', '/', $path);
        parse_str((string) ($parts['query'] ?? ''), $query);
        $kept = [];
        $utm = [];
        foreach ($query as $key => $value) {
            if (!is_string($value)) {
                continue;
            }
            $key = (string) $key;
            if (str_starts_with($key, 'utm_')) {
                $kept[$key] = $value;
                $name = substr($key, 4);
                if (in_array($name, ['source', 'medium', 'campaign', 'term', 'content'], true) && $value !== '') {
                    $utm[$name] = mb_substr($value, 0, 120);
                }
            } elseif (in_array($key, self::KEEP_PARAMS, true)) {
                $kept[$key] = $value;
            }
        }
        $clean = $kept === [] ? $path : $path . '?' . http_build_query($kept);
        return [mb_substr($clean, 0, 255), $utm];
    }

    public static function referrerHost(?string $referrer): ?string
    {
        if ($referrer === null || trim($referrer) === '') {
            return null;
        }
        $host = strtolower((string) parse_url(trim($referrer), PHP_URL_HOST));
        $host = (string) preg_replace('/^www\./', '', $host);
        return $host !== '' && preg_match('/^[a-z0-9.-]{1,120}$/', $host) ? $host : null;
    }

    /** @return array{0:string, 1:string, 2:?string} source, medium, campaign (spec 7.5) */
    public static function attribution(array $utm, ?string $referrerHost): array
    {
        if (!empty($utm['source'])) {
            return [mb_substr(strtolower($utm['source']), 0, 80), mb_substr(strtolower($utm['medium'] ?? 'referral') ?: 'referral', 0, 40), isset($utm['campaign']) ? mb_substr($utm['campaign'], 0, 120) : null];
        }
        $host = $referrerHost;
        if ($host === null || in_array($host, self::ownHosts(), true) || in_array('www.' . $host, self::ownHosts(), true)) {
            return ['direct', 'none', null];
        }
        foreach (self::EMAIL as $domain => $name) {
            if ($host === $domain || str_ends_with($host, '.' . $domain)) {
                return [$name, 'email', null];
            }
        }
        foreach (self::SEARCH as $needle => $name) {
            if (preg_match('/(^|\.)' . $needle . '\.[a-z.]+$/', $host)) {
                return [$name, 'search', null];
            }
        }
        foreach (self::SOCIAL as $domain => $name) {
            if ($host === $domain || str_ends_with($host, '.' . $domain)) {
                return [$name, 'social', null];
            }
        }
        return [mb_substr($host, 0, 80), 'referral', null];
    }

    /** @return array{0:string, 1:string, 2:string} device, browser, os — simple regexes, no library */
    public static function userAgent(string $ua): array
    {
        $device = match (true) {
            (bool) preg_match('/ipad|tablet|kindle|silk|playbook/i', $ua), (bool) preg_match('/android(?!.*mobile)/i', $ua) => 'tablet',
            (bool) preg_match('/mobi|iphone|ipod|android|windows phone|blackberry|opera mini/i', $ua) => 'mobile',
            default => 'desktop',
        };
        $browser = match (true) {
            (bool) preg_match('/Edg(e|A|iOS)?\//', $ua) => 'Edge',
            (bool) preg_match('/OPR\/|Opera/', $ua) => 'Opera',
            (bool) preg_match('/SamsungBrowser\//', $ua) => 'Samsung Internet',
            (bool) preg_match('/UCBrowser\//', $ua) => 'UC Browser',
            (bool) preg_match('/Firefox\/|FxiOS\//', $ua) => 'Firefox',
            (bool) preg_match('/Chrome\/|CriOS\//', $ua) => 'Chrome',
            (bool) preg_match('/Safari\//', $ua) && (bool) preg_match('/Version\//', $ua) => 'Safari',
            default => 'Other',
        };
        $os = match (true) {
            (bool) preg_match('/iPhone|iPad|iPod/', $ua) => 'iOS',
            (bool) preg_match('/Android/', $ua) => 'Android',
            (bool) preg_match('/CrOS/', $ua) => 'ChromeOS',
            (bool) preg_match('/Windows/', $ua) => 'Windows',
            (bool) preg_match('/Mac OS X|Macintosh/', $ua) => 'macOS',
            (bool) preg_match('/Linux/', $ua) => 'Linux',
            default => 'Other',
        };
        return [$device, $browser, $os];
    }

    /** Client time in Lagos, clamped to server time ± 10 minutes. */
    public static function clampTime(mixed $at): string
    {
        $now = new \DateTimeImmutable('now');
        $t = null;
        if (is_string($at) && $at !== '') {
            try {
                $t = (new \DateTimeImmutable($at))->setTimezone($now->getTimezone());
            } catch (\Exception) {
                $t = null;
            }
        }
        if ($t === null) {
            $t = $now;
        }
        $min = $now->modify('-' . self::CLOCK_SKEW_SECONDS . ' seconds');
        $max = $now->modify('+' . self::CLOCK_SKEW_SECONDS . ' seconds');
        $t = $t < $min ? $min : ($t > $max ? $max : $t);
        return $t->format('Y-m-d H:i:s.v');
    }

    /* ---------------- storing ---------------- */

    /**
     * Stores a parsed batch: events, visitor first/last seen, and the session rows (created or updated).
     * @param array{internal:bool, signedInAs:string, userAgent:string, country:?string} $context
     * @return int events stored
     */
    public static function store(array $batch, array $context): int
    {
        $events = $batch['events'];
        if ($events === []) {
            return 0;
        }
        usort($events, static fn ($a, $b) => strcmp($a['at'], $b['at']));
        [$device, $browser, $os] = self::userAgent($context['userAgent']);
        $receivedAt = (new \DateTimeImmutable())->format('Y-m-d H:i:s.v');

        return Database::transaction(static function () use ($batch, $events, $context, $device, $browser, $os, $receivedAt): int {
            // The browser's session, split server-side after 30 idle minutes or at Lagos midnight.
            $current = Database::one(
                'SELECT * FROM analytics_sessions WHERE client_session_id = ? ORDER BY started_at DESC LIMIT 1 FOR UPDATE',
                [$batch['sessionId']],
            );
            $newSessions = [];
            $touched = [];
            $rows = [];
            foreach ($events as $e) {
                $usable = $current !== null
                    && $current['visitor_id'] === $batch['visitorId']
                    && substr((string) $current['started_at'], 0, 10) === substr($e['at'], 0, 10)
                    && strtotime($e['at']) - strtotime((string) $current['ended_at']) <= self::IDLE_SECONDS
                    && strtotime((string) $current['started_at']) - strtotime($e['at']) <= self::IDLE_SECONDS;
                if (!$usable) {
                    $taken = Database::value('SELECT 1 FROM analytics_sessions WHERE session_id = ?', [$batch['sessionId']])
                        || isset($newSessions[$batch['sessionId']]);
                    $id = $taken ? self::derivedId($batch['sessionId'], $e['at']) : $batch['sessionId'];
                    [$source, $medium, $campaign] = self::attribution($batch['utm'], $batch['referrerHost']);
                    $current = [
                        'session_id' => $id, 'client_session_id' => $batch['sessionId'], 'visitor_id' => $batch['visitorId'],
                        'started_at' => $e['at'], 'ended_at' => $e['at'], 'source' => $source, 'medium' => $medium,
                        'campaign' => $campaign, 'referrer_host' => $source === 'direct' ? null : $batch['referrerHost'],
                        'device' => $device, 'browser' => $browser, 'os' => $os, 'country' => $context['country'], 'state' => null,
                        'internal' => $context['internal'] ? 1 : 0, 'signed_in_as' => $context['signedInAs'],
                    ];
                    $newSessions[$id] = $current;
                } elseif ($e['at'] > $current['ended_at']) {
                    $current['ended_at'] = $e['at'];
                }
                $touched[$current['session_id']] = true;
                $rows[] = [
                    $e['at'], $receivedAt, $batch['visitorId'], $current['session_id'], $e['event'], $e['name'], $e['path'],
                    $e['props'] === [] ? null : json_encode($e['props'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                    $current['source'], $current['medium'], $current['campaign'], $current['referrer_host'],
                    $current['device'], $current['browser'], $current['os'], $current['country'], $current['state'],
                    $context['internal'] ? 1 : 0,
                ];
            }

            foreach ($newSessions as $s) {
                Database::insert('analytics_sessions', $s);
            }
            self::insertEvents($rows);

            $first = $events[0]['at'];
            $last = $events[count($events) - 1]['at'];
            Database::run(
                'INSERT INTO analytics_visitors (visitor_id, first_seen, last_seen) VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE first_seen = LEAST(first_seen, VALUES(first_seen)), last_seen = GREATEST(last_seen, VALUES(last_seen))',
                [$batch['visitorId'], substr($first, 0, 19), substr($last, 0, 19)],
            );

            $ids = array_keys($touched);
            if ($context['internal']) {
                self::whereIn('UPDATE analytics_sessions SET internal = 1 WHERE session_id IN', $ids);
            }
            if ($context['signedInAs'] !== 'none') {
                self::whereIn("UPDATE analytics_sessions SET signed_in_as = '" . ($context['signedInAs'] === 'staff' ? 'staff' : 'client') . "' WHERE signed_in_as = 'none' AND session_id IN", $ids);
            }
            self::refreshSessions($ids);
            return count($rows);
        });
    }

    /** Recomputes session aggregates from its events (idempotent; also used by the nightly rollup). @param list<string> $ids */
    public static function refreshSessions(array $ids): void
    {
        if ($ids === []) {
            return;
        }
        foreach (array_chunk($ids, 500) as $chunk) {
            $in = implode(',', array_fill(0, count($chunk), '?'));
            $passive = "'" . implode("','", self::PASSIVE_EVENTS) . "'";
            Database::run(
                "UPDATE analytics_sessions s JOIN (
                    SELECT session_id, MIN(occurred_at) AS mn, MAX(occurred_at) AS mx, SUM(event = 'page_view') AS pv, COUNT(*) AS ev,
                           SUM(event NOT IN ({$passive})) AS inter
                    FROM analytics_events WHERE session_id IN ({$in}) GROUP BY session_id
                 ) a ON a.session_id = s.session_id
                 SET s.started_at = a.mn, s.ended_at = a.mx, s.page_views = a.pv, s.events = a.ev, s.is_bounce = (a.pv = 1 AND a.inter = 0)",
                $chunk,
            );
            Database::run(
                "UPDATE analytics_sessions s SET
                    landing_path = (SELECT e.path FROM analytics_events e WHERE e.session_id = s.session_id AND e.event = 'page_view' ORDER BY e.occurred_at, e.id LIMIT 1),
                    exit_path = (SELECT e.path FROM analytics_events e WHERE e.session_id = s.session_id AND e.event = 'page_view' ORDER BY e.occurred_at DESC, e.id DESC LIMIT 1)
                 WHERE s.session_id IN ({$in})",
                $chunk,
            );
        }
    }

    /** Multi-row insert of prepared event tuples (also used by the demo seeder). @param list<list<mixed>> $rows */
    public static function insertEvents(array $rows): void
    {
        $cols = '(occurred_at, received_at, visitor_id, session_id, event, name, path, props, source, medium, campaign, referrer_host, device, browser, os, country, state, internal)';
        foreach (array_chunk($rows, 400) as $chunk) {
            $place = '(' . implode(',', array_fill(0, 18, '?')) . ')';
            $params = [];
            foreach ($chunk as $r) {
                array_push($params, ...$r);
            }
            Database::run('INSERT INTO analytics_events ' . $cols . ' VALUES ' . implode(',', array_fill(0, count($chunk), $place)), $params);
        }
    }

    /** A new session id derived from the browser's id, used when the server has to split a session. */
    public static function derivedId(string $clientSessionId, string $at): string
    {
        $h = sha1($clientSessionId . '|' . $at);
        return sprintf('%s-%s-5%s-%s%s-%s', substr($h, 0, 8), substr($h, 8, 4), substr($h, 13, 3), dechex(8 | (hexdec($h[16]) & 3)), substr($h, 17, 3), substr($h, 20, 12));
    }

    private static function originOf(string $url): ?string
    {
        $p = parse_url($url);
        if (!isset($p['scheme'], $p['host'])) {
            return null;
        }
        return $p['scheme'] . '://' . $p['host'] . (isset($p['port']) ? ':' . $p['port'] : '');
    }

    /** @param list<string> $ids */
    private static function whereIn(string $sqlPrefix, array $ids): void
    {
        if ($ids !== []) {
            Database::run($sqlPrefix . ' (' . implode(',', array_fill(0, count($ids), '?')) . ')', $ids);
        }
    }
}
