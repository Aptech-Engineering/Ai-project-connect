<?php

declare(strict_types=1);

/**
 * End-to-end API test against a running server with demo data.
 *
 *   php bin/setup.php --fresh --demo --demo-password="DemoStaff2026!" --admin-email=admin@aptechdevteam.com --admin-password=Aptechdev123
 *   php -S 127.0.0.1:8088 public/index.php
 *   php tests/smoke.php http://127.0.0.1:8088
 *
 * Needs config otp.expose_in_response = true (local only) so it can read the sign-in code.
 */

$base = rtrim($argv[1] ?? 'http://127.0.0.1:8088', '/');
$tmp = sys_get_temp_dir() . '/apc-smoke-' . bin2hex(random_bytes(4));
mkdir($tmp);
$passed = 0;
$failed = 0;

function call(string $method, string $path, array $opts = []): array
{
    global $base, $tmp;
    $ch = curl_init($base . $path);
    $headers = $opts['headers'] ?? ['X-Requested-With: XMLHttpRequest'];
    if (isset($opts['json'])) {
        $headers[] = 'Content-Type: application/json';
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($opts['json']));
    } elseif (isset($opts['multipart'])) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, $opts['multipart']);
    }
    $jar = $tmp . '/' . ($opts['as'] ?? 'anon') . '.cookies';
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_COOKIEJAR => $jar,
        CURLOPT_COOKIEFILE => $jar,
        CURLOPT_HEADER => true,
        CURLOPT_TIMEOUT => 30,
    ]);
    $raw = (string) curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $headerSize = (int) curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    curl_close($ch);
    $rawHeaders = substr($raw, 0, $headerSize);
    $body = substr($raw, $headerSize);
    return ['status' => $status, 'body' => json_decode($body, true), 'raw' => $body, 'headers' => $rawHeaders];
}

function check(string $name, bool $ok, $detail = null): void
{
    global $passed, $failed;
    if ($ok) {
        $passed++;
        echo "PASS  {$name}\n";
    } else {
        $failed++;
        echo "FAIL  {$name}" . ($detail !== null ? '  → ' . json_encode($detail) : '') . "\n";
    }
}

function file_part(string $name, string $contents, string $mime): CURLFile
{
    global $tmp;
    $path = $tmp . '/' . $name;
    file_put_contents($path, $contents);
    return new CURLFile($path, $mime, $name);
}

$pdf = "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF";
$png = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');

/* ---------------- public ---------------- */
$r = call('GET', '/api/health');
check('health', $r['status'] === 200 && $r['body']['ok'] === true, $r);
$r = call('GET', '/api/content');
check('site content has hero + idea form options', $r['status'] === 200 && isset($r['body']['hero']['titleLine1'], $r['body']['ideaForm']['categories']));
$r = call('GET', '/api/courses');
check('published courses with prices', $r['status'] === 200 && count($r['body']) === 10 && $r['body'][0]['price'] > 0);
$r = call('GET', '/api/technologies');
check('technologies list', $r['status'] === 200 && count($r['body']) === 10);
$r = call('GET', '/api/nope');
check('unknown endpoint → 404', $r['status'] === 404);

