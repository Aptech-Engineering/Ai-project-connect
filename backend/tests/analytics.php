<?php

declare(strict_types=1);

/**
 * End-to-end test for the analytics dashboard API and the tracker (spec sections 7–10).
 *
 *   php bin/setup.php --fresh --demo --demo-password="DemoStaff2026!" --admin-email=admin@aptechdevteam.com --admin-password=Aptechdev123
 *   php -S 127.0.0.1:8089 public/index.php
 *   php tests/analytics.php http://127.0.0.1:8089
 *
 * Seed WITHOUT --demo-analytics: the test builds its own traffic so every number can be worked out by hand.
 * It also talks to the same database directly (config/config.php, honouring APC_DB_NAME / APC_DB_PORT) to plant
 * historical events for the rollup tests and to check what was — and wasn't — stored.
 */

$base = rtrim($argv[1] ?? 'http://127.0.0.1:8089', '/');
$tmp = sys_get_temp_dir() . '/apc-analytics-' . bin2hex(random_bytes(4));
mkdir($tmp);
$passed = 0;
$failed = 0;

$config = require __DIR__ . '/../config/config.php';
$pdo = new PDO(
    sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $config['db']['host'], $config['db']['port'], $config['db']['name']),
    $config['db']['user'],
    $config['db']['pass'],
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC],
);
$pdo->exec("SET time_zone = '" . (new DateTime('now', new DateTimeZone('Africa/Lagos')))->format('P') . "'");
date_default_timezone_set('Africa/Lagos');

const UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';
const ORIGIN = 'http://127.0.0.1:3001';

function call(string $method, string $path, array $opts = []): array
{
    global $base, $tmp;
    $ch = curl_init($base . $path);
    $headers = $opts['headers'] ?? ['X-Requested-With: XMLHttpRequest'];
    if (isset($opts['json'])) {
        $headers[] = 'Content-Type: application/json';
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($opts['json']));
    } elseif (isset($opts['raw'])) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, $opts['raw']);
    }
    $jar = $tmp . '/' . ($opts['as'] ?? 'anon') . '.cookies';
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => $method, CURLOPT_RETURNTRANSFER => true, CURLOPT_HTTPHEADER => $headers,
        CURLOPT_COOKIEJAR => $jar, CURLOPT_COOKIEFILE => $jar, CURLOPT_HEADER => true, CURLOPT_TIMEOUT => 60,
    ]);
    $raw = (string) curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $size = (int) curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    curl_close($ch);
    return ['status' => $status, 'body' => json_decode(substr($raw, $size), true), 'raw' => substr($raw, $size), 'headers' => substr($raw, 0, $size)];
}

function check(string $name, bool $ok, $detail = null): void
{
    global $passed, $failed;
    $ok ? $passed++ : $failed++;
    echo ($ok ? 'PASS  ' : 'FAIL  ') . $name . (!$ok && $detail !== null ? '  → ' . json_encode($detail, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) : '') . "\n";
}

function uuid(): string
{
    $h = bin2hex(random_bytes(16));
    return sprintf('%s-%s-4%s-%x%s-%s', substr($h, 0, 8), substr($h, 8, 4), substr($h, 13, 3), 8 | (hexdec($h[16]) & 3), substr($h, 17, 3), substr($h, 20, 12));
}

/** Sends a tracker batch the way the site does: text/plain JSON, no X-Requested-With. */
function track(array $body, array $extraHeaders = [], string $as = 'anon', ?string $raw = null): array
{
    $headers = array_merge(['Content-Type: text/plain;charset=UTF-8', 'Origin: ' . ORIGIN, 'User-Agent: ' . UA], $extraHeaders);
    return call('POST', '/api/track', ['headers' => $headers, 'raw' => $raw ?? json_encode($body), 'as' => $as]);
}

function at(int $secondsAgo): string
{
    return gmdate('Y-m-d\TH:i:s.000\Z', time() - $secondsAgo);
}

function kpi(array $kpis, string $key): ?array
{
    foreach ($kpis as $k) {
        if ($k['key'] === $key) {
            return $k;
        }
    }
    return null;
}

function storedEvents(string $visitorId): array
{
    global $pdo;
    $st = $pdo->prepare('SELECT * FROM analytics_events WHERE visitor_id = ? ORDER BY occurred_at, id');
    $st->execute([$visitorId]);
    return $st->fetchAll();
}

function dbValue(string $sql, array $params = []): mixed
{
    global $pdo;
    $st = $pdo->prepare($sql);
    $st->execute($params);
    return $st->fetchColumn();
}

function envelopeOk(array $r): bool
{
    $b = $r['body'] ?? [];
    return $r['status'] === 200 && isset($b['range']['from'], $b['range']['to'], $b['range']['interval'], $b['generatedAt'], $b['meta']['filters'], $b['meta']['definitions'], $b['data'])
        && ($b['range']['timezone'] ?? null) === 'Africa/Lagos' && array_key_exists('trackingSince', $b['meta']) && array_key_exists('compare', $b);
}

$today = date('Y-m-d');
if (date('H:i') < '00:15') {
    echo "NOTE  it's just after midnight in Lagos; today's fixture timestamps may fall on yesterday.\n";
}

foreach (['admin' => ['admin@aptechdevteam.com', 'Aptechdev123'], 'tunde' => ['tunde@aptech.test', 'DemoStaff2026!'], 'chioma' => ['chioma@aptech.test', 'DemoStaff2026!']] as $who => [$email, $password]) {
    $r = call('POST', '/api/staff/auth/login', ['as' => $who, 'json' => ['email' => $email, 'password' => $password]]);
    if ($who === 'tunde') {
        check('login response carries canViewAnalytics', ($r['body']['user']['canViewAnalytics'] ?? null) === false, $r['body']);
    }
}
$chiomaId = (int) dbValue("SELECT id FROM users WHERE email = 'chioma@aptech.test'");

