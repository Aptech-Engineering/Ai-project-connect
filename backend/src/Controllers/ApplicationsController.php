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
use App\Support\Codes;
use App\Support\Ideas;
use App\Support\Paystack;
use App\Support\Presenter;
use App\Support\SiteContent;
use App\Support\Wallet;

/**
 * Public idea application with draft saving and the commitment fee (no sign-in).
 * The applicant is identified by a private resume token (only its sha256 hash is stored).
 */
final class ApplicationsController
{
    /** Start a draft. Email is required so we can send the resume link. */
    public static function create(Request $r): void
    {
        RateLimiter::hit('draft-create:' . $r->ip(), 20, 3600);
        $input = $r->input();
        Validator::validate($input, ['email' => 'required|email|max:190']);
        $columns = Ideas::validateFields($input, false);
        [$idea, $token] = self::createDraft($columns, $r->file('attachment'), 'online', null);

        Activity::system("Applicant started a draft idea {$idea['ref']}");
        self::sendResumeEmail($idea, $token, false);
        Response::json(self::withDevLink(['token' => $token, 'application' => self::present($idea)], $token), 201);
    }

    /**
     * Legacy one-step form (POST /api/ideas): validates every field, then saves a draft that still needs the
     * commitment fee before it can be submitted.
     */
    public static function createComplete(Request $r): void
    {
        RateLimiter::hit('idea:' . $r->ip(), 10, 3600);
        $columns = Ideas::validateFields($r->input(), true);
        [$idea, $token] = self::createDraft($columns, $r->file('attachment'), 'online', null);
        Activity::system("Applicant started a draft idea {$idea['ref']}");
        self::sendResumeEmail($idea, $token, false);
        Response::json(self::withDevLink([
            'ref' => $idea['ref'], 'title' => $idea['title'], 'status' => $idea['status'], 'submittedAt' => null,
            'token' => $token, 'paymentRequired' => true, 'application' => self::present($idea),
        ], $token), 201);
    }

    public static function show(Request $r): void
    {
        RateLimiter::hit('draft-view:' . $r->ip(), 120, 900);
        Response::json(self::present(Wallet::ideaByToken((string) $r->query('token'))));
    }

    /** Save part of the form (JSON, or multipart with an `attachment` PDF). `removeAttachment: true` clears it. */
    public static function save(Request $r): void
    {
        RateLimiter::hit('draft-save:' . $r->ip(), 200, 900);
        $input = $r->input();
        $idea = Wallet::ideaByToken((string) ($input['token'] ?? ''));
        if ($idea['status'] !== 'DRAFT') {
            throw new HttpError(409, 'This application has already been submitted, so it can no longer be edited.');
        }
        $columns = Ideas::validateFields($input, false);
        if (array_key_exists('email', $columns) && $columns['email'] === null) {
            unset($columns['email']); // email is required on a draft
        }
        $upload = $r->file('attachment');
        $oldFile = $idea['attachment_file_id'] ? (int) $idea['attachment_file_id'] : null;
        if ($upload) {
            $columns['attachment_file_id'] = Uploads::store($upload, 'pdf', 'private', null, 'attachment')['id'];
        } elseif (in_array($input['removeAttachment'] ?? null, [true, 1, '1', 'true'], true)) {
            $columns['attachment_file_id'] = null;
        }
        $columns['last_saved_at'] = date('Y-m-d H:i:s');
        Database::update('ideas', $columns, ['id' => (int) $idea['id']]);
        if ($oldFile && array_key_exists('attachment_file_id', $columns)) {
            Uploads::delete($oldFile);
        }
        Response::json(self::present(self::reload((int) $idea['id'])));
    }

