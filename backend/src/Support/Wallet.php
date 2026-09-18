<?php

declare(strict_types=1);

namespace App\Support;

use App\Core\Activity;
use App\Core\Config;
use App\Core\Database;
use App\Core\HttpError;
use App\Core\Notifier;
use App\Core\Settings;
use App\Core\Uploads;

/**
 * Commitment fee wallet: resume links, payment state changes, refunds, receipts and the ledger JSON.
 *
 * Payment status: PENDING (Paystack initialised) | AWAITING_CONFIRMATION (manual claim) | PAID | FAILED.
 * An idea with no usable payment is reported as UNPAID. Refund status: NONE | PENDING | PROCESSING | REFUNDED.
 */
final class Wallet
{
    /** Ranking used to pick the payment that counts for an idea (history is kept). */
    private const CURRENT_ORDER = "CASE
        WHEN status = 'PAID' AND refund_status = 'NONE' THEN 1
        WHEN status = 'PAID' AND refund_status = 'PENDING' THEN 2
        WHEN status = 'AWAITING_CONFIRMATION' THEN 3
        WHEN status = 'PENDING' THEN 4
        WHEN status = 'PAID' THEN 5
        ELSE 6 END, id DESC";

    /* ---------------- fee settings ---------------- */

    /** Client-facing wording from the website content document (admin-editable). */
    public static function wording(): array
    {
        return SiteContent::get()['payments'] ?? [];
    }

    /** Fee, currency, methods and bank details come from admin settings (Settings → Payments). */
    public static function feeKobo(): int
    {
        return (int) round((float) Settings::get('payments.commitmentFee', 2000) * 100);
    }

    public static function currency(): string
    {
        return strtoupper((string) Settings::get('payments.currency', 'NGN'));
    }

    public static function methodEnabled(string $method): bool
    {
        return (bool) Settings::get($method === 'paystack' ? 'payments.paystackEnabled' : 'payments.manualEnabled', true);
    }

    public static function confirmationTime(): string
    {
        return (string) (self::wording()['confirmationTime'] ?? '1 working day');
    }

    public static function money(int $kobo, string $currency = 'NGN'): string
    {
        $symbol = $currency === 'NGN' ? "\u{20A6}" : $currency . ' ';
        return $symbol . number_format($kobo / 100, $kobo % 100 === 0 ? 0 : 2);
    }

    public static function frontendUrl(): string
    {
        return Links::frontend();
    }

    /* ---------------- resume links ---------------- */

    public static function issueToken(int $ideaId): string
    {
        $token = bin2hex(random_bytes(32));
        Database::insert('idea_resume_tokens', ['idea_id' => $ideaId, 'token_hash' => hash('sha256', $token)]);
        return $token;
    }

    public static function resumeLink(string $token): string
    {
        return Links::resume($token);
    }

    /** @return array<string, mixed> the idea for a resume token (404 if unknown) */
    public static function ideaByToken(string $token): array
    {
        $token = trim($token);
        if (strlen($token) < 32 || strlen($token) > 128) {
            throw HttpError::notFound('This application link is invalid. Enter your email to get a new one.');
        }
        $row = Database::one('SELECT t.id AS token_id, i.* FROM idea_resume_tokens t JOIN ideas i ON i.id = t.idea_id WHERE t.token_hash = ?', [hash('sha256', $token)]);
        if ($row === null) {
            throw HttpError::notFound('This application link is invalid. Enter your email to get a new one.');
        }
        Database::update('idea_resume_tokens', ['last_used_at' => date('Y-m-d H:i:s')], ['id' => (int) $row['token_id']]);
        unset($row['token_id']);
        return $row;
    }

    /* ---------------- reading payments ---------------- */

    public static function current(int $ideaId): ?array
    {
        return Database::one('SELECT * FROM idea_payments WHERE idea_id = ? ORDER BY ' . self::CURRENT_ORDER . ' LIMIT 1', [$ideaId]);
    }

