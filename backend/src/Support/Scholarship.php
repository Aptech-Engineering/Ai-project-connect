<?php

declare(strict_types=1);

namespace App\Support;

use App\Core\Database;
use App\Core\HttpError;

/**
 * The scholarship programme: the editable page, its exam batches, and the people
 * who applied. Applicants are not clients and not course leads — they pay a form
 * fee, download the form once it clears, and sit an exam on a batch date.
 */
final class Scholarship
{
    /** Every part of the page an admin can edit lives in one JSON column. */
    public const CONTENT_KEYS = ['courses', 'benefits', 'steps', 'contact'];

    public static function programme(): array
    {
        $row = Database::one('SELECT * FROM scholarship_programme WHERE id = 1');
        if ($row === null) {
            throw new HttpError(503, 'The scholarship programme has not been set up yet.');
        }
        return $row;
    }

    /** @return array{courses: list<array>, benefits: list<array>, steps: list<array>, contact: array} */
    public static function content(array $programme): array
    {
        $decoded = json_decode((string) ($programme['content'] ?? ''), true);
        $decoded = is_array($decoded) ? $decoded : [];
        return [
            'courses' => array_values(array_filter((array) ($decoded['courses'] ?? []), 'is_array')),
            'benefits' => array_values(array_filter((array) ($decoded['benefits'] ?? []), 'is_array')),
            'steps' => array_values(array_filter((array) ($decoded['steps'] ?? []), 'is_array')),
            'contact' => (array) ($decoded['contact'] ?? []),
        ];
    }

    /** What the public page shows. `open` is false once it is switched off or the deadline passes. */
    public static function publicProgramme(): array
    {
        $p = self::programme();
        $content = self::content($p);
        $deadline = $p['deadline'] ? (string) $p['deadline'] : null;
        $expired = $deadline !== null && $deadline < date('Y-m-d');
        $seatsLeft = $p['seats'] !== null ? max(0, (int) $p['seats'] - self::paidCount()) : null;

        return [
            'title' => $p['title'],
            'tagline' => $p['tagline'],
            'intro' => $p['intro'],
            'fee' => (int) $p['fee_kobo'] / 100,
            'feeKobo' => (int) $p['fee_kobo'],
            'currency' => $p['currency'],
            'seats' => $p['seats'] !== null ? (int) $p['seats'] : null,
            'seatsLeft' => $seatsLeft,
            'deadline' => $deadline,
            'open' => (bool) $p['active'] && !$expired && ($seatsLeft === null || $seatsLeft > 0),
            'closedMessage' => $p['closed_message'] ?: ($expired ? 'Applications for this programme have closed.' : null),
            'courses' => $content['courses'],
            'benefits' => $content['benefits'],
            'steps' => $content['steps'],
            'contact' => $content['contact'],
            // Dates are useful before applying; the venue is only on a confirmed place.
            'examDates' => array_map(
                static fn (array $b) => ['name' => $b['name'], 'examDate' => $b['exam_date'], 'examTime' => $b['exam_time']],
                self::batches(true),
            ),
            // Same bank details and Paystack switches as the rest of the app, but this
            // programme's own fee and wording.
            'checkout' => array_merge(Wallet::checkout(), [
                'fee' => (int) $p['fee_kobo'] / 100,
                'feeKobo' => (int) $p['fee_kobo'],
                'currency' => $p['currency'],
                'feeTitle' => 'Scholarship form fee',
                'feeExplainer' => 'Pay the form fee to receive your application form and your exam date.',
            ]),
        ];
    }

    /** @return list<array<string, mixed>> */
    public static function batches(bool $activeOnly = false): array
    {
        $sql = 'SELECT * FROM scholarship_batches' . ($activeOnly ? ' WHERE active = 1' : '') . ' ORDER BY sort_order, exam_date, name';
        return Database::all($sql);
    }

    public static function batch(array $applicant): ?array
    {
        if ($applicant['batch_id'] === null) {
            return null;
        }
        return Database::one('SELECT * FROM scholarship_batches WHERE id = ?', [(int) $applicant['batch_id']]);
    }

    public static function paidCount(): int
    {
        return (int) Database::value("SELECT COUNT(*) FROM scholarship_applicants WHERE status = 'PAID'");
    }

