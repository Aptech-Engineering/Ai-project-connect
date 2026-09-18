<?php

declare(strict_types=1);

namespace App\Core;

/**
 * Admin-managed settings (Engineering Panel → Settings): payment credentials, bank details and
 * notification drivers. Everything the app reads goes through here, in this order:
 *
 *     settings table  →  config/config.php  →  built-in default
 *
 * Secrets (API keys, SMTP password) are encrypted at rest with AES-256-GCM using a key derived from
 * config `app.key`, with a random IV per value. They are never returned by the API, logged or put in
 * an error message — only `{set, last4, updatedAt, updatedBy}`.
 */
final class Settings
{
    /** group => key => [type, secret?, config fallback path, default] */
    private const SCHEMA = [
        'payments' => [
            'commitmentFee' => ['type' => 'number', 'default' => 2000],      // naira, same unit as the old content field
            'currency' => ['type' => 'string', 'default' => 'NGN'],
            'paystackEnabled' => ['type' => 'bool', 'default' => true],
            'manualEnabled' => ['type' => 'bool', 'default' => true],
            'bankName' => ['type' => 'string', 'default' => ''],
            'accountName' => ['type' => 'string', 'default' => ''],
            'accountNumber' => ['type' => 'string', 'default' => ''],
        ],
        'paystack' => [
            'mode' => ['type' => 'string', 'config' => 'paystack.mode', 'default' => 'test'],
            'testPublicKey' => ['type' => 'string', 'config' => 'paystack.public_key', 'default' => ''],
            'testSecretKey' => ['type' => 'string', 'secret' => true, 'config' => 'paystack.secret_key', 'default' => ''],
            'livePublicKey' => ['type' => 'string', 'config' => 'paystack.live_public_key', 'default' => ''],
            'liveSecretKey' => ['type' => 'string', 'secret' => true, 'config' => 'paystack.live_secret_key', 'default' => ''],
        ],
        'notifications' => [
            'driver' => ['type' => 'string', 'default' => 'log'],            // log | mail | termii
            'fromEmail' => ['type' => 'string', 'config' => 'mail.from_email', 'default' => ''],
            'fromName' => ['type' => 'string', 'config' => 'mail.from_name', 'default' => 'AI Project Connect'],
            'smtpHost' => ['type' => 'string', 'config' => 'mail.smtp_host', 'default' => ''],
            'smtpPort' => ['type' => 'int', 'config' => 'mail.smtp_port', 'default' => 587],
            'smtpUser' => ['type' => 'string', 'config' => 'mail.smtp_user', 'default' => ''],
            'smtpPassword' => ['type' => 'string', 'secret' => true, 'config' => 'mail.smtp_password', 'default' => ''],
            'termiiApiKey' => ['type' => 'string', 'secret' => true, 'config' => 'sms.termii_api_key', 'default' => ''],
            'termiiSenderId' => ['type' => 'string', 'config' => 'sms.sender_id', 'default' => 'APConnect'],
        ],
    ];

    /** @var array<string, array{value: ?string, is_secret: int, updated_by: ?int, updated_at: string}>|null */
    private static ?array $rows = null;

    /** @var array<string, mixed> decrypted/cast values for this request */
    private static array $cache = [];

    public static function groups(): array
    {
        return array_keys(self::SCHEMA);
    }

    /** @return array<string, array<string, mixed>> */
    public static function schema(): array
    {
        return self::SCHEMA;
    }

    public static function isSecret(string $key): bool
    {
        return (bool) (self::spec($key)['secret'] ?? false);
    }

    public static function exists(string $key): bool
    {
        [$group, $name] = array_pad(explode('.', $key, 2), 2, '');
        return isset(self::SCHEMA[$group][$name]);
    }

    /** Settings table → config/config.php → default. */
    public static function get(string $key, mixed $default = null): mixed
    {
        if (array_key_exists($key, self::$cache)) {
            return self::$cache[$key] ?? $default;
        }
        $spec = self::spec($key);
        $row = self::rows()[$key] ?? null;
        $value = null;
        if ($row !== null && $row['value'] !== null && $row['value'] !== '') {
            $raw = (bool) $row['is_secret'] ? self::decrypt((string) $row['value'], $key) : (string) $row['value'];
            $value = self::cast($raw, $spec['type']);
        }
        if ($value === null && isset($spec['config'])) {
            $fromConfig = Config::get($spec['config']);
            if ($fromConfig !== null && $fromConfig !== '') {
                $value = self::cast($fromConfig, $spec['type']);
            }
        }
        if ($value === null && $key === 'notifications.driver') {
            // Older installs configured mail.driver and sms.driver separately.
            $value = Config::get('sms.driver') === 'termii' ? 'termii' : (Config::get('mail.driver') === 'mail' ? 'mail' : null);
        }
        if ($value === null) {
            $value = $spec['default'] ?? null;
        }
        self::$cache[$key] = $value;
        return $value ?? $default;
    }