/* ================= 1. Access ================= */
$r = call('GET', '/api/analytics/me');
check('signed out → 401', $r['status'] === 401);
$r = call('GET', '/api/analytics/me', ['as' => 'chioma']);
check('engineer without the flag: me says no access, no sections', $r['status'] === 200 && $r['body']['canViewAnalytics'] === false && $r['body']['sections'] === []);
$r = call('GET', '/api/analytics/overview', ['as' => 'chioma']);
check('engineer without the flag → 403', $r['status'] === 403 && str_contains($r['body']['error'] ?? '', 'Ask an admin'));
$r = call('GET', '/api/staff/me', ['as' => 'admin']);
check('staff/me carries canViewAnalytics (admins always true)', ($r['body']['user']['canViewAnalytics'] ?? null) === true);
$r = call('PATCH', "/api/admin/users/{$chiomaId}", ['as' => 'tunde', 'json' => ['canViewAnalytics' => true]]);
check('only admins grant analytics access → 403', $r['status'] === 403);
$r = call('PATCH', "/api/admin/users/{$chiomaId}", ['as' => 'admin', 'json' => ['canViewAnalytics' => true]]);
check('admin grants analytics access', $r['status'] === 200 && $r['body']['canViewAnalytics'] === true, $r['body']);
$r = call('GET', '/api/admin/users', ['as' => 'admin']);
$byEmail = array_column($r['body'] ?? [], null, 'email');
check('users list returns canViewAnalytics', ($byEmail['chioma@aptech.test']['canViewAnalytics'] ?? null) === true && ($byEmail['tunde@aptech.test']['canViewAnalytics'] ?? null) === false);
$r = call('POST', '/api/admin/users', ['as' => 'admin', 'json' => ['name' => 'Data Analyst', 'email' => 'analyst@aptech.test', 'role' => 'engineer', 'password' => 'Analyst-2026-pass', 'canViewAnalytics' => true]]);
check('canViewAnalytics accepted on create', $r['status'] === 201 && $r['body']['canViewAnalytics'] === true, $r['body']);
$r = call('GET', '/api/admin/activity?q=analytics%20access', ['as' => 'admin']);
$actions = implode(' | ', array_column($r['body']['items'] ?? [], 'action'));
check('access changes are in the activity log', str_contains($actions, 'Gave analytics access to Chioma Eze') && str_contains($actions, 'Gave analytics access to Data Analyst'), $actions);
$r = call('GET', '/api/analytics/me', ['as' => 'chioma']);
check('with the flag: sections exclude revenue and team', $r['status'] === 200 && $r['body']['canViewAnalytics'] === true && !in_array('revenue', $r['body']['sections'], true) && !in_array('team', $r['body']['sections'], true) && in_array('overview', $r['body']['sections'], true), $r['body']);
check('with the flag: overview → 200', call('GET', '/api/analytics/overview', ['as' => 'chioma'])['status'] === 200);
check('revenue is admin-only → 403', call('GET', '/api/analytics/revenue', ['as' => 'chioma'])['status'] === 403);
check('team is admin-only → 403', call('GET', '/api/analytics/team', ['as' => 'chioma'])['status'] === 403);
$r = call('GET', '/api/analytics/overview', ['as' => 'chioma']);
check('non-admins see money tiles on Overview as restricted', kpi($r['body']['data']['kpis'], 'netFeeRevenue')['restricted'] === true && kpi($r['body']['data']['kpis'], 'netFeeRevenue')['value'] === null);
$r = call('GET', '/api/analytics/me', ['as' => 'admin']);
check('admin sees all 12 sections', count($r['body']['sections'] ?? []) === 12 && $r['body']['timezone'] === 'Africa/Lagos' && $r['body']['currency'] === 'NGN');

/* ================= 2. Controlled traffic for today ================= */
$vA = uuid(); $sA = uuid(); $vB = uuid(); $sB = uuid(); $vC = uuid(); $sC = uuid();
$r = track(['visitorId' => $vA, 'sessionId' => $sA, 'referrer' => 'https://www.google.com/search?q=build+my+app', 'screen' => ['w' => 412, 'h' => 915], 'events' => [
    ['event' => 'page_view', 'name' => null, 'path' => '/', 'title' => 'AI Project Connect', 'props' => [], 'at' => at(300)],
    ['event' => 'cta_click', 'name' => 'nav_submit_idea', 'path' => '/', 'props' => [], 'at' => at(240)],
    ['event' => 'page_view', 'name' => null, 'path' => '/apply', 'title' => 'Apply', 'props' => [], 'at' => at(200)],
    ['event' => 'idea_form', 'name' => 'opened', 'path' => '/apply', 'props' => ['step' => 'opened', 'variant' => 'page'], 'at' => at(180)],
]]);
check('tracker batch accepted → 204 with CORS headers for the allowed origin', $r['status'] === 204 && str_contains($r['headers'], 'Access-Control-Allow-Origin: ' . ORIGIN) && str_contains($r['headers'], 'Access-Control-Allow-Credentials: true'), $r['headers']);
track(['visitorId' => $vB, 'sessionId' => $sB, 'events' => [['event' => 'page_view', 'path' => '/', 'title' => 'AI Project Connect', 'at' => at(120)]]]);
$r = track(['visitorId' => $vC, 'sessionId' => $sC, 'events' => [['event' => 'page_view', 'path' => '/engineering', 'title' => 'Engineering Panel', 'at' => at(100)]]], [], 'admin');
check('staff batch accepted', $r['status'] === 204);

$eA = storedEvents($vA);
check('events stored with device/browser/os parsed from the user agent', count($eA) === 4 && $eA[0]['device'] === 'mobile' && $eA[0]['browser'] === 'Chrome' && $eA[0]['os'] === 'Android', $eA[0] ?? null);
check('google referrer → source google / medium search', $eA[0]['source'] === 'google' && $eA[0]['medium'] === 'search' && $eA[0]['referrer_host'] === 'google.com');
check('cta name stored from the event name', $eA[1]['event'] === 'cta_click' && $eA[1]['name'] === 'nav_submit_idea' && json_decode($eA[1]['props'], true) === ['id' => 'nav_submit_idea']);
check('staff traffic flagged internal', (int) (storedEvents($vC)[0]['internal'] ?? 0) === 1 && (int) $eA[0]['internal'] === 0);
check('no IP address column is ever written', !in_array('ip', array_keys($eA[0]), true) && !in_array('ip_address', array_keys($eA[0]), true));
$session = $pdo->query("SELECT * FROM analytics_sessions WHERE session_id = '{$sA}'")->fetch();
check('session row maintained incrementally (2 page views, 4 events, not a bounce, landing/exit)', $session && (int) $session['page_views'] === 2 && (int) $session['events'] === 4 && (int) $session['is_bounce'] === 0 && $session['landing_path'] === '/' && $session['exit_path'] === '/apply', $session);

