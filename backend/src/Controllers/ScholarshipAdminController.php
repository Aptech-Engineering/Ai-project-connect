<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Activity;
use App\Core\Auth;
use App\Core\Database;
use App\Core\HttpError;
use App\Core\Notifier;
use App\Core\Request;
use App\Core\Response;
use App\Core\Uploads;
use App\Core\Validator;
use App\Support\Scholarship;

/**
 * "Our programmes → Scholarship" in the Engineering Panel: the page content, the
 * form applicants download, the exam batches, and everyone who applied.
 */
final class ScholarshipAdminController
{
    /** Admins run the programme; counsellors help with applicants and batches. */
    private const ROLES = ['admin', 'counsellor'];

    /** Everything the screen needs in one call. */
    public static function index(Request $r): void
    {
        Auth::requireStaff(self::ROLES);
        $programme = Scholarship::programme();
        $content = Scholarship::content($programme);
        $counts = [];
        foreach (Database::all("SELECT batch_id, COUNT(*) AS n FROM scholarship_applicants WHERE status = 'PAID' AND batch_id IS NOT NULL GROUP BY batch_id") as $row) {
            $counts[(int) $row['batch_id']] = (int) $row['n'];
        }
        $applicants = Database::all(
            'SELECT a.*, b.name AS batch_name, b.exam_date, f.public_id AS proof_public_id
             FROM scholarship_applicants a
             LEFT JOIN scholarship_batches b ON b.id = a.batch_id
             LEFT JOIN files f ON f.id = a.proof_file_id
             ORDER BY a.created_at DESC LIMIT 1000',
        );
        $stats = Database::one(
            "SELECT COUNT(*) AS total,
                    COALESCE(SUM(status = 'PAID'), 0) AS paid,
                    COALESCE(SUM(status = 'AWAITING_CONFIRMATION'), 0) AS awaiting,
                    COALESCE(SUM(status = 'PAID' AND batch_id IS NULL), 0) AS unassigned,
                    COALESCE(SUM(CASE WHEN status = 'PAID' THEN amount_kobo ELSE 0 END), 0) AS kobo
             FROM scholarship_applicants",
        );

        Response::json([
            'programme' => [
                'title' => $programme['title'],
                'tagline' => $programme['tagline'],
                'intro' => $programme['intro'],
                'fee' => (int) $programme['fee_kobo'] / 100,
                'currency' => $programme['currency'],
                'seats' => $programme['seats'] !== null ? (int) $programme['seats'] : null,
                'deadline' => $programme['deadline'],
                'active' => (bool) $programme['active'],
                'closedMessage' => $programme['closed_message'],
                'formLabel' => $programme['form_label'],
                'formUploaded' => $programme['form_file_id'] !== null,
                'formName' => $programme['form_file_id'] !== null
                    ? (string) Database::value('SELECT original_name FROM files WHERE id = ?', [(int) $programme['form_file_id']])
                    : null,
                'courses' => $content['courses'],
                'benefits' => $content['benefits'],
                'steps' => $content['steps'],
                'contact' => $content['contact'],
            ],
            'batches' => array_map(static fn ($b) => Scholarship::presentBatch($b, $counts[(int) $b['id']] ?? 0), Scholarship::batches()),
            'applicants' => array_map([Scholarship::class, 'presentForStaff'], $applicants),
            'stats' => [
                'total' => (int) $stats['total'],
                'paid' => (int) $stats['paid'],
                'awaiting' => (int) $stats['awaiting'],
                'unassigned' => (int) $stats['unassigned'],
                'collected' => (int) $stats['kobo'] / 100,
                'seatsLeft' => $programme['seats'] !== null ? max(0, (int) $programme['seats'] - (int) $stats['paid']) : null,
            ],
        ]);
    }

