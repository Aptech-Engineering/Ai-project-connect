<?php

declare(strict_types=1);

/**
 * End-to-end test for the commitment fee wallet: drafts, resume links, Paystack (fake mode) + webhook,
 * manual bank transfers, admin confirmation, approval guards, refunds, walk-ins and the client wallet.
 *
 *   php bin/setup.php --fresh --demo --demo-password="DemoStaff2026!" --admin-email=admin@aptechdevteam.com --admin-password=Aptechdev123
 *   php -S 127.0.0.1:8088 public/index.php
 *   php tests/wallet.php http://127.0.0.1:8088
 *
 * Needs config paystack.fake = true (never calls Paystack) and otp.expose_in_response = true (local only).
 */

$base = rtrim($argv[1] ?? 'http://127.0.0.1:8088', '/');
$config = require __DIR__ . '/../config/config.php';
$secret = (string) ($config['paystack']['secret_key'] ?? '');
$tmp = sys_get_temp_dir() . '/apc-wallet-' . bin2hex(random_bytes(4));
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
    } elseif (isset($opts['raw'])) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, $opts['raw']);
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

/** Sends a signed Paystack webhook (or a badly signed one). */
function webhook(array $event, ?string $signature = null): array
{
    global $secret;
    $raw = json_encode($event);
    return call('POST', '/api/payments/paystack/webhook', [
        'headers' => ['Content-Type: application/json', 'X-Paystack-Signature: ' . ($signature ?? hash_hmac('sha512', $raw, $secret))],
        'raw' => $raw,
    ]);
}

function notifications(): array
{
    return call('GET', '/api/staff/notifications', ['as' => 'admin'])['body'] ?? [];
}

function countSubject(string $needle): int
{
    return count(array_filter(notifications(), static fn ($n) => $n['channel'] === 'email' && str_contains((string) $n['subject'], $needle)));
}

function findPayment(string $ideaRef, ?string $status = null): ?array
{
    $items = call('GET', '/api/staff/payments' . ($status ? '?status=' . $status : ''), ['as' => 'admin'])['body']['items'] ?? [];
    foreach ($items as $p) {
        if ($p['idea']['ref'] === $ideaRef) {
            return $p;
        }
    }
    return null;
}

function ideaByRef(string $ref, string $as = 'admin', string $query = ''): ?array
{
    foreach (call('GET', '/api/staff/ideas' . $query, ['as' => $as])['body'] ?? [] as $idea) {
        if ($idea['ref'] === $ref) {
            return $idea;
        }
    }
    return null;
}

$png = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');
$complete = [
    'name' => 'Tobi Alade', 'phone' => '08012349876', 'country' => 'Nigeria', 'state' => 'Oyo',
    'title' => 'CampusRide', 'category' => 'Logistics', 'platforms' => ['Android app', 'Website'],
    'problem' => 'Students in Ibadan struggle to find safe, affordable rides between hostels and campus.',
    'targetUsers' => 'University students and campus tricycle riders', 'features' => 'Book a ride, share fares, track the driver, pay by transfer',
    'budget' => '₦1M – ₦3M', 'timeline' => '1 – 3 months',
];

foreach (['admin' => ['admin@aptechdevteam.com', 'Aptechdev123'], 'tunde' => ['tunde@aptech.test', 'DemoStaff2026!'], 'chioma' => ['chioma@aptech.test', 'DemoStaff2026!']] as $who => [$email, $password]) {
    call('POST', '/api/staff/auth/login', ['as' => $who, 'json' => ['email' => $email, 'password' => $password]]);
}

