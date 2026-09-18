<?php

declare(strict_types=1);

/**
 * End-to-end test for quotes, walk-in registration, client uploads, forgot password,
 * reports, weekly digest, change requests, handover, course invites and the activity log.
 *
 *   php bin/setup.php --fresh --demo --demo-password="DemoStaff2026!" --admin-email=admin@aptechdevteam.com --admin-password=Aptechdev123
 *   php -S 127.0.0.1:8088 public/index.php
 *   php tests/flows.php http://127.0.0.1:8088
 */

$base = rtrim($argv[1] ?? 'http://127.0.0.1:8088', '/');
$tmp = sys_get_temp_dir() . '/apc-flows-' . bin2hex(random_bytes(4));
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
        CURLOPT_CUSTOMREQUEST => $method, CURLOPT_RETURNTRANSFER => true, CURLOPT_HTTPHEADER => $headers,
        CURLOPT_COOKIEJAR => $jar, CURLOPT_COOKIEFILE => $jar, CURLOPT_HEADER => true, CURLOPT_TIMEOUT => 30,
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
    echo ($ok ? 'PASS  ' : 'FAIL  ') . $name . (!$ok && $detail !== null ? '  → ' . json_encode($detail) : '') . "\n";
}

function file_part(string $name, string $contents, string $mime): CURLFile
{
    global $tmp;
    file_put_contents("{$tmp}/{$name}", $contents);
    return new CURLFile("{$tmp}/{$name}", $mime, $name);
}

function signInClient(string $as, string $code): void
{
    $r = call('POST', '/api/client/auth/request-code', ['as' => $as, 'json' => ['projectCode' => $code]]);
    call('POST', '/api/client/auth/verify', ['as' => $as, 'json' => ['projectCode' => $code, 'code' => $r['body']['devCode'] ?? '']]);
}

function notificationSubjects(): array
{
    return array_column(call('GET', '/api/staff/notifications', ['as' => 'admin'])['body'] ?? [], 'subject');
}

$pdf = "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF";
$png = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');

foreach (['admin' => ['admin@aptechdevteam.com', 'Aptechdev123'], 'tunde' => ['tunde@aptech.test', 'DemoStaff2026!'], 'chioma' => ['chioma@aptech.test', 'DemoStaff2026!'], 'grace' => ['grace@aptech.test', 'DemoStaff2026!']] as $who => [$email, $password]) {
    call('POST', '/api/staff/auth/login', ['as' => $who, 'json' => ['email' => $email, 'password' => $password]]);
}
$tundeId = 2;

