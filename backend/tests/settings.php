<?php

declare(strict_types=1);

/**
 * End-to-end test for admin settings: payment credentials, bank details and notification drivers.
 * Checks that secrets are write-only, that settings override config/config.php, and that the
 * validation rules for Paystack keys and modes hold.
 *
 *   php bin/setup.php --fresh --demo --demo-password="DemoStaff2026!" --admin-email=admin@aptechdevteam.com --admin-password=Aptechdev123
 *   php -S 127.0.0.1:8088 public/index.php
 *   php tests/settings.php http://127.0.0.1:8088
 */

$base = rtrim($argv[1] ?? 'http://127.0.0.1:8088', '/');
$tmp = sys_get_temp_dir() . '/apc-settings-' . bin2hex(random_bytes(4));
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

$secretTest = 'sk_test_' . bin2hex(random_bytes(12));
$secretLive = 'sk_live_' . bin2hex(random_bytes(12));
$smtpPassword = 'Sup3rSecret-' . bin2hex(random_bytes(4));

foreach (['admin' => ['admin@aptechdevteam.com', 'Aptechdev123'], 'tunde' => ['tunde@aptech.test', 'DemoStaff2026!'], 'chioma' => ['chioma@aptech.test', 'DemoStaff2026!']] as $who => [$email, $password]) {
    call('POST', '/api/staff/auth/login', ['as' => $who, 'json' => ['email' => $email, 'password' => $password]]);
}

/* ================= 1. Permissions ================= */
foreach (['tunde' => 'lead', 'chioma' => 'engineer', 'anon' => 'signed out'] as $who => $label) {
    $r = call('GET', '/api/admin/settings', ['as' => $who]);
    check("{$label} cannot read settings", $r['status'] === ($who === 'anon' ? 401 : 403), $r['status']);
    $r = call('PUT', '/api/admin/settings', ['as' => $who, 'json' => ['payments' => ['commitmentFee' => 1]]]);
    check("{$label} cannot change settings", $r['status'] === ($who === 'anon' ? 401 : 403), $r['status']);
}
$r = call('PUT', '/api/admin/settings', ['as' => 'admin', 'headers' => [], 'json' => ['payments' => ['commitmentFee' => 2500]]]);
check('settings write without X-Requested-With → 403 (CSRF)', $r['status'] === 403);

/* ================= 2. Reading settings ================= */
$r = call('GET', '/api/admin/settings', ['as' => 'admin']);
$s = $r['body'];
check('admin reads settings groups', $r['status'] === 200 && array_keys($s) === ['payments', 'paystack', 'notifications', 'meta'], array_keys($s ?? []));
check('seeded payment defaults (no keys)', $s['payments']['commitmentFee'] == 2000 && $s['payments']['accountNumber'] === '0000000000' && $s['paystack']['mode'] === 'test', $s['payments']);
check('secrets are metadata only', $s['paystack']['testSecretKey']['set'] === true && !isset($s['paystack']['testSecretKey']['value']) && $s['paystack']['liveSecretKey']['set'] === false, $s['paystack']);
check('unset secret from config/config.php is reported as source config', $s['meta']['sources']['paystack.testSecretKey'] === 'config' && $s['meta']['sources']['payments.bankName'] === 'settings', $s['meta']['sources']);
check('callback + webhook URLs exposed for the Paystack dashboard', str_ends_with($s['paystack']['callbackUrl'], '/api/payments/paystack/callback') && str_ends_with($s['paystack']['webhookUrl'], '/api/payments/paystack/webhook'), $s['paystack']);
check('fake mode is flagged with a warning', $s['paystack']['fakeMode'] === true && $s['meta']['encryptionReady'] === true && count($s['meta']['warnings']) >= 1, $s['meta']);