$q = "from={$today}&to={$today}";
$r = call('GET', "/api/analytics/traffic?{$q}", ['as' => 'admin']);
$k = $r['body']['data']['kpis'] ?? [];
check('traffic: envelope shape', envelopeOk($r), array_keys($r['body'] ?? []));
check('traffic: one-day range → hourly interval, compare = previous day', $r['body']['range']['interval'] === 'hour' && $r['body']['compare']['from'] === date('Y-m-d', strtotime('-1 day')));
check('traffic: visitors 2, sessions 2, page views 3 (staff excluded)', kpi($k, 'visitors')['value'] === 2 && kpi($k, 'sessions')['value'] === 2 && kpi($k, 'pageviews')['value'] === 3, $k);
check('traffic: pages/session 1.5, avg duration 60 s, bounce rate 0.5', kpi($k, 'pagesPerSession')['value'] == 1.5 && kpi($k, 'avgSessionDuration')['value'] == 60 && kpi($k, 'bounceRate')['value'] == 0.5, $k);
check('traffic: goodDirection + format on tiles', kpi($k, 'bounceRate')['goodDirection'] === 'down' && kpi($k, 'bounceRate')['format'] === 'percent' && kpi($k, 'avgSessionDuration')['format'] === 'duration' && kpi($k, 'visitors')['kind'] === null);
check('traffic: new vs returning + 7×24 heatmap', $r['body']['data']['newVsReturning'] === ['new' => 2, 'returning' => 0] && count($r['body']['data']['heatmap']) === 7 && count($r['body']['data']['heatmap'][0]) === 24 && array_sum(array_map('array_sum', $r['body']['data']['heatmap'])) === 2);
$r = call('GET', "/api/analytics/traffic?{$q}&includeInternal=1", ['as' => 'admin']);
check('includeInternal=1 adds the staff visitor', kpi($r['body']['data']['kpis'], 'visitors')['value'] === 3);
$r = call('GET', "/api/analytics/traffic?{$q}&source=google", ['as' => 'admin']);
check('source filter: 1 visitor; meta lists the screen filters', kpi($r['body']['data']['kpis'], 'visitors')['value'] === 1 && in_array('source', $r['body']['meta']['filters'], true) && ($r['body']['meta']['appliedFilters']['source'] ?? null) === 'google');
$r = call('GET', "/api/analytics/traffic/breakdown?{$q}&dimension=source", ['as' => 'admin']);
$rows = array_column($r['body']['data']['rows'] ?? [], null, 'key');
check('breakdown by source: google + direct, labelled, share of visitors', ($rows['google']['label'] ?? '') === 'Google (search)' && $rows['google']['value'] === 1 && $rows['google']['share'] == 0.5 && ($rows['direct']['label'] ?? '') === 'Direct' && $r['body']['data']['total'] === 2, $r['body']['data'] ?? $r);
$r = call('GET', "/api/analytics/traffic/breakdown?{$q}&dimension=page", ['as' => 'admin']);
$rows = array_column($r['body']['data']['rows'] ?? [], null, 'key');
check('breakdown by page: / viewed by 2, /apply by 1, labelled with the title', ($rows['/']['value'] ?? 0) === 2 && ($rows['/apply']['value'] ?? 0) === 1 && $rows['/']['extra']['pageviews'] === 2 && str_starts_with($rows['/']['label'], 'AI Project Connect'), $rows);
$r = call('GET', "/api/analytics/traffic/timeseries?{$q}&metric=pageviews", ['as' => 'admin']);
check('timeseries: 24 hourly points summing to 3 page views, with previous', count($r['body']['data']['series']['points'] ?? []) === 24 && array_sum(array_column($r['body']['data']['series']['points'], 'value')) === 3 && array_key_exists('previous', $r['body']['data']['series']['points'][0]));
$r = call('GET', "/api/analytics/engagement?{$q}", ['as' => 'admin']);
$k = $r['body']['data']['kpis'] ?? [];
$inter = array_values(array_filter($r['body']['data']['interactions'] ?? [], static fn ($i) => $i['target'] === 'nav_submit_idea'))[0] ?? null;
check('engagement: 1 CTA click, 1 idea form opened', envelopeOk($r) && kpi($k, 'ctaClicks')['value'] === 1 && kpi($k, 'ideaFormsOpened')['value'] === 1, $k);
check('engagement: CTR = clickers ÷ viewers of that page (1 ÷ 2)', $inter !== null && $inter['count'] === 1 && $inter['visitors'] === 1 && $inter['ctr'] == 0.5 && $inter['path'] === '/', $inter);
$r = call('GET', "/api/analytics/funnels/application?{$q}", ['as' => 'admin']);
$steps = array_column($r['body']['data']['steps'] ?? [], null, 'key');
check('application funnel: visited 2 → opened 1 (50%), median 2 min', ($steps['visited']['count'] ?? null) === 2 && $steps['form_opened']['count'] === 1 && $steps['form_opened']['fromPrevious'] == 0.5 && $steps['form_opened']['medianSecondsFromPrevious'] === 120 && $steps['draft_saved']['count'] === 0, $steps);
check('funnel breakdown by source', count($r['body']['data']['breakdown'] ?? []) === 2 && $r['body']['data']['by'] === 'source');
$r = call('GET', "/api/analytics/funnels/application?{$q}&by=category", ['as' => 'admin']);
check('unsupported breakdown is explained, not faked', $r['body']['data']['breakdown'] === [] && count($r['body']['data']['notes']) >= 1);
check('unknown funnel → 404', call('GET', '/api/analytics/funnels/nope', ['as' => 'admin'])['status'] === 404);
$r = call('GET', '/api/analytics/realtime', ['as' => 'admin']);
check('realtime: 2 active visitors, 30 per-minute points, anonymous feed, no-store', $r['status'] === 200 && $r['body']['data']['activeVisitors'] === 2 && count($r['body']['data']['perMinute']) === 30 && count($r['body']['data']['feed']) >= 5 && str_contains($r['headers'], 'Cache-Control: no-store'), $r['body']['data']['activeVisitors'] ?? $r);
check('realtime feed exposes no visitor or session ids', !str_contains($r['raw'], $vA) && !str_contains($r['raw'], $sA) && array_keys($r['body']['data']['feed'][0]) === ['at', 'event', 'path', 'source', 'device']);
check('screens are privately cacheable for 60 s', str_contains(call('GET', "/api/analytics/traffic?{$q}", ['as' => 'admin'])['headers'], 'Cache-Control: private, max-age=60'));