    /** SCH-26-4QX7M: the applicant quotes this on the phone and at the centre. */
    public static function newRef(): string
    {
        for ($i = 0; $i < 20; $i++) {
            $ref = 'SCH-' . date('y') . '-' . Codes::random(5);
            if (!Database::value('SELECT 1 FROM scholarship_applicants WHERE ref = ?', [$ref])) {
                return $ref;
            }
        }
        throw new HttpError(500, 'Could not create a reference. Please try again.');
    }

    public static function newPaymentReference(string $ref): string
    {
        return mb_substr('FEE-' . $ref . '-' . strtoupper(bin2hex(random_bytes(3))), 0, 64);
    }

    public static function byToken(string $ref, string $token): array
    {
        $applicant = Database::one('SELECT * FROM scholarship_applicants WHERE ref = ?', [strtoupper(trim($ref))]);
        if ($applicant === null || !hash_equals((string) $applicant['token'], trim($token))) {
            throw HttpError::notFound('We could not find that application. Check the link in your email.');
        }
        return $applicant;
    }

    public static function statusLink(array $applicant): string
    {
        return Links::page('scholarship/status', ['ref' => $applicant['ref'], 'token' => $applicant['token']]);
    }

    /** What the applicant sees on their status page. */
    public static function present(array $a, ?array $batch, array $programme): array
    {
        $paid = $a['status'] === 'PAID';
        return [
            'ref' => $a['ref'],
            'name' => $a['full_name'],
            'email' => $a['email'],
            'phone' => $a['phone'],
            'address' => $a['address'],
            'state' => $a['state'],
            'nationality' => $a['nationality'],
            'course' => $a['course'],
            'status' => $a['status'],
            'method' => $a['method'],
            'amount' => (int) $a['amount_kobo'] / 100,
            'currency' => $a['currency'],
            'reference' => $a['reference'],
            'failureReason' => $a['failure_reason'],
            'appliedAt' => Presenter::iso($a['created_at']),
            'paidAt' => Presenter::iso($a['paid_at']),
            // The form and the exam details only exist once the fee has cleared.
            'form' => $paid && $programme['form_file_id'] ? [
                'label' => $programme['form_label'],
                'url' => Links::api() . '/api/scholarship/form?ref=' . rawurlencode($a['ref']) . '&token=' . rawurlencode($a['token']),
            ] : null,
            'formPending' => $paid && !$programme['form_file_id'],
            'batch' => $paid && $batch !== null ? [
                'name' => $batch['name'],
                'examDate' => $batch['exam_date'],
                'examTime' => $batch['exam_time'],
                'venue' => $batch['venue'],
                'notes' => $batch['notes'],
            ] : null,
            'statusLink' => self::statusLink($a),
        ];
    }

    /** The same applicant as staff see them, with the batch and proof attached. */
    public static function presentForStaff(array $a): array
    {
        return [
            'id' => (int) $a['id'],
            'ref' => $a['ref'],
            'name' => $a['full_name'],
            'email' => $a['email'],
            'phone' => $a['phone'],
            'address' => $a['address'],
            'state' => $a['state'],
            'nationality' => $a['nationality'],
            'course' => $a['course'],
            'batchId' => $a['batch_id'] !== null ? (int) $a['batch_id'] : null,
            'batchName' => $a['batch_name'] ?? null,
            'examDate' => $a['exam_date'] ?? null,
            'status' => $a['status'],
            'method' => $a['method'],
            'amount' => (int) $a['amount_kobo'] / 100,
            'currency' => $a['currency'],
            'reference' => $a['reference'],
            'senderName' => $a['sender_name'],
            'senderBank' => $a['sender_bank'],
            'transferDate' => $a['transfer_date'],
            'proofUrl' => empty($a['proof_public_id']) ? null : Links::api() . '/api/staff/files/' . $a['proof_public_id'],
            'failureReason' => $a['failure_reason'],
            'staffNote' => $a['staff_note'],
            'appliedAt' => Presenter::iso($a['created_at']),
            'paidAt' => Presenter::iso($a['paid_at']),
        ];
    }

    public static function presentBatch(array $b, int $assigned = 0): array
    {
        return [
            'id' => (int) $b['id'],
            'name' => $b['name'],
            'examDate' => $b['exam_date'],
            'examTime' => $b['exam_time'],
            'venue' => $b['venue'],
            'capacity' => $b['capacity'] !== null ? (int) $b['capacity'] : null,
            'notes' => $b['notes'],
            'active' => (bool) $b['active'],
            'assigned' => $assigned,
        ];
    }
}