/* ================= 3. Validation ================= */
$cases = [
    ['bad Paystack key format', ['paystack' => ['testSecretKey' => 'totally-not-a-key']], 'paystack.testSecretKey'],
    ['live key in the test field', ['paystack' => ['testSecretKey' => $secretLive]], 'paystack.testSecretKey'],
    ['secret key in the public field', ['paystack' => ['testPublicKey' => $secretTest]], 'paystack.testPublicKey'],
    ['switching to live without live keys', ['paystack' => ['mode' => 'live']], 'paystack.mode'],
    ['unknown mode', ['paystack' => ['mode' => 'sandbox']], 'paystack.mode'],
    ['account number that is not 10 digits', ['payments' => ['accountNumber' => '12345']], 'payments.accountNumber'],
    ['fee out of range', ['payments' => ['commitmentFee' => 12]], 'payments.commitmentFee'],
    ['both payment methods off', ['payments' => ['paystackEnabled' => false, 'manualEnabled' => false]], 'payments.manualEnabled'],
    ['unknown notification driver', ['notifications' => ['driver' => 'carrier-pigeon']], 'notifications.driver'],
    ['termii driver without an API key', ['notifications' => ['driver' => 'termii']], 'notifications.termiiApiKey'],
    ['invalid sender address', ['notifications' => ['fromEmail' => 'not-an-email']], 'notifications.fromEmail'],
];
foreach ($cases as [$name, $payload, $field]) {
    $r = call('PUT', '/api/admin/settings', ['as' => 'admin', 'json' => $payload]);
    check("rejected: {$name} → 422", $r['status'] === 422 && isset($r['body']['errors'][$field]), $r['body']);
}
$r = call('PUT', '/api/admin/settings', ['as' => 'admin', 'json' => ['nonsense' => ['x' => 1]]]);
check('unknown settings group → 422', $r['status'] === 422);
$r = call('GET', '/api/admin/settings', ['as' => 'admin']);
check('nothing was saved by the rejected requests', $r['body']['payments']['commitmentFee'] == 2000 && $r['body']['paystack']['mode'] === 'test' && $r['body']['payments']['accountNumber'] === '0000000000', $r['body']['payments']);

/* ================= 4. Saving ================= */
$r = call('PUT', '/api/admin/settings', ['as' => 'admin', 'json' => [
    'payments' => ['commitmentFee' => 2500, 'bankName' => 'Zenith Bank', 'accountName' => 'Aptech Ibadan', 'accountNumber' => '1234509876'],
    'paystack' => ['testSecretKey' => $secretTest, 'testPublicKey' => 'pk_test_' . bin2hex(random_bytes(8))],
    'notifications' => ['driver' => 'mail', 'fromEmail' => 'no-reply@aptechdevteam.test', 'fromName' => 'AI Project Connect', 'smtpPassword' => $smtpPassword],
]]);
$s = $r['body'];
check('admin saves payments, keys and notification settings', $r['status'] === 200 && $s['payments']['commitmentFee'] == 2500 && $s['payments']['bankName'] === 'Zenith Bank', $s['payments'] ?? $r);
check('saved secrets come back as set + last4 only', $s['paystack']['testSecretKey']['set'] === true && $s['paystack']['testSecretKey']['last4'] === substr($secretTest, -4) && $s['paystack']['testSecretKey']['updatedBy'] !== null, $s['paystack']['testSecretKey']);
check('secret values never appear in the response body', !str_contains($r['raw'], $secretTest) && !str_contains($r['raw'], $smtpPassword), 'secret leaked');
check('source switches from config to settings', $s['meta']['sources']['paystack.testSecretKey'] === 'settings' && $s['meta']['sources']['notifications.smtpPassword'] === 'settings');

$r = call('PUT', '/api/admin/settings', ['as' => 'admin', 'json' => ['payments' => ['bankName' => 'GTBank'], 'paystack' => ['testSecretKey' => '']]]);
check('empty secret leaves the stored key untouched', $r['status'] === 200 && $r['body']['paystack']['testSecretKey']['last4'] === substr($secretTest, -4) && $r['body']['payments']['bankName'] === 'GTBank', $r['body']['paystack']['testSecretKey']);
$r = call('PUT', '/api/admin/settings', ['as' => 'admin', 'json' => ['notifications' => ['smtpPassword' => null]]]);
check('null clears a secret', $r['status'] === 200 && $r['body']['notifications']['smtpPassword']['set'] === false && $r['body']['notifications']['smtpPassword']['last4'] === null, $r['body']['notifications']['smtpPassword']);

$r = call('GET', '/api/admin/settings', ['as' => 'admin']);
check('no secret is exposed on read either', !str_contains($r['raw'], $secretTest) && !str_contains($r['raw'], $smtpPassword));

/* ================= 5. Live mode ================= */
$r = call('PUT', '/api/admin/settings', ['as' => 'admin', 'json' => ['paystack' => ['liveSecretKey' => $secretLive, 'livePublicKey' => 'pk_live_' . bin2hex(random_bytes(8))]]]);
check('live keys saved without switching mode', $r['status'] === 200 && $r['body']['paystack']['liveReady'] === true && $r['body']['paystack']['mode'] === 'test', $r['body']['paystack']);
$r = call('PUT', '/api/admin/settings', ['as' => 'admin', 'json' => ['paystack' => ['mode' => 'live']]]);
check('live mode refused while the server runs in fake mode → 422', $r['status'] === 422 && str_contains($r['body']['errors']['paystack.mode'], 'fake'), $r['body']);