/* ================= 3. Ingest validation ================= */
$good = ['visitorId' => uuid(), 'sessionId' => uuid(), 'events' => [['event' => 'page_view', 'path' => '/', 'at' => at(10)]]];
$r = track($good, ['Origin: https://evil.example']);
check('foreign Origin → 403', $r['status'] === 403 && storedEvents($good['visitorId']) === []);
$r = call('POST', '/api/track', ['headers' => ['Content-Type: text/plain', 'User-Agent: ' . UA], 'raw' => json_encode($good)]);
check('no Origin or Referer → 403', $r['status'] === 403);
$r = call('POST', '/api/track', ['headers' => ['Content-Type: text/plain', 'User-Agent: ' . UA, 'Referer: ' . ORIGIN . '/apply'], 'raw' => json_encode($good)]);
check('allowed Referer alone is accepted', $r['status'] === 204 && count(storedEvents($good['visitorId'])) === 1);
$json = ['visitorId' => uuid(), 'sessionId' => uuid(), 'events' => [['event' => 'page_view', 'path' => '/', 'at' => at(5)]]];
$r = call('POST', '/api/track', ['headers' => ['Content-Type: application/json', 'Origin: ' . ORIGIN, 'User-Agent: ' . UA], 'raw' => json_encode($json)]);
check('application/json is accepted too', $r['status'] === 204 && count(storedEvents($json['visitorId'])) === 1);
$r = track([], [], 'anon', str_repeat('x', 33 * 1024));
check('body over 32 KB → 413', $r['status'] === 413);
$many = ['visitorId' => uuid(), 'sessionId' => uuid(), 'events' => array_fill(0, 21, ['event' => 'page_view', 'path' => '/'])];
check('more than 20 events → 422', track($many)['status'] === 422);
check('visitorId that is not a UUID v4 → 422', track(['visitorId' => 'not-a-uuid', 'sessionId' => uuid(), 'events' => [['event' => 'page_view']]])['status'] === 422);
check('invalid JSON → 400', track([], [], 'anon', '{nope')['status'] === 400);
$bot = ['visitorId' => uuid(), 'sessionId' => uuid(), 'events' => [['event' => 'page_view', 'path' => '/']]];
$r = track($bot, ['User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 HeadlessChrome/126.0 Safari/537.36']);
check('bot user agent: 204 but nothing stored', $r['status'] === 204 && storedEvents($bot['visitorId']) === []);
$dnt = ['visitorId' => uuid(), 'sessionId' => uuid(), 'events' => [['event' => 'page_view', 'path' => '/']]];
$r1 = track($dnt, ['DNT: 1']);
$r2 = track($dnt, ['Sec-GPC: 1']);
check('Do Not Track and Global Privacy Control: 204 but nothing stored', $r1['status'] === 204 && $r2['status'] === 204 && storedEvents($dnt['visitorId']) === []);
$private = ['visitorId' => uuid(), 'sessionId' => uuid(), 'events' => [
    ['event' => 'page_view', 'path' => '/apply?resume=SECRETTOKEN123&token=abc123&ref=IDEA-4QX7M&email=kola%40x.test&code=123456&reference=FEE-1&reset=r1&view=overview&utm_source=Newsletter&payment=success', 'at' => at(8)],
    ['event' => 'cta_click', 'name' => 'apply_save_later', 'path' => '/apply', 'props' => ['id' => 'apply_save_later', 'email' => 'kola@x.test', 'phone' => '0803'], 'at' => at(7)],
    ['event' => 'tracker_search', 'path' => '/', 'props' => ['kind' => 'project', 'result' => 'maybe'], 'at' => at(6)],
    ['event' => 'made_up_event', 'path' => '/', 'at' => at(6)],
    ['event' => 'hero_submit_idea', 'path' => '/', 'at' => at(6)],
]];
$r = track($private);
$stored = storedEvents($private['visitorId']);
$dump = json_encode($stored);
check('private query params stripped server-side; utm/view/payment kept', ($stored[0]['path'] ?? '') === '/apply?view=overview&utm_source=Newsletter&payment=success', $stored[0]['path'] ?? $stored);
check('nothing private survives anywhere in the stored rows', !str_contains($dump, 'SECRETTOKEN') && !str_contains($dump, 'IDEA-4QX7M') && !str_contains($dump, 'kola') && !str_contains($dump, '123456') && !str_contains($dump, '0803'));
check('unknown prop keys dropped, invalid enum values and unknown events drop the event', count($stored) === 2 && json_decode($stored[1]['props'], true) === ['id' => 'apply_save_later']);
check('utm_source on the landing page sets the session source', ($stored[0]['source'] ?? '') === 'newsletter');
$old = ['visitorId' => uuid(), 'sessionId' => uuid(), 'events' => [['event' => 'page_view', 'path' => '/', 'at' => '2020-01-01T00:00:00Z']]];
track($old);
$e = storedEvents($old['visitorId'])[0] ?? null;
check('client time clamped to server time ± 10 minutes', $e !== null && abs(strtotime($e['occurred_at']) - time()) <= 601, $e['occurred_at'] ?? null);

// Server-side session rules: 30 idle minutes split a session even if the browser keeps its id.
$vS = uuid(); $sS = uuid();
track(['visitorId' => $vS, 'sessionId' => $sS, 'events' => [['event' => 'page_view', 'path' => '/', 'at' => at(590)]]]);
$pdo->prepare('UPDATE analytics_events SET occurred_at = occurred_at - INTERVAL 40 MINUTE WHERE visitor_id = ?')->execute([$vS]);
$pdo->prepare('UPDATE analytics_sessions SET started_at = started_at - INTERVAL 40 MINUTE, ended_at = ended_at - INTERVAL 40 MINUTE WHERE visitor_id = ?')->execute([$vS]);
if (date('Y-m-d', time() - 3000) === $today) {
    track(['visitorId' => $vS, 'sessionId' => $sS, 'events' => [['event' => 'page_view', 'path' => '/apply', 'at' => at(1)]]]);
    $ids = array_unique(array_column(storedEvents($vS), 'session_id'));
    check('after 30 idle minutes the server starts a new session for the same browser id', count($ids) === 2 && (int) dbValue('SELECT COUNT(*) FROM analytics_sessions WHERE client_session_id = ?', [$sS]) === 2, $ids);
}

