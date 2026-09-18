<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Activity;
use App\Core\Auth;
use App\Core\Config;
use App\Core\Database;
use App\Core\HttpError;
use App\Core\RateLimiter;
use App\Core\Request;
use App\Core\Response;
use App\Core\Validator;
use App\Support\Ideas;
use App\Support\Links;
use App\Support\Paystack;
use App\Support\Presenter;
use App\Support\Wallet;

/** Commitment fee payments: Paystack callback + webhook, and the admin payments & refunds queue. */
final class PaymentsController
{
    /* ---------------- Paystack ---------------- */

    /** Paystack returns the payer here after checkout. Verifies server-side, then sends them back to /apply. */
    public static function paystackCallback(Request $r): void
    {
        $reference = trim((string) ($r->query('reference') ?? $r->query('trxref') ?? ''));
        $payment = null;
        $outcome = 'failed';
        try {
            RateLimiter::hit('pay-callback:' . $r->ip(), 30, 900);
            if ($reference !== '' && strlen($reference) <= 64) {
                $payment = Database::one("SELECT * FROM idea_payments WHERE reference = ? AND method = 'paystack'", [$reference]);
            }
            if ($payment !== null) {
                $outcome = self::verifyPaystack($payment);
            }
        } catch (\Throwable $e) {
            error_log('[paystack callback] ' . $e->getMessage());
            $outcome = $payment !== null ? 'pending' : 'failed';
        }
        $ref = $payment ? (string) Database::value('SELECT ref FROM ideas WHERE id = ?', [(int) $payment['idea_id']]) : null;
        Response::redirect(Links::applyPayment($ref, $outcome, $payment ? $reference : null));
    }

    /** Paystack webhook: HMAC-SHA512 signed, no CSRF header, idempotent. */
    public static function paystackWebhook(Request $r): void
    {
        $raw = $r->rawBody();
        $client = Paystack::client();
        if (!$client->validSignature($raw, $r->header('X-Paystack-Signature'))) {
            RateLimiter::hit('webhook-bad-signature:' . $r->ip(), 30, 900);
            throw HttpError::unauthorized('Invalid signature.');
        }
        $event = json_decode($raw, true);
        if (!is_array($event) || !isset($event['event'])) {
            throw HttpError::badRequest('Invalid event.');
        }
        $data = is_array($event['data'] ?? null) ? $event['data'] : [];

        switch ($event['event']) {
            case 'charge.success':
                $payment = Database::one("SELECT * FROM idea_payments WHERE reference = ? AND method = 'paystack'", [(string) ($data['reference'] ?? '')]);
                if ($payment === null) {
                    break; // not one of ours (e.g. another product on the same Paystack account)
                }
                if ((int) ($data['amount'] ?? -1) !== (int) $payment['amount_kobo'] || strtoupper((string) ($data['currency'] ?? '')) !== $payment['currency']) {
                    Activity::system("Paystack reported {$data['currency']} " . ((int) ($data['amount'] ?? 0) / 100) . " for {$payment['reference']}, which doesn't match the commitment fee. Not marked as paid.");
                    break;
                }
                Wallet::markPaid($payment, null, [
                    'paystack_transaction_id' => isset($data['id']) ? (int) $data['id'] : null,
                    'channel' => isset($data['channel']) ? mb_substr((string) $data['channel'], 0, 40) : null,
                ]);
                break;

            case 'refund.processed':
            case 'refund.failed':
            case 'refund.pending':
                $reference = (string) ($data['transaction_reference'] ?? ($data['transaction']['reference'] ?? ''));
                $payment = Database::one("SELECT * FROM idea_payments WHERE reference = ? AND method = 'paystack'", [$reference]);
                if ($payment === null) {
                    break;
                }
                $refundRef = isset($data['refund_reference']) ? (string) $data['refund_reference'] : (isset($data['id']) ? (string) $data['id'] : null);
                if ($event['event'] === 'refund.processed') {
                    Wallet::markRefunded($payment, null, $refundRef, null);
                } elseif ($event['event'] === 'refund.failed' && $payment['refund_status'] === 'PROCESSING') {
                    Database::update('idea_payments', ['refund_status' => 'PENDING', 'refund_note' => 'Paystack could not process the refund. Try again or refund manually.'], ['id' => (int) $payment['id']]);
                    $ref = Database::value('SELECT ref FROM ideas WHERE id = ?', [(int) $payment['idea_id']]);
                    Activity::system("Paystack refund failed for idea {$ref} ({$payment['reference']})");
                    \App\Core\Notifier::staff((string) Config::get('notifications.admin_email'), "Refund failed: {$ref}", "Paystack could not refund {$payment['reference']}. It's back in the refunds queue.");
                }
                break;
        }
        Response::json(['received' => true]);
    }