    /** @return list<array<string, mixed>> oldest first */
    public static function history(int $ideaId): array
    {
        return Database::all('SELECT * FROM idea_payments WHERE idea_id = ? ORDER BY id', [$ideaId]);
    }

    public static function find(int $paymentId): array
    {
        $payment = Database::one('SELECT * FROM idea_payments WHERE id = ?', [$paymentId]);
        if ($payment === null) {
            throw HttpError::notFound('Payment not found.');
        }
        return $payment;
    }

    /** Fee counts as paid (a queued refund can still be cancelled by reopening the idea). */
    public static function isPaid(?array $payment): bool
    {
        return $payment !== null && $payment['status'] === 'PAID' && in_array($payment['refund_status'], ['NONE', 'PENDING'], true);
    }

    public static function statusOf(?array $payment): string
    {
        if ($payment === null || ($payment['status'] === 'PAID' && !self::isPaid($payment))) {
            return 'UNPAID';
        }
        return (string) $payment['status'];
    }

    /** 409 unless the idea's commitment fee is PAID. */
    public static function assertPaid(array $idea, string $action): void
    {
        $payment = self::current((int) $idea['id']);
        if (self::isPaid($payment)) {
            return;
        }
        $message = match (self::statusOf($payment)) {
            'AWAITING_CONFIRMATION' => "The client says they've paid the commitment fee by bank transfer. Confirm the payment in Payments before {$action}.",
            'PENDING' => "The client's online payment for the commitment fee hasn't completed yet. Wait for it to be confirmed before {$action}.",
            default => "The commitment fee for this idea hasn't been paid. It must be paid before {$action}.",
        };
        throw new HttpError(409, $message);
    }

    /** Throws unless a new payment may be started for the idea. */
    public static function assertCanPay(array $idea): void
    {
        if (in_array($idea['status'], ['ACCEPTED', 'DECLINED'], true)) {
            throw new HttpError(409, 'This application is closed, so no payment is needed.');
        }
        $payment = self::current((int) $idea['id']);
        if (self::isPaid($payment)) {
            throw new HttpError(409, 'Your commitment fee is already paid.');
        }
        if ($payment !== null && $payment['status'] === 'AWAITING_CONFIRMATION') {
            throw new HttpError(409, "We're still confirming your bank transfer. We'll email you as soon as it's checked.");
        }
    }

    /* ---------------- creating payments ---------------- */

    public static function newReference(string $ideaRef): string
    {
        do {
            $reference = 'FEE-' . $ideaRef . '-' . Codes::random(6);
        } while (Database::value('SELECT 1 FROM idea_payments WHERE reference = ?', [$reference]));
        return $reference;
    }

    private static function receiptNo(): string
    {
        do {
            $no = 'RCPT-' . date('ym') . '-' . Codes::random(5);
        } while (Database::value('SELECT 1 FROM idea_payments WHERE receipt_no = ?', [$no]));
        return $no;
    }