/* ================= 4. Rollups and raw/rollup stitching ================= */
$fixture = [5 => 2, 4 => 3, 1 => 4]; // days ago => sessions, each: page_view "/" + cta_click flier_cta
$insE = $pdo->prepare("INSERT INTO analytics_events (occurred_at, received_at, visitor_id, session_id, event, name, path, props, source, medium, internal) VALUES (?, ?, ?, ?, ?, ?, '/', ?, 'direct', 'none', 0)");
$insS = $pdo->prepare("INSERT INTO analytics_sessions (session_id, client_session_id, visitor_id, started_at, ended_at, page_views, events, landing_path, exit_path, source, medium, device, is_bounce, internal) VALUES (?, ?, ?, ?, ?, 1, 2, '/', '/', 'direct', 'none', 'desktop', 0, 0)");
$insV = $pdo->prepare('INSERT INTO analytics_visitors (visitor_id, first_seen, last_seen) VALUES (?, ?, ?)');
foreach ($fixture as $ago => $n) {
    $day = date('Y-m-d', strtotime("-{$ago} days"));
    for ($i = 0; $i < $n; $i++) {
        $v = uuid();
        $s = uuid();
        $t0 = sprintf('%s 1%d:00:00', $day, $i);
        $t1 = sprintf('%s 1%d:00:30', $day, $i);
        $insE->execute([$t0 . '.000', $t0 . '.000', $v, $s, 'page_view', null, null]);
        $insE->execute([$t1 . '.000', $t1 . '.000', $v, $s, 'cta_click', 'flier_cta', '{"id":"flier_cta"}']);
        $insS->execute([$s, $s, $v, $t0 . '.000', $t1 . '.000']);
        $insV->execute([$v, $t0, $t1]);
    }
}
$from5 = date('Y-m-d', strtotime('-5 days'));
$range = "from={$from5}&to={$today}";
$ctaNow = static fn (string $extra = '') => kpi(call('GET', "/api/analytics/engagement?{$range}{$extra}", ['as' => 'admin'])['body']['data']['kpis'] ?? [], 'ctaClicks')['value'] ?? null;
$rawTotal = (int) dbValue("SELECT COUNT(*) FROM analytics_events WHERE event = 'cta_click' AND internal = 0 AND occurred_at >= ?", [$from5 . ' 00:00:00']);
check('before any rollup: CTA clicks read live from raw events = raw count', $ctaNow() === $rawTotal && $rawTotal === 2 + 3 + 4 + 2, [$ctaNow(), $rawTotal]);

$rollup = static function () use ($from5): string {
    return (string) shell_exec(escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg(__DIR__ . '/../bin/analytics-rollup.php') . ' --from=' . $from5 . ' --to=' . date('Y-m-d', strtotime('-1 day')) . ' 2>&1');
};
$out = $rollup();
check('rollup job runs', str_contains($out, 'Rolled up'), $out);
$rowsAfterFirst = (int) dbValue('SELECT COUNT(*) FROM analytics_daily');
check('stitched total (rollups for older days + raw for yesterday/today) equals the raw total', $ctaNow() === $rawTotal, [$ctaNow(), $rawTotal]);
$sessionsNow = kpi(call('GET', "/api/analytics/traffic?{$range}", ['as' => 'admin'])['body']['data']['kpis'], 'sessions')['value'];
$rawSessions = (int) dbValue('SELECT COUNT(*) FROM analytics_sessions WHERE internal = 0 AND started_at >= ?', [$from5 . ' 00:00:00']);
check('traffic sessions over the mixed range equal the raw session count', $sessionsNow === $rawSessions, [$sessionsNow, $rawSessions]);
$out = $rollup();
check('rollup is idempotent: re-running changes nothing', (int) dbValue('SELECT COUNT(*) FROM analytics_daily') === $rowsAfterFirst && $ctaNow() === $rawTotal);

// Prove old days really come from the rollup: remove a raw event on a rolled day.
$pdo->exec("DELETE FROM analytics_events WHERE event = 'cta_click' AND DATE(occurred_at) = '{$from5}' ORDER BY id LIMIT 1");
check('older days are served from the rollup (raw deletion not visible until re-rolled)', $ctaNow() === $rawTotal);
check('a traffic filter reads raw events for the whole range', $ctaNow('&source=direct') === $rawTotal - 1 - 2, $ctaNow('&source=direct'));
$rollup();
check('after re-rolling, stitched total matches raw again', $ctaNow() === $rawTotal - 1);

// Compare deltas on the fixture: day −4 (3 sessions) vs day −5 (2 sessions).
$d4 = date('Y-m-d', strtotime('-4 days'));
$r = call('GET', "/api/analytics/traffic?from={$d4}&to={$d4}&compare=previous", ['as' => 'admin']);
$s = kpi($r['body']['data']['kpis'], 'sessions');
check('compare=previous: 3 vs 2 sessions → change 0.5', $s['value'] === 3 && $s['previous'] === 2 && $s['change'] == 0.5 && $r['body']['compare']['from'] === $from5, $s);
$r = call('GET', "/api/analytics/traffic?from={$d4}&to={$d4}&compare=none", ['as' => 'admin']);
check('compare=none: no comparison range, previous null', $r['body']['compare'] === null && kpi($r['body']['data']['kpis'], 'sessions')['previous'] === null);
$r = call('GET', "/api/analytics/traffic/timeseries?{$range}&metric=sessions&compare=year", ['as' => 'admin']);
check('compare=year shifts the range by a year', $r['body']['compare']['from'] === date('Y-m-d', strtotime($from5 . ' -1 year')) && count($r['body']['data']['series']['points']) === 6);
$r = call('GET', '/api/analytics/me', ['as' => 'admin']);
check('trackingSince is the first tracked day', $r['body']['trackingSince'] === $from5, $r['body']['trackingSince']);

/* ================= 5. Parameters ================= */
$interval = static fn (string $q) => call('GET', "/api/analytics/traffic/timeseries?metric=visitors&{$q}", ['as' => 'admin']);
check('interval auto: 30 days → day', $interval('')['body']['range']['interval'] === 'day');
check('interval auto: 120 days → week', $interval('from=' . date('Y-m-d', strtotime('-119 days')) . "&to={$today}")['body']['range']['interval'] === 'week');
check('interval auto: 400 days → month', $interval('from=' . date('Y-m-d', strtotime('-399 days')) . "&to={$today}")['body']['range']['interval'] === 'month');
check('hour interval only up to 7 days → 422', $interval('from=' . date('Y-m-d', strtotime('-9 days')) . "&to={$today}&interval=hour")['status'] === 422);
check('range over 2 years → 422', $interval('from=2020-01-01&to=' . $today)['status'] === 422);
check('bad dates → 422', $interval('from=2026-02-30&to=' . $today)['status'] === 422 && $interval("from={$today}&to={$from5}")['status'] === 422);
check('unknown breakdown dimension → 422', call('GET', '/api/analytics/traffic/breakdown?dimension=shoe_size', ['as' => 'admin'])['status'] === 422);