$ideaFields = [
    'name' => 'Kola Adebayo', 'email' => 'kola@laundrygo.test', 'phone' => '08012345678', 'country' => 'Nigeria', 'state' => 'Lagos',
    'title' => 'LaundryGo', 'category' => 'Logistics', 'platforms' => json_encode(['Android app', 'dApp (Web3)']),
    'problem' => 'People in Lagos waste hours finding reliable laundry pickup.', 'targetUsers' => 'Busy professionals',
    'features' => 'Book pickup, track order, pay online', 'budget' => 'Not sure yet', 'timeline' => '1 – 3 months', 'nda' => '1',
];
$r = call('POST', '/api/ideas', ['headers' => [], 'multipart' => $ideaFields]);
check('CSRF: write without X-Requested-With → 403', $r['status'] === 403, $r['body']);
$r = call('POST', '/api/ideas', ['multipart' => ['category' => 'Made up'] + $ideaFields]);
check('idea with invalid category → 422', $r['status'] === 422 && isset($r['body']['errors']['category']), $r['body']);
$r = call('POST', '/api/ideas', ['multipart' => $ideaFields + ['attachment' => file_part('notes.pdf', 'not a pdf', 'application/pdf')]]);
check('fake PDF rejected by content check', $r['status'] === 422 && isset($r['body']['errors']['attachment']), $r['body']);
$r = call('POST', '/api/ideas', ['multipart' => $ideaFields + ['attachment' => file_part('LaundryGo-Brief.pdf', $pdf, 'application/pdf')]]);
check('idea saved as draft with PDF brief (fee still due)', $r['status'] === 201 && preg_match('/^IDEA-/', $r['body']['ref'] ?? '') && $r['body']['status'] === 'DRAFT' && strlen($r['body']['token'] ?? '') === 64, $r['body']);
$ideaRef = $r['body']['ref'] ?? '';
$ideaToken = $r['body']['token'] ?? '';
$r = call('POST', '/api/applications/submit', ['json' => ['token' => $ideaToken]]);
check('idea cannot be submitted before the commitment fee → 409', $r['status'] === 409, $r['body']);
$r = call('POST', '/api/applications/pay/paystack', ['json' => ['token' => $ideaToken]]);
$checkout = (string) ($r['body']['authorizationUrl'] ?? '');
$r = call('GET', parse_url($checkout, PHP_URL_PATH) . '?' . parse_url($checkout, PHP_URL_QUERY));
check('commitment fee paid online (fake Paystack) → redirected to /apply', $r['status'] === 302 && str_contains($r['headers'], 'payment=success'), $r['headers']);
$r = call('POST', '/api/applications/submit', ['json' => ['token' => $ideaToken]]);
check('idea submitted after paying', $r['status'] === 200 && $r['body']['status'] === 'NEW', $r['body']);
$r = call('GET', '/api/ideas/' . $ideaRef);
check('idea status by reference', $r['status'] === 200 && $r['body']['status'] === 'NEW' && $r['body']['projectRegistered'] === false, $r['body']);

$r = call('POST', '/api/course-enquiries', ['json' => ['courseId' => 'flutter', 'type' => 'info', 'name' => 'Tolu Ade', 'contact' => 'tolu@ade.test']]);
check('public course enquiry creates lead', $r['status'] === 201, $r['body']);

/* ---------------- client portal ---------------- */
$r = call('POST', '/api/client/auth/request-code', ['as' => 'ada', 'json' => ['projectCode' => 'bad']]);
check('client: bad ID format → 422', $r['status'] === 422);
$r = call('POST', '/api/client/auth/request-code', ['as' => 'ada', 'json' => ['projectCode' => 'APC-26-ZZZZZ']]);
check('client: unknown ID → 404', $r['status'] === 404);
$r = call('POST', '/api/client/auth/request-code', ['as' => 'ada', 'json' => ['projectCode' => 'apc-26-7kq9x']]);
check('client: code sent with masked destinations', $r['status'] === 200 && str_contains($r['body']['sentTo']['email'] ?? '', '•••') && isset($r['body']['devCode']), $r['body']);
$otp = $r['body']['devCode'] ?? '';
$r = call('POST', '/api/client/auth/request-code', ['as' => 'ada', 'json' => ['projectCode' => 'APC-26-7KQ9X']]);
check('client: resend too soon → 429', $r['status'] === 429);
$r = call('GET', '/api/client/projects/APC-26-7KQ9X', ['as' => 'ada']);
check('client: project needs sign-in → 401', $r['status'] === 401);
$wrong = $otp === '000000' ? '111111' : '000000';
$r = call('POST', '/api/client/auth/verify', ['as' => 'ada', 'json' => ['projectCode' => 'APC-26-7KQ9X', 'code' => $wrong]]);
check('client: wrong code → 422 with attempts left', $r['status'] === 422 && str_contains($r['body']['errors']['code'] ?? '', 'left'), $r['body']);
$r = call('POST', '/api/client/auth/verify', ['as' => 'ada', 'json' => ['projectCode' => 'APC-26-7KQ9X', 'code' => $otp]]);
check('client: verified, sees both of her projects', $r['status'] === 200 && count($r['body']['projects'] ?? []) === 2, $r['body']);
$r = call('POST', '/api/client/auth/verify', ['as' => 'ada', 'json' => ['projectCode' => 'APC-26-7KQ9X', 'code' => $otp]]);
check('client: code cannot be reused', $r['status'] === 400);