    /** @return 'success'|'pending'|'failed' */
    private static function verifyPaystack(array $payment): string
    {
        if ($payment['status'] === 'PAID') {
            return 'success';
        }
        if ($payment['status'] === 'FAILED') {
            return 'failed';
        }
        $result = Paystack::client()->verify((string) $payment['reference'], $payment);
        if ($result['status'] === 'success') {
            if ($result['amount'] !== (int) $payment['amount_kobo'] || strtoupper($result['currency']) !== $payment['currency'] || $result['reference'] !== $payment['reference']) {
                Activity::system("Paystack verification for {$payment['reference']} didn't match the commitment fee. Not marked as paid.");
                return 'failed';
            }
            Wallet::markPaid($payment, null, [
                'paystack_transaction_id' => $result['id'],
                'channel' => $result['channel'] !== null ? mb_substr($result['channel'], 0, 40) : null,
            ]);
            return 'success';
        }
        if ($result['status'] === 'failed' || $result['status'] === 'reversed') {
            Wallet::markFailed($payment, null, $result['gateway_response'] ?: 'The payment was declined.');
            return 'failed';
        }
        return 'pending'; // abandoned / ongoing: the applicant can try again
    }

    /* ---------------- staff: payments & refunds ---------------- */

    public static function index(Request $r): void
    {
        Auth::requireStaff(['admin']);
        $sql = 'SELECT p.*, i.ref AS idea_ref, i.title AS idea_title, i.name AS idea_name, i.email AS idea_email, i.phone AS idea_phone, i.status AS idea_status, i.source AS idea_source
                FROM idea_payments p JOIN ideas i ON i.id = p.idea_id WHERE 1 = 1';
        $params = [];
        if ($status = $r->query('status')) {
            if (!in_array($status, ['PENDING', 'AWAITING_CONFIRMATION', 'PAID', 'FAILED'], true)) {
                throw HttpError::validation(['status' => 'Unknown status.']);
            }
            $sql .= ' AND p.status = :status';
            $params['status'] = $status;
        }
        if ($method = $r->query('method')) {
            if (!in_array($method, ['paystack', 'manual'], true)) {
                throw HttpError::validation(['method' => 'Unknown method.']);
            }
            $sql .= ' AND p.method = :method';
            $params['method'] = $method;
        }
        if ($refund = $r->query('refund')) {
            if ($refund === 'open') {
                $sql .= " AND p.refund_status IN ('PENDING','PROCESSING')";
            } elseif (in_array($refund, ['NONE', 'PENDING', 'PROCESSING', 'REFUNDED'], true)) {
                $sql .= ' AND p.refund_status = :refund';
                $params['refund'] = $refund;
            } else {
                throw HttpError::validation(['refund' => 'Unknown refund status.']);
            }
        }
        if ($q = trim((string) $r->query('q'))) {
            $like = '%' . str_replace(['%', '_'], ['\\%', '\\_'], $q) . '%';
            $sql .= ' AND (p.reference LIKE :q1 OR p.receipt_no LIKE :q2 OR i.ref LIKE :q3 OR i.name LIKE :q4 OR i.email LIKE :q5 OR p.sender_name LIKE :q6)';
            $params += ['q1' => $like, 'q2' => $like, 'q3' => $like, 'q4' => $like, 'q5' => $like, 'q6' => $like];
        }
        $sql .= ' ORDER BY p.created_at DESC, p.id DESC LIMIT 500';

        $items = array_map(static fn (array $p) => self::item($p), Database::all($sql, $params));
        $counts = Database::one(
            "SELECT SUM(status = 'AWAITING_CONFIRMATION') AS awaiting, SUM(status = 'PAID' AND refund_status = 'PENDING') AS refunds_pending,
                    SUM(status = 'PAID' AND refund_status = 'PROCESSING') AS refunds_processing, SUM(status = 'PAID') AS paid,
                    SUM(CASE WHEN status = 'PAID' AND refund_status <> 'REFUNDED' THEN amount_kobo ELSE 0 END) AS collected_kobo
             FROM idea_payments",
        );
        Response::json([
            'items' => $items,
            'counts' => [
                'awaitingConfirmation' => (int) $counts['awaiting'],
                'refundsPending' => (int) $counts['refunds_pending'],
                'refundsProcessing' => (int) $counts['refunds_processing'],
                'paid' => (int) $counts['paid'],
                'collected' => (int) $counts['collected_kobo'] / 100,
            ],
        ]);
    }