    /**
     * Marks a payment PAID exactly once (webhook, callback and admin confirmation can race).
     * Queues a refund if the idea was already declined or the fee was paid twice.
     * @param array|null $staff admin confirming a manual payment; null for Paystack
     * @return bool true if this call changed the payment
     */
    public static function markPaid(array $payment, ?array $staff, array $extra = []): bool
    {
        $now = date('Y-m-d H:i:s');
        $changed = Database::transaction(static function () use ($payment, $staff, $extra, $now): bool {
            $locked = Database::one('SELECT * FROM idea_payments WHERE id = ? FOR UPDATE', [(int) $payment['id']]);
            if ($locked === null || $locked['status'] === 'PAID') {
                return false;
            }
            Database::update('idea_payments', $extra + [
                'status' => 'PAID',
                'receipt_no' => self::receiptNo(),
                'paid_at' => $now,
                'confirmed_by' => $staff ? (int) $staff['id'] : null,
                'confirmed_at' => $now,
                'failure_reason' => null,
            ], ['id' => (int) $payment['id']]);
            return true;
        });
        if (!$changed) {
            return false;
        }

        $payment = self::find((int) $payment['id']);
        $idea = Database::one('SELECT * FROM ideas WHERE id = ?', [(int) $payment['idea_id']]);
        $amount = self::money((int) $payment['amount_kobo'], (string) $payment['currency']);
        $how = $payment['method'] === 'paystack' ? 'online with Paystack' : ($payment['note'] === 'Paid at centre' ? 'at the centre' : 'by bank transfer');
        $label = $idea['title'] ?: 'your idea';

        if ($staff) {
            Activity::staff($staff, "Confirmed the {$amount} commitment fee for idea {$idea['ref']} ({$payment['reference']}, {$payment['receipt_no']})");
        } else {
            Activity::system("Commitment fee {$amount} paid {$how} for idea {$idea['ref']} ({$payment['reference']}, {$payment['receipt_no']})");
        }
        Notifier::client($idea, "Payment received: receipt {$payment['receipt_no']}", sprintf(
            "Hi %s,\n\nWe've received your %s commitment fee for %s, paid %s.\n\nReceipt: %s\nPayment reference: %s\nIdea reference: %s\nDate: %s\n\n%s\n\nAI Project Connect",
            $idea['name'] ?: 'there',
            $amount,
            $label,
            $how,
            $payment['receipt_no'],
            $payment['reference'],
            $idea['ref'],
            date('j M Y, g:ia', (int) strtotime((string) $payment['paid_at'])),
            $idea['status'] === 'DRAFT' ? 'You can now submit your application from your application link.' : 'Keep this email as your receipt. The fee is not deducted from your project price.',
        ), null);

        // Paid twice (e.g. transfer + card), or the idea was declined while the payment was being confirmed.
        $other = Database::one(
            "SELECT id FROM idea_payments WHERE idea_id = ? AND id <> ? AND status = 'PAID' AND refund_status IN ('NONE','PENDING') LIMIT 1",
            [(int) $idea['id'], (int) $payment['id']],
        );
        if ($other !== null) {
            self::queueRefund($payment, $idea, 'Duplicate payment: the commitment fee was already paid.');
        } elseif ($idea['status'] === 'DECLINED') {
            self::queueRefund($payment, $idea, 'The idea was declined.');
        }
        return true;
    }

    public static function markFailed(array $payment, ?array $staff, string $reason): void
    {
        $changed = Database::run(
            "UPDATE idea_payments SET status = 'FAILED', failure_reason = ?, confirmed_by = ?, confirmed_at = ? WHERE id = ? AND status IN ('PENDING','AWAITING_CONFIRMATION')",
            [mb_substr($reason, 0, 500), $staff ? (int) $staff['id'] : null, $staff ? date('Y-m-d H:i:s') : null, (int) $payment['id']],
        )->rowCount();
        if (!$changed) {
            return;
        }
        $idea = Database::one('SELECT * FROM ideas WHERE id = ?', [(int) $payment['idea_id']]);
        if ($staff) {
            Activity::staff($staff, "Marked the commitment fee transfer for idea {$idea['ref']} as not received ({$payment['reference']}): {$reason}");
        } else {
            Activity::system("Commitment fee payment failed for idea {$idea['ref']} ({$payment['reference']}): {$reason}");
        }
        if ($payment['method'] !== 'manual') {
            return; // abandoned or declined card payments: the applicant sees it on the page and can retry
        }
        $link = self::resumeLink(self::issueToken((int) $idea['id']));
        Notifier::client($idea, "We couldn't confirm your payment ({$idea['ref']})", sprintf(
            "Hi %s,\n\nWe couldn't find your %s commitment fee transfer (reference %s).\n\nReason: %s\n\nPlease check the details and try again, or pay online, from your application:\n%s\n\nAI Project Connect",
            $idea['name'] ?: 'there',
            self::money((int) $payment['amount_kobo'], (string) $payment['currency']),
            $payment['reference'],
            $reason,
            $link,
        ), null);
    }

