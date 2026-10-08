<?php

declare(strict_types=1);

namespace App\Support;

use App\Core\Database;

/**
 * The student register: who is enrolled, what they owe, and the one answer the guard
 * at the gate needs — are they cleared to come in?
 *
 * The verdict is worked out here and nowhere else, so the panel, the student's phone
 * and any future screen can never disagree about it.
 */
final class Students
{
    /** A student plus what they have paid. */
    public static function byId(int $id): ?array
    {
        return Database::one('SELECT * FROM students WHERE id = ?', [$id]);
    }

    /** Sign-in: the Student ID with the names that go with it. Case and spacing are forgiven. */
    public static function bySignIn(string $studentId, string $firstName, string $lastName): ?array
    {
        $row = Database::one('SELECT * FROM students WHERE student_id = ? AND active = 1', [self::normaliseId($studentId)]);
        if ($row === null) {
            return null;
        }
        $same = static fn (string $a, string $b): bool => self::loose($a) === self::loose($b);
        // Either way round: plenty of people give their surname first.
        $straight = $same($row['first_name'], $firstName) && $same($row['last_name'], $lastName);
        $swapped = $same($row['first_name'], $lastName) && $same($row['last_name'], $firstName);

        return $straight || $swapped ? $row : null;
    }

    /** The phone remembers this instead of the name, so a refresh is one tap. */
    public static function byToken(string $studentId, string $token): ?array
    {
        $row = Database::one('SELECT * FROM students WHERE student_id = ? AND active = 1', [self::normaliseId($studentId)]);

        return $row !== null && hash_equals((string) $row['status_token'], trim($token)) ? $row : null;
    }

    public static function paidKobo(int $studentId): int
    {
        return (int) Database::value('SELECT COALESCE(SUM(amount_kobo), 0) FROM student_payments WHERE student_id = ?', [$studentId]);
    }

    /** @return list<array<string, mixed>> */
    public static function payments(int $studentId): array
    {
        return Database::all(
            'SELECT p.*, u.name AS recorded_by_name FROM student_payments p
             LEFT JOIN users u ON u.id = p.recorded_by
             WHERE p.student_id = ? ORDER BY p.paid_on DESC, p.id DESC',
            [$studentId],
        );
    }

    public static function newToken(): string
    {
        return bin2hex(random_bytes(24));
    }

    /** APC/26/0001 — the next free one. A counsellor can type their own instead. */
    public static function suggestStudentId(): string
    {
        $year = date('y');
        $prefix = "APC/{$year}/";
        $last = (string) Database::value(
            'SELECT student_id FROM students WHERE student_id LIKE ? ORDER BY id DESC LIMIT 1',
            [$prefix . '%'],
        );
        $next = $last !== '' && preg_match('/(\d+)$/', $last, $m) ? ((int) $m[1]) + 1 : 1;
        for ($i = 0; $i < 9999; $i++) {
            $candidate = $prefix . str_pad((string) ($next + $i), 4, '0', STR_PAD_LEFT);
            if (!Database::value('SELECT 1 FROM students WHERE student_id = ?', [$candidate])) {
                return $candidate;
            }
        }

        return $prefix . strtoupper(bin2hex(random_bytes(2)));
    }

    public static function normaliseId(string $studentId): string
    {
        return strtoupper(preg_replace('/\s+/', '', trim($studentId)) ?? '');
    }

    /**
     * The gate verdict.
     *
     * Two words decide it — CLEARED or NOT CLEARED — because that is the whole of the
     * guard's job. The amber middle is for a student on an agreed plan, who is let in
     * but should know the balance is still there.
     *
     * @return array{state: string, allowed: bool, headline: string, detail: string, tone: string}
     */
    public static function verdict(array $student, int $paidKobo): array
    {
        $fee = (int) $student['fee_kobo'];
        $outstanding = max(0, $fee - $paidKobo);
        $owed = self::money($outstanding, (string) $student['currency']);

        if ($student['standing'] === 'BLOCKED') {
            return [
                'state' => 'BLOCKED',
                'allowed' => false,
                'headline' => 'NOT CLEARED',
                'detail' => 'Please see the accounts office before going in.',
                'tone' => 'red',
            ];
        }
        if ($student['standing'] === 'WAIVED') {
            return ['state' => 'WAIVED', 'allowed' => true, 'headline' => 'CLEARED', 'detail' => 'Fees waived. Nothing to pay.', 'tone' => 'green'];
        }
        if ($fee > 0 && $paidKobo >= $fee) {
            return ['state' => 'CLEARED', 'allowed' => true, 'headline' => 'CLEARED', 'detail' => 'Fees paid in full. Thank you.', 'tone' => 'green'];
        }
        if ($student['standing'] === 'DISCUSSION') {
            return $student['gate_pass']
                ? [
                    'state' => 'ON_PLAN',
                    'allowed' => true,
                    'headline' => 'CLEARED — ON A PLAN',
                    'detail' => "{$owed} still to pay, on an agreed plan.",
                    'tone' => 'amber',
                ]
                : [
                    'state' => 'DISCUSSION',
                    'allowed' => false,
                    'headline' => 'NOT CLEARED',
                    'detail' => "Payment is being discussed. {$owed} outstanding — see the office.",
                    'tone' => 'amber',
                ];
        }
        if ($fee === 0) {
            return ['state' => 'NO_FEE', 'allowed' => true, 'headline' => 'CLEARED', 'detail' => 'No fee is set on this record.', 'tone' => 'green'];
        }
        if ($paidKobo > 0) {
            return [
                'state' => 'PART_PAID',
                'allowed' => false,
                'headline' => 'NOT CLEARED',
                'detail' => "{$owed} still outstanding.",
                'tone' => 'red',
            ];
        }

        return ['state' => 'UNPAID', 'allowed' => false, 'headline' => 'NOT CLEARED', 'detail' => "Nothing paid yet. {$owed} due.", 'tone' => 'red'];
    }