    /** "Forgot where you stopped?" Emails links for every open draft. Same answer whether or not the email is known. */
    public static function resumeLinks(Request $r): void
    {
        RateLimiter::hit('resume-links:' . $r->ip(), 5, 3600);
        $data = Validator::validate($r->input(), ['email' => 'required|email|max:190']);
        $email = strtolower($data['email']);
        RateLimiter::hit('resume-links-email:' . hash('sha256', $email), 3, 3600);

        $drafts = Database::all("SELECT * FROM ideas WHERE email = ? AND status = 'DRAFT' ORDER BY COALESCE(last_saved_at, created_at) DESC LIMIT 10", [$email]);
        $links = [];
        if ($drafts) {
            $lines = [];
            foreach ($drafts as $d) {
                $token = Wallet::issueToken((int) $d['id']);
                $links[] = Wallet::resumeLink($token);
                $lines[] = sprintf("• %s (%s), last saved %s\n  %s", $d['title'] ?: 'Untitled idea', $d['ref'], date('j M Y', (int) strtotime((string) ($d['last_saved_at'] ?? $d['created_at']))), end($links));
            }
            Notifier::email('client', $email, 'Continue your application', "Hi,\n\nHere " . (count($drafts) === 1 ? 'is the link to your saved application' : 'are the links to your saved applications') . ":\n\n" . implode("\n\n", $lines) . "\n\nIf you didn't ask for this, you can ignore this email.\n\nAI Project Connect");
            Activity::system('Resume links emailed for ' . count($drafts) . ' draft idea(s)');
        }
        $response = ['message' => "If there's a saved application for that email, we've sent a link to continue it."];
        if (Config::get('otp.expose_in_response') && !Config::isProduction()) {
            $response['devLinks'] = $links;
        }
        Response::json($response);
    }

    /** Starts a Paystack checkout for the commitment fee. */
    public static function payWithPaystack(Request $r): void
    {
        RateLimiter::hit('pay-init:' . $r->ip(), 15, 900);
        $idea = Wallet::ideaByToken((string) ($r->input()['token'] ?? ''));
        if (!Wallet::methodEnabled('paystack')) {
            throw new HttpError(409, 'Online payment is switched off right now. Please pay by bank transfer.');
        }
        Wallet::assertCanPay($idea);

        $amount = Wallet::feeKobo();
        $reference = Wallet::newReference($idea['ref']);
        $paymentId = Database::insert('idea_payments', [
            'idea_id' => (int) $idea['id'], 'method' => 'paystack', 'status' => 'PENDING',
            'amount_kobo' => $amount, 'currency' => Wallet::currency(), 'reference' => $reference,
        ]);
        try {
            $checkout = Paystack::client()->initialize([
                'email' => $idea['email'],
                'amount' => $amount,
                'currency' => Wallet::currency(),
                'reference' => $reference,
                'callback_url' => Paystack::callbackUrl(),
                'metadata' => ['idea_ref' => $idea['ref'], 'payment_id' => $paymentId, 'purpose' => 'commitment_fee'],
            ]);
        } catch (\Throwable $e) {
            Database::update('idea_payments', ['status' => 'FAILED', 'failure_reason' => 'Could not start the online payment.'], ['id' => $paymentId]);
            throw $e;
        }
        Database::update('idea_payments', ['paystack_access_code' => $checkout['access_code'], 'paystack_authorization_url' => $checkout['authorization_url']], ['id' => $paymentId]);
        Activity::system("Online payment started for idea {$idea['ref']} ({$reference})");

        Response::json([
            'reference' => $reference,
            'authorizationUrl' => $checkout['authorization_url'],
            'accessCode' => $checkout['access_code'],
            'publicKey' => Paystack::publicKey(),
            'email' => $idea['email'],
            'amount' => $amount / 100,
            'amountKobo' => $amount,
            'currency' => Wallet::currency(),
        ], 201);
    }