    /* ---------------- refunds ---------------- */

    public static function queueRefund(array $payment, array $idea, string $reason): void
    {
        $changed = Database::run(
            "UPDATE idea_payments SET refund_status = 'PENDING', refund_note = ?, refund_queued_at = ? WHERE id = ? AND status = 'PAID' AND refund_status = 'NONE'",
            [mb_substr($reason, 0, 500), date('Y-m-d H:i:s'), (int) $payment['id']],
        )->rowCount();
        if (!$changed) {
            return;
        }
        $amount = self::money((int) $payment['amount_kobo'], (string) $payment['currency']);
        Activity::system("Refund of the {$amount} commitment fee queued for idea {$idea['ref']} ({$payment['reference']}): {$reason}");
        $where = $payment['method'] === 'paystack'
            ? 'It will go back to the card or account you paid with.'
            : (!empty($payment['refund_account_number'])
                ? "It will be sent to {$payment['refund_account_name']}, {$payment['refund_bank']} ({$payment['refund_account_number']})."
                : 'Please add the bank account we should refund to from your application link, or reply to this email with it.');
        Notifier::client($idea, "Your commitment fee refund is on its way ({$idea['ref']})", sprintf(
            "Hi %s,\n\nWe're refunding your %s commitment fee for %s (payment reference %s). %s\n\nRefunds usually arrive within 5 to 10 working days. We'll email you when it's done.\n\nAI Project Connect",
            $idea['name'] ?: 'there',
            $amount,
            $idea['title'] ?: $idea['ref'],
            $payment['reference'],
            $where,
        ), null);
        Notifier::staff((string) Config::get('notifications.admin_email'), "Refund to process: {$idea['ref']}", "Refund the {$amount} commitment fee ({$payment['method']}, {$payment['reference']}) for {$idea['name']} — {$reason}");
    }

    /** Idea reopened after being declined: cancel a refund nobody has started. */
    public static function cancelQueuedRefund(array $idea, array $staff): void
    {
        $payment = Database::one("SELECT * FROM idea_payments WHERE idea_id = ? AND status = 'PAID' AND refund_status = 'PENDING' AND refund_note = 'The idea was declined.' LIMIT 1", [(int) $idea['id']]);
        if ($payment === null) {
            return;
        }
        Database::update('idea_payments', ['refund_status' => 'NONE', 'refund_note' => null, 'refund_queued_at' => null], ['id' => (int) $payment['id']]);
        Activity::staff($staff, "Cancelled the queued commitment fee refund for idea {$idea['ref']} (idea reopened)");
    }

    public static function markRefunded(array $payment, ?array $staff, ?string $reference, ?string $note): bool
    {
        $changed = Database::run(
            "UPDATE idea_payments SET refund_status = 'REFUNDED', refund_reference = COALESCE(?, refund_reference), refund_note = COALESCE(?, refund_note), refunded_by = COALESCE(?, refunded_by), refunded_at = ?
             WHERE id = ? AND status = 'PAID' AND refund_status IN ('PENDING','PROCESSING')",
            [$reference, $note, $staff ? (int) $staff['id'] : null, date('Y-m-d H:i:s'), (int) $payment['id']],
        )->rowCount();
        if (!$changed) {
            return false;
        }
        $payment = self::find((int) $payment['id']);
        $idea = Database::one('SELECT * FROM ideas WHERE id = ?', [(int) $payment['idea_id']]);
        $amount = self::money((int) $payment['amount_kobo'], (string) $payment['currency']);
        $action = "Refunded the {$amount} commitment fee for idea {$idea['ref']} ({$payment['reference']}" . ($payment['refund_reference'] ? ", refund {$payment['refund_reference']}" : '') . ')';
        $staff ? Activity::staff($staff, $action) : Activity::system($action);
        Notifier::client($idea, "Your commitment fee has been refunded ({$idea['ref']})", sprintf(
            "Hi %s,\n\nWe've refunded your %s commitment fee for %s.\n\nPayment reference: %s\n%s%s\nDepending on your bank it can take a few working days to show.\n\nAI Project Connect",
            $idea['name'] ?: 'there',
            $amount,
            $idea['title'] ?: $idea['ref'],
            $payment['reference'],
            $payment['refund_reference'] ? "Refund reference: {$payment['refund_reference']}\n" : '',
            $payment['refund_note'] && $staff ? "Note: {$payment['refund_note']}\n" : '',
        ), null);
        return true;
    }