/* ================= 1. Quotes accepted online ================= */
$ideas = call('GET', '/api/staff/ideas', ['as' => 'tunde'])['body'];
$idea = array_values(array_filter($ideas, static fn ($i) => $i['ref'] === 'IDEA-8JD2P'))[0];
$quoteFields = [
    'amount' => '2500000', 'currency' => 'NGN', 'summary' => 'Web and Android apps for custom tailoring orders with measurements and WhatsApp reminders.',
    'timelineWeeks' => '12', 'validUntil' => date('Y-m-d', strtotime('+14 days')), 'leadId' => (string) $tundeId, 'targetDate' => date('Y-m-d', strtotime('+90 days')),
];
$r = call('POST', "/api/staff/ideas/{$idea['id']}/quote", ['as' => 'chioma', 'multipart' => $quoteFields]);
check('engineer cannot send quotes → 403', $r['status'] === 403);
$r = call('POST', "/api/staff/ideas/{$idea['id']}/quote", ['as' => 'tunde', 'multipart' => $quoteFields + ['proposal' => file_part('StyleHub-Proposal.pdf', $pdf, 'application/pdf')]]);
check('lead sends quote with proposal PDF', $r['status'] === 201 && $r['body']['quote']['proposal'] !== null && isset($r['body']['devLink']), $r['body']);
parse_str((string) parse_url($r['body']['devLink'] ?? '', PHP_URL_QUERY), $link);
$token = $link['token'] ?? '';
$r = call('GET', "/api/staff/ideas/{$idea['id']}", ['as' => 'tunde']);
check('idea shows quote sent', $r['body']['status'] === 'QUOTE_SENT' && $r['body']['quote']['amount'] == 2500000);
$r = call('GET', '/api/quotes/IDEA-8JD2P?token=wrong-token-wrong-token');
check('wrong quote token → 404', $r['status'] === 404);
$r = call('GET', "/api/quotes/IDEA-8JD2P?token={$token}");
check('client opens quote link', $r['status'] === 200 && $r['body']['status'] === 'sent' && $r['body']['idea']['title'] === 'StyleHub Tailors', $r['body']);
$r = call('GET', $r['body']['proposal']['url'] ?? '/');
check('client downloads proposal PDF via link', $r['status'] === 200 && str_starts_with($r['raw'], '%PDF'));
$r = call('POST', '/api/quotes/IDEA-8JD2P/accept', ['json' => ['token' => $token, 'name' => 'Amaka Nwachukwu', 'agree' => false]]);
check('must agree to accept', $r['status'] === 422);
$r = call('POST', '/api/quotes/IDEA-8JD2P/accept', ['json' => ['token' => $token, 'name' => 'Amaka Nwachukwu', 'agree' => true]]);
check('client accepts quote online', $r['status'] === 200 && $r['body']['projectRegistered'] === true, $r['body']);
$r = call('POST', '/api/quotes/IDEA-8JD2P/accept', ['json' => ['token' => $token, 'name' => 'Amaka Nwachukwu', 'agree' => true]]);
check('quote cannot be accepted twice', $r['status'] === 400);
$r = call('GET', "/api/staff/ideas/{$idea['id']}", ['as' => 'tunde']);
$newCode = $r['body']['projectCode'] ?? '';
check('project registered automatically with Project ID', $r['body']['status'] === 'ACCEPTED' && preg_match('/^APC-/', $newCode), $r['body']);
$r = call('GET', "/api/staff/projects/{$newCode}", ['as' => 'tunde']);
check('auto-registered project has lead + welcome update', $r['status'] === 200 && $r['body']['lead']['name'] === 'Tunde Bakare' && $r['body']['updates'][0]['title'] === 'Welcome! Your project is registered');
$subjects = notificationSubjects();
check('client got proposal email + welcome with Project ID; staff told', in_array('Your proposal for StyleHub Tailors', $subjects, true) && in_array('Welcome to AI Project Connect! Your Project ID', $subjects, true) && in_array('Quote accepted: StyleHub Tailors', $subjects, true));

// decline path
$ideas = call('GET', '/api/staff/ideas', ['as' => 'admin'])['body'];
$agro = array_values(array_filter($ideas, static fn ($i) => $i['ref'] === 'IDEA-2VN9K'))[0];
$r = call('POST', "/api/staff/ideas/{$agro['id']}/quote", ['as' => 'admin', 'multipart' => ['summary' => 'Cold storage booking website with SMS alerts and crate payments.'] + $quoteFields]);
parse_str((string) parse_url($r['body']['devLink'] ?? '', PHP_URL_QUERY), $link2);
$r = call('POST', '/api/quotes/IDEA-2VN9K/decline', ['json' => ['token' => $link2['token'] ?? '', 'reason' => 'Budget is too high for now']]);
check('client declines quote → idea back in review', $r['status'] === 200 && call('GET', "/api/staff/ideas/{$agro['id']}", ['as' => 'admin'])['body']['status'] === 'REVIEWING');

