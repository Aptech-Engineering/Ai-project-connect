<?php

declare(strict_types=1);

namespace App\Support;

use App\Core\Database;

/** Random, non-sequential identifiers (PRD AD-03 and security NFR). */
final class Codes
{
    // No 0/O/1/I so codes are easy to read out over the phone.
    private const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

    public static function random(int $length): string
    {
        $out = '';
        $max = strlen(self::ALPHABET) - 1;
        for ($i = 0; $i < $length; $i++) {
            $out .= self::ALPHABET[random_int(0, $max)];
        }
        return $out;
    }

    public static function projectCode(): string
    {
        do {
            $code = sprintf('APC-%s-%s', date('y'), self::random(5));
            $taken = Database::value(
                'SELECT 1 FROM projects WHERE code = ? UNION SELECT 1 FROM project_revoked_codes WHERE code = ?',
                [$code, $code],
            );
        } while ($taken);
        return $code;
    }

    public static function ideaRef(): string
    {
        do {
            $ref = 'IDEA-' . self::random(5);
        } while (Database::value('SELECT 1 FROM ideas WHERE ref = ?', [$ref]));
        return $ref;
    }

    public static function otp(): string
    {
        return str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
    }

    public static function normaliseProjectCode(string $input): string
    {
        return strtoupper(trim($input));
    }

    public static function isProjectCode(string $code): bool
    {
        return (bool) preg_match('/^APC-\d{2}-[A-Z0-9]{5}$/', $code);
    }

    public static function isIdeaRef(string $ref): bool
    {
        return (bool) preg_match('/^IDEA-[A-Z0-9]{5}$/', $ref);
    }

    public static function slug(string $text): string
    {
        $slug = strtolower(trim((string) preg_replace('/[^A-Za-z0-9]+/', '-', $text), '-'));
        return substr($slug, 0, 50) ?: 'item-' . self::random(4);
    }
}
