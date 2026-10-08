<?php

declare(strict_types=1);

namespace App\Support;

use App\Core\Database;

/**
 * The student register and the one answer the guard needs: are they cleared to enter?
 *
 * The verdict is worked out here and nowhere else, so the panel, the student's phone
 * and any future screen can never disagree about it.
 */
final class Students
{
    /** A student's register entry. */
    public static function byId(int $id): ?array
    {
        return Database::one('SELECT * FROM students WHERE id = ?', [$id]);
    }

    /**
     * Sign-in. The name is what a student always has on them; the Student ID is only
     * needed when two of them share a name, which is why it is optional.
     *
     * Case, spacing and the order of the two names are all forgiven.
     *
     * @return list<array<string, mixed>> everyone who matches: none, one, or namesakes
     */
    public static function matching(?string $studentId, string $firstName, string $lastName, ?string $phone = null): array
    {
        $rows = $studentId !== null && trim($studentId) !== ''
            ? Database::all('SELECT * FROM students WHERE student_id = ? AND active = 1', [self::normaliseId($studentId)])
            : Database::all('SELECT * FROM students WHERE active = 1');

        $same = static fn (string $a, string $b): bool => self::loose($a) === self::loose($b);
        $rows = array_values(array_filter($rows, static function (array $row) use ($same, $firstName, $lastName) {
            // Either way round: plenty of people give their surname first.
            return ($same($row['first_name'], $firstName) && $same($row['last_name'], $lastName))
                || ($same($row['first_name'], $lastName) && $same($row['last_name'], $firstName));
        }));

        // A phone number tells namesakes apart as well as an ID does, and more people
        // know it by heart. The last 7 digits, so 0803… and +234 803… both match.
        if (count($rows) > 1 && $phone !== null && trim($phone) !== '') {
            $tail = static fn (?string $value): string => substr(preg_replace('/\D/', '', (string) $value) ?? '', -7);
            $wanted = $tail($phone);
            if ($wanted !== '') {
                $narrowed = array_values(array_filter($rows, static fn ($row) => $tail($row['phone']) === $wanted));
                if ($narrowed !== []) {
                    return $narrowed;
                }
            }
        }

        return $rows;
    }

    /** The phone remembers this instead of the name, so a refresh is one tap. */
    public static function byToken(string $studentId, string $token): ?array
    {
        $row = Database::one('SELECT * FROM students WHERE student_id = ? AND active = 1', [self::normaliseId($studentId)]);

        return $row !== null && hash_equals((string) $row['status_token'], trim($token)) ? $row : null;
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
     * The admin's clearance decision is the only thing the guard needs.
     *
     * @return array{state: string, allowed: bool, headline: string, detail: string, tone: string}
     */
    public static function verdict(array $student): array
    {
        $cleared = $student['standing'] === 'WAIVED';
        return $cleared
            ? ['state' => 'CLEARED', 'allowed' => true, 'headline' => 'CLEARED', 'detail' => 'You are cleared to enter.', 'tone' => 'green']
            : ['state' => 'NOT_CLEARED', 'allowed' => false, 'headline' => 'NOT CLEARED', 'detail' => 'Please check with the office before entering.', 'tone' => 'red'];
    }

    /** What the student's own phone shows. No staff notes, no other students. */
    public static function presentForStudent(array $s): array
    {
        return [
            'studentId' => $s['student_id'],
            'token' => $s['status_token'],
            'firstName' => $s['first_name'],
            'lastName' => $s['last_name'],
            'name' => trim($s['first_name'] . ' ' . $s['last_name']),
            'course' => $s['course'],
            'batch' => $s['batch'],
            'gateNote' => $s['gate_note'],
            'verdict' => self::verdict($s),
            // The phone shows this so a screenshot from yesterday is obvious.
            'checkedAt' => gmdate('c'),
        ];
    }

    /** The same student as the panel sees them. */
    public static function presentForStaff(array $s): array
    {
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
            'standing' => $s['standing'],
            'gateNote' => $s['gate_note'],
            'note' => $s['note'],
            'startedOn' => $s['started_on'],
            'active' => (bool) $s['active'],
            'lastSeenAt' => $s['last_seen_at'],
            'createdAt' => $s['created_at'],
            'verdict' => self::verdict($s),
        ];
        return $out;
    }

    /** Letters and digits only, lowercased — so "  ADEWUNMI " matches "Adewunmi". */
    private static function loose(string $value): string
    {
        return strtolower(preg_replace('/[^a-z0-9]/i', '', $value) ?? '');
    }
}