    /** Admin confirms a bank transfer (also allowed after "not received" if the money turns up). */
    public static function confirm(Request $r): void
    {
        $user = Auth::requireStaff(['admin']);
        $payment = Wallet::find((int) $r->params['id']);
        if ($payment['method'] !== 'manual') {
            throw new HttpError(409, 'Online payments are confirmed automatically by Paystack.');
        }
        if ($payment['status'] === 'PAID') {
            throw new HttpError(409, 'This payment is already confirmed.');
        }
        if (!in_array($payment['status'], ['AWAITING_CONFIRMATION', 'FAILED'], true)) {
            throw new HttpError(409, 'Only bank transfers waiting for confirmation can be confirmed.');
        }
        $data = Validator::validate($r->input(), ['note' => 'nullable|string|max:500']);
        Wallet::markPaid($payment, $user, !empty($data['note']) ? ['note' => $data['note']] : []);
        Response::json(self::item(Wallet::find((int) $payment['id'])));
    }

    /** Admin couldn't find the transfer: FAILED with a reason; the applicant can try again. */
    public static function reject(Request $r): void
    {
        $user = Auth::requireStaff(['admin']);
        $payment = Wallet::find((int) $r->params['id']);
        $data = Validator::validate($r->input(), ['reason' => 'required|string|min:3|max:500']);
        if ($payment['method'] !== 'manual' || $payment['status'] !== 'AWAITING_CONFIRMATION') {
            throw new HttpError(409, 'Only bank transfers waiting for confirmation can be marked as not received.');
        }
        Wallet::markFailed($payment, $user, $data['reason']);
        Response::json(self::item(Wallet::find((int) $payment['id'])));
    }

    /** Cash or transfer received at the centre: a manual payment created and confirmed in one step. */
    public static function recordAtCentre(Request $r): void
    {
        $user = Auth::requireStaff(['admin']);
        $idea = IdeasController::find((int) $r->params['id']);
        Wallet::assertCanPay($idea);
        $data = Validator::validate($r->input(), [
            'amount' => 'nullable|number|between:1,100000000',
            'senderName' => 'nullable|string|max:120',
            'note' => 'nullable|string|max:500',
            'refundAccountName' => 'nullable|string|max:120',
            'refundAccountNumber' => 'nullable|string|max:20',
            'refundBank' => 'nullable|string|max:120',
        ]);
        $fee = Wallet::feeKobo();
        if (isset($data['amount']) && (int) round($data['amount'] * 100) < $fee) {
            throw HttpError::validation(['amount' => 'The commitment fee is ' . Wallet::money($fee) . '.']);
        }
        if (!empty($data['refundAccountNumber']) && !preg_match('/^\d{10}$/', $data['refundAccountNumber'])) {
            throw HttpError::validation(['refundAccountNumber' => 'Enter the 10-digit account number.']);
        }
        $paymentId = Database::insert('idea_payments', [
            'idea_id' => (int) $idea['id'], 'method' => 'manual', 'status' => 'AWAITING_CONFIRMATION',
            'amount_kobo' => $fee, 'currency' => Wallet::currency(), 'reference' => Wallet::newReference($idea['ref']),
            'sender_name' => $data['senderName'] ?? $idea['name'], 'claimed_amount_kobo' => isset($data['amount']) ? (int) round($data['amount'] * 100) : $fee,
            'transfer_date' => date('Y-m-d'), 'note' => 'Paid at centre', 'created_by_user' => (int) $user['id'],
            'refund_account_name' => $data['refundAccountName'] ?? null, 'refund_account_number' => $data['refundAccountNumber'] ?? null, 'refund_bank' => $data['refundBank'] ?? null,
        ]);
        Activity::staff($user, "Recorded a commitment fee paid at the centre for idea {$idea['ref']}" . (!empty($data['note']) ? ": {$data['note']}" : ''));
        Wallet::markPaid(Wallet::find($paymentId), $user);
        Response::json(self::item(Wallet::find($paymentId)), 201);
    }

    /**
     * Sends a queued refund. Paystack: starts a refund through the API (PROCESSING until the refund.processed webhook
     * or "mark refunded"). Manual: admin has already sent the money and records the reference (REFUNDED).
     */
    public static function refund(Request $r): void
    {
        $user = Auth::requireStaff(['admin']);
        $payment = Wallet::find((int) $r->params['id']);
        $data = Validator::validate($r->input(), [
            'reference' => 'nullable|string|max:100',
            'note' => 'nullable|string|max:500',
        ]);
        if ($payment['status'] !== 'PAID' || $payment['refund_status'] !== 'PENDING') {
            throw new HttpError(409, $payment['refund_status'] === 'NONE' ? 'There is no refund queued for this payment. Decline the idea to queue one.' : 'This refund has already been started.');
        }
        $ref = Database::value('SELECT ref FROM ideas WHERE id = ?', [(int) $payment['idea_id']]);

        if ($payment['method'] === 'paystack') {
            $result = Paystack::client()->refund((string) $payment['reference']);
            Database::run(
                "UPDATE idea_payments SET refund_status = 'PROCESSING', refund_reference = ?, refund_note = COALESCE(?, refund_note), refunded_by = ? WHERE id = ? AND refund_status = 'PENDING'",
                [$result['id'], $data['note'] ?? null, (int) $user['id'], (int) $payment['id']],
            );
            Activity::staff($user, "Started a Paystack refund for idea {$ref} ({$payment['reference']})");
        } else {
            if (empty($data['reference'])) {
                throw HttpError::validation(['reference' => 'Enter the transfer reference of the refund you sent.']);
            }
            Wallet::markRefunded($payment, $user, $data['reference'], $data['note'] ?? null);
        }
        Response::json(self::item(Wallet::find((int) $payment['id'])));
    }

