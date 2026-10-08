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
 * "Students" in the Engineering Panel. A counsellor keeps the register: who is
 * enrolled, what their fee is, and every payment as it is taken. Everything the
 * student's own page says comes from here.
 */
final class StudentsAdminController
{
    /** Counsellors run this day to day; an admin can do everything they can. */
    private const ROLES = ['admin', 'counsellor'];

    public static function index(Request $r): void
    {
        Auth::requireStaff(self::ROLES);

        $paid = [];
        foreach (Database::all('SELECT student_id, SUM(amount_kobo) AS total FROM student_payments GROUP BY student_id') as $row) {
            $paid[(int) $row['student_id']] = (int) $row['total'];
        }

        $students = [];
        $owing = 0;
        $cleared = 0;
        $collected = 0;
        $outstanding = 0;
        foreach (Database::all('SELECT * FROM students ORDER BY last_name, first_name') as $row) {
            $sum = $paid[(int) $row['id']] ?? 0;
            $student = Students::presentForStaff($row, $sum);
            $collected += $sum;
            $outstanding += max(0, (int) $row['fee_kobo'] - $sum);
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
                'collected' => intdiv($collected, 100),
                'outstanding' => intdiv($outstanding, 100),
            ],
        ]);
    }

    /** One student with every payment on the record. */
    public static function show(Request $r): void
    {
        Auth::requireStaff(self::ROLES);
        $student = self::find((int) $r->params['id']);

        Response::json(Students::presentForStaff($student, Students::paidKobo((int) $student['id']), true));
    }

    public static function store(Request $r): void
    {
        $user = Auth::requireStaff(self::ROLES);
        $data = self::validateStudent($r->input(), true);
        $data['student_id'] = self::freeStudentId($data['student_id'] ?? '');
        $data['status_token'] = Students::newToken();
        $data['created_by'] = (int) $user['id'];

        $id = Database::insert('students', $data);
        Activity::staff($user, "Enrolled {$data['first_name']} {$data['last_name']} ({$data['student_id']})");
        Response::json(Students::presentForStaff(self::find($id), 0, true), 201);
    }

    public static function update(Request $r): void
    {
        $user = Auth::requireStaff(self::ROLES);
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

    /** Money in. Each one is dated, so a part payment reads as a history, not a total. */
    public static function addPayment(Request $r): void
    {
        $user = Auth::requireStaff(self::ROLES);
        $student = self::find((int) $r->params['id']);
        $data = Validator::validate($r->input(), [
            'amount' => 'required|number|min:1',
            'method' => 'nullable|in:cash,transfer,pos,paystack,other',
            'reference' => 'nullable|string|max:120',
            'paidOn' => 'nullable|date',
            'note' => 'nullable|string|max:255',
        ]);

        Database::insert('student_payments', [
            'student_id' => (int) $student['id'],
            'amount_kobo' => (int) round(((float) $data['amount']) * 100),
            'method' => $data['method'] ?? 'cash',
            'reference' => $data['reference'] ?: null,
            'paid_on' => $data['paidOn'] ?: date('Y-m-d'),
            'note' => $data['note'] ?: null,
            'recorded_by' => (int) $user['id'],
        ]);

        // Once they are square there is nothing left to discuss.
        $paid = Students::paidKobo((int) $student['id']);
        if ($paid >= (int) $student['fee_kobo'] && $student['standing'] === 'DISCUSSION') {
            Database::update('students', ['standing' => 'AUTO', 'gate_pass' => 0], ['id' => (int) $student['id']]);
        }

        Activity::staff($user, "Recorded a payment of {$data['amount']} for {$student['student_id']}");
        self::respond((int) $student['id']);
    }

    public static function deletePayment(Request $r): void
    {
        $user = Auth::requireStaff(self::ROLES);
        $student = self::find((int) $r->params['id']);
        $payment = Database::one('SELECT * FROM student_payments WHERE id = ? AND student_id = ?', [
            (int) $r->params['paymentId'],
            (int) $student['id'],
        ]);
        if ($payment === null) {
            throw HttpError::notFound('That payment is not on this record.');
        }

        Database::run('DELETE FROM student_payments WHERE id = ?', [(int) $payment['id']]);
        Activity::staff($user, "Removed a payment from {$student['student_id']}");
        self::respond((int) $student['id']);
    }

    /** Deleting takes the payment history with it, so only an admin may. */
    public static function destroy(Request $r): void
    {
        $user = Auth::requireStaff(['admin']);
        $student = self::find((int) $r->params['id']);

        Database::run('DELETE FROM students WHERE id = ?', [(int) $student['id']]);
        Activity::staff($user, "Deleted the student record for {$student['student_id']}, with its payment history");
        Response::noContent();
    }

    /* ---------------- helpers ---------------- */

    private static function respond(int $id): void
    {
        $student = self::find($id);
        Response::json(Students::presentForStaff($student, Students::paidKobo($id), true));
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
            'fee' => 'nullable|number|min:0',
            'standing' => 'nullable|in:AUTO,DISCUSSION,BLOCKED,WAIVED',
            'gatePass' => 'nullable|bool',
            'gateNote' => 'nullable|string|max:255',
            'note' => 'nullable|string|max:5000',
            'startedOn' => 'nullable|date',
            'dueOn' => 'nullable|date',
            'active' => 'nullable|bool',
        ]);

        $out = [];
        $columns = [
            'studentId' => 'student_id', 'firstName' => 'first_name', 'lastName' => 'last_name', 'phone' => 'phone',
            'email' => 'email', 'course' => 'course', 'batch' => 'batch', 'gateNote' => 'gate_note', 'note' => 'note',
            'startedOn' => 'started_on', 'dueOn' => 'due_on', 'standing' => 'standing',
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
        if (array_key_exists('fee', $input) && $data['fee'] !== null && $data['fee'] !== '') {
            $out['fee_kobo'] = (int) round(((float) $data['fee']) * 100);
        }
        foreach (['gatePass' => 'gate_pass', 'active' => 'active'] as $key => $column) {
            if (array_key_exists($key, $data) && $data[$key] !== null) {
                $out[$column] = $data[$key] ? 1 : 0;
            }
        }
        if ($creating && !isset($out['fee_kobo'])) {
            $out['fee_kobo'] = 0;
        }

        return $out;
    }
}