/* ================= 1. Content + drafts ================= */
$r = call('GET', '/api/content');
check('site content keeps only the payment wording', array_keys($r['body']['payments'] ?? []) === ['feeTitle', 'feeExplainer', 'transferInstructions', 'confirmationTime'], $r['body']['payments'] ?? null);
$content = $r['body'];
$bad = $content;
$bad['payments']['confirmationTime'] = 5;
$r = call('PUT', '/api/admin/content', ['as' => 'admin', 'json' => $bad]);
check('admin content: invalid confirmation time → 422', $r['status'] === 422 && isset($r['body']['errors']['payments.confirmationTime']), $r['body']);
$content['payments']['confirmationTime'] = '2 working days';
$content['payments']['feeDescription'] = 'old key is ignored';
$r = call('PUT', '/api/admin/content', ['as' => 'admin', 'json' => $content]);
check('admin saves payments wording (unknown keys dropped)', $r['status'] === 200 && $r['body']['payments']['confirmationTime'] === '2 working days' && !isset($r['body']['payments']['feeDescription']), $r['body']['payments'] ?? $r);
$r = call('GET', '/api/admin/settings', ['as' => 'admin']);
check('fee, methods and bank details live in admin settings', $r['status'] === 200 && $r['body']['payments']['commitmentFee'] == 2000 && $r['body']['payments']['accountNumber'] === '0000000000', $r['body']['payments'] ?? $r);

$r = call('POST', '/api/applications', ['json' => ['title' => 'No email yet']]);
check('draft needs an email → 422', $r['status'] === 422 && isset($r['body']['errors']['email']));
$r = call('POST', '/api/applications', ['json' => ['email' => 'Tobi@CampusRide.test', 'title' => 'CampusRide']]);
$token = $r['body']['token'] ?? '';
check('draft created; token returned once', $r['status'] === 201 && strlen($token) === 64 && $r['body']['application']['status'] === 'DRAFT' && $r['body']['application']['payment']['status'] === 'UNPAID', $r['body']);
$ref = $r['body']['application']['ref'] ?? '';
$checkout = $r['body']['application']['checkout'] ?? [];
check('draft shows fee + checkout options (settings + wording)', $checkout['fee'] == 2000 && $checkout['manual']['enabled'] === true && $checkout['manual']['accountNumber'] === '0000000000' && $checkout['confirmationTime'] === '2 working days' && isset($checkout['feeTitle'], $checkout['feeExplainer'], $checkout['manual']['transferInstructions']) && $r['body']['application']['wallet'][0]['type'] === 'fee', $checkout);
check('"Continue your application" email queued', countSubject('Continue your application') >= 1);
$r = call('GET', '/api/applications/draft?token=' . str_repeat('a', 64));
check('wrong resume token → 404', $r['status'] === 404);
$r = call('GET', '/api/applications/draft?token=' . $token);
check('resume by token', $r['status'] === 200 && $r['body']['fields']['title'] === 'CampusRide' && $r['body']['fields']['email'] === 'tobi@campusride.test' && in_array('problem', $r['body']['missingFields'], true), $r['body']);
$r = call('POST', '/api/applications/draft', ['json' => ['token' => $token, 'category' => 'Space travel']]);
check('draft save validates list options → 422', $r['status'] === 422 && isset($r['body']['errors']['category']));
$r = call('POST', '/api/applications/draft', ['json' => ['token' => $token, 'name' => 'Tobi Alade', 'problem' => 'Short']]);
check('partial save (short text allowed in draft)', $r['status'] === 200 && $r['body']['fields']['problem'] === 'Short' && $r['body']['complete'] === false, $r['body']);
$r = call('POST', '/api/applications/submit', ['json' => ['token' => $token]]);
check('incomplete draft cannot be submitted → 422', $r['status'] === 422 && isset($r['body']['errors']['problem']), $r['body']);
$r = call('POST', '/api/applications/draft', ['json' => ['token' => $token] + $complete]);
check('draft completed', $r['status'] === 200 && $r['body']['complete'] === true && $r['body']['canSubmit'] === false, $r['body']);
$r = call('POST', '/api/applications/submit', ['json' => ['token' => $token]]);
check('complete but unpaid → 409', $r['status'] === 409 && str_contains($r['body']['error'], 'commitment fee'), $r['body']);
check('draft hidden from the staff inbox', ideaByRef($ref) === null && ideaByRef($ref, 'tunde') === null);
$r = call('GET', '/api/staff/ideas?status=DRAFT', ['as' => 'tunde']);
check('lead cannot list drafts → 403', $r['status'] === 403);
$draftForAdmin = ideaByRef($ref, 'admin', '?status=DRAFT');
check('admin can filter drafts', $draftForAdmin !== null && $draftForAdmin['paymentStatus'] === 'UNPAID');
$r = call('GET', "/api/staff/ideas/{$draftForAdmin['id']}", ['as' => 'tunde']);
check('lead cannot open a draft → 404', $r['status'] === 404);