$r = call('GET', '/api/client/projects/APC-26-7KQ9X', ['as' => 'ada']);
$titles = array_column($r['body']['updates'] ?? [], 'title');
check('client: project loads', $r['status'] === 200 && $r['body']['stage'] === 'DEVELOPMENT' && $r['body']['progress'] === 62, $r['status']);
check('client: internal notes and pending updates hidden', !in_array('Paystack webhook retries flaky on staging', $titles, true) && !in_array('Buyer order tracking screen ready', $titles, true), $titles);
check('client: no internal fields leaked', !isset($r['body']['activity']) && !isset($r['body']['client']['email']) && !isset($r['body']['id']), array_keys($r['body'] ?? []));
$milestone = null;
foreach ($r['body']['milestones'] ?? [] as $m) {
    if ($m['title'] === 'Payments & checkout demo') {
        $milestone = $m['id'];
    }
}
$r = call('GET', '/api/client/projects/APC-26-M4TR8', ['as' => 'ada']);
check("client: another client's project → 404", $r['status'] === 404);
$r = call('GET', '/api/client/projects/APC-26-D5LC3', ['as' => 'ada']);
check('client: can switch to her second project', $r['status'] === 200 && $r['body']['title'] === 'KoboSave');

$r = call('POST', '/api/client/projects/APC-26-7KQ9X/messages', ['as' => 'ada', 'json' => ['text' => 'When is the checkout demo?']]);
check('client: message sent', $r['status'] === 201);
$r = call('POST', "/api/client/projects/APC-26-7KQ9X/milestones/{$milestone}/approve", ['as' => 'ada']);
check('client: milestone approved', $r['status'] === 200 && !empty($r['body']['approvedAt']), $r['body']);
$r = call('POST', '/api/client/projects/APC-26-7KQ9X/course-requests', ['as' => 'ada', 'json' => ['techId' => 'node', 'type' => 'enrol']]);
check('client: Learn this → enrol lead', $r['status'] === 201, $r['body']);
$r = call('POST', '/api/client/projects/APC-26-7KQ9X/course-requests', ['as' => 'ada', 'json' => ['techId' => 'figma', 'type' => 'enrol']]);
check('client: course for tech not in stack → 404', $r['status'] === 404);
$r = call('PATCH', '/api/client/projects/APC-26-7KQ9X/preferences', ['as' => 'ada', 'json' => ['promosOptOut' => true]]);
check('client: opt out of course suggestions', $r['status'] === 200 && $r['body']['promosOptOut'] === true);
$r = call('POST', '/api/client/projects/APC-26-7KQ9X/rating', ['as' => 'ada', 'json' => ['stars' => 5]]);
check('client: cannot rate before delivery', $r['status'] === 400);

/* ---------------- staff ---------------- */
$r = call('POST', '/api/staff/auth/login', ['as' => 'admin', 'json' => ['email' => 'admin@aptechdevteam.com', 'password' => 'wrong-password']]);
check('staff: wrong password → 401 generic message', $r['status'] === 401 && $r['body']['error'] === 'Incorrect email or password.');
$r = call('POST', '/api/staff/auth/login', ['as' => 'admin', 'json' => ['email' => 'Admin@AptechDevTeam.com', 'password' => 'Aptechdev123']]);
check('staff: admin signs in', $r['status'] === 200 && $r['body']['user']['role'] === 'admin', $r['body']);
foreach (['chioma' => 'chioma@aptech.test', 'tunde' => 'tunde@aptech.test', 'aisha' => 'aisha@aptech.test', 'grace' => 'grace@aptech.test'] as $who => $email) {
    $r = call('POST', '/api/staff/auth/login', ['as' => $who, 'json' => ['email' => $email, 'password' => 'DemoStaff2026!']]);
    check("staff: {$who} signs in", $r['status'] === 200, $r['body']);
}