    /** Where the value in use comes from: 'settings', 'config' or 'default' (helps admins debug). */
    public static function source(string $key): string
    {
        $row = self::rows()[$key] ?? null;
        if ($row !== null && $row['value'] !== null && $row['value'] !== '') {
            return 'settings';
        }
        $spec = self::spec($key);
        $fromConfig = isset($spec['config']) ? Config::get($spec['config']) : null;
        if ($key === 'notifications.driver' && in_array(Config::get('sms.driver'), ['termii'], true) || ($key === 'notifications.driver' && Config::get('mail.driver') === 'mail')) {
            return 'config';
        }
        return $fromConfig !== null && $fromConfig !== '' ? 'config' : 'default';
    }

    /**
     * Saves values. `null` clears a setting (back to config/default).
     * @param array<string, mixed> $values key => value
     */
    public static function save(array $values, ?int $userId): void
    {
        foreach ($values as $key => $value) {
            $spec = self::spec($key);
            $secret = (bool) ($spec['secret'] ?? false);
            if ($value === null) {
                Database::run('DELETE FROM settings WHERE setting_key = ?', [$key]);
                continue;
            }
            $stored = $secret ? self::encrypt((string) $value) : self::plain($value, $spec['type']);
            Database::run(
                'INSERT INTO settings (setting_key, value, is_secret, updated_by) VALUES (:k, :v, :s, :u)
                 ON DUPLICATE KEY UPDATE value = VALUES(value), is_secret = VALUES(is_secret), updated_by = VALUES(updated_by), updated_at = CURRENT_TIMESTAMP',
                ['k' => $key, 'v' => $stored, 's' => $secret ? 1 : 0, 'u' => $userId],
            );
        }
        self::flush();
    }

    /** Metadata for a secret: never the value. @return array{set:bool, last4:?string, updatedAt:?string, updatedBy:?string, source:string} */
    public static function secretInfo(string $key): array
    {
        $row = self::rows()[$key] ?? null;
        $value = (string) self::get($key, '');
        $by = $row && $row['updated_by'] ? Database::value('SELECT name FROM users WHERE id = ?', [(int) $row['updated_by']]) : null;
        return [
            'set' => $value !== '',
            'last4' => $value !== '' ? mb_substr($value, -4) : null,
            'updatedAt' => $row ? date('c', (int) strtotime((string) $row['updated_at'])) : null,
            'updatedBy' => $by !== null ? (string) $by : null,
            'source' => self::source($key),
        ];
    }

    /** False when app.key is missing or too short: secrets cannot be saved or read (the UI warns about it). */
    public static function encryptionReady(): bool
    {
        try {
            self::key();
            return true;
        } catch (HttpError) {
            return false;
        }
    }

    public static function flush(): void
    {
        self::$rows = null;
        self::$cache = [];
    }

    /* ---------------- encryption ---------------- */

    /** Fails closed: without a long app.key nothing can be encrypted or read back. */
    private static function key(): string
    {
        $appKey = (string) Config::get('app.key', '');
        if (strlen($appKey) < 32 || str_starts_with($appKey, 'CHANGE-ME')) {
            throw new HttpError(500, 'Set a long random app.key in config/config.php before saving payment credentials (php -r "echo bin2hex(random_bytes(32));").');
        }
        return hash('sha256', 'apc-settings|' . $appKey, true);
    }

    public static function encrypt(string $plain): string
    {
        $iv = random_bytes(12);
        $tag = '';
        $cipher = openssl_encrypt($plain, 'aes-256-gcm', self::key(), OPENSSL_RAW_DATA, $iv, $tag);
        if ($cipher === false) {
            throw new HttpError(500, 'Could not encrypt the value. Check that the openssl extension is enabled.');
        }
        return 'v1:' . base64_encode($iv . $tag . $cipher);
    }

    private static function decrypt(string $stored, string $key): string
    {
        $raw = str_starts_with($stored, 'v1:') ? base64_decode(substr($stored, 3), true) : false;
        $plain = false;
        if (is_string($raw) && strlen($raw) > 28) {
            $plain = openssl_decrypt(substr($raw, 28), 'aes-256-gcm', self::key(), OPENSSL_RAW_DATA, substr($raw, 0, 12), substr($raw, 12, 16));
        }
        if ($plain === false) {
            // Never include the value or the key material in the message.
            throw new HttpError(500, "The stored value for {$key} could not be read. It was saved with a different app.key — re-enter it in Settings.");
        }
        return $plain;
    }

    /* ---------------- helpers ---------------- */

    /** @return array<string, mixed> */
    private static function spec(string $key): array
    {
        [$group, $name] = array_pad(explode('.', $key, 2), 2, '');
        $spec = self::SCHEMA[$group][$name] ?? null;
        if ($spec === null) {
            throw new \LogicException("Unknown setting: {$key}");
        }
        return $spec;
    }

    private static function rows(): array
    {
        if (self::$rows === null) {
            self::$rows = [];
            foreach (Database::all('SELECT * FROM settings') as $row) {
                self::$rows[(string) $row['setting_key']] = $row;
            }
        }
        return self::$rows;
    }

    private static function cast(mixed $value, string $type): mixed
    {
        return match ($type) {
            'bool' => in_array($value, [true, 1, '1', 'true'], true),
            'int' => (int) $value,
            'number' => (float) $value,
            default => (string) $value,
        };
    }

    private static function plain(mixed $value, string $type): string
    {
        return match ($type) {
            'bool' => $value ? '1' : '0',
            default => (string) $value,
        };
    }
}
