<?php

declare(strict_types=1);

/**
 * Weekly progress email to every client with an active project (NT-04).
 * cPanel → Cron Jobs, Mondays at 8:00:
 *   0 8 * * 1  php /home/USER/apc-backend/bin/weekly-digest.php >/dev/null 2>&1
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require dirname(__DIR__) . '/src/bootstrap.php';

use App\Core\Activity;
use App\Support\Digest;

$result = Digest::sendAll();
Activity::system("Sent weekly progress emails ({$result['sent']} sent, {$result['skipped']} skipped)");
echo "Weekly digest: {$result['sent']} sent, {$result['skipped']} skipped.\n";