/* ================= 6. Business screens on the demo data ================= */
$r = call('GET', '/api/analytics/revenue', ['as' => 'admin']);
$cash = $r['body']['data']['cash']['kpis'] ?? [];
check('revenue: envelope; fees collected ₦8,000 (4 × ₦2,000 Paystack), kind cash', envelopeOk($r) && kpi($cash, 'feesCollected')['value'] == 8000 && kpi($cash, 'feesCollected')['kind'] === 'cash' && kpi($cash, 'netFeeRevenue')['value'] == 8000, $cash);
check('revenue: transfer awaiting (1 × ₦2,000, pending) and refund due (1 × ₦2,000, liability)', kpi($cash, 'awaitingConfirmation')['value'] == 2000 && kpi($cash, 'awaitingConfirmation')['count'] === 1 && kpi($cash, 'awaitingConfirmation')['kind'] === 'pending' && kpi($cash, 'refundsDue')['count'] === 1 && kpi($cash, 'refundsDue')['kind'] === 'liability');
$booked = $r['body']['data']['booked']['kpis'] ?? [];
check('revenue: booked kept apart (kinds booked/estimate), support MRR from the delivered project\'s plan', kpi($booked, 'contractValueWon')['kind'] === 'booked' && kpi($booked, 'estimatedCourseRevenue')['kind'] === 'estimate' && kpi($booked, 'supportPlanMrr')['value'] == 75000, $booked);
$methods = array_column($r['body']['data']['byMethod'] ?? [], null, 'key');
check('revenue: by method in fixed order, Paystack 100%', array_keys($methods) === ['paystack', 'manual', 'centre'] && $methods['paystack']['value'] == 8000 && $methods['paystack']['share'] == 1.0);
check('revenue: ledger of 5 payments, 1 page', count($r['body']['data']['ledger']) === 5 && $r['body']['data']['pages'] === 1 && isset($r['body']['data']['ledger'][0]['reference']), $r['body']['data']['ledgerTotal'] ?? null);
check('revenue: method filter', kpi(call('GET', '/api/analytics/revenue?method=manual', ['as' => 'admin'])['body']['data']['cash']['kpis'], 'feesCollected')['value'] == 0);
$r = call('GET', '/api/analytics/projects', ['as' => 'admin']);
$k = $r['body']['data']['kpis'] ?? [];
$stages = array_column($r['body']['data']['byStage'] ?? [], 'value', 'key');
check('projects: 4 active, 1 delivered on time, none overdue', kpi($k, 'activeProjects')['value'] === 4 && kpi($k, 'delivered')['value'] === 1 && kpi($k, 'onTimeRate')['value'] == 1 && kpi($k, 'overdueNow')['value'] === 0, $k);
check('projects: by stage', $stages === ['APPROVED' => 0, 'DESIGN' => 1, 'DEVELOPMENT' => 1, 'TESTING' => 1, 'DEPLOYMENT' => 0, 'ON_HOLD' => 1], $stages);
check('projects: delivery vs target (ShopBeta 2 days early), table rows', ($r['body']['data']['deliveryVsTarget'][0]['daysEarlyOrLate'] ?? null) === 2 && count($r['body']['data']['table']) === 5);
$r = call('PUT', '/api/staff/projects/APC-26-M4TR8/stage', ['as' => 'admin', 'json' => ['stage' => 'DEPLOYMENT']]);
check('stage changes are written to project_stage_history', $r['status'] === 200 && dbValue("SELECT to_stage FROM project_stage_history h JOIN projects p ON p.id = h.project_id WHERE p.code = 'APC-26-M4TR8' ORDER BY h.id DESC LIMIT 1") === 'DEPLOYMENT');
$tis = array_column(call('GET', '/api/analytics/projects', ['as' => 'admin'])['body']['data']['timeInStage'], null, 'key');
check('projects: time in stage from history (Testing stay just ended)', ($tis['TESTING']['samples'] ?? 0) >= 1 && $tis['TESTING']['medianDays'] !== null, $tis['TESTING'] ?? null);
$r = call('GET', '/api/analytics/pipeline', ['as' => 'admin']);
$k = $r['body']['data']['kpis'] ?? [];
check('pipeline: 5 submitted, 6 drafts started, completion 5/6, no walk-ins', kpi($k, 'ideasSubmitted')['value'] === 5 && kpi($k, 'draftsStarted')['value'] === 6 && abs(kpi($k, 'draftCompletionRate')['value'] - 5 / 6) < 0.001 && kpi($k, 'walkInShare')['value'] == 0, $k);
check('pipeline: by category / platform / budget / state, ageing buckets, table', count($r['body']['data']['by']) === 4 && count($r['body']['data']['ageing']) === 4 && count($r['body']['data']['table']) === 5 && isset($r['body']['data']['series']['submitted']['online']['points']));
check('pipeline: category filter', kpi(call('GET', '/api/analytics/pipeline?category=Logistics', ['as' => 'admin'])['body']['data']['kpis'], 'ideasSubmitted')['value'] === 2);
$r = call('GET', '/api/analytics/funnels/sales?by=category', ['as' => 'admin']);
$steps = array_column($r['body']['data']['steps'] ?? [], 'count', 'key');
// Demo: 8JD2P REVIEWING, 2VN9K QUOTE_SENT (marked in the inbox, no quote record), 9DCLN DECLINED; 4QX7M and 5TRNF NEW.
check('sales funnel: 5 submitted → 3 reviewed → 1 quote sent (status-only, so no median)', $steps['submitted'] === 5 && $steps['reviewed'] === 3 && $steps['quote_sent'] === 1 && $r['body']['data']['steps'][2]['medianSecondsFromPrevious'] === null, $steps);
$r = call('GET', '/api/analytics/overview', ['as' => 'admin']);
$d = $r['body']['data'] ?? [];
check('overview: 6 tiles, 6-step funnel, both trends, attention lists, top sources', envelopeOk($r) && count($d['kpis']) === 6 && count($d['funnel']) === 6 && isset($d['trend']['visitors']['points'], $d['trend']['ideas']['points'], $d['attention']['overdue'], $d['attention']['transfers'], $d['attention']['refunds'], $d['attention']['stale']) && count($d['topSources']) <= 5);
check('overview: 1 transfer awaiting, 1 refund due, ideas submitted 5', count($d['attention']['transfers']) === 1 && count($d['attention']['refunds']) === 1 && kpi($d['kpis'], 'ideasSubmitted')['value'] === 5 && $d['attention']['transfers'][0]['amount'] == 2000);
foreach (['clients', 'courses', 'team', 'operations', 'engagement'] as $screen) {
    $r = call('GET', "/api/analytics/{$screen}", ['as' => 'admin']);
    check("{$screen}: envelope + definitions", envelopeOk($r) && count((array) $r['body']['meta']['definitions']) >= 1, $r['status']);
}
$r = call('GET', '/api/analytics/clients', ['as' => 'admin']);
check('clients: 4 new clients (demo seed), opt-outs and locations', kpi($r['body']['data']['kpis'], 'newClients')['value'] === 4 && isset($r['body']['data']['optOuts']['digest']) && count($r['body']['data']['byLocation']) >= 1);
$r = call('GET', '/api/analytics/team', ['as' => 'admin']);
check('team: caption, people and workload', str_contains($r['body']['data']['caption'], 'not to rank people') && count($r['body']['data']['people']) >= 5 && count($r['body']['data']['workload']) >= 5);
$r = call('GET', '/api/analytics/operations', ['as' => 'admin']);
$slow = array_column($r['body']['data']['api']['slowest'] ?? [], 'route');
check('operations: request log uses route patterns (never raw paths or tokens)', in_array('/api/analytics/revenue', $slow, true) || in_array('/api/analytics/overview', $slow, true));
check('request log never stores raw ids, and skips /api/track', (int) dbValue("SELECT COUNT(*) FROM api_request_log WHERE route LIKE '%APC-%' OR route LIKE '%IDEA-%' OR route = '/api/track'") === 0 && (int) dbValue("SELECT COUNT(*) FROM api_request_log WHERE route = '/api/staff/projects/{code}/stage'") >= 1);
check('operations: staff sign-ins counted from the log', $r['body']['data']['security']['staffSignIns'] >= 3 && array_key_exists('successRate', $r['body']['data']['payments']) && array_key_exists('failureRate', $r['body']['data']['messaging']), $r['body']['data']['security'] ?? $r);