$r = call('GET', '/api/staff/dashboard', ['as' => 'admin']);
check('admin dashboard counts', $r['status'] === 200 && $r['body']['activeProjects'] === 4 && $r['body']['pendingApprovals'] === 1 && $r['body']['newIdeas'] === 3 && $r['body']['paymentsToConfirm'] === 1, $r['body']);
$r = call('GET', '/api/staff/projects', ['as' => 'admin']);
check('admin sees all 5 projects', $r['status'] === 200 && count($r['body']) === 5);
$r = call('GET', '/api/staff/projects', ['as' => 'chioma']);
check('engineer sees only assigned projects (2)', $r['status'] === 200 && count($r['body']) === 2, array_column($r['body'] ?? [], 'code'));
$r = call('GET', '/api/staff/projects/APC-26-H2NP6', ['as' => 'chioma']);
check('engineer: unassigned project → 404', $r['status'] === 404);
$r = call('GET', '/api/staff/projects', ['as' => 'aisha']);
check('counsellor cannot list projects → 403', $r['status'] === 403);
$r = call('GET', '/api/staff/projects/APC-26-7KQ9X', ['as' => 'chioma']);
check('staff project view includes internal notes + activity', $r['status'] === 200 && isset($r['body']['activity']) && in_array('internal', array_column($r['body']['updates'], 'visibility'), true));

$r = call('POST', '/api/staff/projects/APC-26-7KQ9X/updates', ['as' => 'chioma', 'json' => ['title' => 'Checkout screens ready', 'body' => 'You can now try the full checkout.', 'visibility' => 'client']]);
check('engineer client update → pending', $r['status'] === 201 && $r['body']['pending'] === true, $r['body']);
$pendingId = $r['body']['id'] ?? 0;
$r = call('POST', "/api/staff/updates/{$pendingId}/approve", ['as' => 'chioma']);
check('engineer cannot approve → 403', $r['status'] === 403);
$r = call('POST', "/api/staff/updates/{$pendingId}/approve", ['as' => 'grace']);
check("other project's lead cannot approve → 404", $r['status'] === 404);
$r = call('POST', "/api/staff/updates/{$pendingId}/approve", ['as' => 'tunde']);
check('project lead approves → published', $r['status'] === 200 && $r['body']['pending'] === false, $r['body']);
$r = call('PUT', '/api/staff/projects/APC-26-7KQ9X/stage', ['as' => 'chioma', 'json' => ['stage' => 'TESTING']]);
check('engineer cannot change stage → 403', $r['status'] === 403);
$r = call('PUT', '/api/staff/projects/APC-26-7KQ9X/stage', ['as' => 'tunde', 'json' => ['stage' => 'ON_HOLD']]);
check('on hold needs a reason → 422', $r['status'] === 422 && isset($r['body']['errors']['holdReason']));
$r = call('PUT', '/api/staff/projects/APC-26-7KQ9X/stage', ['as' => 'tunde', 'json' => ['stage' => 'TESTING', 'progress' => 60]]);
check('lead changes stage; progress raised to stage minimum; stage update auto-posted', $r['status'] === 200 && $r['body']['stage'] === 'TESTING' && $r['body']['progress'] === 75 && $r['body']['updates'][0]['kind'] === 'stage', $r['body']['progress'] ?? $r['body']);

