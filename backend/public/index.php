<?php

declare(strict_types=1);

/**
 * API front controller. Every /api/* request is routed here (see .htaccess).
 *
 * On Nairahost, this folder's contents go in public_html/api/ and the rest of the backend
 * (src, config, storage, database, bin) goes OUTSIDE public_html, e.g. /home/USER/apc-backend.
 */

$candidates = [
    getenv('APC_BACKEND_PATH') ?: null,
    __DIR__ . '/..',                  // local: backend/public
    dirname(__DIR__, 2) . '/apc-backend', // cPanel: public_html/api → ~/apc-backend
];
foreach ($candidates as $base) {
    if ($base && is_file($base . '/src/bootstrap.php')) {
        require $base . '/src/bootstrap.php';
        break;
    }
}
if (!defined('APC_ROOT')) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo '{"error":"Backend files not found. Check APC_BACKEND_PATH."}';
    exit;
}

use App\Core\Auth;
use App\Core\Config;
use App\Core\HttpError;
use App\Core\Request;
use App\Core\Response;
use App\Core\Router;

$request = Request::fromGlobals();
$startedAt = hrtime(true);

header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: same-origin');

try {
    // CORS: only needed when the frontend runs on a different origin (e.g. Next.js dev on :3000).
    $origin = $request->header('Origin');
    $allowedOrigins = (array) Config::get('cors.allowed_origins', []);
    $sameOrigin = $origin !== null && parse_url($origin, PHP_URL_HOST) === ($_SERVER['HTTP_HOST'] ?? '') ;
    // The scholarship page is public marketing data, and partner sites host their own
    // landing page on their own domain: let anyone READ it (no cookies, GET only).
    $publicRead = $request->path === '/api/scholarship' && in_array($request->method, ['GET', 'OPTIONS'], true);
    if ($publicRead && $origin !== null) {
        header('Access-Control-Allow-Origin: *');
        header('Vary: Origin');
        if ($request->method === 'OPTIONS') {
            header('Access-Control-Allow-Methods: GET');
            header('Access-Control-Allow-Headers: Content-Type');
            header('Access-Control-Max-Age: 600');
            http_response_code(204);
            exit;
        }
    }
    if ($origin !== null && in_array($origin, $allowedOrigins, true)) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Access-Control-Allow-Credentials: true');
        header('Vary: Origin');
        if ($request->method === 'OPTIONS') {
            header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE');
            header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');
            header('Access-Control-Max-Age: 600');
            http_response_code(204);
            exit;
        }
    }

    // CSRF: state-changing requests must come from our own frontend.
    // The Paystack webhook is server-to-server and is authenticated by its HMAC signature instead.
    // The tracker (POST /api/track) is a "simple" cross-site request (sendBeacon can't set headers):
    // it runs its own Origin/Referer allow-list check instead, see TrackController.
    $isWebhook = $request->method === 'POST' && $request->path === '/api/payments/paystack/webhook';
    $isTracker = $request->method === 'POST' && $request->path === '/api/track';
    if (!$isWebhook && !$isTracker && !in_array($request->method, ['GET', 'HEAD', 'OPTIONS'], true)) {
        if ($request->header('X-Requested-With') !== 'XMLHttpRequest') {
            throw HttpError::forbidden('Missing X-Requested-With header.');
        }
        $originHost = $origin !== null ? parse_url($origin, PHP_URL_HOST) : null;
        if ($origin !== null && !in_array($origin, $allowedOrigins, true) && $originHost !== parse_url((string) Config::get('app.url'), PHP_URL_HOST) && !$sameOrigin) {
            throw HttpError::forbidden('Cross-site request blocked.');
        }
    }

    Auth::startSession();

    $router = new Router();
    (require APC_ROOT . '/src/routes.php')($router);
    $router->dispatch($request);
} catch (HttpError $e) {
    $body = ['error' => $e->getMessage()];
    if ($e->errors) {
        $body['errors'] = $e->errors;
    }
    if ($e->status === 429 && isset($e->errors['retryAfter'])) {
        header('Retry-After: ' . $e->errors['retryAfter']);
    }
    Response::json($body, $e->status);
} catch (Throwable $e) {
    error_log(sprintf('[api] %s in %s:%d', $e->getMessage(), $e->getFile(), $e->getLine()));
    $body = ['error' => 'Something went wrong. Please try again.'];
    if (Config::get('app.debug') && !Config::isProduction()) {
        $body['debug'] = $e->getMessage() . ' @ ' . basename($e->getFile()) . ':' . $e->getLine();
    }
    Response::json($body, 500);
}

// Operations screen: one row per API request (route pattern, status, time). Never breaks a response.
App\Analytics\RequestLog::record($request, $startedAt);