/* ================= 7. Exports ================= */
$r = call('GET', "/api/analytics/export?view=traffic&table=breakdown&format=csv&{$range}", ['as' => 'chioma']);
$lines = explode("\n", $r['raw']);
check('CSV: UTF-8 BOM, header, unit row, data rows', $r['status'] === 200 && str_starts_with($r['raw'], "\xEF\xBB\xBF") && str_contains($lines[0], 'key') && str_contains($lines[1], 'count') && count(array_filter($lines)) >= 4 && str_contains($r['headers'], 'text/csv'), array_slice($lines, 0, 3));
check('CSV states confidentiality, range and filters', str_contains($r['raw'], 'Confidential') && str_contains($r['raw'], $from5) && str_contains($r['raw'], 'staff traffic excluded'));
$r = call('GET', "/api/analytics/export?view=projects&format=xlsx", ['as' => 'admin']);
$xlsxFile = $tmp . '/export.xlsx';
file_put_contents($xlsxFile, $r['raw']);
$zipOk = false;
$sheets = '';
if (str_contains($r['headers'], 'X-Export-Format: xlsx') && class_exists(ZipArchive::class)) {
    $zip = new ZipArchive();
    $zipOk = $zip->open($xlsxFile) === true;
    $sheets = $zipOk ? (string) $zip->getFromName('xl/workbook.xml') : '';
    $readMe = $zipOk ? (string) $zip->getFromName('xl/worksheets/sheet1.xml') : '';
    $zip->close();
    check('XLSX opens; one sheet per table plus "Read me" with range and definitions', $zipOk && str_contains($sheets, 'name="Read me"') && substr_count($sheets, '<sheet ') >= 4 && str_contains($readMe, 'On-time delivery rate') !== false && str_contains($readMe, 'Confidential'), $sheets);
} else {
    check('XLS fallback (SpreadsheetML) opens as XML with a Read me sheet', str_contains($r['headers'], 'X-Export-Format: xls') && simplexml_load_string($r['raw']) !== false && str_contains($r['raw'], 'ss:Name="Read me"'));
}
check('export of an admin-only screen by a non-admin → 403', call('GET', '/api/analytics/export?view=revenue&format=csv', ['as' => 'chioma'])['status'] === 403);
check('unknown export table → 422 listing the tables', call('GET', '/api/analytics/export?view=projects&table=nope&format=csv', ['as' => 'admin'])['status'] === 422);
$r = call('GET', '/api/admin/activity?q=Exported%20analytics', ['as' => 'admin']);
check('exports are in the activity log', ($r['body']['total'] ?? 0) >= 2);

/* ================= 8. Saved views ================= */
$r = call('POST', '/api/analytics/views', ['as' => 'chioma', 'json' => ['name' => 'Last month traffic', 'query' => "view=traffic&from={$from5}&to={$today}&compare=previous&resume=secret"]]);
$myView = $r['body']['id'] ?? 0;
check('create a personal view (unknown params dropped)', $r['status'] === 201 && $r['body']['view'] === 'traffic' && $r['body']['shared'] === false && str_starts_with($r['body']['url'], '/analytics?view=traffic') && !str_contains($r['body']['url'], 'secret'), $r['body']);
check('non-admins cannot share views → 403', call('POST', '/api/analytics/views', ['as' => 'chioma', 'json' => ['name' => 'Shared?', 'query' => 'view=traffic', 'shared' => true]])['status'] === 403);
check('non-admins cannot save admin-only screens → 403', call('POST', '/api/analytics/views', ['as' => 'chioma', 'json' => ['name' => 'Money', 'query' => 'view=revenue']])['status'] === 403);
check('a view needs a known screen → 422', call('POST', '/api/analytics/views', ['as' => 'chioma', 'json' => ['name' => 'Bad', 'query' => 'from=2026-01-01']])['status'] === 422);
$r = call('POST', '/api/analytics/views', ['as' => 'admin', 'json' => ['name' => 'Team overview', 'query' => ['view' => 'overview', 'compare' => 'year'], 'shared' => true]]);
$shared = $r['body']['id'] ?? 0;
call('POST', '/api/analytics/views', ['as' => 'admin', 'json' => ['name' => 'Cash', 'query' => 'view=revenue', 'shared' => true]]);
$names = array_column(call('GET', '/api/analytics/views', ['as' => 'chioma'])['body'] ?? [], 'name');
check('list: own + shared, minus sections the user cannot open', in_array('Last month traffic', $names, true) && in_array('Team overview', $names, true) && !in_array('Cash', $names, true), $names);
$r = call('PATCH', "/api/analytics/views/{$myView}", ['as' => 'chioma', 'json' => ['name' => 'Traffic, last 5 days']]);
check('rename own view', $r['status'] === 200 && $r['body']['name'] === 'Traffic, last 5 days');
check("can't edit someone else's shared view → 403", call('PATCH', "/api/analytics/views/{$shared}", ['as' => 'chioma', 'json' => ['name' => 'Mine now']])['status'] === 403);
check('delete own view', call('DELETE', "/api/analytics/views/{$myView}", ['as' => 'chioma'])['status'] === 204);

