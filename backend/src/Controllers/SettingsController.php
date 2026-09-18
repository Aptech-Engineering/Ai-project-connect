<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Activity;
use App\Core\Auth;
use App\Core\Config;
use App\Core\Database;
use App\Core\HttpError;
use App\Core\Notifier;
use App\Core\RateLimiter;
use App\Core\Request;
use App\Core\Response;
use App\Core\Settings;
use App\Support\Paystack;
use App\Support\Wallet;

/**
 * Admin settings: payment credentials, bank details and notification drivers (AD-09).
 * Secrets are write-only — responses only ever say whether one is set and its last 4 characters.
 */
final class SettingsController
{
    private const KEY_PATTERN = '/^(sk|pk)_(test|live)_[A-Za-z0-9]+$/';

    /** Which Paystack field must start with which prefix. */
    private const KEY_PREFIX = [
        'testPublicKey' => 'pk_test_', 'testSecretKey' => 'sk_test_',
        'livePublicKey' => 'pk_live_', 'liveSecretKey' => 'sk_live_',
    ];

    public static function index(Request $r): void
    {
        Auth::requireStaff(['admin']);
        Response::json(self::present());
    }

    /** Partial update. Omitted or empty secrets stay as they are; an explicit null clears a value. */
    public static function update(Request $r): void
    {
        $user = Auth::requireStaff(['admin']);
        $input = $r->input();
        if ($input === [] || array_diff(array_keys($input), Settings::groups()) !== []) {
            throw HttpError::validation(['settings' => 'Send one or more of: ' . implode(', ', Settings::groups()) . '.']);
        }

        [$values, $errors] = self::validate($input);
        if ($errors !== []) {
            throw HttpError::validation($errors);
        }
        if ($values === []) {
            Response::json(self::present());
            return;
        }

        $changed = [];
        foreach ($values as $key => $value) {
            $secret = Settings::isSecret($key);
            $before = $secret ? (string) Settings::get($key, '') : Settings::get($key);
            if (!$secret && $before === $value) {
                continue;
            }
            if ($secret && $value !== null && (string) $value === $before) {
                continue;
            }
            $changed[$key] = $secret ? ($value === null ? 'cleared' : 'updated') : ($value === null ? 'cleared' : 'changed');
        }
        Settings::save(array_intersect_key($values, $changed), (int) $user['id']);
        Paystack::use(null); // pick up new keys in this request

        if ($changed !== []) {
            // Values are never written to the log — only the key names and what happened to them.
            $summary = implode(', ', array_map(static fn (string $k, string $what) => "{$k} {$what}", array_keys($changed), array_values($changed)));
            Activity::staff($user, 'Updated settings: ' . mb_substr($summary, 0, 400));
            self::alertAdmins($user, $changed);
        }
        Response::json(self::present());
    }

    /** Checks the saved key for the current mode by calling Paystack (no-op in fake mode). */
    public static function testPaystack(Request $r): void
    {
        $user = Auth::requireStaff(['admin']);
        RateLimiter::hit('settings-paystack-test:' . $user['id'], 10, 900);
        $mode = Paystack::mode();
        try {
            $result = Paystack::client()->ping();
        } catch (HttpError $e) {
            $result = ['ok' => false, 'message' => $e->getMessage(), 'business' => null];
        }
        Activity::staff($user, 'Tested the Paystack ' . $mode . ' connection: ' . ($result['ok'] ? 'success' : 'failed'));
        Response::json(['ok' => $result['ok'], 'message' => $result['message'], 'mode' => $mode, 'business' => $result['business']]);
    }

    /* ---------------- validation ---------------- */

