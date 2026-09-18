<?php

declare(strict_types=1);

/**
 * Loads config, registers the autoloader and sets safe PHP defaults.
 * Used by public/index.php (web) and the scripts in bin/ (CLI).
 */

define('APC_ROOT', dirname(__DIR__));

spl_autoload_register(static function (string $class): void {
    if (strncmp($class, 'App\\', 4) !== 0) {
        return;
    }
    $file = APC_ROOT . '/src/' . str_replace('\\', '/', substr($class, 4)) . '.php';
    if (is_file($file)) {
        require $file;
    }
});

$configFile = APC_ROOT . '/config/config.php';
if (!is_file($configFile)) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Missing config/config.php. Copy config/config.example.php and fill it in.']);
    exit(1);
}

App\Core\Config::load(require $configFile);

date_default_timezone_set(App\Core\Config::get('app.timezone', 'Africa/Lagos'));
mb_internal_encoding('UTF-8');

$debug = (bool) App\Core\Config::get('app.debug', false);
error_reporting(E_ALL);
ini_set('display_errors', $debug && PHP_SAPI === 'cli' ? '1' : '0');
ini_set('log_errors', '1');
ini_set('error_log', APC_ROOT . '/storage/logs/php-errors.log');