/* ================= 9. Scheduled reports ================= */
$r = call('POST', '/api/analytics/schedules', ['as' => 'chioma', 'json' => ['name' => 'My traffic', 'view' => 'traffic', 'frequency' => 'weekly', 'format' => 'csv', 'recipients' => ['chioma@aptech.test'], 'query' => ['from' => '2026-01-01', 'source' => 'google']]]);
$sid = $r['body']['id'] ?? 0;
check('create schedule: rolling range, dates dropped, next run on Monday 07:00', $r['status'] === 201 && $r['body']['range'] === 'last_7_days' && !isset($r['body']['query']['from']) && ($r['body']['query']['source'] ?? null) === 'google' && str_contains((string) $r['body']['nextRunAt'], 'T07:00:00') && date('N', strtotime((string) $r['body']['nextRunAt'])) === '1', $r['body']);
check('recipients must have analytics access → 422', call('POST', '/api/analytics/schedules', ['as' => 'chioma', 'json' => ['name' => 'x', 'view' => 'traffic', 'recipients' => ['tunde@aptech.test']]])['status'] === 422);
check('external recipients are refused → 422', call('POST', '/api/analytics/schedules', ['as' => 'chioma', 'json' => ['name' => 'x', 'view' => 'traffic', 'recipients' => ['someone@gmail.com']]])['status'] === 422);
check('non-admins cannot schedule admin-only screens → 403', call('POST', '/api/analytics/schedules', ['as' => 'chioma', 'json' => ['name' => 'x', 'view' => 'revenue', 'recipients' => ['chioma@aptech.test']]])['status'] === 403);
check('admin-only reports go to admins only → 422', call('POST', '/api/analytics/schedules', ['as' => 'admin', 'json' => ['name' => 'x', 'view' => 'revenue', 'recipients' => ['chioma@aptech.test']]])['status'] === 422);
$r = call('PATCH', "/api/analytics/schedules/{$sid}", ['as' => 'chioma', 'json' => ['active' => false, 'frequency' => 'daily', 'range' => 'yesterday']]);
check('pause and edit a schedule', $r['status'] === 200 && $r['body']['active'] === false && $r['body']['frequency'] === 'daily' && $r['body']['nextRunAt'] === null);
$list = call('GET', '/api/analytics/schedules', ['as' => 'admin'])['body'] ?? [];
check('admins see every schedule, including the default weekly business summary', in_array('Weekly business summary', array_column($list, 'name'), true) && in_array('My traffic', array_column($list, 'name'), true));
$report = static fn (int $id) => (string) shell_exec(escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg(__DIR__ . '/../bin/analytics-reports.php') . " --id={$id} --force 2>&1");
$before = (int) dbValue('SELECT COALESCE(MAX(id), 0) FROM notifications');
$out = $report($sid);
$n = $pdo->query("SELECT * FROM notifications WHERE id > {$before} AND recipient = 'chioma@aptech.test' ORDER BY id DESC LIMIT 1")->fetch();
$att = $n ? json_decode((string) $n['attachments'], true) : null;
$yesterday = date('Y-m-d', strtotime('-1 day'));
check('test send: CSV attached, rolling range (yesterday) in the file name', str_contains($out, 'Sent 1 report') && $n && is_array($att) && str_ends_with($att[0]['name'], "{$yesterday}-to-{$yesterday}.csv") && is_file($att[0]['path']) && str_starts_with((string) file_get_contents($att[0]['path']), "\xEF\xBB\xBF"), [$out, $att]);
$weekly = (int) dbValue("SELECT id FROM analytics_schedules WHERE name = 'Weekly business summary' LIMIT 1");
$out = $report($weekly);
$n = $pdo->query("SELECT * FROM notifications WHERE id > {$before} AND recipient = 'admin@aptechdevteam.com' ORDER BY id DESC LIMIT 1")->fetch();
check('PDF format: HTML summary with KPIs and a link to the screen', $n && str_contains((string) $n['html_body'], 'Open the full report') && str_contains((string) $n['body'], 'Visitors') && str_contains((string) $n['body'], '/analytics?view=overview'), $n['subject'] ?? $out);
check('delete a schedule', call('DELETE', "/api/analytics/schedules/{$sid}", ['as' => 'chioma'])['status'] === 204);
$r = call('GET', '/api/admin/activity?q=scheduled%20analytics', ['as' => 'admin']);
check('schedule changes and sends are in the activity log', ($r['body']['total'] ?? 0) >= 4);

/* ================= 10. Rate limit (last: it blocks this IP for a minute) ================= */
$limited = false;
$accepted = 0;
for ($i = 0; $i < 10 && !$limited; $i++) {
    $batch = ['visitorId' => uuid(), 'sessionId' => uuid(), 'events' => array_fill(0, 20, ['event' => 'scroll_depth', 'path' => '/', 'props' => ['depth' => 25]])];
    $r = track($batch);
    $limited = $r['status'] === 429;
    $accepted += $r['status'] === 204 ? 20 : 0;
}
check('120 events per minute per IP, then 429', $limited && $accepted <= 120, $accepted);

echo "\n{$passed} passed, {$failed} failed\n";
exit($failed ? 1 : 0);