    /** @return array{0: array<string, mixed>, 1: array<string, string>} values to save, errors */
    private static function validate(array $input): array
    {
        $values = [];
        $errors = [];
        $string = static function (mixed $v, int $max, string $field) use (&$errors): ?string {
            if ($v === null) {
                return null;
            }
            if (!is_string($v)) {
                $errors[$field] = 'Must be text.';
                return null;
            }
            $v = trim($v);
            if (mb_strlen($v) > $max) {
                $errors[$field] = "Must be {$max} characters or fewer.";
            }
            return $v;
        };

        /* payments */
        $payments = $input['payments'] ?? [];
        foreach (['bankName' => 120, 'accountName' => 120] as $key => $max) {
            if (array_key_exists($key, $payments)) {
                $values["payments.{$key}"] = $string($payments[$key], $max, "payments.{$key}");
            }
        }
        if (array_key_exists('commitmentFee', $payments)) {
            $fee = $payments['commitmentFee'];
            if (!is_numeric($fee) || $fee < 100 || $fee > 1_000_000) {
                $errors['payments.commitmentFee'] = 'Enter an amount between 100 and 1,000,000.';
            } else {
                $values['payments.commitmentFee'] = (float) $fee;
            }
        }
        if (array_key_exists('currency', $payments)) {
            if ($payments['currency'] !== 'NGN') {
                $errors['payments.currency'] = 'Only NGN is supported.';
            } else {
                $values['payments.currency'] = 'NGN';
            }
        }
        if (array_key_exists('accountNumber', $payments)) {
            $number = (string) $string($payments['accountNumber'], 20, 'payments.accountNumber');
            if ($number !== '' && !preg_match('/^\d{10}$/', $number)) {
                $errors['payments.accountNumber'] = 'Account numbers have 10 digits.';
            } else {
                $values['payments.accountNumber'] = $number;
            }
        }
        foreach (['paystackEnabled', 'manualEnabled'] as $key) {
            if (array_key_exists($key, $payments)) {
                if (!is_bool($payments[$key])) {
                    $errors["payments.{$key}"] = 'Must be true or false.';
                } else {
                    $values["payments.{$key}"] = $payments[$key];
                }
            }
        }
        $paystackOn = $values['payments.paystackEnabled'] ?? Settings::get('payments.paystackEnabled');
        $manualOn = $values['payments.manualEnabled'] ?? Settings::get('payments.manualEnabled');
        if (!$paystackOn && !$manualOn) {
            $errors['payments.manualEnabled'] = 'Keep at least one payment method switched on.';
        }

        /* paystack */
        $paystack = $input['paystack'] ?? [];
        foreach (self::KEY_PREFIX as $field => $prefix) {
            if (!array_key_exists($field, $paystack)) {
                continue;
            }
            $value = $paystack[$field];
            if ($value === null) {
                $values["paystack.{$field}"] = null; // clear
                continue;
            }
            if (!is_string($value)) {
                $errors["paystack.{$field}"] = 'Must be text.';
                continue;
            }
            $value = trim($value);
            if ($value === '') {
                continue; // leave the stored value alone
            }
            if (!preg_match(self::KEY_PATTERN, $value)) {
                $errors["paystack.{$field}"] = 'That does not look like a Paystack key (sk_test_…, pk_live_…).';
                continue;
            }
            if (!str_starts_with($value, $prefix)) {
                $errors["paystack.{$field}"] = 'This field needs a key starting with ' . $prefix . '.';
                continue;
            }
            $values["paystack.{$field}"] = $value;
        }
        if (array_key_exists('mode', $paystack)) {
            if (!in_array($paystack['mode'], ['test', 'live'], true)) {
                $errors['paystack.mode'] = 'Choose test or live.';
            } else {
                $values['paystack.mode'] = $paystack['mode'];
            }
        }
        $mode = $values['paystack.mode'] ?? Paystack::mode();
        if ($mode === 'live') {
            $liveSecret = array_key_exists('paystack.liveSecretKey', $values) ? $values['paystack.liveSecretKey'] : Settings::get('paystack.liveSecretKey', '');
            $livePublic = array_key_exists('paystack.livePublicKey', $values) ? $values['paystack.livePublicKey'] : Settings::get('paystack.livePublicKey', '');
            if (!$liveSecret || !$livePublic) {
                $errors['paystack.mode'] = 'Add both live keys before switching to live mode.';
            } elseif (Config::get('paystack.fake', false)) {
                $errors['paystack.mode'] = 'This server runs in test (fake) mode, so it cannot take live payments. Set paystack.fake to false in config/config.php first.';
            }
        }

        /* notifications */
        $notifications = $input['notifications'] ?? [];
        foreach (['fromName' => 120, 'smtpHost' => 190, 'smtpUser' => 190, 'termiiSenderId' => 40] as $key => $max) {
            if (array_key_exists($key, $notifications)) {
                $values["notifications.{$key}"] = $string($notifications[$key], $max, "notifications.{$key}");
            }
        }
        foreach (['smtpPassword', 'termiiApiKey'] as $key) {
            if (!array_key_exists($key, $notifications)) {
                continue;
            }
            $value = $notifications[$key];
            if ($value === null) {
                $values["notifications.{$key}"] = null;
            } elseif (!is_string($value)) {
                $errors["notifications.{$key}"] = 'Must be text.';
            } elseif (trim($value) !== '') {
                $values["notifications.{$key}"] = trim($value);
            }
        }
        if (array_key_exists('fromEmail', $notifications)) {
            $email = (string) $string($notifications['fromEmail'], 190, 'notifications.fromEmail');
            if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
                $errors['notifications.fromEmail'] = 'Enter a valid email address.';
            } else {
                $values['notifications.fromEmail'] = $email;
            }
        }
        if (array_key_exists('smtpPort', $notifications)) {
            $port = $notifications['smtpPort'];
            if (filter_var($port, FILTER_VALIDATE_INT) === false || $port < 1 || $port > 65535) {
                $errors['notifications.smtpPort'] = 'Enter a port number between 1 and 65535.';
            } else {
                $values['notifications.smtpPort'] = (int) $port;
            }
        }
        if (array_key_exists('driver', $notifications)) {
            if (!in_array($notifications['driver'], ['log', 'mail', 'termii'], true)) {
                $errors['notifications.driver'] = 'Choose log, mail or termii.';
            } else {
                $values['notifications.driver'] = $notifications['driver'];
            }
        }
        $driver = $values['notifications.driver'] ?? Settings::get('notifications.driver');
        if ($driver !== 'log') {
            $from = $values['notifications.fromEmail'] ?? Settings::get('notifications.fromEmail', '');
            if (!$from) {
                $errors['notifications.fromEmail'] = 'Add the address emails are sent from before switching this driver on.';
            }
        }
        if ($driver === 'termii') {
            $apiKey = array_key_exists('notifications.termiiApiKey', $values) ? $values['notifications.termiiApiKey'] : Settings::get('notifications.termiiApiKey', '');
            if (!$apiKey) {
                $errors['notifications.termiiApiKey'] = 'Add your Termii API key before switching SMS on.';
            }
        }