/* ================= 2. Resume links by email ================= */
$r = call('POST', '/api/applications/resume-links', ['json' => ['email' => 'nobody@nowhere.test']]);
$generic = $r['body']['message'] ?? '';
check('unknown email: generic answer, no links', $r['status'] === 200 && ($r['body']['devLinks'] ?? []) === []);
$r = call('POST', '/api/applications/resume-links', ['json' => ['email' => 'TOBI@campusride.test']]);
check('known email: same answer, link emailed', $r['status'] === 200 && $r['body']['message'] === $generic && count($r['body']['devLinks'] ?? []) === 1, $r['body']);
parse_str((string) parse_url($r['body']['devLinks'][0] ?? '', PHP_URL_QUERY), $q);
$r = call('GET', '/api/applications/draft?token=' . ($q['resume'] ?? ''));
check('emailed link opens the same draft; old token still works', $r['status'] === 200 && $r['body']['ref'] === $ref && call('GET', '/api/applications/draft?token=' . $token)['status'] === 200);

/* ================= 3. Paystack (fake) + webhook ================= */
$r = call('POST', '/api/applications/pay/paystack', ['json' => ['token' => $token]]);
$reference = $r['body']['reference'] ?? '';
check('Paystack checkout initialised (kobo amount)', $r['status'] === 201 && $r['body']['amountKobo'] === 200000 && str_starts_with($reference, "FEE-{$ref}-") && $r['body']['authorizationUrl'] !== '', $r['body']);
$r = call('POST', '/api/applications/submit', ['json' => ['token' => $token]]);
check('payment pending → still cannot submit', $r['status'] === 409);
$event = ['event' => 'charge.success', 'data' => ['id' => 99001, 'reference' => $reference, 'amount' => 200000, 'currency' => 'NGN', 'status' => 'success', 'channel' => 'card']];
$r = webhook($event, str_repeat('0', 128));
check('webhook with invalid signature → 401', $r['status'] === 401);
check('…and payment is not marked paid', call('GET', '/api/applications/draft?token=' . $token)['body']['payment']['status'] === 'PENDING');
$r = webhook(['event' => 'charge.success', 'data' => ['reference' => $reference, 'amount' => 100, 'currency' => 'NGN']]);
check('signed webhook with wrong amount is ignored', $r['status'] === 200 && call('GET', '/api/applications/draft?token=' . $token)['body']['payment']['status'] === 'PENDING');
$r = webhook($event);
check('valid signed webhook (no CSRF header) → 200', $r['status'] === 200 && $r['body']['received'] === true, $r);
$app = call('GET', '/api/applications/draft?token=' . $token)['body'];
check('payment PAID with receipt RCPT-YYMM-XXXXX', $app['payment']['status'] === 'PAID' && preg_match('/^RCPT-\d{4}-[A-Z0-9]{5}$/', (string) $app['payment']['receiptNo']) && $app['canSubmit'] === true, $app['payment']);
$receipts = countSubject('Payment received: receipt');
$r = webhook($event);
$r2 = call('GET', '/api/payments/paystack/callback?reference=' . rawurlencode($reference) . '&trxref=' . rawurlencode($reference));
check('webhook replay + callback are idempotent (one receipt)', $r['status'] === 200 && $r2['status'] === 302 && countSubject('Payment received: receipt') === $receipts && call('GET', '/api/applications/draft?token=' . $token)['body']['payment']['receiptNo'] === $app['payment']['receiptNo']);
check('callback redirects to /apply with ref + success', str_contains($r2['headers'], "/apply?ref={$ref}&payment=success"), $r2['headers']);
$r = call('GET', '/api/payments/paystack/callback?reference=FEE-NOPE');
check('callback with unknown reference → redirect failed', $r['status'] === 302 && str_contains($r['headers'], 'payment=failed'));
$r = call('POST', '/api/applications/pay/paystack', ['json' => ['token' => $token]]);
check('cannot pay twice → 409', $r['status'] === 409);
$r = call('POST', '/api/applications/submit', ['json' => ['token' => $token]]);
check('paid draft submitted → NEW', $r['status'] === 200 && $r['body']['status'] === 'NEW' && $r['body']['submittedAt'] !== null, $r['body']);
$r = call('POST', '/api/applications/draft', ['json' => ['token' => $token, 'title' => 'Changed']]);
check('submitted application is locked → 409', $r['status'] === 409);
$paidIdea = ideaByRef($ref, 'tunde');
check('lead sees submitted idea with payment + wallet', $paidIdea !== null && $paidIdea['payment']['status'] === 'PAID' && $paidIdea['payment']['method'] === 'paystack' && count($paidIdea['wallet']) === 2 && $paidIdea['wallet'][1]['reference'] === $reference, $paidIdea);