    /** Marks a refund as done (e.g. a Paystack refund when the webhook didn't arrive, or one sent outside the panel). */
    public static function completeRefund(Request $r): void
    {
        $user = Auth::requireStaff(['admin']);
        $payment = Wallet::find((int) $r->params['id']);
        $data = Validator::validate($r->input(), [
            'reference' => 'nullable|string|max:100',
            'note' => 'nullable|string|max:500',
        ]);
        if ($payment['refund_status'] === 'REFUNDED') {
            throw new HttpError(409, 'This payment is already refunded.');
        }
        if ($payment['status'] !== 'PAID' || !in_array($payment['refund_status'], ['PENDING', 'PROCESSING'], true)) {
            throw new HttpError(409, 'There is no refund queued for this payment.');
        }
        if ($payment['method'] === 'manual' && empty($data['reference'])) {
            throw HttpError::validation(['reference' => 'Enter the transfer reference of the refund you sent.']);
        }
        Wallet::markRefunded($payment, $user, $data['reference'] ?? null, $data['note'] ?? null);
        Response::json(self::item(Wallet::find((int) $payment['id'])));
    }

    /** Walk-in: admin starts an application for a visitor; the client finishes and pays from the emailed link. */
    public static function startWalkIn(Request $r): void
    {
        $user = Auth::requireStaff(['admin']);
        $input = $r->input();
        Validator::validate($input, ['name' => 'required|string|min:2|max:120', 'email' => 'required|email|max:190']);
        $columns = Ideas::validateFields($input, false);
        [$idea, $token] = ApplicationsController::createDraft($columns, $r->file('attachment'), 'walk_in', $user);
        Activity::staff($user, "Started a walk-in application {$idea['ref']} for {$idea['name']}");
        ApplicationsController::sendResumeEmail($idea, $token, true);

        $response = ['idea' => Presenter::idea(IdeasController::find((int) $idea['id'])), 'sentTo' => Presenter::maskEmail($idea['email'])];
        if (Config::get('otp.expose_in_response') && !Config::isProduction()) {
            $response['devLink'] = Wallet::resumeLink($token);
        }
        Response::json($response, 201);
    }

    /**
     * Sends the client a fresh "continue your application" link for a draft.
     * Staff can't read the old one (only its hash is stored), so this issues a new token.
     */
    public static function resendResumeLink(Request $r): void
    {
        $user = Auth::requireStaff(['admin']);
        $idea = IdeasController::find((int) $r->params['id']);
        if ($idea['status'] !== 'DRAFT') {
            throw new HttpError(409, 'This application has already been submitted, so there is nothing to continue.');
        }
        // Limited per application, not per IP: a whole office shares one address.
        RateLimiter::hit('resume-link:idea:' . $idea['id'], 5, 3600);

        $token = Wallet::issueToken((int) $idea['id']);
        ApplicationsController::sendResumeEmail($idea, $token, $idea['source'] === 'walk_in', true);
        Activity::staff($user, "Sent {$idea['email']} a new link to continue application {$idea['ref']}");

        $response = ['sentTo' => Presenter::maskEmail((string) $idea['email']), 'idea' => Presenter::idea(IdeasController::find((int) $idea['id']))];
        if (Config::get('otp.expose_in_response') && !Config::isProduction()) {
            $response['devLink'] = Wallet::resumeLink($token);
        }
        Response::json($response);
    }

    private static function item(array $p): array
    {
        if (!isset($p['idea_ref'])) {
            $idea = Database::one('SELECT ref, title, name, email, phone, status, source FROM ideas WHERE id = ?', [(int) $p['idea_id']]);
            foreach ($idea as $k => $v) {
                $p['idea_' . $k] = $v;
            }
        }
        return Wallet::payment($p, 'staff') + [
            'idea' => [
                'id' => (int) $p['idea_id'], 'ref' => $p['idea_ref'], 'title' => $p['idea_title'], 'name' => $p['idea_name'],
                'email' => $p['idea_email'], 'phone' => $p['idea_phone'], 'status' => $p['idea_status'], 'source' => $p['idea_source'],
            ],
        ];
    }
}