    /** Edit the page: wording, fee, seats, deadline, the course list, contact details. */
    public static function update(Request $r): void
    {
        $user = Auth::requireStaff(['admin']);
        $input = $r->input();
        $data = Validator::validate($input, [
            'title' => 'nullable|string|min:3|max:160',
            'tagline' => 'nullable|string|max:255',
            'intro' => 'nullable|string|max:5000',
            'fee' => 'nullable|numeric|min:0|max:10000000',
            'seats' => 'nullable|int|min:0|max:65000',
            'deadline' => 'nullable|date',
            'active' => 'nullable|bool',
            'closedMessage' => 'nullable|string|max:255',
            'formLabel' => 'nullable|string|max:160',
        ]);
        $changes = [];
        foreach (['title' => 'title', 'tagline' => 'tagline', 'intro' => 'intro', 'formLabel' => 'form_label', 'closedMessage' => 'closed_message'] as $key => $column) {
            if (array_key_exists($key, $data) && $data[$key] !== null) {
                $changes[$column] = $data[$key];
            }
        }
        if (isset($data['fee'])) {
            $changes['fee_kobo'] = (int) round((float) $data['fee'] * 100);
        }
        if (array_key_exists('seats', $input)) {
            $changes['seats'] = $data['seats'] !== null ? (int) $data['seats'] : null;
        }
        if (array_key_exists('deadline', $input)) {
            $changes['deadline'] = $data['deadline'] ?: null;
        }
        if (array_key_exists('active', $data) && $data['active'] !== null) {
            $changes['active'] = $data['active'] ? 1 : 0;
        }

        // The lists that make up the page. Sent whole, so an admin can reorder or remove.
        $content = Scholarship::content(Scholarship::programme());
        $touched = false;
        foreach (['courses', 'benefits', 'steps'] as $key) {
            if (isset($input[$key]) && is_array($input[$key])) {
                $content[$key] = array_values(array_map(static fn ($item) => [
                    'title' => mb_substr(trim((string) ($item['title'] ?? '')), 0, 120),
                    'description' => mb_substr(trim((string) ($item['description'] ?? '')), 0, 400),
                ], array_filter($input[$key], static fn ($i) => is_array($i) && trim((string) ($i['title'] ?? '')) !== '')));
                $touched = true;
            }
        }
        if (isset($input['contact']) && is_array($input['contact'])) {
            $content['contact'] = [
                'address' => mb_substr(trim((string) ($input['contact']['address'] ?? '')), 0, 400),
                'organisers' => mb_substr(trim((string) ($input['contact']['organisers'] ?? '')), 0, 200),
                'phones' => array_values(array_filter(array_map(
                    static fn ($p) => mb_substr(trim((string) $p), 0, 60),
                    (array) ($input['contact']['phones'] ?? []),
                ))),
            ];
            $touched = true;
        }
        if ($touched) {
            $changes['content'] = json_encode($content, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        }

        $changes['updated_by'] = (int) $user['id'];
        Database::update('scholarship_programme', $changes, ['id' => 1]);
        Activity::staff($user, 'Updated the scholarship programme page');
        self::index($r);
    }

    /** Upload the application form (PDF or Word) applicants download once paid. */
    public static function uploadForm(Request $r): void
    {
        $user = Auth::requireStaff(['admin']);
        $upload = $r->file('file');
        if ($upload === null) {
            throw HttpError::validation(['file' => 'Choose the form to upload.']);
        }
        $stored = Uploads::store($upload, 'document', 'private', (int) $user['id']);
        $previous = Database::value('SELECT form_file_id FROM scholarship_programme WHERE id = 1');
        Database::update('scholarship_programme', ['form_file_id' => $stored['id'], 'updated_by' => (int) $user['id']], ['id' => 1]);
        if ($previous) {
            Uploads::delete((int) $previous);
        }
        Activity::staff($user, "Uploaded the scholarship form ({$stored['name']})");
        self::index($r);
    }

    /* ---------------- batches ---------------- */

    public static function createBatch(Request $r): void
    {
        $user = Auth::requireStaff(self::ROLES);
        $data = self::validateBatch($r->input(), true);
        $data['sort_order'] = (int) Database::value('SELECT COALESCE(MAX(sort_order), 0) + 1 FROM scholarship_batches');
        Database::insert('scholarship_batches', $data);
        Activity::staff($user, "Created scholarship batch \"{$data['name']}\"");
        self::index($r);
    }

    public static function updateBatch(Request $r): void
    {
        $user = Auth::requireStaff(self::ROLES);
        $batch = Database::one('SELECT * FROM scholarship_batches WHERE id = ?', [(int) $r->params['id']]);
        if ($batch === null) {
            throw HttpError::notFound('Batch not found.');
        }
        $changes = self::validateBatch($r->input(), false);
        if ($changes !== []) {
            Database::update('scholarship_batches', $changes, ['id' => (int) $batch['id']]);
        }
        Activity::staff($user, "Updated scholarship batch \"{$batch['name']}\"");
        self::index($r);
    }

    /** Deleting a batch never deletes people: they go back to "no batch yet". */
    public static function deleteBatch(Request $r): void
    {
        $user = Auth::requireStaff(self::ROLES);
        $batch = Database::one('SELECT * FROM scholarship_batches WHERE id = ?', [(int) $r->params['id']]);
        if ($batch === null) {
            throw HttpError::notFound('Batch not found.');
        }
        Database::run('DELETE FROM scholarship_batches WHERE id = ?', [(int) $batch['id']]);
        Activity::staff($user, "Deleted scholarship batch \"{$batch['name']}\"");
        self::index($r);
    }

    /* ---------------- applicants ---------------- */

    /**
     * Put someone in a batch, confirm or reject a bank transfer, or leave a note.
     * Confirming and being placed both email the applicant.
     */
    public static function updateApplicant(Request $r): void
    {
        $user = Auth::requireStaff(self::ROLES);
        $applicant = Database::one('SELECT * FROM scholarship_applicants WHERE id = ?', [(int) $r->params['id']]);
        if ($applicant === null) {
            throw HttpError::notFound('Applicant not found.');
        }
        $input = $r->input();
        $data = Validator::validate($input, [
            'batchId' => 'nullable|int',
            'payment' => 'nullable|in:confirm,reject',
            'reason' => 'nullable|string|max:255',
            'note' => 'nullable|string|max:500',
        ]);
        $changes = [];
        $emails = [];

        if (array_key_exists('note', $data) && $data['note'] !== null) {
            $changes['staff_note'] = $data['note'];
        }

        if (($data['payment'] ?? null) === 'confirm') {
            if ($applicant['status'] === 'PAID') {
                throw new HttpError(409, 'This form fee is already confirmed.');
            }
            $changes += [
                'status' => 'PAID',
                'method' => $applicant['method'] ?: 'manual',
                'paid_at' => date('Y-m-d H:i:s'),
                'confirmed_by' => (int) $user['id'],
                'failure_reason' => null,
                'reference' => $applicant['reference'] ?: \App\Support\Scholarship::newPaymentReference($applicant['ref']),
            ];
            $emails[] = 'paid';
        } elseif (($data['payment'] ?? null) === 'reject') {
            if ($applicant['status'] === 'PAID') {
                throw new HttpError(409, 'That fee is already confirmed. Refund it instead of rejecting it.');
            }
            $changes += ['status' => 'FAILED', 'failure_reason' => $data['reason'] ?: 'We could not find this transfer.'];
            $emails[] = 'failed';
        }

        if (array_key_exists('batchId', $input)) {
            $batchId = $data['batchId'] !== null ? (int) $data['batchId'] : null;
            if ($batchId !== null && !Database::value('SELECT 1 FROM scholarship_batches WHERE id = ?', [$batchId])) {
                throw HttpError::validation(['batchId' => 'That batch no longer exists.']);
            }
            $changes['batch_id'] = $batchId;
            if ($batchId !== null && (int) ($applicant['batch_id'] ?? 0) !== $batchId) {
                $emails[] = 'batch';
            }
        }

        if ($changes !== []) {
            Database::update('scholarship_applicants', $changes, ['id' => (int) $applicant['id']]);
        }
        $fresh = Database::one('SELECT * FROM scholarship_applicants WHERE id = ?', [(int) $applicant['id']]);
        self::notify($fresh, $emails);

        if (in_array('paid', $emails, true)) {
            Activity::staff($user, "Confirmed the scholarship form fee for {$applicant['ref']} ({$applicant['full_name']})");
        } elseif (in_array('failed', $emails, true)) {
            Activity::staff($user, "Rejected the scholarship transfer for {$applicant['ref']} ({$applicant['full_name']})");
        } elseif (array_key_exists('batch_id', $changes)) {
            Activity::staff($user, "Placed {$applicant['ref']} ({$applicant['full_name']}) in a scholarship batch");
        }
        self::index($r);
    }

    /** Admins can remove an application entirely (a duplicate, or a test). */
    public static function deleteApplicant(Request $r): void
    {
        $user = Auth::requireStaff(['admin']);
        $applicant = Database::one('SELECT * FROM scholarship_applicants WHERE id = ?', [(int) $r->params['id']]);
        if ($applicant === null) {
            throw HttpError::notFound('Applicant not found.');
        }
        Database::run('DELETE FROM scholarship_applicants WHERE id = ?', [(int) $applicant['id']]);
        if ($applicant['proof_file_id'] !== null) {
            Uploads::delete((int) $applicant['proof_file_id']);
        }
        Activity::staff($user, "Deleted scholarship application {$applicant['ref']} ({$applicant['full_name']})");
        Response::noContent();
    }

    /* ---------------- helpers ---------------- */

    /** @param list<string> $kinds */
    private static function notify(array $applicant, array $kinds): void
    {
        if ($kinds === []) {
            return;
        }
        $batch = Scholarship::batch($applicant);
        $link = Scholarship::statusLink($applicant);
        $when = $batch !== null
            ? trim(($batch['exam_date'] ? date('l j F Y', (int) strtotime((string) $batch['exam_date'])) : 'a date we will confirm') . ' ' . (string) $batch['exam_time'])
            : null;

        if (in_array('paid', $kinds, true)) {
            $body = "Hi {$applicant['full_name']},\n\nWe have confirmed your scholarship form fee. Reference {$applicant['ref']}.\n\n"
                . "Download your application form and see your exam details here:\n{$link}\n\n";
            if ($batch !== null) {
                $body .= "Your exam: {$batch['name']} — {$when}" . ($batch['venue'] ? "\nVenue: {$batch['venue']}" : '') . "\n\n";
            }
            Notifier::email('lead', $applicant['email'], 'Your scholarship form is ready', $body . "APTECH Computer Education & AI Projects LTD");
            return;
        }
        if (in_array('failed', $kinds, true)) {
            Notifier::email(
                'lead',
                $applicant['email'],
                'We could not confirm your scholarship payment',
                "Hi {$applicant['full_name']},\n\nWe could not confirm the form fee for {$applicant['ref']}. {$applicant['failure_reason']}\n\nYou can try again here:\n{$link}\n\nAPTECH Computer Education & AI Projects LTD",
            );
            return;
        }
        if (in_array('batch', $kinds, true) && $batch !== null) {
            Notifier::email(
                'lead',
                $applicant['email'],
                "Your scholarship exam: {$batch['name']}",
                "Hi {$applicant['full_name']},\n\nYou have been placed in {$batch['name']} for the scholarship entrance exam.\n"
                . "When: {$when}\n" . ($batch['venue'] ? "Where: {$batch['venue']}\n" : '')
                . ($batch['notes'] ? "\n{$batch['notes']}\n" : '')
                . "\nYour form and details:\n{$link}\n\nAPTECH Computer Education & AI Projects LTD",
            );
        }
    }

    /** @return array<string, mixed> */
    private static function validateBatch(array $input, bool $creating): array
    {
        $req = $creating ? 'required' : 'nullable';
        $data = Validator::validate($input, [
            'name' => "{$req}|string|min:1|max:80",
            'examDate' => 'nullable|date',
            'examTime' => 'nullable|string|max:40',
            'venue' => 'nullable|string|max:255',
            'capacity' => 'nullable|int|min:0|max:65000',
            'notes' => 'nullable|string|max:500',
            'active' => 'nullable|bool',
        ]);
        $out = [];
        if (!empty($data['name'])) {
            $out['name'] = $data['name'];
        }
        foreach (['examDate' => 'exam_date', 'examTime' => 'exam_time', 'venue' => 'venue', 'notes' => 'notes'] as $key => $column) {
            if (array_key_exists($key, $input)) {
                $out[$column] = $data[$key] ?: null;
            }
        }
        if (array_key_exists('capacity', $input)) {
            $out['capacity'] = $data['capacity'] !== null ? (int) $data['capacity'] : null;
        }
        if (array_key_exists('active', $data) && $data['active'] !== null) {
            $out['active'] = $data['active'] ? 1 : 0;
        }
        return $out;
    }
}
