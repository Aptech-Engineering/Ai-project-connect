<?php

declare(strict_types=1);

/**
 * Analytics retention (spec 8.3 / 14). cPanel → Cron Jobs, daily:
 *   30 1 * * * php /home/USER/apc-backend/bin/analytics-prune.php >/dev/null 2>&1
 *
 *   raw events            13 months
 *   sessions + visitors   25 months (so exact visitor counts cover the 2-year maximum range)
 *   API request log       30 days
 *   daily rollups         kept forever
 *   report attachments    30 days
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require dirname(__DIR__) . '/src/bootstrap.php';

use App\Core\Database;

$events = Database::run('DELETE FROM analytics_events WHERE occurred_at < (NOW() - INTERVAL 13 MONTH)')->rowCount();
$sessions = Database::run('DELETE FROM analytics_sessions WHERE started_at < (NOW() - INTERVAL 25 MONTH)')->rowCount();
$visitors = Database::run('DELETE FROM analytics_visitors WHERE last_seen < (NOW() - INTERVAL 25 MONTH)')->rowCount();
$requests = Database::run('DELETE FROM api_request_log WHERE at < (NOW() - INTERVAL 30 DAY)')->rowCount();

$files = 0;
foreach (glob(APC_ROOT . '/storage/reports/*') ?: [] as $file) {
    if (is_file($file) && filemtime($file) < time() - 30 * 86400) {
        @unlink($file);
        $files++;
    }
}
echo sprintf("Pruned %d events, %d sessions, %d visitors, %d request-log rows, %d report files.\n", $events, $sessions, $visitors, $requests, $files);