$r = call('POST', '/api/staff/projects/APC-26-7KQ9X/technologies', ['as' => 'chioma', 'json' => ['techId' => 'firebase', 'usage' => 'Push notifications']]);
check('engineer tags technology', $r['status'] === 201);
$r = call('POST', '/api/staff/projects/APC-26-7KQ9X/technologies', ['as' => 'chioma', 'json' => ['techId' => 'cobol', 'usage' => 'Legacy']]);
check('unknown technology → 422', $r['status'] === 422);
$r = call('POST', '/api/staff/projects/APC-26-7KQ9X/milestones', ['as' => 'tunde', 'json' => ['title' => 'Security review', 'dueDate' => date('Y-m-d', strtotime('+10 days')), 'needsClientApproval' => false]]);
check('lead adds milestone', $r['status'] === 201);
$newMilestone = $r['body']['id'] ?? 0;
$r = call('PATCH', "/api/staff/milestones/{$newMilestone}", ['as' => 'tunde', 'json' => ['completed' => true]]);
check('lead completes milestone', $r['status'] === 200);
$r = call('POST', '/api/staff/projects/APC-26-7KQ9X/members', ['as' => 'tunde', 'json' => ['userId' => 8]]);
check('assign engineer (David)', $r['status'] === 201, $r['body']);
$r = call('POST', '/api/staff/projects/APC-26-7KQ9X/files', ['as' => 'chioma', 'multipart' => ['kind' => 'design', 'file' => file_part('Checkout-Designs.pdf', $pdf, 'application/pdf')]]);
check('engineer shares a PDF', $r['status'] === 201, $r['body']);
$r = call('POST', '/api/staff/projects/APC-26-7KQ9X/files', ['as' => 'chioma', 'multipart' => ['file' => file_part('script.php', '<?php echo 1;', 'application/pdf')]]);
check('PHP file disguised as PDF rejected', $r['status'] === 422, $r['body']);
$r = call('POST', '/api/staff/projects/APC-26-7KQ9X/messages', ['as' => 'tunde', 'json' => ['text' => 'The demo is on Friday!']]);
check('lead replies to client', $r['status'] === 201);
$r = call('GET', '/api/staff/messages', ['as' => 'tunde']);
check('message threads list', $r['status'] === 200 && count($r['body']) >= 1);

// client sees staff changes
$r = call('GET', '/api/client/projects/APC-26-7KQ9X', ['as' => 'ada']);
$titles = array_column($r['body']['updates'] ?? [], 'title');
check('client sees approved update + stage change + reply + file', in_array('Checkout screens ready', $titles, true) && $r['body']['stage'] === 'TESTING' && end($r['body']['messages'])['text'] === 'The demo is on Friday!' && count($r['body']['files']) === 1, $titles);
$fileUrl = $r['body']['files'][0]['url'] ?? '';
$r = call('GET', $fileUrl, ['as' => 'ada']);
check('client downloads shared PDF', $r['status'] === 200 && str_starts_with($r['raw'], '%PDF') && str_contains($r['headers'], 'nosniff'));
$r = call('GET', $fileUrl, ['as' => 'anon']);
check('anonymous cannot download client file', $r['status'] === 401);

// regenerate Project ID
$r = call('POST', '/api/staff/projects/APC-26-7KQ9X/regenerate-code', ['as' => 'tunde']);
$newCode = $r['body']['code'] ?? '';
check('lead regenerates Project ID', $r['status'] === 200 && $newCode !== 'APC-26-7KQ9X' && preg_match('/^APC-\d{2}-[A-Z0-9]{5}$/', $newCode), $r['body']);
$r = call('GET', '/api/client/me', ['as' => 'ada']);
check('client signed out after regeneration', $r['status'] === 401);
$r = call('POST', '/api/client/auth/request-code', ['as' => 'ada2', 'json' => ['projectCode' => 'APC-26-7KQ9X']]);
check('old ID explains it was replaced', $r['status'] === 404 && str_contains($r['body']['error'], 'replaced'), $r['body']);
$r = call('POST', '/api/client/auth/request-code', ['as' => 'ada2', 'json' => ['projectCode' => $newCode]]);
check('new ID works', $r['status'] === 200);