/* ================= 4. Manual transfer → submit → quote blocked until confirmed ================= */
$r = call('POST', '/api/applications', ['json' => ['email' => 'kunle@farmtrack.test'] + array_replace($complete, ['name' => 'Kunle Bello', 'title' => 'FarmTrack', 'category' => 'Agriculture'])]);
$token2 = $r['body']['token'] ?? '';
$ref2 = $r['body']['application']['ref'] ?? '';
check('second draft created complete', $r['status'] === 201 && $r['body']['application']['complete'] === true, $r['body']);
$manual = ['token' => $token2, 'senderName' => 'Kunle Bello', 'senderBank' => 'Zenith Bank', 'amount' => '2000', 'transferDate' => date('Y-m-d'), 'refundAccountName' => 'Kunle Bello', 'refundAccountNumber' => '2034567891', 'refundBank' => 'Zenith Bank'];
$r = call('POST', '/api/applications/pay/manual', ['multipart' => ['amount' => '500'] + $manual]);
check('transfer below the fee → 422', $r['status'] === 422 && isset($r['body']['errors']['amount']));
$r = call('POST', '/api/applications/pay/manual', ['multipart' => $manual + ['proof' => file_part('proof.pdf', '<?php echo 1;', 'application/pdf')]]);
check('fake proof file rejected → 422', $r['status'] === 422 && isset($r['body']['errors']['proof']), $r['body']);
$r = call('POST', '/api/applications/pay/manual', ['multipart' => $manual + ['proof' => file_part('transfer.png', $png, 'image/png')]]);
check('"I have sent the money" → AWAITING_CONFIRMATION', $r['status'] === 201 && $r['body']['payment']['status'] === 'AWAITING_CONFIRMATION' && $r['body']['payment']['manual']['proof']['name'] === 'transfer.png' && !isset($r['body']['payment']['manual']['proof']['url']), $r['body']);
check('staff notified of payment to confirm', countSubject("Payment to confirm: {$ref2}") === 1);
$claimEmail = array_values(array_filter(notifications(), static fn ($n) => $n['channel'] === 'email' && $n['subject'] === "We've received your payment details ({$ref2})"))[0] ?? null;
check('claim email uses the admin-set confirmation time', $claimEmail !== null && str_contains($claimEmail['body'], 'within 2 working days'), $claimEmail);
$r = call('POST', '/api/applications/submit', ['json' => ['token' => $token2]]);
check('submit allowed while transfer awaits confirmation', $r['status'] === 200 && $r['body']['status'] === 'NEW', $r['body']);
$idea2 = ideaByRef($ref2, 'admin');
$quoteFields = [
    'amount' => '1500000', 'currency' => 'NGN', 'summary' => 'Android app and website for farm produce tracking with transfer payments.',
    'timelineWeeks' => '10', 'validUntil' => date('Y-m-d', strtotime('+14 days')), 'leadId' => '2', 'targetDate' => date('Y-m-d', strtotime('+80 days')),
];
$r = call('POST', "/api/staff/ideas/{$idea2['id']}/quote", ['as' => 'tunde', 'multipart' => $quoteFields]);
check('quote blocked until the transfer is confirmed → 409', $r['status'] === 409 && str_contains($r['body']['error'], 'Confirm the payment'), $r['body']);
$r = call('PATCH', "/api/staff/ideas/{$idea2['id']}", ['as' => 'tunde', 'json' => ['status' => 'QUOTE_SENT']]);
check('marking quote sent also blocked → 409', $r['status'] === 409);
$r = call('PATCH', "/api/staff/ideas/{$idea2['id']}", ['as' => 'tunde', 'json' => ['status' => 'REVIEWING']]);
check('moving to REVIEWING needs no payment', $r['status'] === 200 && $r['body']['status'] === 'REVIEWING');
$r = call('PATCH', "/api/staff/ideas/{$idea2['id']}", ['as' => 'admin', 'json' => ['status' => 'DECLINED']]);
check('cannot decline while a transfer awaits confirmation → 409', $r['status'] === 409);
$r = call('POST', "/api/staff/ideas/{$idea2['id']}/convert", ['as' => 'admin', 'json' => ['leadId' => 2, 'targetDate' => date('Y-m-d', strtotime('+90 days'))]]);
check('convert blocked until paid → 409', $r['status'] === 409);