    /* ---------------- JSON ---------------- */

    /** @param 'staff'|'client' $audience */
    public static function payment(?array $p, string $audience): array
    {
        if ($p === null) {
            return [
                'id' => null, 'status' => 'UNPAID', 'method' => null, 'amount' => self::feeKobo() / 100, 'amountKobo' => self::feeKobo(),
                'currency' => self::currency(), 'reference' => null, 'receiptNo' => null, 'paidAt' => null, 'createdAt' => null,
                'failureReason' => null, 'manual' => null, 'refundAccount' => null,
                'refund' => ['status' => 'NONE', 'reference' => null, 'note' => null, 'queuedAt' => null, 'at' => null],
            ];
        }
        $proof = null;
        if (!empty($p['proof_file_id'])) {
            $f = Database::one('SELECT public_id, original_name, size_bytes, mime_type FROM files WHERE id = ?', [(int) $p['proof_file_id']]);
            if ($f) {
                $proof = ['name' => $f['original_name'], 'size' => (int) $f['size_bytes'], 'type' => $f['mime_type']];
                if ($audience === 'staff') {
                    $proof['url'] = '/api/staff/files/' . $f['public_id'];
                }
            }
        }
        $data = [
            'id' => $audience === 'staff' ? (int) $p['id'] : null,
            'status' => (string) $p['status'],
            'method' => $p['method'],
            'amount' => (int) $p['amount_kobo'] / 100,
            'amountKobo' => (int) $p['amount_kobo'],
            'currency' => $p['currency'],
            'reference' => $p['reference'],
            'receiptNo' => $p['receipt_no'],
            'paidAt' => Presenter::iso($p['paid_at']),
            'createdAt' => Presenter::iso($p['created_at']),
            'failureReason' => $p['failure_reason'],
            'manual' => $p['method'] === 'manual' ? [
                'senderName' => $p['sender_name'],
                'senderBank' => $p['sender_bank'],
                'amountClaimed' => $p['claimed_amount_kobo'] !== null ? (int) $p['claimed_amount_kobo'] / 100 : null,
                'transferDate' => $p['transfer_date'],
                'note' => $p['note'],
                'proof' => $proof,
            ] : null,
            'refundAccount' => $p['refund_account_number'] ? [
                'accountName' => $p['refund_account_name'],
                'accountNumber' => $p['refund_account_number'],
                'bankName' => $p['refund_bank'],
            ] : null,
            'refund' => [
                'status' => $p['refund_status'],
                'reference' => $p['refund_reference'],
                'note' => $p['refund_note'],
                'queuedAt' => Presenter::iso($p['refund_queued_at']),
                'at' => Presenter::iso($p['refunded_at']),
            ],
        ];
        if ($audience === 'staff') {
            $names = [];
            foreach (['confirmed_by', 'refunded_by', 'created_by_user'] as $col) {
                $names[$col] = $p[$col] ? Database::value('SELECT name FROM users WHERE id = ?', [(int) $p[$col]]) : null;
            }
            $data += [
                'confirmedBy' => $names['confirmed_by'],
                'confirmedAt' => Presenter::iso($p['confirmed_at']),
                'refundedBy' => $names['refunded_by'],
                'recordedBy' => $names['created_by_user'],
                'paystackTransactionId' => $p['paystack_transaction_id'] !== null ? (int) $p['paystack_transaction_id'] : null,
                'channel' => $p['channel'],
            ];
        } else {
            unset($data['id']);
        }
        return $data;
    }