/* ---------------- ideas ---------------- */
$r = call('GET', '/api/staff/ideas?status=NEW', ['as' => 'tunde']);
$idea = null;
foreach ($r['body'] ?? [] as $i) {
    if ($i['ref'] === $ideaRef) {
        $idea = $i;
    }
}
check('lead sees new idea with PDF brief', $r['status'] === 200 && $idea !== null && $idea['attachment'] !== null && $idea['location'] === 'Lagos, Nigeria', $idea);
$r = call('GET', $idea['attachment']['url'] ?? '/', ['as' => 'tunde']);
check('lead opens the PDF brief', $r['status'] === 200 && str_starts_with($r['raw'], '%PDF'));
$r = call('GET', $idea['attachment']['url'] ?? '/', ['as' => 'chioma']);
check('engineer cannot open idea brief', $r['status'] === 404);
$r = call('PATCH', "/api/staff/ideas/{$idea['id']}", ['as' => 'tunde', 'json' => ['status' => 'QUOTE_SENT', 'notes' => 'Quoted 12 weeks']]);
check('lead marks quote sent', $r['status'] === 200 && $r['body']['status'] === 'QUOTE_SENT');
$r = call('POST', "/api/staff/ideas/{$idea['id']}/convert", ['as' => 'tunde', 'json' => ['leadId' => 2, 'targetDate' => date('Y-m-d', strtotime('+90 days'))]]);
check('only admin converts ideas → 403', $r['status'] === 403);
$r = call('POST', "/api/staff/ideas/{$idea['id']}/convert", ['as' => 'admin', 'json' => ['leadId' => 2, 'targetDate' => date('Y-m-d', strtotime('+90 days'))]]);
$convertedCode = $r['body']['projectCode'] ?? '';
check('admin converts idea → project + Project ID', $r['status'] === 201 && preg_match('/^APC-/', $convertedCode) && $r['body']['idea']['status'] === 'ACCEPTED', $r['body']);
$r = call('GET', '/api/ideas/' . $ideaRef);
check('submitter sees project registered (ID not revealed)', $r['body']['projectRegistered'] === true && !str_contains($r['raw'], $convertedCode));
$r = call('GET', "/api/staff/projects/{$convertedCode}", ['as' => 'tunde']);
check('new project has lead, welcome update and brief file', $r['status'] === 200 && $r['body']['lead']['name'] === 'Tunde Bakare' && $r['body']['updates'][0]['title'] === 'Welcome! Your project is registered' && count($r['body']['files']) === 1, $r['body']['files'] ?? $r);

/* ---------------- leads ---------------- */
$r = call('GET', '/api/staff/leads', ['as' => 'aisha']);
check('counsellor sees leads (seeded + website + portal)', $r['status'] === 200 && $r['body']['stats']['total'] === 4, $r['body']['stats'] ?? $r);
$leadId = $r['body']['leads'][0]['id'] ?? 0;
$r = call('PATCH', "/api/staff/leads/{$leadId}", ['as' => 'aisha', 'json' => ['status' => 'ENROLLED', 'notes' => 'Paid deposit']]);
check('counsellor marks enrolled', $r['status'] === 200 && $r['body']['status'] === 'ENROLLED');
$r = call('GET', '/api/staff/leads', ['as' => 'chioma']);
check('engineer cannot see leads → 403', $r['status'] === 403);

/* ---------------- admin ---------------- */
$r = call('GET', '/api/content');
$content = $r['body'];
$content['hero']['titleLine1'] = 'We turn ideas into apps.';
$content['announcement']['enabled'] = true;
$r = call('PUT', '/api/admin/content', ['as' => 'tunde', 'json' => $content]);
check('lead cannot edit website → 403', $r['status'] === 403);
$r = call('PUT', '/api/admin/content', ['as' => 'admin', 'json' => $content]);
check('admin publishes website content', $r['status'] === 200);
$r = call('GET', '/api/content');
check('public content updated', $r['body']['hero']['titleLine1'] === 'We turn ideas into apps.' && $r['body']['announcement']['enabled'] === true);
$bad = $content;
$bad['ideaForm']['categories'] = 'not a list';
$r = call('PUT', '/api/admin/content', ['as' => 'admin', 'json' => $bad]);
check('malformed content rejected → 422', $r['status'] === 422);

