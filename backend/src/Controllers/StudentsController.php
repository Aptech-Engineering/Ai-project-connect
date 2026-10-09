<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Database;
use App\Core\HttpError;
use App\Core\RateLimiter;
use App\Core\Request;
use App\Core\Response;
use App\Core\Validator;
use App\Support\Attendance;
use App\Support\Students;

/**
 * The student's own page at /student. No password: their Student ID and their name
 * open it, and their phone keeps a token afterwards so a refresh is one tap.
 *
 * It holds only a name, a course and a clearance status — and it has to
 * work in a queue at the gate on a bad line, which is why it is this light.
 */
final class StudentsController
{
    /**
     * Signing in. The name is enough on its own; the Student ID is only asked for
     * when it has to be, because plenty of students do not know theirs by heart.
     */
    public static function signIn(Request $r): void
    {
        RateLimiter::hit('student-signin:' . $r->ip(), 60, 3600);
        $data = Validator::validate($r->input(), [
            'studentId' => 'nullable|string|max:30',
            'firstName' => 'required|string|min:2|max:80',
            'lastName' => 'required|string|min:2|max:80',
            'phone' => 'nullable|string|max:40',
        ]);

        $matches = Students::matching($data['studentId'] ?? null, $data['firstName'], $data['lastName'], $data['phone'] ?? null);

        if ($matches === []) {
            // Guessing names should get slow quickly.
            RateLimiter::hit('student-signin-miss:' . $r->ip(), 15, 3600);
            throw HttpError::notFound(
                ($data['studentId'] ?? '') !== ''
                    ? 'That Student ID does not go with those names. Check them with the office.'
                    : 'We could not find that name on the register. Check the spelling, or ask at the front desk.',
            );
        }

        if (count($matches) > 1) {
            // Namesakes. One more detail settles it, and either will do.
            throw HttpError::validation(
                ['studentId' => 'Enter your Student ID, or the phone number on your record.'],
                'More than one student has that name.',
            );
        }

        Response::json(self::payload($matches[0]));
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

    /**
     * Signing in at the gate. The code comes off the sheet on the wall, either
     * scanned or typed, and only a cleared student may sign in at all.
     */
    public static function signInAttendance(Request $r): void
    {
        RateLimiter::hit('attendance:' . $r->ip(), 120, 3600);
        $data = Validator::validate($r->input(), [
            'id' => 'required|string|max:30',
            'token' => 'required|string|max:64',
            'code' => 'required|string|max:40',
        ]);

        $student = Students::byToken($data['id'], $data['token']);
        if ($student === null) {
            throw HttpError::notFound('Sign in again on this phone.');
        }
        if (!Attendance::matches($data['code'])) {
            throw HttpError::validation(['code' => 'That is not the code on the wall. Scan it again, or type it exactly.']);
        }
        if (!Students::verdict($student)['allowed']) {
            throw HttpError::forbidden('You are not cleared, so you cannot sign in. Please see the accounts office.');
        }

        Attendance::signIn($student);
        Response::json(self::payload($student));
    }

    /** Signing out on the way back out. The clock does it anyway if they forget. */
    public static function signOutAttendance(Request $r): void
    {
        RateLimiter::hit('attendance:' . $r->ip(), 120, 3600);
        $data = Validator::validate($r->input(), [
            'id' => 'required|string|max:30',
            'token' => 'required|string|max:64',
        ]);

        $student = Students::byToken($data['id'], $data['token']);
        if ($student === null) {
            throw HttpError::notFound('Sign in again on this phone.');
        }

        Attendance::signOut((int) $student['id']);
        Response::json(self::payload($student));
    }

    /** @param array<string, mixed> $student */
    private static function payload(array $student): array
    {
        // A sitting whose time is up is over, whoever happens to be asking.
        Attendance::sweep();
        // So a counsellor can see who is actually using the page.
        Database::run('UPDATE students SET last_seen_at = NOW() WHERE id = ?', [(int) $student['id']]);

        return Students::presentForStudent($student);
    }
}
