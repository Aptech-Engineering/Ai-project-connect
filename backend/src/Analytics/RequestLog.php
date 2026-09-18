<?php

declare(strict_types=1);

namespace App\Analytics;

use App\Core\Database;
use App\Core\Request;

/**
 * Writes one api_request_log row per API request for the Operations screen.
 * Stores the matched route pattern (never the raw path, which can hold tokens), the status and the duration.
 * Any failure is swallowed: logging must never break a response.
 */
final class RequestLog
{
    private const SKIP = ['/api/track', '/api/health'];

    public static function record(Request $request, int $startedAtNs): void
    {
        try {
            if (in_array($request->path, self::SKIP, true) || $request->method === 'OPTIONS') {
                return;
            }
            $route = $request->route ?? '(not found)';
            $status = http_response_code();
            $internal = session_status() === PHP_SESSION_ACTIVE && !empty($_SESSION['staff_id']) ? 1 : 0;
            Database::insert('api_request_log', [
                'at' => (new \DateTimeImmutable())->format('Y-m-d H:i:s.v'),
                'method' => substr($request->method, 0, 8),
                'route' => mb_substr($route, 0, 160),
                'status' => is_int($status) ? $status : 200,
                'ms' => max(0, (int) round((hrtime(true) - $startedAtNs) / 1_000_000)),
                'internal' => $internal,
            ]);
        } catch (\Throwable $e) {
            error_log('[request-log] ' . $e->getMessage());
        }
    }
}
