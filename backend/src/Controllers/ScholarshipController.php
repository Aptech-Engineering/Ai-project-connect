<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Activity;
use App\Core\Config;
use App\Core\Database;
use App\Core\HttpError;
use App\Core\Notifier;
use App\Core\RateLimiter;
use App\Core\Request;
use App\Core\Response;
use App\Core\Uploads;
use App\Core\Validator;
use App\Support\Paystack;
use App\Support\Scholarship;
use App\Support\Wallet;

/**
 * The public side of the scholarship programme (/scholarship): read the page,
 * register, pay the form fee, then come back to download the form and see the
 * exam date. Nobody signs in here — the link we email carries a token.
 */
final class ScholarshipController
{
    /** The page itself: what to show, what it costs, when the exams are. */
    public static function show(Request $r): void
    {
        Response::json(Scholarship::publicProgramme());
    }

    /** One partner's landing page: their branding and wording, plus the live programme. */
    public static function partner(Request $r): void
    {
        $slug = (string) ($r->params['slug'] ?? '');
        $partner = Scholarship::partnerBySlug($slug);
        if ($partner === null) {
            throw HttpError::notFound('We could not find that partner page.');
        }
        // A cheap read counter, so staff can see which partner page gets opened.
        Database::run('UPDATE scholarship_partners SET views = views + 1 WHERE id = ?', [(int) $partner['id']]);
        Response::json([
            'partner' => Scholarship::presentPartner($partner, Scholarship::programme()),
            'programme' => Scholarship::publicProgramme(),
        ]);
    }

    /** Register: name, email, phone, address, state, nationality and a course. */
    public static function apply(Request $r): void
    {
        RateLimiter::hit('scholarship-apply:' . $r->ip(), 10, 3600);
        $programme = Scholarship::programme();
        $public = Scholarship::publicProgramme();
        if (!$public['open']) {
            throw new HttpError(409, $public['closedMessage'] ?: 'Applications are closed.');
        }
        $data = Validator::validate($r->input(), [
            'name' => 'required|string|min:2|max:120',
            'email' => 'required|email|max:190',
            'phone' => 'required|string|min:7|max:40',
            'address' => 'required|string|min:5|max:255',
            'state' => 'required|string|min:2|max:80',
            'nationality' => 'required|string|min:2|max:80',
            'course' => 'nullable|string|max:120',
            // Set when they arrived from a partner's landing page.
            'partner' => 'nullable|string|max:60',
        ]);
        $partnerSlug = null;
        if (!empty($data['partner'])) {
            $slug = strtolower(trim($data['partner']));
            $partnerSlug = Database::value('SELECT slug FROM scholarship_partners WHERE slug = ?', [$slug]) ?: null;
        }

        $email = strtolower(trim($data['email']));
        // One unpaid application per email: a second attempt continues the first,
        // so nobody ends up with two references for the same person.
        $existing = Database::one("SELECT * FROM scholarship_applicants WHERE email = ? AND status <> 'PAID' ORDER BY id DESC LIMIT 1", [$email]);
        if ($existing !== null) {
            Database::update('scholarship_applicants', [
                'full_name' => $data['name'], 'phone' => $data['phone'], 'address' => $data['address'],
                'state' => $data['state'], 'nationality' => $data['nationality'], 'course' => $data['course'] ?? null,
                'amount_kobo' => (int) $programme['fee_kobo'],
            ], ['id' => (int) $existing['id']]);
            $applicant = Database::one('SELECT * FROM scholarship_applicants WHERE id = ?', [(int) $existing['id']]);
            Response::json(self::applied($applicant), 200);
            return;
        }

        $ref = Scholarship::newRef();
        $id = Database::insert('scholarship_applicants', [
            'ref' => $ref,
            'token' => bin2hex(random_bytes(24)),
            'full_name' => $data['name'],
            'email' => $email,
            'phone' => trim($data['phone']),
            'address' => $data['address'],
            'state' => $data['state'],
            'nationality' => $data['nationality'],
            'course' => $data['course'] ?? null,
            'partner_slug' => $partnerSlug,
            'amount_kobo' => (int) $programme['fee_kobo'],
            'currency' => $programme['currency'],
        ]);
        $applicant = Database::one('SELECT * FROM scholarship_applicants WHERE id = ?', [$id]);
        Activity::system("Scholarship application started: {$ref} ({$data['name']})");
        Notifier::email(
            'lead',
            (string) Config::get('notifications.admin_email'),
            "New scholarship application: {$data['name']}",
            "{$data['name']} ({$email}, {$data['phone']}) from {$data['state']} applied for the scholarship programme.\nReference: {$ref}\nCourse: " . ($data['course'] ?: 'not chosen'),
        );
        Response::json(self::applied($applicant), 201);
    }