    /**
     * Client-facing ledger: the fee, each payment attempt and any refund.
     * @return list<array{type:string, label:string, amount:float, currency:string, status:string, reference:?string, at:?string}>
     */
    public static function ledger(array $idea): array
    {
        $history = self::history((int) $idea['id']);
        $current = self::current((int) $idea['id']);
        $feeKobo = $current !== null ? (int) $current['amount_kobo'] : self::feeKobo();
        $entries = [[
            'type' => 'fee',
            'label' => 'Commitment fee (non-credit)',
            'amount' => $feeKobo / 100,
            'currency' => $current['currency'] ?? self::currency(),
            'status' => self::isPaid($current) ? 'PAID' : self::statusOf($current),
            'reference' => $idea['ref'],
            'at' => Presenter::iso($idea['created_at']),
        ]];
        foreach ($history as $p) {
            // Abandoned card checkouts only clutter the wallet; show a pending one only while it is the current attempt.
            if ($p['status'] === 'PENDING' && ($current === null || (int) $current['id'] !== (int) $p['id'])) {
                continue;
            }
            $entries[] = [
                'type' => 'payment',
                'label' => $p['method'] === 'paystack' ? 'Paid online (Paystack)' : ($p['note'] === 'Paid at centre' ? 'Paid at the centre' : 'Bank transfer'),
                'amount' => (int) $p['amount_kobo'] / 100,
                'currency' => $p['currency'],
                'status' => $p['status'],
                'method' => $p['method'],
                'reference' => $p['reference'],
                'receiptNo' => $p['receipt_no'],
                'note' => $p['status'] === 'FAILED' ? $p['failure_reason'] : null,
                'at' => Presenter::iso($p['paid_at'] ?? $p['created_at']),
            ];
            if ($p['refund_status'] !== 'NONE') {
                $entries[] = [
                    'type' => 'refund',
                    'label' => 'Refund of commitment fee',
                    'amount' => (int) $p['amount_kobo'] / 100,
                    'currency' => $p['currency'],
                    'status' => $p['refund_status'],
                    'method' => $p['method'],
                    'reference' => $p['refund_reference'],
                    'receiptNo' => null,
                    'note' => $p['refund_note'],
                    'at' => Presenter::iso($p['refunded_at'] ?? $p['refund_queued_at']),
                ];
            }
        }
        return $entries;
    }

    /** Wallet for a client portal project created from an idea (null for walk-in registrations without one). */
    public static function ledgerForProject(int $projectId): ?array
    {
        $idea = Database::one('SELECT * FROM ideas WHERE project_id = ? ORDER BY id LIMIT 1', [$projectId]);
        return $idea ? self::ledger($idea) : null;
    }

    /** Amounts, methods and bank details (settings) plus the wording (website content) for the payment step. */
    public static function checkout(): array
    {
        $w = self::wording();
        return [
            'fee' => self::feeKobo() / 100,
            'feeKobo' => self::feeKobo(),
            'currency' => self::currency(),
            'feeTitle' => $w['feeTitle'] ?? 'Commitment fee',
            'feeExplainer' => $w['feeExplainer'] ?? '',
            'confirmationTime' => self::confirmationTime(),
            'paystack' => ['enabled' => self::methodEnabled('paystack'), 'publicKey' => Paystack::publicKey(), 'mode' => Paystack::mode()],
            'manual' => [
                'enabled' => self::methodEnabled('manual'),
                'bankName' => (string) Settings::get('payments.bankName', ''),
                'accountName' => (string) Settings::get('payments.accountName', ''),
                'accountNumber' => (string) Settings::get('payments.accountNumber', ''),
                'transferInstructions' => $w['transferInstructions'] ?? '',
            ],
        ];
    }

    /** Stores an optional proof of transfer. */
    public static function storeProof(?array $upload): ?int
    {
        return $upload ? Uploads::store($upload, 'proof', 'private', null, 'proof')['id'] : null;
    }
}