        return [$values, $errors];
    }

    /* ---------------- output ---------------- */

    private static function present(): array
    {
        $plain = static fn (string $key) => Settings::get($key);
        $sources = [];
        foreach (Settings::schema() as $group => $keys) {
            foreach (array_keys($keys) as $name) {
                $sources["{$group}.{$name}"] = Settings::source("{$group}.{$name}");
            }
        }
        $liveReady = (string) Settings::get('paystack.liveSecretKey', '') !== '' && (string) Settings::get('paystack.livePublicKey', '') !== '';

        $warnings = [];
        if (!Settings::encryptionReady()) {
            $warnings[] = 'Set a long random app.key in config/config.php: secrets cannot be saved until you do.';
        }
        if (Wallet::methodEnabled('manual') && (string) Settings::get('payments.accountNumber', '') === '') {
            $warnings[] = 'Bank transfer is switched on but no account number is saved, so clients have nowhere to pay.';
        }
        if (Wallet::methodEnabled('paystack') && Paystack::publicKey() === '') {
            $warnings[] = 'Online payment is switched on but no Paystack ' . Paystack::mode() . ' keys are saved.';
        }
        if (Config::get('paystack.fake', false)) {
            $warnings[] = 'This server runs in test (fake) mode: online payments are approved without contacting Paystack.';
        }

        return [
            'payments' => [
                'commitmentFee' => (float) $plain('payments.commitmentFee'),
                'currency' => $plain('payments.currency'),
                'paystackEnabled' => (bool) $plain('payments.paystackEnabled'),
                'manualEnabled' => (bool) $plain('payments.manualEnabled'),
                'bankName' => $plain('payments.bankName'),
                'accountName' => $plain('payments.accountName'),
                'accountNumber' => $plain('payments.accountNumber'),
            ],
            'paystack' => [
                'mode' => Paystack::mode(),
                'testPublicKey' => $plain('paystack.testPublicKey'),
                'testSecretKey' => Settings::secretInfo('paystack.testSecretKey'),
                'livePublicKey' => $plain('paystack.livePublicKey'),
                'liveSecretKey' => Settings::secretInfo('paystack.liveSecretKey'),
                'callbackUrl' => Paystack::callbackUrl(),
                'webhookUrl' => Paystack::webhookUrl(),
                'liveReady' => $liveReady,
                'fakeMode' => (bool) Config::get('paystack.fake', false),
            ],
            'notifications' => [
                'driver' => $plain('notifications.driver'),
                'fromEmail' => $plain('notifications.fromEmail'),
                'fromName' => $plain('notifications.fromName'),
                'smtpHost' => $plain('notifications.smtpHost'),
                'smtpPort' => (int) $plain('notifications.smtpPort'),
                'smtpUser' => $plain('notifications.smtpUser'),
                'smtpPassword' => Settings::secretInfo('notifications.smtpPassword'),
                'termiiApiKey' => Settings::secretInfo('notifications.termiiApiKey'),
                'termiiSenderId' => $plain('notifications.termiiSenderId'),
            ],
            'meta' => [
                'sources' => $sources,
                'updatedAt' => ($at = Database::value('SELECT MAX(updated_at) FROM settings')) ? date('c', (int) strtotime((string) $at)) : null,
                'encryptionReady' => Settings::encryptionReady(),
                'warnings' => $warnings,
            ],
        ];
    }

    /** Tells the other admins when payment credentials or the Paystack mode change. */
    private static function alertAdmins(array $actor, array $changed): void
    {
        $keys = array_keys(array_filter($changed, static fn (string $what, string $key) => str_starts_with($key, 'paystack.') || str_starts_with($key, 'payments.'), ARRAY_FILTER_USE_BOTH));
        if ($keys === []) {
            return;
        }
        $mode = Paystack::mode();
        $body = sprintf(
            "%s changed payment settings in the Engineering Panel.\n\nChanged: %s\nPaystack mode is now: %s\n\nIf this wasn't expected, check Settings → Payments and the activity log.",
            $actor['name'],
            implode(', ', $keys),
            strtoupper($mode),
        );
        foreach (Database::all("SELECT email FROM users WHERE role = 'admin' AND status = 'active'") as $admin) {
            Notifier::staff((string) $admin['email'], 'Payment settings changed', $body);
        }
    }
}