$r = call('GET', '/api/staff/payments', ['as' => 'tunde']);
check('lead cannot list payments → 403', $r['status'] === 403);
$r = call('GET', '/api/staff/payments', ['as' => 'chioma']);
check('engineer cannot list payments → 403', $r['status'] === 403);
$r = call('GET', '/api/staff/payments?status=AWAITING_CONFIRMATION&method=manual', ['as' => 'admin']);
$awaiting = array_values(array_filter($r['body']['items'] ?? [], static fn ($p) => $p['idea']['ref'] === $ref2))[0] ?? null;
check('admin payments list: to-confirm filter (seeded + new)', $r['status'] === 200 && $r['body']['counts']['awaitingConfirmation'] === 2 && count($r['body']['items']) === 2 && $awaiting !== null, $r['body']['counts'] ?? $r);
$r = call('GET', $awaiting['manual']['proof']['url'] ?? '/', ['as' => 'admin']);
check('admin opens proof of transfer', $r['status'] === 200 && str_contains($r['headers'], 'image/png'));
$r = call('GET', $awaiting['manual']['proof']['url'] ?? '/', ['as' => 'tunde']);
check('lead cannot open proof of transfer', $r['status'] === 404);

$r = call('POST', "/api/staff/payments/{$awaiting['id']}/reject", ['as' => 'admin', 'json' => []]);
check('not received needs a reason → 422', $r['status'] === 422);
$r = call('POST', "/api/staff/payments/{$awaiting['id']}/reject", ['as' => 'tunde', 'json' => ['reason' => 'Not in statement']]);
check('lead cannot reject payments → 403', $r['status'] === 403);
$r = call('POST', "/api/staff/payments/{$awaiting['id']}/reject", ['as' => 'admin', 'json' => ['reason' => 'No transfer from Kunle Bello in our statement']]);
check('admin marks transfer not received → FAILED', $r['status'] === 200 && $r['body']['status'] === 'FAILED' && $r['body']['failureReason'] !== null, $r['body']);
check('client told payment not received', countSubject("We couldn't confirm your payment ({$ref2})") === 1);
$app2 = call('GET', '/api/applications/draft?token=' . $token2)['body'];
check('client sees FAILED + reason in wallet', $app2['payment']['status'] === 'FAILED' && $app2['wallet'][1]['status'] === 'FAILED' && str_contains((string) $app2['wallet'][1]['note'], 'statement'), $app2['wallet']);
$r = call('POST', '/api/applications/pay/manual', ['multipart' => array_replace($manual, ['senderName' => 'K. Bello', 'transferDate' => date('Y-m-d', strtotime('-1 day'))])]);
check('client retries the transfer claim', $r['status'] === 201 && $r['body']['payment']['status'] === 'AWAITING_CONFIRMATION' && count($r['body']['wallet']) === 3, $r['body']['wallet'] ?? $r);
$retry = findPayment($ref2, 'AWAITING_CONFIRMATION');
$r = call('POST', "/api/staff/payments/{$retry['id']}/confirm", ['as' => 'admin', 'json' => []]);
check('admin confirms transfer → PAID with receipt', $r['status'] === 200 && $r['body']['status'] === 'PAID' && $r['body']['confirmedBy'] !== null && str_starts_with((string) $r['body']['receiptNo'], 'RCPT-'), $r['body']);
$r = call('POST', "/api/staff/payments/{$retry['id']}/confirm", ['as' => 'admin', 'json' => []]);
check('confirming twice → 409', $r['status'] === 409);
$r = call('POST', "/api/staff/ideas/{$idea2['id']}/quote", ['as' => 'tunde', 'multipart' => $quoteFields]);
check('quote allowed once paid', $r['status'] === 201, $r['body']);
$r = call('POST', '/api/applications/refund-account', ['json' => ['token' => $token2, 'accountName' => 'Kunle Bello', 'accountNumber' => '123', 'bankName' => 'Zenith Bank']]);
check('refund account number must have 10 digits → 422', $r['status'] === 422 && isset($r['body']['errors']['accountNumber']), $r['body']);
$r = call('POST', '/api/applications/refund-account', ['json' => ['token' => $token2, 'accountName' => 'Kunle Bello', 'accountNumber' => '0987654321', 'bankName' => 'Access Bank']]);
check('client updates refund bank details', $r['status'] === 200 && $r['body']['payment']['refundAccount']['accountNumber'] === '0987654321');