    /** "I have sent the money": manual bank transfer claim (multipart, optional `proof`). */
    public static function claimTransfer(Request $r): void
    {
        RateLimiter::hit('pay-manual:' . $r->ip(), 10, 3600);
        $input = $r->input();
        $idea = Wallet::ideaByToken((string) ($input['token'] ?? ''));
        if (!Wallet::methodEnabled('manual')) {
            throw new HttpError(409, 'Bank transfer is switched off right now. Please pay online.');
        }
        Wallet::assertCanPay($idea);
        $data = Validator::validate($input, [
            'senderName' => 'required|string|min:2|max:120',
            'senderBank' => 'required|string|min:2|max:120',
            'amount' => 'required|number|between:1,100000000',
            'transferDate' => 'required|date',
            'refundAccountName' => 'nullable|string|min:2|max:120',
            'refundAccountNumber' => 'nullable|string|max:20',
            'refundBank' => 'nullable|string|min:2|max:120',
        ]);
        $fee = Wallet::feeKobo();
        $errors = [];
        if ((int) round($data['amount'] * 100) < $fee) {
            $errors['amount'] = 'The commitment fee is ' . Wallet::money($fee) . '. Please transfer the full amount.';
        }
        if ($data['transferDate'] > date('Y-m-d') || $data['transferDate'] < date('Y-m-d', strtotime('-60 days'))) {
            $errors['transferDate'] = 'Enter the date you made the transfer.';
        }
        $errors += self::refundAccountErrors($data['refundAccountName'] ?? null, $data['refundAccountNumber'] ?? null, $data['refundBank'] ?? null, false);
        if ($errors) {
            throw HttpError::validation($errors);
        }

        $paymentId = Database::transaction(static function () use ($r, $idea, $data, $fee) {
            $proofId = Wallet::storeProof($r->file('proof'));
            return Database::insert('idea_payments', [
                'idea_id' => (int) $idea['id'], 'method' => 'manual', 'status' => 'AWAITING_CONFIRMATION',
                'amount_kobo' => $fee, 'currency' => Wallet::currency(), 'reference' => Wallet::newReference($idea['ref']),
                'sender_name' => $data['senderName'], 'sender_bank' => $data['senderBank'],
                'claimed_amount_kobo' => (int) round($data['amount'] * 100), 'transfer_date' => $data['transferDate'], 'proof_file_id' => $proofId,
                'refund_account_name' => $data['refundAccountName'] ?? null,
                'refund_account_number' => $data['refundAccountNumber'] ?? null,
                'refund_bank' => $data['refundBank'] ?? null,
            ]);
        });
        $payment = Wallet::find($paymentId);
        $amount = Wallet::money((int) $payment['claimed_amount_kobo']);

        Activity::system("Applicant reported a {$amount} bank transfer for idea {$idea['ref']} ({$payment['reference']})");
        Notifier::client($idea, "We've received your payment details ({$idea['ref']})", sprintf(
            "Hi %s,\n\nThanks! You told us you sent %s by bank transfer from %s (%s) on %s.\n\nPayment reference: %s\n\nWe'll confirm it within %s and email you a receipt.%s\n\nAI Project Connect",
            $idea['name'] ?: 'there', $amount, $data['senderName'], $data['senderBank'], date('j M Y', (int) strtotime($data['transferDate'])), $payment['reference'],
            Wallet::confirmationTime(),
            $idea['status'] === 'DRAFT' ? ' You can already submit your application while we check.' : '',
        ), null);
        Notifier::staff((string) Config::get('notifications.admin_email'), "Payment to confirm: {$idea['ref']}", sprintf(
            "%s says they paid the %s commitment fee by bank transfer.\n\nSender: %s (%s)\nAmount: %s\nDate: %s\nProof attached: %s\nReference: %s\n\nConfirm or mark as not received in Engineering Panel → Payments.",
            $idea['name'] ?: $idea['email'], Wallet::money($fee), $data['senderName'], $data['senderBank'], $amount, $data['transferDate'], $payment['proof_file_id'] ? 'yes' : 'no', $payment['reference'],
        ));
        Response::json(self::present(self::reload((int) $idea['id'])), 201);
    }

    /** Where to send a refund for a bank transfer (editable until the refund is sent). */
    public static function refundAccount(Request $r): void
    {
        RateLimiter::hit('refund-account:' . $r->ip(), 10, 3600);
        $input = $r->input();
        $idea = Wallet::ideaByToken((string) ($input['token'] ?? ''));
        $data = Validator::validate($input, [
            'accountName' => 'required|string|min:2|max:120',
            'accountNumber' => 'required|string|max:20',
            'bankName' => 'required|string|min:2|max:120',
        ]);
        if ($errors = self::refundAccountErrors($data['accountName'], $data['accountNumber'], $data['bankName'], true)) {
            $map = ['refundAccountName' => 'accountName', 'refundAccountNumber' => 'accountNumber', 'refundBank' => 'bankName'];
            throw HttpError::validation(array_combine(array_map(static fn ($k) => $map[$k], array_keys($errors)), array_values($errors)));
        }
        $payment = Wallet::current((int) $idea['id']);
        if ($payment === null || !in_array($payment['status'], ['AWAITING_CONFIRMATION', 'PAID'], true)) {
            throw new HttpError(409, 'Add refund details after you have paid the commitment fee.');
        }
        if ($payment['method'] !== 'manual') {
            throw new HttpError(409, 'Online payments are refunded to the card or account you paid with, so no bank details are needed.');
        }
        if (in_array($payment['refund_status'], ['PROCESSING', 'REFUNDED'], true)) {
            throw new HttpError(409, 'Your refund has already been sent.');
        }
        Database::update('idea_payments', ['refund_account_name' => $data['accountName'], 'refund_account_number' => $data['accountNumber'], 'refund_bank' => $data['bankName']], ['id' => (int) $payment['id']]);
        Activity::system("Applicant updated refund bank details for idea {$idea['ref']} ({$payment['reference']})");
        Response::json(self::present(self::reload((int) $idea['id'])));
    }