/* ================= 6. Test connection ================= */
$r = call('POST', '/api/admin/settings/paystack/test', ['as' => 'tunde']);
check('lead cannot test the Paystack connection → 403', $r['status'] === 403);
$r = call('POST', '/api/admin/settings/paystack/test', ['as' => 'admin']);
check('admin tests the Paystack connection (fake mode)', $r['status'] === 200 && $r['body']['ok'] === true && $r['body']['mode'] === 'test' && str_contains($r['body']['message'], 'fake'), $r['body']);

/* ================= 7. Settings drive the app ================= */
$r = call('POST', '/api/applications', ['json' => ['email' => 'zara@settingstest.test', 'title' => 'SettingsTest']]);
$token = $r['body']['token'] ?? '';
$checkout = $r['body']['application']['checkout'] ?? [];
check('application checkout uses the saved fee and bank details', $checkout['fee'] == 2500 && $checkout['feeKobo'] === 250000 && $checkout['manual']['bankName'] === 'GTBank' && $checkout['manual']['accountNumber'] === '1234509876', $checkout);
check('checkout shows the public key and mode from settings', str_starts_with((string) $checkout['paystack']['publicKey'], 'pk_test_') && $checkout['paystack']['mode'] === 'test', $checkout['paystack']);
check('wording still comes from website content', $checkout['feeTitle'] === 'Fund your project wallet' && $checkout['confirmationTime'] === '1 working day', $checkout);
$r = call('POST', '/api/applications/pay/paystack', ['json' => ['token' => $token]]);
check('Paystack checkout uses the new fee', $r['status'] === 201 && $r['body']['amountKobo'] === 250000, $r['body']);
$r = call('PUT', '/api/admin/settings', ['as' => 'admin', 'json' => ['payments' => ['paystackEnabled' => false]]]);
check('online payment can be switched off', $r['status'] === 200 && $r['body']['payments']['paystackEnabled'] === false);
$r = call('POST', '/api/applications/pay/paystack', ['json' => ['token' => $token]]);
check('switched-off method is refused → 409', $r['status'] === 409, $r['body']);
call('PUT', '/api/admin/settings', ['as' => 'admin', 'json' => ['payments' => ['paystackEnabled' => true]]]);

/* ================= 8. Content no longer owns payment settings ================= */
$r = call('GET', '/api/content');
check('website content only keeps the payment wording', array_keys($r['body']['payments']) === ['feeTitle', 'feeExplainer', 'transferInstructions', 'confirmationTime'], $r['body']['payments']);
$content = $r['body'];
$content['payments']['commitmentFee'] = 50;
$content['payments']['accountNumber'] = 'hacked';
$r = call('PUT', '/api/admin/content', ['as' => 'admin', 'json' => $content]);
check('fee/bank keys sent to content are ignored', $r['status'] === 200 && !isset($r['body']['payments']['commitmentFee'], $r['body']['payments']['accountNumber']), $r['body']['payments']);
$r = call('GET', '/api/admin/settings', ['as' => 'admin']);
check('settings still hold the real fee and account', $r['body']['payments']['commitmentFee'] == 2500 && $r['body']['payments']['accountNumber'] === '1234509876');

/* ================= 9. Audit trail ================= */
$r = call('GET', '/api/admin/activity?q=settings', ['as' => 'admin']);
$entries = $r['body']['items'] ?? [];
$actions = implode(' | ', array_column($entries, 'action'));
check('activity log lists changed keys', $r['status'] === 200 && str_contains($actions, 'paystack.testSecretKey updated') && str_contains($actions, 'payments.bankName changed'), $actions);
check('activity log never contains a secret', !str_contains($r['raw'], $secretTest) && !str_contains($r['raw'], $smtpPassword) && !str_contains($r['raw'], substr($secretLive, 8)));
$r = call('GET', '/api/staff/notifications?audience=staff', ['as' => 'admin']);
$alerts = array_filter($r['body'] ?? [], static fn ($n) => $n['subject'] === 'Payment settings changed');
check('admins are emailed when payment settings change', count($alerts) >= 1 && !str_contains($r['raw'], $secretTest), count($alerts));

echo "\n{$passed} passed, {$failed} failed\n";
exit($failed ? 1 : 0);
