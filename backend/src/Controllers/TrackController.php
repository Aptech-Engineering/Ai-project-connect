<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Analytics\Tracking;
use App\Core\Auth;
use App\Core\HttpError;
use App\Core\RateLimiter;
use App\Core\Request;
use App\Core\Response;

/**
 * POST /api/track — the website tracker (spec 7). Public and header-free (sendBeacon can't set headers), so:
 *   - the Origin (or Referer) must be our site or an allowed origin (this is the CSRF defence),
 *   - the body is capped at 32 KB and 20 events, event names and prop keys are whitelisted,
 *   - Do Not Track / Global Privacy Control and bots are dropped silently (still 204, so the filter can't be probed),
 *   - 120 events per minute per IP; the IP itself is never stored.
 * The body is JSON whatever the Content-Type (the client sends text/plain to stay a CORS "simple" request).
 */
final class TrackController
{
    public static function ingest(Request $r): void
    {
        $origin = Tracking::allowedOrigin($r->header('Origin'), $r->header('Referer'));
        if ($origin !== null) {
            header('Access-Control-Allow-Origin: ' . $origin);
            header('Access-Control-Allow-Credentials: true');
            header('Vary: Origin');
        }

        $raw = $r->rawBody(Tracking::MAX_BYTES);

        if ($r->header('DNT') === '1' || $r->header('Sec-GPC') === '1' || Tracking::isBot($r->header('User-Agent'))) {
            Response::noContent();
            return;
        }

        $body = json_decode($raw, true);
        if (!is_array($body)) {
            throw HttpError::badRequest('Send the tracker batch as JSON.');
        }
        $batch = Tracking::parse($body);
        RateLimiter::hitMany('track:' . $r->ip(), max(1, count($body['events'])), 120, 60);

        $staff = Auth::staff() !== null;
        Tracking::store($batch, [
            'internal' => $staff,
            'signedInAs' => $staff ? 'staff' : (Auth::clientId() !== null ? 'client' : 'none'),
            'userAgent' => (string) $r->header('User-Agent'),
            'country' => self::country($r->header('CF-IPCountry')),
        ]);
        Response::noContent();
    }

    /** Country from Cloudflare's header when present; there is no GeoIP lookup on shared hosting. */
    private static function country(?string $header): ?string
    {
        $c = strtoupper(trim((string) $header));
        return preg_match('/^[A-Z]{2}$/', $c) && !in_array($c, ['XX', 'T1'], true) ? $c : null;
    }
}