/* ================= 2. Walk-in registration ================= */
$r = call('GET', '/api/staff/clients?q=ada', ['as' => 'tunde']);
check('only admin can search clients → 403', $r['status'] === 403);
$r = call('GET', '/api/staff/clients?q=ada', ['as' => 'admin']);
check('admin finds existing client', $r['status'] === 200 && $r['body'][0]['name'] === 'Ada Okafor' && $r['body'][0]['projects'] === 2);
$r = call('POST', '/api/staff/projects', ['as' => 'admin', 'json' => ['clientName' => 'Musa Garba', 'clientEmail' => 'musa@walkin.test', 'title' => 'Garba Pharmacy Stock']]);
check('direct project registration (fee bypass) is gone → 404', $r['status'] === 404 || $r['status'] === 405, $r['status']);
$r = call('POST', '/api/staff/walk-ins', ['as' => 'admin', 'json' => [
    'name' => 'Musa Garba', 'email' => 'musa@walkin.test', 'phone' => '08023456789', 'country' => 'Nigeria', 'state' => 'Kaduna',
    'title' => 'Garba Pharmacy Stock', 'category' => 'Health', 'platforms' => ['Website'], 'budget' => '₦1M – ₦3M',
]]);
$walkInIdea = $r['body']['idea'] ?? [];
parse_str((string) parse_url($r['body']['devLink'] ?? '', PHP_URL_QUERY), $walkLink);
$walkToken = $walkLink['resume'] ?? '';
check('admin starts walk-in application (draft + link emailed)', $r['status'] === 201 && ($walkInIdea['status'] ?? '') === 'DRAFT' && strlen($walkToken) === 64 && in_array('Continue your application', notificationSubjects(), true), $r['body']);
$r = call('POST', "/api/staff/ideas/{$walkInIdea['id']}/convert", ['as' => 'admin', 'json' => ['leadId' => $tundeId, 'targetDate' => date('Y-m-d', strtotime('+60 days'))]]);
check('unpaid walk-in draft cannot be converted → 409', $r['status'] === 409);
$r = call('POST', "/api/staff/ideas/{$walkInIdea['id']}/payments/centre", ['as' => 'admin', 'json' => ['amount' => 2000, 'note' => 'Cash at Kaduna centre']]);
check('admin records commitment fee paid at the centre', $r['status'] === 201 && $r['body']['status'] === 'PAID', $r['body']);
$r = call('POST', '/api/applications/draft', ['json' => [
    'token' => $walkToken, 'problem' => 'Pharmacies in Kaduna lose money because they cannot see which drugs are about to expire.',
    'targetUsers' => 'Pharmacy owners and their shop attendants', 'features' => 'Stock list, expiry alerts, daily sales report, supplier reorders', 'timeline' => '1 – 3 months',
]]);
check('client finishes the application from the link', $r['status'] === 200 && $r['body']['canSubmit'] === true, $r['body']);
$r = call('POST', "/api/staff/ideas/{$walkInIdea['id']}/convert", ['as' => 'admin', 'json' => ['leadId' => $tundeId, 'targetDate' => date('Y-m-d', strtotime('+60 days'))]]);
check('paid but unsubmitted draft cannot be converted → 409', $r['status'] === 409);
$r = call('POST', '/api/applications/submit', ['json' => ['token' => $walkToken]]);
check('client submits walk-in application', $r['status'] === 200 && $r['body']['status'] === 'NEW', $r['body']);
$r = call('POST', "/api/staff/ideas/{$walkInIdea['id']}/convert", ['as' => 'admin', 'json' => ['leadId' => $tundeId, 'targetDate' => date('Y-m-d', strtotime('+60 days'))]]);
$walkIn = $r['body']['projectCode'] ?? '';
check('admin converts paid walk-in idea → project', $r['status'] === 201 && preg_match('/^APC-/', $walkIn), $r['body']);
check('walk-in client gets welcome email', in_array('Welcome to AI Project Connect! Your Project ID', notificationSubjects(), true));

/* ================= 3. Client uploads files ================= */
signInClient('ngozi', 'APC-26-H2NP6');
$r = call('POST', '/api/client/projects/APC-26-H2NP6/files', ['as' => 'ngozi', 'multipart' => ['note' => 'Tutor intro videos checklist', 'file' => file_part('Tutor-Checklist.pdf', $pdf, 'application/pdf')]]);
check('client uploads content file', $r['status'] === 201, $r['body']);
$r = call('POST', '/api/client/projects/APC-26-H2NP6/files', ['as' => 'ngozi', 'multipart' => ['file' => file_part('hack.php', '<?php system($_GET["c"]);', 'application/pdf')]]);
check('client cannot upload PHP disguised as PDF', $r['status'] === 422);
$r = call('GET', '/api/staff/projects/APC-26-H2NP6', ['as' => 'grace']);
$fromClient = array_values(array_filter($r['body']['files'], static fn ($f) => $f['source'] === 'client'));
check('staff sees file marked as from client with note', count($fromClient) === 1 && $fromClient[0]['note'] === 'Tutor intro videos checklist', $r['body']['files']);
$r = call('POST', '/api/client/projects/APC-26-7KQ9X/files', ['as' => 'ngozi', 'multipart' => ['file' => file_part('x.pdf', $pdf, 'application/pdf')]]);
check("client cannot upload to someone else's project", $r['status'] === 404);

