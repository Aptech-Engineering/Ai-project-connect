<?php

declare(strict_types=1);

namespace App\Core;

/**
 * Queues email/SMS in the notifications table and delivers them (NT-01 to NT-03).
 *
 * Drivers:
 *   mail.driver = log  → stored only (local/testing)
 *   mail.driver = mail → PHP mail(), works on cPanel hosting
 *   sms.driver  = log | termii (Nigerian SMS gateway, https://termii.com)
 */
final class Notifier
{
    public static function email(string $audience, string $to, string $subject, string $body, ?int $projectId = null): void
    {
        if (!filter_var($to, FILTER_VALIDATE_EMAIL)) {
            return;
        }
        self::queue($audience, 'email', $to, $subject, $body, $projectId);
    }

    public static function sms(string $audience, ?string $to, string $body, ?int $projectId = null): void
    {
        $phone = self::normalisePhone((string) $to);
        if ($phone === null) {
            return;
        }
        self::queue($audience, 'sms', $phone, mb_substr($body, 0, 60), $body, $projectId);
    }

    /** Email + SMS to a client (NT-01). */
    public static function client(array $client, string $subject, string $body, ?int $projectId, bool $withSms = true): void
    {
        self::email('client', (string) $client['email'], $subject, $body, $projectId);
        if ($withSms && !empty($client['phone'])) {
            self::sms('client', (string) $client['phone'], $subject . '. ' . mb_substr($body, 0, 100), $projectId);
        }
    }

    public static function staff(string $to, string $subject, string $body, ?int $projectId = null): void
    {
        self::email('staff', $to, $subject, $body, $projectId);
    }

    private static function queue(string $audience, string $channel, string $to, string $subject, string $body, ?int $projectId): void
    {
        $id = Database::insert('notifications', [
            'audience' => $audience,
            'channel' => $channel,
            'recipient' => $to,
            'subject' => mb_substr($subject, 0, 255),
            'body' => $body,
            'project_id' => $projectId,
            'status' => 'queued',
        ]);
        if (Config::get('notifications.send_immediately', true)) {
            self::deliver($id);
        }
    }

    /** Sends one queued notification. Used immediately or by bin/send-notifications.php. */
    public static function deliver(int $id): void
    {
        $n = Database::one("SELECT * FROM notifications WHERE id = ? AND status IN ('queued','failed')", [$id]);
        if ($n === null) {
            return;
        }
        try {
            $status = $n['channel'] === 'email' ? self::sendEmail($n) : self::sendSms($n);
            Database::update('notifications', ['status' => $status, 'attempts' => (int) $n['attempts'] + 1, 'sent_at' => date('Y-m-d H:i:s'), 'error' => null], ['id' => $id]);
        } catch (\Throwable $e) {
            Database::update('notifications', ['status' => 'failed', 'attempts' => (int) $n['attempts'] + 1, 'error' => mb_substr($e->getMessage(), 0, 500)], ['id' => $id]);
            error_log('[notifier] ' . $e->getMessage());
        }
    }

    /** log = store only; mail / termii = deliver email. Chosen in Settings → Notifications (falls back to config). */
    private static function driver(): string
    {
        return (string) Settings::get('notifications.driver', 'log');
    }

    private static function sendEmail(array $n): string
    {
        if (self::driver() === 'log') {
            return 'logged';
        }
        $fromEmail = (string) Settings::get('notifications.fromEmail', '');
        $fromName = (string) Settings::get('notifications.fromName', 'AI Project Connect');
        if ($fromEmail === '') {
            throw new \RuntimeException('No sender address: set it in Settings → Notifications.');
        }
        if ((string) Settings::get('notifications.smtpHost', '') !== '') {
            return self::sendSmtp($n, $fromEmail, $fromName);
        }
        $headers = [
            'From' => sprintf('%s <%s>', mb_encode_mimeheader($fromName), $fromEmail),
            'Reply-To' => (string) Config::get('mail.reply_to', $fromEmail),
            'MIME-Version' => '1.0',
            'Content-Type' => 'text/plain; charset=UTF-8',
            'Content-Transfer-Encoding' => '8bit',
        ];
        $ok = mail((string) $n['recipient'], mb_encode_mimeheader((string) $n['subject']), (string) $n['body'], $headers, '-f' . $fromEmail);
        if (!$ok) {
            throw new \RuntimeException('mail() returned false');
        }
        return 'sent';
    }