/* ================= 5. Decline paid ideas → refunds ================= */
$r = call('PATCH', "/api/staff/ideas/{$idea2['id']}", ['as' => 'admin', 'json' => ['status' => 'DECLINED']]);
check('declining a paid idea queues a refund', $r['status'] === 200 && $r['body']['payment']['refund']['status'] === 'PENDING', $r['body']['payment'] ?? $r);
check('client told refund is on its way', countSubject("Your commitment fee refund is on its way ({$ref2})") === 1);
$pay2 = findPayment($ref2, 'PAID');
$r = call('POST', "/api/staff/payments/{$pay2['id']}/refund", ['as' => 'admin', 'json' => ['note' => 'Sent from GTBank']]);
check('manual refund needs the transfer reference → 422', $r['status'] === 422);
$r = call('POST', "/api/staff/payments/{$pay2['id']}/refund", ['as' => 'admin', 'json' => ['reference' => 'GTB-REF-5521', 'note' => 'Sent to Access Bank 0987654321']]);
check('manual refund completed → REFUNDED', $r['status'] === 200 && $r['body']['refund']['status'] === 'REFUNDED' && $r['body']['refund']['reference'] === 'GTB-REF-5521', $r['body']);
check('client told refund completed', countSubject("Your commitment fee has been refunded ({$ref2})") === 1);
$app2 = call('GET', '/api/applications/draft?token=' . $token2)['body'];
$refundRow = array_values(array_filter($app2['wallet'], static fn ($e) => $e['type'] === 'refund'))[0] ?? null;
check('client wallet shows refund entry', $refundRow !== null && $refundRow['status'] === 'REFUNDED' && $refundRow['reference'] === 'GTB-REF-5521', $app2['wallet']);

