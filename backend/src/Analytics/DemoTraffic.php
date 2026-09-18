<?php

declare(strict_types=1);

namespace App\Analytics;

use App\Core\Database;

/**
 * Synthetic website traffic for local development (php bin/setup.php --demo --demo-analytics).
 * About 90 days of sessions with realistic sources, devices, weekday/hour patterns, CTA clicks,
 * tracker searches, portal sign-ins and application-funnel drop-offs, plus a month of API request log.
 * Deterministic (seeded), so screenshots and demos stay stable.
 */
final class DemoTraffic
{
    private const SOURCES = [
        // [weight, source, medium, campaign, referrer host]
        [30, 'direct', 'none', null, null],
        [27, 'google', 'search', null, 'google.com'],
        [2, 'bing', 'search', null, 'bing.com'],
        [11, 'instagram', 'social', null, 'l.instagram.com'],
        [8, 'facebook', 'social', null, 'm.facebook.com'],
        [7, 'whatsapp', 'social', null, 'wa.me'],
        [3, 'linkedin', 'social', null, 'linkedin.com'],
        [2, 'x', 'social', null, 't.co'],
        [4, 'newsletter', 'email', 'sept-cohort', null],
        [2, 'techcabal.com', 'referral', null, 'techcabal.com'],
        [2, 'nairaland.com', 'referral', null, 'nairaland.com'],
        [2, 'aptech-education.com.ng', 'referral', null, 'aptech-education.com.ng'],
    ];
    private const DEVICES = [
        [64, 'mobile', [[55, 'Chrome', 'Android'], [20, 'Safari', 'iOS'], [12, 'Opera', 'Android'], [8, 'Samsung Internet', 'Android'], [5, 'UC Browser', 'Android']]],
        [31, 'desktop', [[62, 'Chrome', 'Windows'], [14, 'Edge', 'Windows'], [12, 'Safari', 'macOS'], [8, 'Firefox', 'Windows'], [4, 'Chrome', 'Linux']]],
        [5, 'tablet', [[60, 'Safari', 'iOS'], [40, 'Chrome', 'Android']]],
    ];
    private const COUNTRIES = [[92, 'NG'], [3, 'GH'], [2, 'GB'], [2, 'US'], [1, 'KE']];
    private const HOURS = [1, 1, 1, 1, 1, 2, 3, 5, 7, 9, 10, 10, 9, 8, 7, 7, 7, 8, 9, 10, 10, 8, 5, 2];
    private const CTAS = ['nav_submit_idea', 'hero_track', 'flier_cta', 'course_enrol', 'course_info', 'footer_cta', 'announcement_link'];
    private const COURSES = ['react', 'next', 'node', 'flutter', 'figma', 'postgres', 'cloud'];