    /** Start an online payment for the form fee. */
    public static function payWithPaystack(Request $r): void
    {
        RateLimiter::hit('scholarship-pay:' . $r->ip(), 15, 900);
        $applicant = self::applicantFromRequest($r);
        self::assertPayable($applicant);
        if (!Wallet::methodEnabled('paystack')) {
            throw new HttpError(409, 'Online payment is switched off right now. Please pay by bank transfer.');
        }

        $reference = Scholarship::newPaymentReference($applicant['ref']);
        Database::update('scholarship_applicants', [
            'method' => 'paystack', 'status' => 'PENDING', 'reference' => $reference, 'failure_reason' => null,
        ], ['id' => (int) $applicant['id']]);
        try {
            $checkout = Paystack::client()->initialize([
                'email' => $applicant['email'],
                'amount' => (int) $applicant['amount_kobo'],
                'currency' => $applicant['currency'],
                'reference' => $reference,
                'callback_url' => Paystack::callbackUrl(),
                'metadata' => ['scholarship_ref' => $applicant['ref'], 'purpose' => 'scholarship_form_fee'],
            ]);
        } catch (\Throwable $e) {
            Database::update('scholarship_applicants', ['status' => 'FAILED', 'failure_reason' => 'Could not start the online payment.'], ['id' => (int) $applicant['id']]);
            throw $e;
        }
        Database::update('scholarship_applicants', [
            'paystack_access_code' => $checkout['access_code'],
            'paystack_authorization_url' => $checkout['authorization_url'],
        ], ['id' => (int) $applicant['id']]);
        Activity::system("Scholarship payment started for {$applicant['ref']} ({$reference})");

        Response::json([
            'reference' => $reference,
            'authorizationUrl' => $checkout['authorization_url'],
            'accessCode' => $checkout['access_code'],
            'publicKey' => Paystack::publicKey(),
            'amount' => (int) $applicant['amount_kobo'] / 100,
            'currency' => $applicant['currency'],
        ], 201);
    }

    /** "I have sent the money": a bank transfer for an admin to confirm (multipart, optional `proof`). */
    public static function claimTransfer(Request $r): void
    {
        RateLimiter::hit('scholarship-manual:' . $r->ip(), 10, 3600);
        $applicant = self::applicantFromRequest($r);
        self::assertPayable($applicant);
        if (!Wallet::methodEnabled('manual')) {
            throw new HttpError(409, 'Bank transfer is switched off right now. Please pay online.');
        }
        $data = Validator::validate($r->input(), [
            'senderName' => 'required|string|min:2|max:120',
            'senderBank' => 'nullable|string|max:120',
            'transferDate' => 'nullable|date',
        ]);
        $proofId = Wallet::storeProof($r->file('proof'));

        Database::update('scholarship_applicants', [
            'method' => 'manual',
            'status' => 'AWAITING_CONFIRMATION',
            'reference' => $applicant['reference'] ?: Scholarship::newPaymentReference($applicant['ref']),
            'sender_name' => $data['senderName'],
            'sender_bank' => $data['senderBank'] ?? null,
            'transfer_date' => $data['transferDate'] ?? null,
            'proof_file_id' => $proofId ?? ($applicant['proof_file_id'] !== null ? (int) $applicant['proof_file_id'] : null),
            'failure_reason' => null,
        ], ['id' => (int) $applicant['id']]);

        Activity::system("Scholarship transfer declared for {$applicant['ref']} by {$data['senderName']}");
        Notifier::email(
            'lead',
            (string) Config::get('notifications.admin_email'),
            "Scholarship transfer to confirm: {$applicant['ref']}",
            "{$applicant['full_name']} says they have transferred the scholarship form fee.\nReference: {$applicant['ref']}\nSender: {$data['senderName']}\n\nConfirm it in the Engineering Panel under Our programmes → Scholarship.",
        );
        Response::json(self::statusFor((int) $applicant['id']));
    }

    /** The applicant's own page: payment state, the form, the exam date. */
    public static function status(Request $r): void
    {
        $applicant = self::applicantFromRequest($r);
        Response::json(self::statusFor((int) $applicant['id']));
    }

    /** The form itself, once the fee has cleared. */
    public static function form(Request $r): void
    {
        $applicant = self::applicantFromRequest($r);
        if ($applicant['status'] !== 'PAID') {
            throw HttpError::forbidden('The form unlocks once your form fee is confirmed.');
        }
        $programme = Scholarship::programme();
        if ($programme['form_file_id'] === null) {
            throw HttpError::notFound('The form has not been uploaded yet. Please check back shortly.');
        }
        $file = Database::one('SELECT * FROM files WHERE id = ?', [(int) $programme['form_file_id']]);
        if ($file === null) {
            throw HttpError::notFound('The form is missing.');
        }
        Response::file(Uploads::path($file), $file['mime_type'], $file['original_name'], false);
    }

    /* ---------------- helpers ---------------- */

    private static function applicantFromRequest(Request $r): array
    {
        $input = $r->input();
        $ref = (string) ($r->query('ref') ?? $input['ref'] ?? '');
        $token = (string) ($r->query('token') ?? $input['token'] ?? '');
        if ($ref === '' || $token === '') {
            throw HttpError::notFound('We could not find that application.');
        }
        return Scholarship::byToken($ref, $token);
    }

    private static function assertPayable(array $applicant): void
    {
        if ($applicant['status'] === 'PAID') {
            throw new HttpError(409, 'This form fee has already been paid.');
        }
        if ($applicant['status'] === 'AWAITING_CONFIRMATION') {
            throw new HttpError(409, 'We are checking your transfer. You will get an email once it is confirmed.');
        }
    }

    private static function applied(array $applicant): array
    {
        return [
            'ref' => $applicant['ref'],
            'token' => $applicant['token'],
            'statusLink' => Scholarship::statusLink($applicant),
            'amount' => (int) $applicant['amount_kobo'] / 100,
            'currency' => $applicant['currency'],
            'status' => $applicant['status'],
        ];
    }

    /** @return array<string, mixed> */
    private static function statusFor(int $id): array
    {
        $applicant = Database::one('SELECT * FROM scholarship_applicants WHERE id = ?', [$id]);
        return Scholarship::present($applicant, Scholarship::batch($applicant), Scholarship::programme());
    }
}