// Paystack refund: decline the idea paid online in step 3
$r = call('PATCH', "/api/staff/ideas/{$paidIdea['id']}", ['as' => 'admin', 'json' => ['status' => 'DECLINED']]);
check('declined Paystack-paid idea → refund PENDING', $r['status'] === 200 && $r['body']['payment']['refund']['status'] === 'PENDING');
$r = call('GET', '/api/staff/payments?refund=open', ['as' => 'admin']);
check('refund queue lists it (with seeded refund)', $r['status'] === 200 && count($r['body']['items']) === 2 && $r['body']['counts']['refundsPending'] === 2, $r['body']['counts'] ?? $r);
$pay1 = findPayment($ref, 'PAID');
$r = call('POST', "/api/staff/payments/{$pay1['id']}/refund", ['as' => 'admin', 'json' => []]);
check('Paystack refund started → PROCESSING', $r['status'] === 200 && $r['body']['refund']['status'] === 'PROCESSING', $r['body']);
$r = call('POST', "/api/staff/payments/{$pay1['id']}/refund", ['as' => 'admin', 'json' => []]);
check('refund cannot be started twice → 409', $r['status'] === 409);
$r = webhook(['event' => 'refund.processed', 'data' => ['status' => 'processed', 'transaction_reference' => $reference, 'refund_reference' => 'PSK-RF-1', 'amount' => 200000, 'currency' => 'NGN']]);
check('refund.processed webhook → REFUNDED', $r['status'] === 200 && findPayment($ref, 'PAID')['refund']['status'] === 'REFUNDED');
$r = webhook(['event' => 'refund.processed', 'data' => ['transaction_reference' => $reference, 'refund_reference' => 'PSK-RF-1']]);
check('refund webhook replay is idempotent', $r['status'] === 200 && countSubject("Your commitment fee has been refunded ({$ref})") === 1);
$declined = ideaByRef('IDEA-9DCLN');
$seededRefund = findPayment('IDEA-9DCLN', 'PAID');
$r = call('POST', "/api/staff/payments/{$seededRefund['id']}/refund/complete", ['as' => 'admin', 'json' => ['note' => 'Refunded from the Paystack dashboard']]);
check('admin marks seeded refund done', $r['status'] === 200 && $r['body']['refund']['status'] === 'REFUNDED' && $declined['payment']['refund']['status'] === 'PENDING', $r['body']);

/* ================= 6. Walk-in ================= */
$walkIn = ['name' => 'Mama Nkechi', 'email' => 'nkechi@foodhub.test', 'phone' => '08031112222', 'title' => 'Nkechi FoodHub', 'category' => 'E-commerce'];
$r = call('POST', '/api/staff/walk-ins', ['as' => 'tunde', 'json' => $walkIn]);
check('lead cannot start walk-in applications → 403', $r['status'] === 403);
$r = call('POST', '/api/staff/walk-ins', ['as' => 'admin', 'json' => $walkIn]);
$walkRef = $r['body']['idea']['ref'] ?? '';
$walkId = $r['body']['idea']['id'] ?? 0;
parse_str((string) parse_url($r['body']['devLink'] ?? '', PHP_URL_QUERY), $wq);
check('admin starts walk-in → DRAFT + resume link emailed', $r['status'] === 201 && $r['body']['idea']['status'] === 'DRAFT' && $r['body']['idea']['source'] === 'walk_in' && strlen($wq['resume'] ?? '') === 64, $r['body']);
check('walk-in email + SMS sent', countSubject('Continue your application') >= 3 && count(array_filter(notifications(), static fn ($n) => $n['channel'] === 'sms' && $n['to'] === '+2348031112222')) >= 1);
$r = call('PATCH', "/api/staff/ideas/{$walkId}", ['as' => 'admin', 'json' => ['status' => 'REVIEWING']]);
check('draft status cannot be changed by staff → 409', $r['status'] === 409);
$r = call('POST', "/api/staff/ideas/{$walkId}/payments/centre", ['as' => 'tunde', 'json' => []]);
check('lead cannot record centre payments → 403', $r['status'] === 403);
$r = call('POST', "/api/staff/ideas/{$walkId}/payments/centre", ['as' => 'admin', 'json' => ['amount' => 2000, 'note' => 'Cash']]);
check('admin records fee paid at the centre → PAID immediately', $r['status'] === 201 && $r['body']['status'] === 'PAID' && $r['body']['manual']['note'] === 'Paid at centre' && $r['body']['recordedBy'] !== null, $r['body']);
$r = call('POST', "/api/staff/ideas/{$walkId}/payments/centre", ['as' => 'admin', 'json' => []]);
check('cannot record a second fee → 409', $r['status'] === 409);
$app3 = call('GET', '/api/applications/draft?token=' . ($wq['resume'] ?? ''))['body'];
check('client opens walk-in link: prefilled + paid', ($app3['fields']['name'] ?? '') === 'Mama Nkechi' && $app3['payment']['status'] === 'PAID' && $app3['wallet'][1]['label'] === 'Paid at the centre', $app3);
$r = call('POST', "/api/staff/ideas/{$walkId}/resume-link", ['as' => 'tunde']);
check('lead cannot resend the application link → 403', $r['status'] === 403);
$r = call('POST', "/api/staff/ideas/{$walkId}/resume-link", ['as' => 'admin']);
parse_str((string) parse_url($r['body']['devLink'] ?? '', PHP_URL_QUERY), $wq2);
check('admin resends the application link (masked recipient)', $r['status'] === 200 && str_contains((string) ($r['body']['sentTo'] ?? ''), '•••') && strlen($wq2['resume'] ?? '') === 64 && $wq2['resume'] !== ($wq['resume'] ?? ''), $r['body']);
check('resent link opens the same draft; the old one still works', call('GET', '/api/applications/draft?token=' . $wq2['resume'])['body']['ref'] === $walkRef && call('GET', '/api/applications/draft?token=' . $wq['resume'])['status'] === 200);
check('resend emails + SMSes the client again', countSubject('Continue your application') >= 4 && count(array_filter(notifications(), static fn ($n) => $n['channel'] === 'sms' && $n['to'] === '+2348031112222')) >= 2);
$r = call('POST', '/api/applications/draft', ['json' => ['token' => $wq['resume']] + array_diff_key($complete, ['name' => 1, 'title' => 1, 'category' => 1])]);
$r = call('POST', '/api/applications/submit', ['json' => ['token' => $wq['resume']]]);
check('walk-in client completes and submits', $r['status'] === 200 && $r['body']['status'] === 'NEW', $r['body']);
$r = call('POST', "/api/staff/ideas/{$walkId}/resume-link", ['as' => 'admin']);
check('cannot resend a link for a submitted application → 409', $r['status'] === 409, $r['body']);

