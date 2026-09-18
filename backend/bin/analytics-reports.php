<?php

declare(strict_types=1);

/**
 * Sends scheduled analytics reports that are due (spec 10.3). cPanel → Cron Jobs, hourly:
 *   5 * * * * php /home/USER/apc-backend/bin/analytics-reports.php >/dev/null 2>&1
 *
 * Reports go out at 07:00 Lagos (daily, Monday for weekly, the 1st for monthly); a run after 07:00 catches up.
 * Options: --id=N --force   send one schedule now (a "test send"), whether or not it is due.
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require dirname(__DIR__) . '/src/bootstrap.php';

use App\Analytics\Reports;
use App\Core\Database;

$opts = getopt('', ['id:', 'force']);
$rows = isset($opts['id'])
    ? Database::all('SELECT * FROM analytics_schedules WHERE id = ?', [(int) $opts['id']])
    : Database::all('SELECT * FROM analytics_schedules WHERE active = 1');

$sent = 0;
$reports = 0;
foreach ($rows as $schedule) {
    if (!isset($opts['force']) && !Reports::isDue($schedule, time())) {
        continue;
    }
    try {
        $sent += Reports::send($schedule);
        $reports++;
    } catch (Throwable $e) {
        error_log('[analytics-reports] schedule ' . $schedule['id'] . ': ' . $e->getMessage());
        fwrite(STDERR, "Schedule {$schedule['id']} failed: {$e->getMessage()}\n");
    }
}
echo sprintf("Sent %d report(s) to %d recipient(s).\n", $reports, $sent);
