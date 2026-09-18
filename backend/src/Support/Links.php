<?php

declare(strict_types=1);

namespace App\Support;

use App\Core\Config;

/**
 * Every link the back end puts in an email, SMS or redirect.
 *
 * The website is a Next.js static export served from the same domain as this API:
 *   /            → Client Portal (Project ID + one-time code)
 *   /apply       → idea application (draft, commitment fee, wallet)
 *   /quote       → private quote link
 *   /engineering → Engineering Panel
 *
 * Page links use `app.frontend_url` when it is set (handy when the site and the API are on different
 * hosts during development) and fall back to `app.url`. API links always use `app.url`.
 */
final class Links
{
    /** Website root, never with a trailing slash, so "/apply" can be appended safely. */
    public static function frontend(): string
    {
        return rtrim((string) (Config::get('app.frontend_url') ?: Config::get('app.url', '')), '/');
    }

    /** API root (this back end), never with a trailing slash. */
    public static function api(): string
    {
        return rtrim((string) Config::get('app.url', ''), '/');
    }

    /** @param array<string, string|null> $query */
    public static function page(string $path, array $query = []): string
    {
        $url = self::frontend() . '/' . ltrim($path, '/');
        $query = array_filter($query, static fn ($v) => $v !== null && $v !== '');
        return $query === [] ? $url : $url . '?' . http_build_query($query);
    }

    /** Client Portal home. */
    public static function portal(): string
    {
        return self::frontend() ?: '/';
    }

    /** "Continue your application" link: only the applicant has the token. */
    public static function resume(string $token): string
    {
        return self::page('apply', ['resume' => $token]);
    }

    /** Where Paystack sends the payer back to after checkout. */
    public static function applyPayment(?string $ideaRef, string $outcome, ?string $reference): string
    {
        return self::page('apply', ['ref' => $ideaRef, 'payment' => $outcome, 'reference' => $reference]);
    }

    public static function quote(string $ideaRef, string $token): string
    {
        return self::page('quote', ['ref' => $ideaRef, 'token' => $token]);
    }

    public static function engineering(array $query = []): string
    {
        return self::page('engineering', $query);
    }
}
