<?php

declare(strict_types=1);

namespace App\Support;

use App\Core\Config;
use App\Core\HttpError;
use App\Core\Settings;

/**
 * Minimal Paystack API client (no SDK needed on shared hosting).
 *
 * With paystack.fake = true (local development and tests) it never touches the network:
 * initialise returns a checkout URL pointing straight at our callback and verify reports success
 * for the amount/currency we stored. Tests can also swap the instance with Paystack::use().
 */
class Paystack
{
    private static ?self $instance = null;

    public function __construct(
        protected readonly string $secretKey,
        protected readonly string $baseUrl = 'https://api.paystack.co',
        protected readonly bool $fake = false,
    ) {
    }

    public static function client(): self
    {
        if (self::$instance === null) {
            $fake = (bool) Config::get('paystack.fake', false);
            $mode = self::mode();
            if ($fake && (Config::isProduction() || $mode === 'live')) {
                // Never pretend to charge real cards.
                throw new HttpError(503, 'Paystack is set to LIVE mode but this server runs in test (fake) mode. Set paystack.fake to false in config/config.php, or switch the mode back to test in Settings → Payments.');
            }
            self::$instance = new self(
                (string) Settings::get($mode === 'live' ? 'paystack.liveSecretKey' : 'paystack.testSecretKey', ''),
                rtrim((string) Config::get('paystack.base_url', 'https://api.paystack.co'), '/'),
                $fake,
            );
        }
        return self::$instance;
    }

    /** 'test' or 'live' (Settings → config → test). */
    public static function mode(): string
    {
        return Settings::get('paystack.mode', 'test') === 'live' ? 'live' : 'test';
    }

    /** Publishable key for the mode in use (safe to send to the browser). */
    public static function publicKey(): string
    {
        return (string) Settings::get(self::mode() === 'live' ? 'paystack.livePublicKey' : 'paystack.testPublicKey', '');
    }

    public static function callbackUrl(): string
    {
        return (string) Config::get('paystack.callback_url') ?: rtrim((string) Config::get('app.url'), '/') . '/api/payments/paystack/callback';
    }

    public static function webhookUrl(): string
    {
        return rtrim((string) Config::get('app.url'), '/') . '/api/payments/paystack/webhook';
    }

    /** Checks the stored key by calling Paystack. @return array{ok:bool, message:string, business:?string} */
    public function ping(): array
    {
        if ($this->fake) {
            return ['ok' => true, 'message' => 'Test (fake) mode: Paystack is not called, payments are approved automatically.', 'business' => null];
        }
        if ($this->secretKey === '') {
            return ['ok' => false, 'message' => 'No secret key saved for this mode.', 'business' => null];
        }
        try {
            $data = $this->request('GET', '/balance');
        } catch (HttpError $e) {
            return ['ok' => false, 'message' => $e->getMessage(), 'business' => null];
        }
        $balance = $data[0]['balance'] ?? ($data['balance'] ?? null);
        return [
            'ok' => true,
            'message' => 'Connected to Paystack.' . ($balance !== null ? ' Current balance: ' . number_format(((int) $balance) / 100, 2) . ' ' . (string) ($data[0]['currency'] ?? 'NGN') . '.' : ''),
            'business' => null,
        ];
    }

    /** Replace the client (e.g. with a stub in tests). Pass null to go back to the configured one. */
    public static function use(?self $client): void
    {
        self::$instance = $client;
    }

    public function isFake(): bool
    {
        return $this->fake;
    }

    /** HMAC-SHA512 of the raw request body, compared with the x-paystack-signature header. */
    public function validSignature(string $rawBody, ?string $signature): bool
    {
        if ($this->secretKey === '' || $signature === null || $signature === '') {
            return false;
        }
        return hash_equals(hash_hmac('sha512', $rawBody, $this->secretKey), strtolower(trim($signature)));
    }