    /** Submit a complete draft once the fee is PAID or a bank transfer is awaiting confirmation. */
    public static function submit(Request $r): void
    {
        RateLimiter::hit('draft-submit:' . $r->ip(), 15, 900);
        $idea = Wallet::ideaByToken((string) ($r->input()['token'] ?? ''));
        if ($idea['status'] !== 'DRAFT') {
            throw new HttpError(409, 'This application has already been submitted.');
        }
        Ideas::assertComplete($idea);
        $payment = Wallet::current((int) $idea['id']);
        $status = Wallet::statusOf($payment);
        if (!in_array($status, ['PAID', 'AWAITING_CONFIRMATION'], true)) {
            throw new HttpError(409, $status === 'PENDING'
                ? "We haven't received confirmation of your online payment yet. Please wait a moment and try again."
                : 'Please pay the ' . Wallet::money(Wallet::feeKobo()) . ' commitment fee before submitting your application.');
        }
        $now = date('Y-m-d H:i:s');
        $changed = Database::run("UPDATE ideas SET status = 'NEW', submitted_at = ?, last_saved_at = ? WHERE id = ? AND status = 'DRAFT'", [$now, $now, (int) $idea['id']])->rowCount();
        if (!$changed) {
            throw new HttpError(409, 'This application has already been submitted.');
        }
        $idea = self::reload((int) $idea['id']);

        $responseTime = SiteContent::get()['ideaForm']['responseTime'] ?? '2 working days';
        Activity::system("Idea {$idea['ref']} submitted" . ($idea['source'] === 'walk_in' ? ' (walk-in)' : '') . ' with commitment fee ' . strtolower(str_replace('_', ' ', $status)));
        Notifier::email('client', $idea['email'], "We received your idea ({$idea['ref']})", "Hi {$idea['name']},\n\nThanks for sharing {$idea['title']} with us. Our team will review it and send you a proposal within {$responseTime}."
            . ($status === 'AWAITING_CONFIRMATION' ? "\n\nWe're still confirming your commitment fee transfer; we'll email your receipt once it's checked." : '')
            . "\n\nCheck its status anytime with your reference {$idea['ref']}.\n\nAI Project Connect");
        Notifier::staff(
            (string) Config::get('notifications.admin_email'),
            "New idea submitted: {$idea['title']}",
            sprintf("%s (%s, %s) · %s · %s%s · Fee: %s", $idea['name'], $idea['state'], $idea['country'], $idea['category'], $idea['budget'], $idea['attachment_file_id'] ? ' · PDF brief attached' : '', $status === 'PAID' ? 'paid' : 'bank transfer to confirm'),
        );
        Response::json(['ref' => $idea['ref'], 'title' => $idea['title'], 'status' => $idea['status'], 'submittedAt' => Presenter::iso($idea['submitted_at']), 'application' => self::present($idea)]);
    }

    /* ---------------- shared with staff walk-ins ---------------- */

    /**
     * @param array<string, mixed> $columns validated idea columns (email required)
     * @return array{0: array, 1: string} idea row and plaintext resume token
     */
    public static function createDraft(array $columns, ?array $attachment, string $source, ?array $staff): array
    {
        if (empty($columns['email'])) {
            throw HttpError::validation(['email' => 'This field is required.']);
        }
        return Database::transaction(static function () use ($columns, $attachment, $source, $staff) {
            if ($attachment) {
                $columns['attachment_file_id'] = Uploads::store($attachment, 'pdf', 'private', $staff ? (int) $staff['id'] : null, 'attachment')['id'];
            }
            $now = date('Y-m-d H:i:s');
            $id = Database::insert('ideas', $columns + [
                'ref' => Codes::ideaRef(),
                'status' => 'DRAFT',
                'source' => $source,
                'created_by_user' => $staff ? (int) $staff['id'] : null,
                'last_saved_at' => $now,
            ]);
            return [self::reload($id), Wallet::issueToken($id)];
        });
    }