/* ================= 4. Forgot password ================= */
$r = call('POST', '/api/staff/auth/forgot-password', ['json' => ['email' => 'nobody@nowhere.test']]);
$unknownMessage = $r['body']['message'] ?? '';
check('unknown email gets the same generic answer', $r['status'] === 200 && !isset($r['body']['devToken']));
$r = call('POST', '/api/staff/auth/forgot-password', ['json' => ['email' => 'grace@aptech.test']]);
check('known email: same message, reset link issued', $r['status'] === 200 && $r['body']['message'] === $unknownMessage && isset($r['body']['devToken']));
$resetToken = $r['body']['devToken'] ?? '';
$r = call('POST', '/api/staff/auth/reset-password', ['json' => ['token' => $resetToken, 'password' => 'short']]);
check('weak new password rejected', $r['status'] === 422);
$r = call('POST', '/api/staff/auth/reset-password', ['json' => ['token' => $resetToken, 'password' => 'GraceNewPass2026!']]);
check('password reset with link', $r['status'] === 200);
$r = call('POST', '/api/staff/auth/reset-password', ['json' => ['token' => $resetToken, 'password' => 'AnotherPass2026!']]);
check('reset link works only once', $r['status'] === 400);
$r = call('POST', '/api/staff/auth/login', ['as' => 'grace2', 'json' => ['email' => 'grace@aptech.test', 'password' => 'GraceNewPass2026!']]);
check('signs in with new password', $r['status'] === 200 && $r['body']['user']['mustChangePassword'] === false);
$r = call('POST', '/api/admin/users', ['as' => 'admin', 'json' => ['name' => 'Temp Person', 'email' => 'temp@aptech.test', 'role' => 'engineer', 'password' => 'Temporary-2026']]);
$r = call('POST', '/api/staff/auth/login', ['as' => 'temp', 'json' => ['email' => 'temp@aptech.test', 'password' => 'Temporary-2026']]);
check('admin-created user must change password', $r['body']['user']['mustChangePassword'] === true);
$r = call('POST', '/api/staff/me/password', ['as' => 'temp', 'json' => ['currentPassword' => 'Temporary-2026', 'newPassword' => 'MyOwnPassword2026']]);
check('changing password clears the flag', $r['status'] === 200 && call('GET', '/api/staff/me', ['as' => 'temp'])['body']['user']['mustChangePassword'] === false);

/* ================= 5. Change requests ================= */
signInClient('ada', 'APC-26-7KQ9X');
$r = call('GET', '/api/client/projects/APC-26-7KQ9X', ['as' => 'ada']);
$seeded = $r['body']['changeRequests'][0] ?? null;
check('client sees quoted change request', $seeded !== null && $seeded['status'] === 'QUOTED' && $seeded['impactDays'] === 10);
$targetBefore = $r['body']['targetDate'];
$r = call('POST', "/api/client/change-requests/{$seeded['id']}/approve", ['as' => 'ada', 'json' => ['note' => 'Go ahead']]);
check('client approves change', $r['status'] === 200 && $r['body']['status'] === 'APPROVED', $r['body']);
$r = call('GET', '/api/client/projects/APC-26-7KQ9X', ['as' => 'ada']);
check('target delivery moved by 10 days', (strtotime($r['body']['targetDate']) - strtotime($targetBefore)) === 10 * 86400, [$targetBefore, $r['body']['targetDate']]);
$r = call('POST', '/api/client/projects/APC-26-7KQ9X/change-requests', ['as' => 'ada', 'json' => ['title' => 'Add Yoruba language', 'description' => 'Farmers in Oyo prefer Yoruba for the app screens.']]);
$crId = $r['body']['id'] ?? 0;
check('client submits change request', $r['status'] === 201 && $r['body']['status'] === 'SUBMITTED');
$r = call('POST', "/api/client/change-requests/{$crId}/approve", ['as' => 'ada']);
check('client cannot approve before it is quoted', $r['status'] === 400);
$r = call('PATCH', "/api/staff/change-requests/{$crId}", ['as' => 'chioma', 'json' => ['status' => 'QUOTED', 'impactCost' => 200000]]);
check('engineer cannot quote change → 403', $r['status'] === 403);
$r = call('PATCH', "/api/staff/change-requests/{$crId}", ['as' => 'tunde', 'json' => ['status' => 'QUOTED']]);
check('quote needs cost or days', $r['status'] === 422);
$r = call('PATCH', "/api/staff/change-requests/{$crId}", ['as' => 'tunde', 'json' => ['status' => 'QUOTED', 'impactCost' => 200000, 'impactDays' => 7, 'responseNote' => 'Needs translation and review.']]);
check('lead quotes the impact', $r['status'] === 200 && $r['body']['status'] === 'QUOTED');
$r = call('POST', "/api/client/change-requests/{$crId}/decline", ['as' => 'ada', 'json' => ['note' => 'Maybe next phase']]);
check('client declines', $r['status'] === 200 && $r['body']['status'] === 'DECLINED');
$r = call('PATCH', "/api/staff/change-requests/{$seeded['id']}", ['as' => 'tunde', 'json' => ['status' => 'COMPLETED']]);
check('lead completes approved change', $r['status'] === 200 && $r['body']['status'] === 'COMPLETED');
$r = call('GET', '/api/staff/change-requests', ['as' => 'tunde']);
check('staff change-request list', $r['status'] === 200 && count($r['body']) >= 2);

