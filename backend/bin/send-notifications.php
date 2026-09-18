<?php

declare(strict_types=1);

/**
 * Sends queued and failed notifications (up to 3 attempts).
 * cPanel → Cron Jobs, every 5 minutes:
 *   php /home/USER/apc-backend/bin/send-notifications.php >/dev/null 2>&1
 * Also cleans up expired one-time codes and old rate-limit rows.
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require dirname(__DIR__) . '/src/bootstrap.php';

use App\Core\Database;
use App\Core\Notifier;

$ids = array_column(Database::all("SELECT id FROM notifications WHERE status IN ('queued','failed') AND attempts < 3 ORDER BY id LIMIT 100"), 'id');
foreach ($ids as $id) {
    Notifier::deliver((int) $id);
}

Database::run('DELETE FROM otp_codes WHERE expires_at < (NOW() - INTERVAL 1 DAY)');
Database::run('DELETE FROM rate_limits WHERE created_at < (NOW() - INTERVAL 1 DAY)');

echo sprintf("Processed %d notification(s).\n", count($ids));
