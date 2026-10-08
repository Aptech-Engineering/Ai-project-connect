<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Activity;
use App\Core\Auth;
use App\Core\Database;
use App\Core\HttpError;
use App\Core\Request;
use App\Core\Response;
use App\Core\Validator;
use App\Support\Links;
use App\Support\Students;

/**
 * Student register. Counsellors can onboard; only admins can change records or clearance.
 */
final class StudentsAdminController
{
    /** Counsellors run this day to day; an admin can do everything they can. */
    private const ROLES = ['admin', 'counsellor'];

    public static function index(Request $r): void
    {
        Auth::requireStaff(self::ROLES);

        $students = [];
        $owing = 0;
        $cleared = 0;
        foreach (Database::all('SELECT * FROM students ORDER BY last_name, first_name') as $row) {
            $student = Students::presentForStaff($row);
            $student['verdict']['allowed'] ? $cleared++ : $owing++;
            $students[] = $student;
        }

        Response::json([
            'students' => $students,
            'suggestedId' => Students::suggestStudentId(),
            'page' => Links::page('student'),
            'stats' => [
                'total' => count($students),
                'cleared' => $cleared,
                'owing' => $owing,
            ],
        ]);
    }

    /**
     * A new month: everyone goes back to not cleared, and the office clears them
     * again as they settle up. Doing that one student at a time is what makes a
     * monthly round impossible, so it is one action.
     */
    public static function resetClearance(Request $r): void
    {
        $user = Auth::requireStaff(['admin']);
        $affected = Database::run('UPDATE students SET standing = ? WHERE active = 1 AND standing <> ?', ['BLOCKED', 'BLOCKED'])->rowCount();
        Activity::staff($user, "Started a new clearance month: {$affected} students set back to not cleared");
        Response::json(['reset' => $affected]);
    }

    /** One student record. */
    public static function show(Request $r): void
    {
        Auth::requireStaff(self::ROLES);
        $student = self::find((int) $r->params['id']);

        Response::json(Students::presentForStaff($student));
    }

    public static function store(Request $r): void
    {
        $user = Auth::requireStaff(self::ROLES);
        $data = self::validateStudent($r->input(), true);
        // A newly onboarded student starts NOT CLEARED. An admin must make the gate decision.
        $data['standing'] = 'BLOCKED';
        $data['fee_kobo'] = 0;
        $data['student_id'] = self::freeStudentId($data['student_id'] ?? '');
        $data['status_token'] = Students::newToken();
        $data['created_by'] = (int) $user['id'];

        $id = Database::insert('students', $data);
        Activity::staff($user, "Enrolled {$data['first_name']} {$data['last_name']} ({$data['student_id']})");
        Response::json(Students::presentForStaff(self::find($id)), 201);
    }

    public static function update(Request $r): void
    {
        $user = Auth::requireStaff(['admin']);
        $student = self::find((int) $r->params['id']);
        $changes = self::validateStudent($r->input(), false);
        if (isset($changes['student_id']) && $changes['student_id'] !== $student['student_id']) {
            $changes['student_id'] = self::freeStudentId($changes['student_id'], (int) $student['id']);
        }
        if ($changes !== []) {
            Database::update('students', $changes, ['id' => (int) $student['id']]);
        }
        Activity::staff($user, "Updated the record for {$student['student_id']}");
        self::respond((int) $student['id']);
    }

    /** Only admins may remove a student record. */
    public static function destroy(Request $r): void
    {
        $user = Auth::requireStaff(['admin']);
        $student = self::find((int) $r->params['id']);

        Database::run('DELETE FROM students WHERE id = ?', [(int) $student['id']]);
        Activity::staff($user, "Deleted the student record for {$student['student_id']}");
        Response::noContent();
    }

    /* ---------------- helpers ---------------- */

    private static function respond(int $id): void
    {
        $student = self::find($id);
        Response::json(Students::presentForStaff($student));
    }

    /** @return array<string, mixed> */
    private static function find(int $id): array
    {
        $row = Database::one('SELECT * FROM students WHERE id = ?', [$id]);
        if ($row === null) {
            throw HttpError::notFound('Student not found.');
        }

        return $row;
    }

    /** Two students on one ID would let the wrong person through the gate. */
    private static function freeStudentId(string $wanted, ?int $ignoreId = null): string
    {
        $wanted = Students::normaliseId($wanted);
        if ($wanted === '') {
            return Students::suggestStudentId();
        }
        $clash = $ignoreId === null
            ? Database::value('SELECT 1 FROM students WHERE student_id = ?', [$wanted])
            : Database::value('SELECT 1 FROM students WHERE student_id = ? AND id <> ?', [$wanted, $ignoreId]);
        if ($clash) {
            throw HttpError::validation(['studentId' => 'Another student already has that ID.']);
        }

        return $wanted;
    }

    /**
     * @param array<string, mixed> $input
     * @return array<string, mixed>
     */
    private static function validateStudent(array $input, bool $creating): array
    {
        $req = $creating ? 'required' : 'nullable';
        $data = Validator::validate($input, [
            'studentId' => 'nullable|string|max:30',
            'firstName' => "{$req}|string|min:2|max:80",
            'lastName' => "{$req}|string|min:2|max:80",
            'phone' => 'nullable|string|max:40',
            'email' => 'nullable|email|max:190',
            'course' => 'nullable|string|max:160',
            'batch' => 'nullable|string|max:80',
            'standing' => 'nullable|in:BLOCKED,WAIVED',
            'gateNote' => 'nullable|string|max:255',
            'note' => 'nullable|string|max:5000',
            'startedOn' => 'nullable|date',
            'active' => 'nullable|bool',
        ]);

        $out = [];
        $columns = [
            'studentId' => 'student_id', 'firstName' => 'first_name', 'lastName' => 'last_name', 'phone' => 'phone',
            'email' => 'email', 'course' => 'course', 'batch' => 'batch', 'gateNote' => 'gate_note', 'note' => 'note',
            'startedOn' => 'started_on', 'standing' => 'standing',
        ];
        foreach ($columns as $key => $column) {
            if (!array_key_exists($key, $input)) {
                continue;
            }
            $value = $data[$key] !== null && $data[$key] !== '' ? $data[$key] : null;
            // A name or an ID is never blanked; the rest may be cleared.
            if ($value === null && in_array($key, ['studentId', 'firstName', 'lastName', 'standing'], true)) {
                continue;
            }
            $out[$column] = $value;
        }
        foreach (['active' => 'active'] as $key => $column) {
            if (array_key_exists($key, $data) && $data[$key] !== null) {
                $out[$column] = $data[$key] ? 1 : 0;
            }
        }
        return $out;
    }
}