$r = call('POST', '/api/admin/images', ['as' => 'admin', 'multipart' => ['file' => file_part('flier.png', $png, 'image/png')]]);
check('admin uploads flier image', $r['status'] === 201 && strlen($r['body']['id'] ?? '') === 32, $r['body']);
$flier = $r['body'];
$r = call('POST', '/api/admin/courses', ['as' => 'admin', 'json' => [
    'title' => 'Blockchain & Solidity for dApps', 'duration' => '10 weeks', 'format' => 'Online · Evenings', 'nextStart' => date('Y-m-d', strtotime('+30 days')),
    'price' => 250000, 'currency' => 'NGN', 'discountPercent' => 20, 'discountCode' => 'web320', 'flierId' => $flier['id'], 'published' => true,
]]);
check('admin creates priced course with flier', $r['status'] === 201 && $r['body']['id'] === 'blockchain-solidity-for-dapps' && $r['body']['discountCode'] === 'WEB320', $r['body']);
$r = call('POST', '/api/admin/technologies', ['as' => 'admin', 'json' => ['name' => 'Solidity', 'category' => 'Web3', 'plain' => 'The language used to write the smart contracts behind your dApp.', 'color' => '#627EEA', 'courseId' => 'blockchain-solidity-for-dapps']]);
check('admin creates technology linked to course', $r['status'] === 201 && $r['body']['courseId'] === 'blockchain-solidity-for-dapps', $r['body']);
$r = call('GET', '/api/courses');
$new = array_values(array_filter($r['body'], static fn ($c) => $c['id'] === 'blockchain-solidity-for-dapps'))[0] ?? null;
check('course is public with flier URL', $new !== null && $new['flierUrl'] === '/api/files/' . $flier['id']);
$r = call('GET', $new['flierUrl'] ?? '/');
check('flier image served publicly as image/png', $r['status'] === 200 && str_contains($r['headers'], 'Content-Type: image/png'));
$r = call('PATCH', '/api/admin/courses/blockchain-solidity-for-dapps', ['as' => 'admin', 'json' => ['published' => false, 'price' => 230000]]);
check('admin unpublishes + reprices course', $r['status'] === 200 && $r['body']['published'] === false && $r['body']['price'] == 230000);

$r = call('POST', '/api/admin/users', ['as' => 'admin', 'json' => ['name' => 'New Engineer', 'email' => 'new@aptech.test', 'role' => 'engineer', 'password' => 'short']]);
check('weak password rejected', $r['status'] === 422);
$r = call('POST', '/api/admin/users', ['as' => 'admin', 'json' => ['name' => 'New Engineer', 'email' => 'new@aptech.test', 'role' => 'engineer', 'jobTitle' => 'Back-end engineer', 'password' => 'a-strong-password-1']]);
check('admin creates staff user', $r['status'] === 201, $r['body']);
$r = call('PATCH', '/api/admin/users/1', ['as' => 'admin', 'json' => ['role' => 'engineer']]);
check('admin cannot demote themselves', $r['status'] === 400);

$r = call('GET', '/api/staff/notifications', ['as' => 'admin']);
$subjects = array_column($r['body'] ?? [], 'subject');
$has = static fn (string $needle) => (bool) array_filter($subjects, static fn ($s) => str_contains($s, $needle));
check('notification log: OTP, welcome, stage, update, ID change, leads', $r['status'] === 200 && $has('sign-in code') && $has('Welcome to AI Project Connect') && $has('is now: Testing') && $has('New update on') && $has('Project ID has changed') && $has('enrolment'), $subjects);
$r = call('GET', '/api/staff/notifications', ['as' => 'tunde']);
check('lead cannot view notification log → 403', $r['status'] === 403);

/* ---------------- rate limiting ---------------- */
$locked = false;
for ($i = 0; $i < 7; $i++) {
    $r = call('POST', '/api/staff/auth/login', ['as' => 'attacker', 'json' => ['email' => 'grace@aptech.test', 'password' => 'guess-' . $i]]);
    if ($r['status'] === 429) {
        $locked = true;
        break;
    }
}
check('staff login locks after repeated failures → 429', $locked);

$r = call('POST', '/api/staff/auth/logout', ['as' => 'admin']);
$r2 = call('GET', '/api/staff/me', ['as' => 'admin']);
check('staff logout ends session', $r['status'] === 204 && $r2['status'] === 401);

echo "\n{$passed} passed, {$failed} failed\n";
exit($failed ? 1 : 0);
