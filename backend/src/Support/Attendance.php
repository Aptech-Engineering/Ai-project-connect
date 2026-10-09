<?php

declare(strict_types=1);

namespace App\Support;

use App\Core\Database;
use App\Core\HttpError;
use App\Core\Settings;

/**
 * Who is in the centre.
 *
 * A student scans the printed code on their way in and the session opens. They press
 * sign out on their way back out — and when they forget, which they will, the clock
 * does it for them at the end of a sitting.
 *
 * Shared hosting has no scheduler to rely on, so nothing waits for a cron: a session
 * past its end is already over as far as every reader is concerned, and it is written
 * away the next time anybody touches attendance.
 */
final class Attendance
{
    /** How long a sitting lasts before the clock closes it. */
    public static function sessionMinutes(): int
    {
        $minutes = (int) Settings::get('attendance.sessionMinutes', 150);

        return $minutes >= 15 && $minutes <= 1440 ? $minutes : 150;
    }

    /**
     * The code printed on the sheet at the gate. Made on first use, and an admin can
     * make a new one — which is what retires a sheet that has been photographed.
     */
    public static function code(): string
    {
        $code = (string) Settings::get('attendance.code', '');
        if ($code === '') {
            $code = self::newCode();
            Settings::save(['attendance.code' => $code], null);
        }

        return $code;
    }

    public static function newCode(): string
    {
        // No letters that can be read as a digit, since it is typed off paper.
        $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        $code = '';
        for ($i = 0; $i < 8; $i++) {
            $code .= $alphabet[random_int(0, strlen($alphabet) - 1)];
        }

        return substr($code, 0, 4) . '-' . substr($code, 4);
    }

    public static function matches(string $given): bool
    {
        $tidy = static fn (string $v): string => strtoupper(preg_replace('/[^A-Z0-9]/i', '', $v) ?? '');

        return $tidy($given) !== '' && hash_equals($tidy(self::code()), $tidy($given));
    }

    /** Closes every sitting whose time is up. Cheap, and safe to call often. */
    public static function sweep(): void
    {
        Database::run(
            'UPDATE student_attendance
             SET signed_out_at = signed_in_at + INTERVAL ? MINUTE, ended_by = ?
             WHERE signed_out_at IS NULL AND signed_in_at + INTERVAL ? MINUTE <= NOW()',
            [self::sessionMinutes(), 'clock', self::sessionMinutes()],
        );
    }

    /** The sitting a student is in the middle of, if any. */
    public static function openFor(int $studentId): ?array
    {
        return Database::one(
            'SELECT * FROM student_attendance WHERE student_id = ? AND signed_out_at IS NULL ORDER BY signed_in_at DESC LIMIT 1',
            [$studentId],
        );
    }

    /**
     * The sitting to show on their phone: the one they are in, or the last one they
     * finished — "last here on Tuesday for 2h 10m" is worth seeing.
     */
    public static function latestFor(int $studentId): ?array
    {
        return Database::one(
            'SELECT * FROM student_attendance WHERE student_id = ? ORDER BY signed_in_at DESC LIMIT 1',
            [$studentId],
        );
    }

    /**
     * Signs a student in. Scanning again while already in is not an error — it is a
     * student checking the code worked — so the sitting they are in comes back.
     */
    public static function signIn(array $student, string $source = 'qr'): array
    {
        self::sweep();

        $open = self::openFor((int) $student['id']);
        if ($open !== null) {
            return $open;
        }

        $id = Database::insert('student_attendance', [
            'student_id' => (int) $student['id'],
            'signed_in_at' => date('Y-m-d H:i:s'),
            'source' => $source,
        ]);

        return Database::one('SELECT * FROM student_attendance WHERE id = ?', [$id]) ?? [];
    }

    public static function signOut(int $studentId, string $endedBy = 'student'): void
    {
        self::sweep();

        $open = self::openFor($studentId);
        if ($open === null) {
            throw HttpError::badRequest('You are not signed in at the moment.');
        }
        Database::run(
            'UPDATE student_attendance SET signed_out_at = NOW(), ended_by = ? WHERE id = ?',
            [$endedBy, (int) $open['id']],
        );
    }

    /** One sitting, as both the student's phone and the panel read it. */
    public static function present(?array $session): ?array
    {
        if ($session === null) {
            return null;
        }
        $in = strtotime((string) $session['signed_in_at']);
        $ends = $in + self::sessionMinutes() * 60;
        $out = $session['signed_out_at'] !== null ? strtotime((string) $session['signed_out_at']) : null;

        return [
            'id' => (int) $session['id'],
            'signedInAt' => gmdate('c', $in),
            'signedOutAt' => $out !== null ? gmdate('c', $out) : null,
            // When the clock will close it, so the phone can count down on its own.
            'endsAt' => gmdate('c', $ends),
            'open' => $out === null,
            'endedBy' => $session['ended_by'],
            'source' => $session['source'],
            'minutes' => (int) round((($out ?? time()) - $in) / 60),
        ];
    }
}
