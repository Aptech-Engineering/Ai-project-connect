<?php

declare(strict_types=1);

namespace App\Support;

use App\Core\Activity;
use App\Core\Database;
use App\Core\Notifier;

/**
 * The scholarship form fee, paid online. The commitment fee has Wallet; this is the
 * same shape for a different thing, kept apart so neither can settle the other.
 */
final class ScholarshipPayments
{
    /**
     * Asks Paystack what happened and records it. Safe to call twice: a fee that is
     * already paid stays paid and the applicant is not emailed again.
     *
     * @return 'success'|'failed'|'pending'
     */
    public static function verify(array $applicant): string
    {
        if ($applicant['status'] === 'PAID') {
            return 'success';
        }
        $result = Paystack::client()->verify((string) $applicant['reference'], [
            'amount_kobo' => (int) $applicant['amount_kobo'],
            'currency' => $applicant['currency'],
            'reference' => $applicant['reference'],
        ]);

        if ($result['status'] === 'success') {
            if ($result['amount'] !== (int) $applicant['amount_kobo']
                || strtoupper((string) $result['currency']) !== strtoupper((string) $applicant['currency'])
                || $result['reference'] !== $applicant['reference']) {
                Activity::system("Paystack verification for {$applicant['reference']} didn't match the scholarship fee. Not marked as paid.");
                return 'failed';
            }
            self::markPaid($applicant, $result);
            return 'success';
        }
        if ($result['status'] === 'failed' || $result['status'] === 'reversed') {
            Database::update('scholarship_applicants', [
                'status' => 'FAILED',
                'failure_reason' => mb_substr((string) ($result['gateway_response'] ?: 'The payment was declined.'), 0, 255),
            ], ['id' => (int) $applicant['id']]);
            return 'failed';
        }
        return 'pending'; // abandoned or still going: they can try again
    }

    public static function markPaid(array $applicant, array $result = []): void
    {
        Database::update('scholarship_applicants', [
            'status' => 'PAID',
            'paid_at' => date('Y-m-d H:i:s'),
            'failure_reason' => null,
            'paystack_transaction_id' => $result['id'] ?? null,
            'channel' => isset($result['channel']) && $result['channel'] !== null ? mb_substr((string) $result['channel'], 0, 40) : null,
        ], ['id' => (int) $applicant['id']]);

        $fresh = Database::one('SELECT * FROM scholarship_applicants WHERE id = ?', [(int) $applicant['id']]);
        Activity::system("Scholarship form fee paid: {$fresh['ref']} ({$fresh['full_name']})");
        Notifier::email(
            'lead',
            $fresh['email'],
            'Your scholarship form is ready',
            "Hi {$fresh['full_name']},\n\nWe have received your scholarship form fee. Reference {$fresh['ref']}.\n\n"
            . "Download your application form and see your exam details here:\n" . Scholarship::statusLink($fresh)
            . "\n\nWe will email you again once your exam batch is set.\n\nAPTECH Computer Education & AI Projects LTD",
        );
        Notifier::email(
            'lead',
            (string) \App\Core\Config::get('notifications.admin_email'),
            "Scholarship fee paid: {$fresh['full_name']}",
            "{$fresh['full_name']} ({$fresh['email']}) paid the scholarship form fee.\nReference: {$fresh['ref']}\n\nPlace them in an exam batch in the Engineering Panel under Our programmes → Scholarship.",
        );
    }

    /** Where Paystack sends the payer back to: their own status page. */
    public static function returnLink(array $applicant, string $outcome): string
    {
        return Links::page('scholarship/status', [
            'ref' => $applicant['ref'],
            'token' => $applicant['token'],
            'payment' => $outcome,
        ]);
    }
}