    /**
     * Minimal SMTP delivery (used when an SMTP host is configured in Settings → Notifications).
     * Supports STARTTLS/implicit TLS and AUTH LOGIN, which is what cPanel and most providers offer.
     */
    private static function sendSmtp(array $n, string $fromEmail, string $fromName): string
    {
        $host = (string) Settings::get('notifications.smtpHost', '');
        $port = (int) Settings::get('notifications.smtpPort', 587);
        $user = (string) Settings::get('notifications.smtpUser', '');
        $password = (string) Settings::get('notifications.smtpPassword', '');
        $transport = $port === 465 ? 'ssl://' : '';
        $socket = @fsockopen($transport . $host, $port, $errno, $errstr, 15);
        if (!$socket) {
            throw new \RuntimeException("Could not connect to the mail server {$host}:{$port} ({$errstr})");
        }
        stream_set_timeout($socket, 15);
        $read = static function () use ($socket): string {
            $out = '';
            while (($line = fgets($socket, 515)) !== false) {
                $out .= $line;
                if (strlen($line) < 4 || $line[3] !== '-') {
                    break;
                }
            }
            return $out;
        };
        $say = static function (string $command, string $expect) use ($socket, $read): string {
            if ($command !== '') {
                fwrite($socket, $command . "\r\n");
            }
            $reply = $read();
            if (!str_starts_with($reply, $expect)) {
                throw new \RuntimeException('Mail server refused the message: ' . trim(mb_substr($reply, 0, 120)));
            }
            return $reply;
        };
        try {
            $say('', '220');
            $domain = parse_url((string) Config::get('app.url'), PHP_URL_HOST) ?: 'localhost';
            $say('EHLO ' . $domain, '250');
            if ($transport === '' && $port !== 25) {
                $say('STARTTLS', '220');
                if (!stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
                    throw new \RuntimeException('Could not start a secure connection to the mail server.');
                }
                $say('EHLO ' . $domain, '250');
            }
            if ($user !== '') {
                $say('AUTH LOGIN', '334');
                $say(base64_encode($user), '334');
                $say(base64_encode($password), '235'); // never logged
            }
            $say('MAIL FROM:<' . $fromEmail . '>', '250');
            $say('RCPT TO:<' . (string) $n['recipient'] . '>', '250');
            $say('DATA', '354');
            $body = str_replace("\n.", "\n..", str_replace("\r\n", "\n", (string) $n['body']));
            $message = implode("\r\n", [
                'From: ' . sprintf('%s <%s>', mb_encode_mimeheader($fromName), $fromEmail),
                'To: <' . (string) $n['recipient'] . '>',
                'Subject: ' . mb_encode_mimeheader((string) $n['subject']),
                'Date: ' . date('r'),
                'MIME-Version: 1.0',
                'Content-Type: text/plain; charset=UTF-8',
                'Content-Transfer-Encoding: 8bit',
                '',
                str_replace("\n", "\r\n", $body),
                '.',
            ]);
            $say($message, '250');
            $say('QUIT', '221');
        } finally {
            fclose($socket);
        }
        return 'sent';
    }

    private static function sendSms(array $n): string
    {
        if (self::driver() !== 'termii' || (string) Settings::get('notifications.termiiApiKey', '') === '') {
            return 'logged';
        }
        $payload = json_encode([
            'api_key' => (string) Settings::get('notifications.termiiApiKey', ''),
            'to' => ltrim((string) $n['recipient'], '+'),
            'from' => (string) Settings::get('notifications.termiiSenderId', 'APConnect'),
            'sms' => (string) $n['body'],
            'type' => 'plain',
            'channel' => (string) Config::get('sms.termii_channel', 'generic'),
        ]);
        $ch = curl_init((string) Config::get('sms.termii_url', 'https://api.ng.termii.com/api/sms/send'));
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $payload,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 15,
        ]);
        $response = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);
        if ($response === false || $code >= 400) {
            throw new \RuntimeException("SMS gateway error ({$code}): " . ($error ?: mb_substr((string) $response, 0, 200)));
        }
        return 'sent';
    }

    /** Converts local Nigerian numbers (080…) to international (+23480…). */
    public static function normalisePhone(string $phone): ?string
    {
        $digits = preg_replace('/\D/', '', $phone) ?? '';
        if ($digits === '') {
            return null;
        }
        if (str_starts_with($digits, '0') && strlen($digits) === 11) {
            $digits = (string) Config::get('sms.default_country_code', '234') . substr($digits, 1);
        }
        return strlen($digits) >= 10 ? '+' . $digits : null;
    }
}