    public static function sendResumeEmail(array $idea, string $token, bool $walkIn): void
    {
        $link = Wallet::resumeLink($token);
        $fee = Wallet::money(Wallet::feeKobo());
        $body = $walkIn
            ? "Hi {$idea['name']},\n\nThanks for visiting us! We've started your application" . ($idea['title'] ? " for {$idea['title']}" : '') . ".\n\nFinish it, pay the {$fee} commitment fee and submit it here:\n{$link}\n\nYour reference is {$idea['ref']}. Keep this link private: anyone with it can edit your application.\n\nAI Project Connect"
            : "Hi" . ($idea['name'] ? " {$idea['name']}" : '') . ",\n\nYour application" . ($idea['title'] ? " for {$idea['title']}" : '') . " is saved. Continue where you stopped:\n{$link}\n\nTo submit it you'll need to pay the {$fee} commitment fee. Your reference is {$idea['ref']}. Keep this link private: anyone with it can edit your application.\n\nAI Project Connect";
        Notifier::email('client', $idea['email'], 'Continue your application', $body);
        if ($walkIn && !empty($idea['phone'])) {
            Notifier::sms('client', $idea['phone'], "AI Project Connect: finish your idea application and pay the {$fee} commitment fee from the link we emailed to {$idea['email']}. Ref {$idea['ref']}.");
        }
    }

    /** Applicant view: form fields, completeness, payment, wallet ledger and checkout options. */
    public static function present(array $idea): array
    {
        $attachment = null;
        if (!empty($idea['attachment_file_id'])) {
            $f = Database::one('SELECT original_name, size_bytes FROM files WHERE id = ?', [(int) $idea['attachment_file_id']]);
            $attachment = $f ? ['name' => $f['original_name'], 'size' => (int) $f['size_bytes']] : null;
        }
        $payment = Wallet::current((int) $idea['id']);
        $missing = $idea['status'] === 'DRAFT' ? Ideas::missingFields($idea) : [];
        return [
            'ref' => $idea['ref'],
            'status' => $idea['status'],
            'source' => $idea['source'],
            'fields' => [
                'name' => $idea['name'], 'email' => $idea['email'], 'phone' => $idea['phone'], 'organisation' => $idea['organisation'],
                'country' => $idea['country'], 'state' => $idea['state'], 'title' => $idea['title'], 'category' => $idea['category'],
                'platforms' => $idea['platforms'] !== null ? (json_decode((string) $idea['platforms'], true) ?: []) : [],
                'problem' => $idea['problem'], 'targetUsers' => $idea['target_users'], 'features' => $idea['features'],
                'budget' => $idea['budget'], 'timeline' => $idea['timeline'], 'nda' => (bool) $idea['nda'],
            ],
            'attachment' => $attachment,
            'missingFields' => $missing,
            'complete' => $idea['status'] !== 'DRAFT' || $missing === [],
            'canSubmit' => $idea['status'] === 'DRAFT' && $missing === [] && in_array(Wallet::statusOf($payment), ['PAID', 'AWAITING_CONFIRMATION'], true),
            'createdAt' => Presenter::iso($idea['created_at']),
            'lastSavedAt' => Presenter::iso($idea['last_saved_at']),
            'submittedAt' => Presenter::iso($idea['submitted_at']),
            'payment' => Wallet::payment($payment, 'client'),
            'wallet' => Wallet::ledger($idea),
            'checkout' => Wallet::checkout(),
        ];
    }

    /* ---------------- helpers ---------------- */

    private static function reload(int $id): array
    {
        return Database::one('SELECT * FROM ideas WHERE id = ?', [$id]);
    }

    private static function withDevLink(array $response, string $token): array
    {
        if (Config::get('otp.expose_in_response') && !Config::isProduction()) {
            $response['devLink'] = Wallet::resumeLink($token);
        }
        return $response;
    }

    /** @return array<string, string> */
    private static function refundAccountErrors(?string $name, ?string $number, ?string $bank, bool $required): array
    {
        $errors = [];
        $any = $name || $number || $bank;
        if (!$any && !$required) {
            return [];
        }
        if (!$name) {
            $errors['refundAccountName'] = 'Enter the account name.';
        }
        if (!$number || !preg_match('/^\d{10}$/', $number)) {
            $errors['refundAccountNumber'] = 'Enter the 10-digit account number.';
        }
        if (!$bank) {
            $errors['refundBank'] = 'Enter the bank name.';
        }
        return $errors;
    }
}
