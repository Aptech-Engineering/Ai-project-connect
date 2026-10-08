<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Database;
use App\Core\HttpError;
use App\Core\RateLimiter;
use App\Core\Request;
use App\Core\Response;
use App\Core\Validator;
use App\Support\Students;

/**
 * The student's own page at /student. No password: their Student ID and their name
 * open it, and their phone keeps a token afterwards so a refresh is one tap.
 *
 * It holds nothing worth stealing — a name, a course and a balance — and it has to
 * work in a queue at the gate on a bad line, which is why it is this light.
 */
final class StudentsController
{
    /** Signing in: Student ID plus first and last name. */
    public static function signIn(Request $r): void
    {
        RateLimiter::hit('student-signin:' . $r->ip(), 60, 3600);
        $data = Validator::validate($r->input(), [
            'studentId' => 'required|string|max:30',
            'firstName' => 'required|string|max:80',
            'lastName' => 'required|string|max:80',
        ]);

        $student = Students::bySignIn($data['studentId'], $data['firstName'], $data['lastName']);
        if ($student === null) {
            // Guessing a name against an ID should get slow quickly.
            RateLimiter::hit('student-signin-miss:' . $r->ip(), 15, 3600);
            throw HttpError::notFound('We could not find that Student ID with those names. Check them with the office.');
        }

        Response::json(self::payload($student));
    }

    /** Refreshing: the phone sends the token it was given instead of the name. */
    public static function status(Request $r): void
    {
        RateLimiter::hit('student-status:' . $r->ip(), 300, 3600);
        $studentId = (string) ($r->query('id') ?? '');
        $token = (string) ($r->query('token') ?? '');
        if ($studentId === '' || $token === '') {
            throw HttpError::badRequest('Sign in again on this phone.');
        }

        $student = Students::byToken($studentId, $token);
        if ($student === null) {
            throw HttpError::notFound('Sign in again on this phone.');
        }

        Response::json(self::payload($student));
    }

    /** @param array<string, mixed> $student */
    private static function payload(array $student): array
    {
        // So a counsellor can see who is actually using the page.
        Database::run('UPDATE students SET last_seen_at = NOW() WHERE id = ?', [(int) $student['id']]);

        return Students::presentForStudent($student, Students::paidKobo((int) $student['id']));
    }
}
