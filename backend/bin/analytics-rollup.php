<?php

declare(strict_types=1);

/**
 * Nightly analytics rollup (spec 8.3). cPanel → Cron Jobs, daily at 01:00 (Africa/Lagos):
 *   0 1 * * * php /home/USER/apc-backend/bin/analytics-rollup.php >/dev/null 2>&1
 *
 * Re-rolls the last 3 days (to catch late events) and recomputes those days' sessions. Idempotent.
 * Options: --from=YYYY-MM-DD --to=YYYY-MM-DD to rebuild any range (e.g. after importing old events).
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require dirname(__DIR__) . '/src/bootstrap.php';

use App\Analytics\Period;
use App\Analytics\Rollup;
use App\Analytics\Tracking;
use App\Core\Database;

$opts = getopt('', ['from:', 'to:']);
$yesterday = date('Y-m-d', strtotime('-1 day'));
$from = $opts['from'] ?? date('Y-m-d', strtotime('-3 days'));
$to = $opts['to'] ?? $yesterday;
if (!Period::isDate($from) || !Period::isDate($to) || $from > $to) {
    fwrite(STDERR, "Use --from and --to as YYYY-MM-DD with from <= to.\n");
    exit(1);
}

// "Close" sessions: recompute their totals from the events that arrived (late batches included).
$ids = array_column(Database::all('SELECT session_id FROM analytics_sessions WHERE started_at >= ? AND started_at < ?', [$from . ' 00:00:00', date('Y-m-d', strtotime($to . ' +1 day')) . ' 00:00:00']), 'session_id');
Tracking::refreshSessions(array_map('strval', $ids));

$rows = Rollup::rollDays($from, $to);
echo sprintf("Rolled up %s to %s: %d rows, %d sessions refreshed.\n", $from, $to, $rows, count($ids));