/* ================= 6. Handover ================= */
$r = call('POST', '/api/staff/projects/APC-26-M4TR8/handover/items', ['as' => 'grace2', 'json' => ['useDefaults' => true]]);
check('lead adds standard handover checklist', $r['status'] === 201 && $r['body']['added'] === 5);
$r = call('POST', '/api/staff/projects/APC-26-M4TR8/handover/request', ['as' => 'grace2']);
check('cannot request sign-off before Deployment', $r['status'] === 400);
call('PUT', '/api/staff/projects/APC-26-M4TR8/stage', ['as' => 'grace2', 'json' => ['stage' => 'DEPLOYMENT']]);
$r = call('POST', '/api/staff/projects/APC-26-M4TR8/handover/request', ['as' => 'grace2']);
check('cannot request sign-off with unfinished checklist', $r['status'] === 400);
$project = call('GET', '/api/staff/projects/APC-26-M4TR8', ['as' => 'grace2'])['body'];
foreach ($project['handover']['items'] as $item) {
    call('PATCH', "/api/staff/handover-items/{$item['id']}", ['as' => 'grace2', 'json' => ['done' => true]]);
}
$r = call('POST', '/api/staff/projects/APC-26-M4TR8/handover/request', ['as' => 'grace2']);
check('lead requests sign-off', $r['status'] === 200);
signInClient('kemi', 'APC-26-M4TR8');
$r = call('GET', '/api/client/projects/APC-26-M4TR8', ['as' => 'kemi']);
check('client sees completed checklist', $r['body']['handover']['requestedAt'] !== null && count(array_filter($r['body']['handover']['items'], static fn ($i) => $i['doneAt'])) === 5);
$r = call('POST', '/api/client/projects/APC-26-M4TR8/handover/sign', ['as' => 'kemi', 'json' => ['name' => 'Kemi Balogun', 'supportPlan' => 'platinum', 'agree' => true]]);
check('unknown support plan rejected', $r['status'] === 422);
$r = call('POST', '/api/client/projects/APC-26-M4TR8/handover/sign', ['as' => 'kemi', 'json' => ['name' => 'Kemi Balogun', 'supportPlan' => 'growth', 'agree' => true]]);
check('client signs handover → delivered', $r['status'] === 200 && $r['body']['stage'] === 'DELIVERED', $r['body']);
$r = call('GET', '/api/client/projects/APC-26-M4TR8', ['as' => 'kemi']);
check('project delivered at 100% with plan saved', $r['body']['stage'] === 'DELIVERED' && $r['body']['progress'] === 100 && $r['body']['handover']['supportPlanName'] === 'Growth');
$r = call('PATCH', "/api/staff/handover-items/{$project['handover']['items'][0]['id']}", ['as' => 'grace2', 'json' => ['done' => false]]);
check('signed checklist is locked', $r['status'] === 400);

/* ================= 7. Course invites ================= */
$r = call('POST', '/api/client/projects/APC-26-7KQ9X/course-invites', ['as' => 'ada', 'json' => ['techId' => 'flutter', 'name' => 'Bayo Ade', 'email' => 'bayo@farmlink.test', 'message' => 'You should learn this!']]);
check('client invites team member to course', $r['status'] === 201, $r['body']);
$r = call('POST', '/api/client/projects/APC-26-7KQ9X/course-invites', ['as' => 'ada', 'json' => ['techId' => 'aws', 'name' => 'Bayo Ade', 'email' => 'bayo@farmlink.test']]);
check('invite for tech not in stack → 404', $r['status'] === 404);
$leads = call('GET', '/api/staff/leads', ['as' => 'admin'])['body']['leads'];
$invite = array_values(array_filter($leads, static fn ($l) => $l['source'] === 'invite'))[0] ?? null;
check('invite appears as lead with inviter', $invite !== null && $invite['invitedBy'] === 'Ada Okafor' && $invite['clientName'] === 'Bayo Ade');
check('invitee receives course email', in_array('Ada Okafor invited you to learn Flutter', notificationSubjects(), true));