/* ================= 7. Approve paid idea → client portal wallet ================= */
$mechanic = ideaByRef('IDEA-4QX7M');
check('seeded ideas are paid by Paystack', $mechanic['paymentStatus'] === 'PAID' && $mechanic['payment']['method'] === 'paystack');
$awaitingSeed = ideaByRef('IDEA-5TRNF');
$r = call('POST', "/api/staff/ideas/{$awaitingSeed['id']}/convert", ['as' => 'admin', 'json' => ['leadId' => 2, 'targetDate' => date('Y-m-d', strtotime('+90 days'))]]);
check('seeded awaiting-confirmation idea cannot be converted → 409', $r['status'] === 409);
$r = call('POST', "/api/staff/ideas/{$mechanic['id']}/convert", ['as' => 'admin', 'json' => ['leadId' => 2, 'targetDate' => date('Y-m-d', strtotime('+90 days'))]]);
$mechanicCode = $r['body']['projectCode'] ?? '';
check('paid idea converts to a project', $r['status'] === 201 && preg_match('/^APC-/', $mechanicCode), $r['body']);
$r = call('POST', '/api/client/auth/request-code', ['as' => 'bola', 'json' => ['projectCode' => $mechanicCode]]);
call('POST', '/api/client/auth/verify', ['as' => 'bola', 'json' => ['projectCode' => $mechanicCode, 'code' => $r['body']['devCode'] ?? '']]);
$r = call('GET', "/api/client/projects/{$mechanicCode}", ['as' => 'bola']);
check('client portal project has wallet from its idea', $r['status'] === 200 && is_array($r['body']['wallet']) && $r['body']['wallet'][0]['type'] === 'fee' && $r['body']['wallet'][1]['status'] === 'PAID', $r['body']['wallet'] ?? $r);
$r = call('GET', '/api/staff/projects/APC-26-M4TR8', ['as' => 'admin']);
check('projects without an idea have wallet null', $r['status'] === 200 && array_key_exists('wallet', $r['body']) && $r['body']['wallet'] === null);

$r = call('GET', '/api/staff/dashboard', ['as' => 'admin']);
check('admin dashboard shows payments to confirm + refunds', $r['status'] === 200 && $r['body']['paymentsToConfirm'] === 1 && $r['body']['refundsPending'] === 0, $r['body']);
$r = call('GET', '/api/admin/activity?q=commitment', ['as' => 'admin']);
check('activity log records wallet events', $r['status'] === 200 && $r['body']['total'] >= 8, $r['body']['total'] ?? $r);

echo "\n{$passed} passed, {$failed} failed\n";
exit($failed ? 1 : 0);