    /**
     * @param array{email:string, amount:int, currency:string, reference:string, callback_url:string, metadata?:array} $payload amount in kobo
     * @return array{authorization_url:string, access_code:string, reference:string}
     */
    public function initialize(array $payload): array
    {
        if ($this->fake) {
            $sep = str_contains($payload['callback_url'], '?') ? '&' : '?';
            return [
                'authorization_url' => $payload['callback_url'] . $sep . 'trxref=' . rawurlencode($payload['reference']) . '&reference=' . rawurlencode($payload['reference']),
                'access_code' => 'fake_' . substr(hash('sha256', $payload['reference']), 0, 16),
                'reference' => $payload['reference'],
            ];
        }
        $data = $this->request('POST', '/transaction/initialize', $payload);
        return [
            'authorization_url' => (string) ($data['authorization_url'] ?? ''),
            'access_code' => (string) ($data['access_code'] ?? ''),
            'reference' => (string) ($data['reference'] ?? $payload['reference']),
        ];
    }

    /**
     * @param array{amount_kobo:int|string, currency:string}|null $expected used only by the fake client
     * @return array{status:string, reference:string, amount:int, currency:string, id:int|null, channel:string|null, paid_at:string|null, gateway_response:string|null}
     */
    public function verify(string $reference, ?array $expected = null): array
    {
        if ($this->fake) {
            return [
                'status' => 'success', 'reference' => $reference, 'amount' => (int) ($expected['amount_kobo'] ?? 0),
                'currency' => (string) ($expected['currency'] ?? 'NGN'), 'id' => random_int(100000, 999999), 'channel' => 'card',
                'paid_at' => date('c'), 'gateway_response' => 'Approved (fake)',
            ];
        }
        $data = $this->request('GET', '/transaction/verify/' . rawurlencode($reference));
        return [
            'status' => (string) ($data['status'] ?? ''),
            'reference' => (string) ($data['reference'] ?? ''),
            'amount' => (int) ($data['amount'] ?? 0),
            'currency' => (string) ($data['currency'] ?? ''),
            'id' => isset($data['id']) ? (int) $data['id'] : null,
            'channel' => isset($data['channel']) ? (string) $data['channel'] : null,
            'paid_at' => isset($data['paid_at']) ? (string) $data['paid_at'] : null,
            'gateway_response' => isset($data['gateway_response']) ? (string) $data['gateway_response'] : null,
        ];
    }

    /**
     * Starts a refund for a successful transaction (full amount unless $amountKobo is given).
     * @return array{id:string|null, status:string}
     */
    public function refund(string $reference, ?int $amountKobo = null): array
    {
        if ($this->fake) {
            return ['id' => 'fake_rf_' . substr(hash('sha256', $reference), 0, 10), 'status' => 'pending'];
        }
        $payload = ['transaction' => $reference];
        if ($amountKobo !== null) {
            $payload['amount'] = $amountKobo;
        }
        $data = $this->request('POST', '/refund', $payload);
        return ['id' => isset($data['id']) ? (string) $data['id'] : null, 'status' => (string) ($data['status'] ?? 'pending')];
    }

    /** @return array<string, mixed> the "data" object of the Paystack response */
    protected function request(string $method, string $path, ?array $body = null): array
    {
        if ($this->secretKey === '') {
            throw new HttpError(503, 'Online payments are not set up yet: add your Paystack ' . self::mode() . ' secret key in Settings → Payments. Please pay by bank transfer in the meantime.');
        }
        $ch = curl_init($this->baseUrl . $path);
        $options = [
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $this->secretKey, 'Content-Type: application/json', 'Cache-Control: no-cache'],
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_TIMEOUT => 25,
        ];
        if ($body !== null) {
            $options[CURLOPT_POSTFIELDS] = json_encode($body, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        }
        curl_setopt_array($ch, $options);
        $raw = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);

        $decoded = is_string($raw) ? json_decode($raw, true) : null;
        if ($raw === false || !is_array($decoded) || $code >= 400 || empty($decoded['status'])) {
            $message = is_array($decoded) && isset($decoded['message']) ? (string) $decoded['message'] : ($error ?: "HTTP {$code}");
            error_log("[paystack] {$method} {$path} failed: {$message}");
            throw new HttpError(502, "We couldn't reach the payment provider. Please try again in a moment.");
        }
        return is_array($decoded['data'] ?? null) ? $decoded['data'] : [];
    }
}
