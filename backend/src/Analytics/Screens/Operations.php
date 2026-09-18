<?php

declare(strict_types=1);

namespace App\Analytics\Screens;

use App\Analytics\Blocks;
use App\Analytics\Metrics;
use App\Analytics\Period;
use App\Core\Database;
use App\Core\Request;

/** Operations — are emails, SMS and payments working? (spec 4.11) */
final class Operations extends Screen
{
    public const FILTERS = [];
    public const DEFINITIONS = ['messagesSent', 'deliveryFailureRate', 'paymentAttempts', 'paymentSuccessRate', 'abandonedCheckouts', 'medianConfirmHours', 'staffSignIns', 'failedSignIns', 'passwordResets', 'codesRequested', 'codesVerified', 'rateLimitHits', 'apiErrors', 'p95Latency'];

    public static function data(Period $p, array $viewer, Request $r): array
    {
        $range = [$p->start(), $p->endExclusive()];

        // Messaging
        $bucket = Period::bucketSql('n.created_at', $p->interval);
        $series = ['sent' => [], 'logged' => [], 'failed' => [], 'queued' => []];
        $byChannel = ['email' => ['sent' => 0, 'logged' => 0, 'failed' => 0, 'queued' => 0], 'sms' => ['sent' => 0, 'logged' => 0, 'failed' => 0, 'queued' => 0]];
        foreach (Database::all("SELECT {$bucket} AS t, n.channel, n.status, COUNT(*) AS c FROM notifications n WHERE n.created_at >= ? AND n.created_at < ? GROUP BY t, n.channel, n.status", $range) as $row) {
            $series[$row['status']][$row['t']] = ($series[$row['status']][$row['t']] ?? 0) + (int) $row['c'];
            $byChannel[$row['channel']][$row['status']] += (int) $row['c'];
        }
        $sent = $byChannel['email']['sent'] + $byChannel['sms']['sent'];
        $failed = $byChannel['email']['failed'] + $byChannel['sms']['failed'];
        $topErrors = array_map(static fn ($row) => ['error' => $row['error'], 'count' => (int) $row['c']], Database::all(
            "SELECT LEFT(error, 200) AS error, COUNT(*) AS c FROM notifications WHERE status = 'failed' AND error IS NOT NULL AND created_at >= ? AND created_at < ? GROUP BY LEFT(error, 200) ORDER BY c DESC LIMIT 5",
            $range,
        ));

        // Payments (Paystack attempts started in the range)
        $pay = Database::one(
            "SELECT COUNT(*) AS attempts, COALESCE(SUM(status = 'PAID'), 0) AS paid, COALESCE(SUM(status = 'FAILED'), 0) AS failed,
                    COALESCE(SUM(status = 'PENDING' AND created_at < NOW() - INTERVAL 1 HOUR), 0) AS abandoned
             FROM idea_payments WHERE method = 'paystack' AND created_at >= ? AND created_at < ?",
            $range,
        );
        $confirm = array_map(static fn ($row) => max(0, strtotime((string) $row['confirmed_at']) - strtotime((string) $row['created_at'])) / 3600, Database::all(
            "SELECT created_at, confirmed_at FROM idea_payments WHERE method = 'manual' AND status = 'PAID' AND confirmed_by IS NOT NULL AND confirmed_at >= ? AND confirmed_at < ? AND (note IS NULL OR note <> 'Paid at centre')",
            $range,
        ));
        $medianConfirm = Blocks::median($confirm);

        // Security (sign-ins and 429s come from the request log, kept 30 days)
        $log = Database::one(
            "SELECT COALESCE(SUM(route = '/api/staff/auth/login' AND status = 200), 0) AS signins,
                    COALESCE(SUM(route = '/api/staff/auth/login' AND status IN (401, 429)), 0) AS failed_signins,
                    COALESCE(SUM(status = 429), 0) AS rate_limited
             FROM api_request_log WHERE at >= ? AND at < ?",
            $range,
        );

        // API health
        $errBucket = Period::bucketSql('a.at', $p->interval);
        $server = [];
        $client = [];
        foreach (Database::all(
            "SELECT {$errBucket} AS t, COALESCE(SUM(a.status >= 500), 0) AS server, COALESCE(SUM(a.status >= 400 AND a.status < 500 AND a.status NOT IN (401, 404, 429)), 0) AS client
             FROM api_request_log a WHERE a.at >= ? AND a.at < ? GROUP BY t",
            $range,
        ) as $row) {
            $server[$row['t']] = (int) $row['server'];
            $client[$row['t']] = (int) $row['client'];
        }
        $errors = [];
        foreach ($p->buckets() as $b) {
            $errors[] = ['t' => $b, 'serverErrors' => $server[$b] ?? 0, 'clientErrors' => $client[$b] ?? 0];
        }

        return [
            'messaging' => [
                'series' => array_map(static fn (string $status) => Blocks::series($status, $p, $series[$status]), array_keys($series)),
                'byChannel' => $byChannel,
                'failureRate' => Blocks::ratio($failed, $sent + $failed),
                'topErrors' => $topErrors,
            ],
            'payments' => [
                'attempts' => (int) $pay['attempts'],
                'successRate' => Blocks::ratio((int) $pay['paid'], (int) $pay['paid'] + (int) $pay['failed'] + (int) $pay['abandoned']),
                'abandoned' => (int) $pay['abandoned'],
                'medianConfirmHours' => $medianConfirm !== null ? round($medianConfirm, 1) : null,
            ],
            'security' => [
                'staffSignIns' => (int) $log['signins'],
                'failedSignIns' => (int) $log['failed_signins'],
                'passwordResets' => (int) Database::value('SELECT COUNT(*) FROM password_resets WHERE created_at >= ? AND created_at < ?', $range),
                'codesRequested' => (int) Database::value('SELECT COUNT(*) FROM otp_codes WHERE created_at >= ? AND created_at < ?', $range),
                'codesVerified' => (int) Database::value('SELECT COUNT(*) FROM otp_codes WHERE consumed_at >= ? AND consumed_at < ?', $range),
                'rateLimited' => (int) $log['rate_limited'],
            ],
            'api' => ['errors' => $errors, 'slowest' => self::slowest($p)],
        ];
    }

    /** The 10 route patterns with the highest p95 response time. */
    private static function slowest(Period $p): array
    {
        $groups = [];
        foreach (Database::all('SELECT route, method, ms FROM api_request_log WHERE at >= ? AND at < ? ORDER BY route, method, ms', [$p->start(), $p->endExclusive()]) as $row) {
            $groups[$row['method'] . ' ' . $row['route']][] = (int) $row['ms'];
        }
        $out = [];
        foreach ($groups as $key => $ms) {
            [$method, $route] = explode(' ', $key, 2);
            $out[] = ['route' => $route, 'method' => $method, 'p95Ms' => (int) round((float) Blocks::percentile($ms, 95)), 'medianMs' => (int) round((float) Blocks::median($ms)), 'requests' => count($ms)];
        }
        usort($out, static fn ($a, $b) => $b['p95Ms'] <=> $a['p95Ms']);
        return array_slice($out, 0, 10);
    }
}