    /** @return array{sessions:int, events:int, requests:int} */
    public static function seed(int $days = 90): array
    {
        mt_srand(20260918);
        $visitorsSeen = [];
        $sessions = [];
        $events = [];
        $now = time();
        $today = date('Y-m-d');

        for ($d = $days - 1; $d >= 0; $d--) {
            $day = date('Y-m-d', strtotime("-{$d} days"));
            $weekday = (int) date('N', strtotime($day));
            $factor = [1 => 1.08, 1.12, 1.1, 1.05, 0.98, 0.72, 0.6][$weekday];
            $trend = 0.75 + 0.5 * (($days - $d) / $days);
            $count = (int) round(115 * $factor * $trend * (0.85 + mt_rand(0, 30) / 100));

            for ($i = 0; $i < $count; $i++) {
                $hour = self::pick(array_map(null, self::HOURS, range(0, 23)));
                $start = strtotime($day . sprintf(' %02d:%02d:%02d', $hour, mt_rand(0, 59), mt_rand(0, 59)));
                if ($day === $today && $start > $now - 120) {
                    continue; // no future traffic today
                }
                $returning = $visitorsSeen !== [] && mt_rand(1, 100) <= 24;
                $visitor = $returning ? $visitorsSeen[mt_rand(0, count($visitorsSeen) - 1)] : self::uuid();
                if (!$returning) {
                    $visitorsSeen[] = $visitor;
                }
                [$source, $medium, $campaign, $referrer] = array_slice(self::pickRow(self::SOURCES), 1);
                $deviceRow = self::pickRow(self::DEVICES);
                [, $browser, $os] = self::pickRow($deviceRow[2]);
                $country = self::pick(array_map(static fn ($c) => [$c[0], $c[1]], self::COUNTRIES));
                $session = self::uuid();
                $ctx = [$visitor, $session, $source, $medium, $campaign, $referrer, $deviceRow[1], $browser, $os, $country, null, 0];
                $flow = self::flow($source, $medium);
                $t = $start;
                $sessionEvents = [];
                foreach ($flow as [$event, $name, $path, $props, $gap]) {
                    $t += $gap;
                    if ($day === $today && $t > $now) {
                        break;
                    }
                    $sessionEvents[] = [$t, $event, $name, $path, $props];
                }
                self::addSession($sessions, $events, $ctx, $sessionEvents);
            }

            // A little staff traffic (flagged internal, excluded by default).
            for ($s = 0; $s < 2; $s++) {
                $start = strtotime($day . sprintf(' %02d:%02d:00', mt_rand(9, 16), mt_rand(0, 59)));
                if ($day === $today && $start > $now - 600) {
                    continue;
                }
                $ctx = [self::staffVisitor($s), self::uuid(), 'direct', 'none', null, null, 'desktop', 'Chrome', 'Windows', 'NG', null, 1];
                self::addSession($sessions, $events, $ctx, [
                    [$start, 'page_view', null, '/engineering', ['title' => 'Engineering Panel']],
                    [$start + 240, 'page_view', null, '/analytics?view=overview', ['title' => 'Analytics']],
                ]);
            }
        }

        Database::transaction(static function () use ($sessions, $events): void {
            foreach (array_chunk($sessions, 300) as $chunk) {
                $cols = array_keys($chunk[0]);
                $params = [];
                foreach ($chunk as $row) {
                    array_push($params, ...array_values($row));
                }
                Database::run('INSERT INTO analytics_sessions (' . implode(',', $cols) . ') VALUES ' . implode(',', array_fill(0, count($chunk), '(' . implode(',', array_fill(0, count($cols), '?')) . ')')), $params);
            }
            Tracking::insertEvents($events);
            Database::run('INSERT INTO analytics_visitors (visitor_id, first_seen, last_seen)
                           SELECT visitor_id, MIN(occurred_at), MAX(occurred_at) FROM analytics_events GROUP BY visitor_id
                           ON DUPLICATE KEY UPDATE first_seen = LEAST(first_seen, VALUES(first_seen)), last_seen = GREATEST(last_seen, VALUES(last_seen))');
        });

        $requests = self::requestLog(min(30, $days));
        return ['sessions' => count($sessions), 'events' => count($events), 'requests' => $requests];
    }

    /** One session's events: landing, scrolling, then zero or more journeys. @return list<array{0:string,1:?string,2:string,3:array,4:int}> */
    private static function flow(string $source, string $medium): array
    {
        $landing = $medium === 'email' || ($source === 'instagram' && mt_rand(1, 100) <= 30) ? '/apply' : '/';
        $flow = [['page_view', null, $landing . ($medium === 'email' ? '?utm_source=newsletter&utm_medium=email&utm_campaign=sept-cohort' : ''), ['title' => $landing === '/' ? 'AI Project Connect' : 'Apply'], 0]];
        if (mt_rand(1, 100) <= 46) {
            return $flow; // bounce: one page view, nothing else
        }
        if ($landing === '/') {
            foreach ([25, 50, 75, 100] as $i => $depth) {
                if (mt_rand(1, 100) > [85, 62, 41, 24][$i]) {
                    break;
                }
                $flow[] = ['scroll_depth', null, '/', ['depth' => (string) $depth], mt_rand(4, 25)];
            }
        }
        $r = mt_rand(1, 100);
        if ($r <= 30) {
            // Tracker search → portal sign-in
            $kind = mt_rand(1, 100) <= 70 ? 'project' : 'idea';
            $result = self::pick([[55, 'found'], [40, 'not_found'], [3, 'rate_limited'], [2, 'error']]);
            $flow[] = ['cta_click', 'hero_track', '/', ['id' => 'hero_track'], mt_rand(5, 40)];
            $flow[] = ['tracker_search', null, '/', ['kind' => $kind, 'result' => $result], mt_rand(3, 20)];
            if ($kind === 'project' && $result === 'found' && mt_rand(1, 100) <= 85) {
                $flow[] = ['portal_signin', 'code_requested', '/', ['step' => 'code_requested'], mt_rand(5, 30)];
                $step = mt_rand(1, 100) <= 78 ? 'verified' : 'failed';
                $flow[] = ['portal_signin', $step, '/', ['step' => $step], mt_rand(30, 180)];
                if ($step === 'verified') {
                    $flow[] = ['page_view', null, '/', ['title' => 'Your project'], mt_rand(2, 10)];
                    if (mt_rand(1, 100) <= 12) {
                        $flow[] = ['download', null, '/', ['kind' => self::pick([[50, 'report'], [20, 'proposal'], [30, 'file']])], mt_rand(20, 120)];
                    }
                    if (mt_rand(1, 100) <= 8) {
                        $flow[] = ['cta_click', 'portal_learn_this', '/', ['id' => 'portal_learn_this'], mt_rand(20, 90)];
                    }
                }
            }
        } elseif ($r <= 55) {
            // Courses
            $course = self::COURSES[mt_rand(0, count(self::COURSES) - 1)];
            $flow[] = ['course_view', $course, '/', ['courseId' => $course], mt_rand(10, 60)];
            if (mt_rand(1, 100) <= 38) {
                $flow[] = ['course_click', $course, '/', ['courseId' => $course], mt_rand(5, 40)];
                $flow[] = ['cta_click', mt_rand(1, 100) <= 55 ? 'course_info' : 'course_enrol', '/', [], mt_rand(3, 20)];
            }
        } elseif ($r <= 80 || $landing === '/apply') {
            // Application funnel with realistic drop-off
            $variant = $landing === '/apply' ? 'page' : 'modal';
            if ($landing === '/') {
                $flow[] = ['cta_click', mt_rand(1, 100) <= 70 ? 'nav_submit_idea' : 'footer_cta', '/', [], mt_rand(5, 60)];
                $flow[] = ['page_view', null, '/apply', ['title' => 'Apply'], mt_rand(1, 4)];
            }
            $steps = [['opened', 100], ['about_you', 78], ['idea', 84], ['budget', 88], ['draft_saved', 86], ['payment', 80]];
            foreach ($steps as [$step, $keep]) {
                if (mt_rand(1, 100) > $keep) {
                    if (mt_rand(1, 100) <= 25) {
                        $flow[] = ['cta_click', 'apply_save_later', '/apply', [], mt_rand(10, 60)];
                        $flow[] = ['idea_form', 'resume_link_requested', '/apply', ['step' => 'resume_link_requested', 'variant' => $variant], mt_rand(5, 30)];
                    }
                    return $flow;
                }
                $flow[] = ['idea_form', $step, '/apply', ['step' => $step, 'variant' => $variant], mt_rand(20, 240)];
            }
            $paystack = mt_rand(1, 100) <= 62;
            $flow[] = ['cta_click', $paystack ? 'apply_pay_paystack' : 'apply_pay_transfer', '/apply', [], mt_rand(10, 60)];
            if ($paystack) {
                $flow[] = ['payment', 'started', '/apply', ['method' => 'paystack', 'step' => 'started'], mt_rand(2, 10)];
                $ok = mt_rand(1, 100) <= 81;
                $flow[] = ['payment', $ok ? 'returned_success' : 'returned_failed', '/apply?payment=' . ($ok ? 'success' : 'failed'), ['method' => 'paystack', 'step' => $ok ? 'returned_success' : 'returned_failed'], mt_rand(60, 300)];
                if (!$ok) {
                    return $flow;
                }
            } else {
                if (mt_rand(1, 100) > 72) {
                    return $flow;
                }
                $flow[] = ['payment', 'transfer_reported', '/apply', ['method' => 'manual', 'step' => 'transfer_reported'], mt_rand(120, 900)];
            }
            if (mt_rand(1, 100) <= 91) {
                $flow[] = ['idea_form', 'submitted', '/apply', ['step' => 'submitted', 'variant' => $variant], mt_rand(20, 120)];
            }
        } else {
            $flow[] = ['cta_click', self::CTAS[mt_rand(0, count(self::CTAS) - 1)], '/', [], mt_rand(10, 90)];
            if (mt_rand(1, 100) <= 30) {
                $flow[] = ['outbound_click', null, '/', ['host' => self::pick([[50, 'wa.me'], [30, 'instagram.com'], [20, 'aptech-education.com.ng']])], mt_rand(5, 60)];
            }
        }
        if (mt_rand(1, 1000) <= 4) {
            $flow[] = ['client_error', null, '/', ['code' => 'E_NETWORK'], mt_rand(1, 30)];
        }
        return $flow;
    }

    /** @param list<array{0:int,1:string,2:?string,3:string,4:array}> $list */
    private static function addSession(array &$sessions, array &$events, array $ctx, array $list): void
    {
        if ($list === []) {
            return;
        }
        [$visitor, $session, $source, $medium, $campaign, $referrer, $device, $browser, $os, $country, $state, $internal] = $ctx;
        $pageviews = 0;
        $interactions = 0;
        $landing = null;
        $exit = null;
        foreach ($list as [$t, $event, $name, $path, $props]) {
            $name ??= match ($event) {
                'cta_click' => $props['id'] ?? null,
                default => null,
            };
            if ($event === 'cta_click' && !isset($props['id'])) {
                $props['id'] = $name;
            }
            $at = date('Y-m-d H:i:s', $t) . '.' . sprintf('%03d', mt_rand(0, 999));
            $events[] = [$at, $at, $visitor, $session, $event, $name, $path, $props ? json_encode($props, JSON_UNESCAPED_SLASHES) : null,
                $source, $medium, $campaign, $source === 'direct' ? null : $referrer, $device, $browser, $os, $country, $state, $internal];
            if ($event === 'page_view') {
                $pageviews++;
                $landing ??= $path;
                $exit = $path;
            } elseif (!in_array($event, Tracking::PASSIVE_EVENTS, true)) {
                $interactions++;
            }
        }
        $sessions[] = [
            'session_id' => $session, 'client_session_id' => $session, 'visitor_id' => $visitor,
            'started_at' => date('Y-m-d H:i:s', $list[0][0]) . '.000', 'ended_at' => date('Y-m-d H:i:s', $list[count($list) - 1][0]) . '.999',
            'page_views' => $pageviews, 'events' => count($list), 'landing_path' => $landing, 'exit_path' => $exit,
            'source' => $source, 'medium' => $medium, 'campaign' => $campaign, 'referrer_host' => $source === 'direct' ? null : $referrer,
            'device' => $device, 'browser' => $browser, 'os' => $os, 'country' => $country, 'state' => $state,
            'is_bounce' => $pageviews === 1 && $interactions === 0 ? 1 : 0, 'internal' => $internal, 'signed_in_as' => $internal ? 'staff' : 'none',
        ];
    }

    /** About a month of API request log for the Operations screen. */
    private static function requestLog(int $days): int
    {
        $routes = [
            [30, 'GET', '/api/content', 40], [14, 'GET', '/api/courses', 55], [10, 'GET', '/api/client/projects/{code}', 120],
            [8, 'POST', '/api/client/auth/request-code', 380], [6, 'POST', '/api/client/auth/verify', 150], [6, 'GET', '/api/staff/projects', 140],
            [5, 'GET', '/api/staff/projects/{code}', 210], [4, 'POST', '/api/staff/auth/login', 260], [4, 'GET', '/api/staff/dashboard', 180],
            [3, 'POST', '/api/applications/draft', 90], [3, 'POST', '/api/applications/pay/paystack', 900], [2, 'GET', '/api/analytics/overview', 420],
            [2, 'GET', '/api/admin/reports', 650], [1, 'POST', '/api/staff/projects/{code}/files', 1200], [1, 'GET', '/api/staff/ideas', 160],
        ];
        $rows = [];
        for ($d = $days - 1; $d >= 0; $d--) {
            $day = date('Y-m-d', strtotime("-{$d} days"));
            $n = mt_rand(220, 380);
            for ($i = 0; $i < $n; $i++) {
                [, $method, $route, $base] = self::pickRow($routes);
                $hour = self::pick(array_map(null, self::HOURS, range(0, 23)));
                $t = strtotime($day . sprintf(' %02d:%02d:%02d', $hour, mt_rand(0, 59), mt_rand(0, 59)));
                if ($t > time()) {
                    continue;
                }
                $status = 200;
                $roll = mt_rand(1, 1000);
                if ($route === '/api/staff/auth/login' && $roll <= 180) {
                    $status = $roll <= 20 ? 429 : 401;
                } elseif ($roll <= 6) {
                    $status = 500;
                } elseif ($roll <= 20) {
                    $status = 422;
                } elseif ($roll <= 26) {
                    $status = 429;
                } elseif ($roll <= 40) {
                    $status = 404;
                }
                $ms = (int) round($base * exp((mt_rand(0, 1000) / 1000 - 0.5) * 1.4) * (mt_rand(1, 100) <= 3 ? 4 : 1));
                $rows[] = [date('Y-m-d H:i:s', $t) . '.' . sprintf('%03d', mt_rand(0, 999)), $method, $route, $status, $ms, mt_rand(1, 100) <= 20 ? 1 : 0];
            }
        }
        foreach (array_chunk($rows, 500) as $chunk) {
            $params = [];
            foreach ($chunk as $r) {
                array_push($params, ...$r);
            }
            Database::run('INSERT INTO api_request_log (at, method, route, status, ms, internal) VALUES ' . implode(',', array_fill(0, count($chunk), '(?,?,?,?,?,?)')), $params);
        }
        return count($rows);
    }

    /** @param list<array{0:int, 1:mixed}> $weighted [weight, value] */
    private static function pick(array $weighted): mixed
    {
        return self::pickRow($weighted)[1];
    }

    private static function pickRow(array $weighted): array
    {
        $total = array_sum(array_column($weighted, 0));
        $r = mt_rand(1, $total);
        foreach ($weighted as $row) {
            $r -= $row[0];
            if ($r <= 0) {
                return $row;
            }
        }
        return $weighted[count($weighted) - 1];
    }

    private static function uuid(): string
    {
        $h = sprintf('%08x%08x%08x%08x', mt_rand(0, 0xffffffff), mt_rand(0, 0xffffffff), mt_rand(0, 0xffffffff), mt_rand(0, 0xffffffff));
        return sprintf('%s-%s-4%s-%x%s-%s', substr($h, 0, 8), substr($h, 8, 4), substr($h, 13, 3), 8 | (hexdec($h[16]) & 3), substr($h, 17, 3), substr($h, 20, 12));
    }

    private static function staffVisitor(int $n): string
    {
        return ['7a1b2c3d-0000-4000-8000-00000000000' . $n][0];
    }
}
