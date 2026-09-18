<?php

declare(strict_types=1);

namespace App\Core;

/** Sliding-window limiter backed by the rate_limits table (works on shared hosting without Redis). */
final class RateLimiter
{
    /**
     * Throws 429 if the bucket already has $max hits in the window; otherwise records a hit.
     */
    public static function hit(string $bucket, int $max, int $windowSeconds): void
    {
        self::ensureAllowed($bucket, $max, $windowSeconds);
        Database::insert('rate_limits', ['bucket' => self::key($bucket)]);

        // Occasionally clean old rows.
        if (random_int(1, 50) === 1) {
            Database::run('DELETE FROM rate_limits WHERE created_at < (NOW() - INTERVAL 1 DAY)');
        }
    }

    public static function ensureAllowed(string $bucket, int $max, int $windowSeconds): void
    {
        $row = Database::one(
            'SELECT COUNT(*) AS hits, MIN(created_at) AS oldest FROM rate_limits WHERE bucket = ? AND created_at > (NOW() - INTERVAL ? SECOND)',
            [self::key($bucket), $windowSeconds],
        );
        if ((int) $row['hits'] >= $max) {
            $retry = max(1, $windowSeconds - (time() - strtotime((string) $row['oldest'])));
            throw HttpError::tooManyRequests($retry);
        }
    }

    public static function clear(string $bucket): void
    {
        Database::run('DELETE FROM rate_limits WHERE bucket = ?', [self::key($bucket)]);
    }

    private static function key(string $bucket): string
    {
        return strlen($bucket) > 190 ? hash('sha256', $bucket) : $bucket;
    }
}
