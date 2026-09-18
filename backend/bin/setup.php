<?php

declare(strict_types=1);

/**
 * One-time setup.
 *
 *   php bin/setup.php --admin-name="Jane Admin" --admin-email=admin@yourdomain.com --admin-password="a-long-password"
 *
 * Options:
 *   --fresh            Drop and recreate all tables (DELETES ALL DATA)
 *   --demo             Also load demo projects, staff, ideas and leads
 *   --demo-password=…  Password for demo staff accounts (default: random, printed)
 *
 * No SSH on your host? Import database/schema.sql in phpMyAdmin instead, then run this script
 * once from cPanel → Terminal or a one-off cron job.
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require dirname(__DIR__) . '/src/bootstrap.php';

use App\Core\Database;
use App\Setup\Seeder;

$opts = getopt('', ['fresh', 'demo', 'admin-name:', 'admin-email:', 'admin-password:', 'demo-password:']);

$tablesExist = (bool) Database::value("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'projects'");
if (isset($opts['fresh']) || !$tablesExist) {
    echo isset($opts['fresh']) ? "Recreating all tables…\n" : "Creating tables…\n";
    Seeder::installSchema();
}

Seeder::seedCatalog();
echo "Course catalogue ready.\n";

Seeder::seedSettings();
echo "Payment settings ready (Paystack mode: test, no keys stored).\n";
echo "→ Sign in to the Engineering Panel as an admin and open Settings to enter your Paystack keys,\n";
echo "  bank account for transfers and email/SMS details. They are encrypted with app.key, never in config.php.\n";

if (!empty($opts['admin-email'])) {
    $password = (string) ($opts['admin-password'] ?? '');
    if (strlen($password) < 10) {
        fwrite(STDERR, "Admin password must be at least 10 characters.\n");
        exit(1);
    }
    $id = Seeder::createAdmin((string) ($opts['admin-name'] ?? 'Administrator'), (string) $opts['admin-email'], $password);
    echo "Admin account ready (user #{$id}): {$opts['admin-email']}\n";
} elseif (!(int) Database::value("SELECT COUNT(*) FROM users WHERE role = 'admin'")) {
    echo "No admin account yet. Re-run with --admin-email and --admin-password.\n";
}

if (isset($opts['demo'])) {
    if ((int) Database::value('SELECT COUNT(*) FROM projects') > 0) {
        echo "Demo data skipped: projects already exist (use --fresh to start over).\n";
    } else {
        $demoPassword = (string) ($opts['demo-password'] ?? bin2hex(random_bytes(6)));
        Seeder::seedDemo($demoPassword);
        echo "Demo data loaded. Demo staff (e.g. tunde@aptech.test) password: {$demoPassword}\n";
        echo "Demo draft application: /apply?resume=" . Seeder::DEMO_DRAFT_TOKEN . "\n";
    }
}

echo "Done.\n";