    /** What the student's own phone shows. No staff notes, no other students. */
    public static function presentForStudent(array $s, int $paid): array
    {
        $fee = (int) $s['fee_kobo'];

        return [
            'studentId' => $s['student_id'],
            'token' => $s['status_token'],
            'firstName' => $s['first_name'],
            'lastName' => $s['last_name'],
            'name' => trim($s['first_name'] . ' ' . $s['last_name']),
            'course' => $s['course'],
            'batch' => $s['batch'],
            'fee' => intdiv($fee, 100),
            'paid' => intdiv($paid, 100),
            'outstanding' => intdiv(max(0, $fee - $paid), 100),
            'currency' => $s['currency'],
            'gateNote' => $s['gate_note'],
            'dueOn' => $s['due_on'],
            'verdict' => self::verdict($s, $paid),
            'payments' => array_map(static fn ($p) => [
                'amount' => intdiv((int) $p['amount_kobo'], 100),
                'method' => $p['method'],
                'paidOn' => $p['paid_on'],
                'reference' => $p['reference'],
            ], self::payments((int) $s['id'])),
            // The phone shows this so a screenshot from yesterday is obvious.
            'checkedAt' => gmdate('c'),
        ];
    }

    /** The same student as the panel sees them. */
    public static function presentForStaff(array $s, int $paid, bool $withPayments = false): array
    {
        $fee = (int) $s['fee_kobo'];
        $out = [
            'id' => (int) $s['id'],
            'studentId' => $s['student_id'],
            'firstName' => $s['first_name'],
            'lastName' => $s['last_name'],
            'name' => trim($s['first_name'] . ' ' . $s['last_name']),
            'phone' => $s['phone'],
            'email' => $s['email'],
            'course' => $s['course'],
            'batch' => $s['batch'],
            'fee' => intdiv($fee, 100),
            'paid' => intdiv($paid, 100),
            'outstanding' => intdiv(max(0, $fee - $paid), 100),
            'currency' => $s['currency'],
            'standing' => $s['standing'],
            'gatePass' => (bool) $s['gate_pass'],
            'gateNote' => $s['gate_note'],
            'note' => $s['note'],
            'startedOn' => $s['started_on'],
            'dueOn' => $s['due_on'],
            'active' => (bool) $s['active'],
            'lastSeenAt' => $s['last_seen_at'],
            'createdAt' => $s['created_at'],
            'verdict' => self::verdict($s, $paid),
        ];
        if ($withPayments) {
            $out['payments'] = array_map(static fn ($p) => [
                'id' => (int) $p['id'],
                'amount' => intdiv((int) $p['amount_kobo'], 100),
                'method' => $p['method'],
                'reference' => $p['reference'],
                'paidOn' => $p['paid_on'],
                'note' => $p['note'],
                'recordedBy' => $p['recorded_by_name'],
            ], self::payments((int) $s['id']));
        }

        return $out;
    }

    /** 2700000 kobo as ₦27,000 - the wording the gate card reads out. */
    private static function money(int $kobo, string $currency): string
    {
        $symbol = $currency === 'NGN' ? "\u{20A6}" : $currency . ' ';

        return $symbol . number_format(intdiv($kobo, 100));
    }

    /** Letters and digits only, lowercased — so "  ADEWUNMI " matches "Adewunmi". */
    private static function loose(string $value): string
    {
        return strtolower(preg_replace('/[^a-z0-9]/i', '', $value) ?? '');
    }
}