/* ================= 8. Course funnel + reports ================= */
$r = call('POST', '/api/course-events', ['json' => ['event' => 'click', 'courseId' => 'react', 'techId' => 'react']]);
check('course click tracked', $r['status'] === 204);
$r = call('POST', '/api/course-events', ['json' => ['event' => 'purchase', 'courseId' => 'react']]);
check('unknown event rejected', $r['status'] === 422);
$r = call('GET', '/api/admin/reports?days=90', ['as' => 'tunde']);
check('lead cannot view reports → 403', $r['status'] === 403);
$r = call('GET', '/api/admin/reports?days=90', ['as' => 'admin']);
$report = $r['body'];
check('reports: projects by stage', $r['status'] === 200 && count($report['projects']['byStage']) === 9 && $report['projects']['total'] === 7, $report['projects'] ?? $r);
check('reports: update frequency per project', count($report['updates']['perProject']) >= 5 && array_key_exists('avgDaysSinceLastUpdate', $report['updates']));
$react = array_values(array_filter($report['courses']['byCourse'], static fn ($c) => $c['courseId'] === 'react'))[0] ?? null;
check('reports: course funnel views → clicks → leads', $react !== null && $react['views'] >= 42 && $react['clicks'] >= 13 && $react['leads'] >= 1, $react);
check('reports: quotes and change requests', $report['ideas']['quotesAccepted'] === 1 && $report['ideas']['acceptedValue'] == 2500000 && $report['changeRequests']['approved'] >= 1, [$report['ideas'], $report['changeRequests']]);
check('reports: satisfaction', $report['satisfaction']['ratings'] === 0 || $report['satisfaction']['averageRating'] !== null);

/* ================= 9. Weekly digest ================= */
$r = call('GET', '/api/staff/projects/APC-26-7KQ9X/digest-preview', ['as' => 'tunde']);
check('digest preview has stage, updates and decisions', $r['status'] === 200 && str_contains($r['body']['subject'], 'FarmLink Marketplace') && str_contains($r['body']['body'], 'Sign in with your Project ID'), $r['body']);
$r = call('PATCH', '/api/client/projects/APC-26-D5LC3/preferences', ['as' => 'ada', 'json' => ['digestOptOut' => true]]);
check('client turns off weekly email', $r['status'] === 200 && $r['body']['digestOptOut'] === true);
$r = call('POST', '/api/admin/digests/send', ['as' => 'admin']);
check('admin sends weekly digests (opted-out skipped)', $r['status'] === 200 && $r['body']['sent'] >= 3 && $r['body']['skipped'] >= 2, $r['body']);

/* ================= 10. Activity log ================= */
$r = call('GET', '/api/admin/activity?actorType=client', ['as' => 'admin']);
check('activity log filtered by clients', $r['status'] === 200 && $r['body']['total'] > 0 && count(array_filter($r['body']['items'], static fn ($i) => $i['actorType'] !== 'client')) === 0);
$r = call('GET', '/api/admin/activity?q=quote', ['as' => 'admin']);
check('activity log search', $r['status'] === 200 && $r['body']['total'] >= 2);
$r = call('GET', '/api/admin/activity?projectCode=APC-26-M4TR8', ['as' => 'admin']);
check('activity log by project', $r['body']['total'] >= 5 && $r['body']['items'][0]['projectCode'] === 'APC-26-M4TR8');
$r = call('GET', '/api/admin/activity.csv?actorType=staff', ['as' => 'admin']);
check('activity CSV export', $r['status'] === 200 && str_contains($r['headers'], 'text/csv') && str_starts_with($r['raw'], 'Time,'));
$r = call('GET', '/api/admin/activity', ['as' => 'chioma']);
check('engineer cannot view activity log → 403', $r['status'] === 403);

echo "\n{$passed} passed, {$failed} failed\n";
exit($failed ? 1 : 0);
