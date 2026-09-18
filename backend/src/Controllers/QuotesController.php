<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Activity;
use App\Core\Auth;
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
use App\Support\Presenter;

/**
 * Quotes: staff send a proposal + amount; the idea owner opens a private link,
 * reviews it and accepts online, which registers the project automatically.
 */
final class QuotesController
{
    private const CURRENCIES = 'NGN,GHS,KES,ZAR,USD,GBP,EUR,INR,AED';

    /* ---------------- staff ---------------- */

    public static function send(Request $r): void
    {
        $user = Auth::requireStaff(['admin', 'lead']);
        $idea = IdeasController::find((int) $r->params['id']);
        if ($idea['project_id'] !== null || $idea['status'] === 'ACCEPTED') {
            throw HttpError::badRequest('This idea is already registered as a project.');
        }
        if ($idea['status'] === 'DRAFT') {
            throw new HttpError(409, "This application hasn't been submitted yet.");
        }
        \App\Support\Wallet::assertPaid($idea, 'sending a quote');
        $data = Validator::validate($r->input(), [
            'amount' => 'required|number|between:1,100000000000',
            'currency' => 'required|in:' . self::CURRENCIES,
            'summary' => 'required|string|min:20|max:5000',
            'timelineWeeks' => 'nullable|int|between:1,260',
            'validUntil' => 'required|date',
            'leadId' => 'required|int',
            'targetDate' => 'required|date',
        ]);
        if ($data['validUntil'] < date('Y-m-d')) {
            throw HttpError::validation(['validUntil' => 'Choose a date in the future.']);
        }
        if ($data['targetDate'] <= date('Y-m-d')) {
            throw HttpError::validation(['targetDate' => 'Choose a delivery date in the future.']);
        }
        $lead = Database::one("SELECT * FROM users WHERE id = ? AND status = 'active' AND role IN ('admin','lead')", [$data['leadId']]);
        if ($lead === null) {
            throw HttpError::validation(['leadId' => 'Choose an active project lead.']);
        }

        $token = bin2hex(random_bytes(24));
        $quoteId = Database::transaction(static function () use ($r, $user, $idea, $data, $token) {
            $proposal = $r->file('proposal');
            $fileId = $proposal ? Uploads::store($proposal, 'pdf', 'private', (int) $user['id'], 'proposal')['id'] : null;
            Database::run("UPDATE quotes SET status = 'withdrawn' WHERE idea_id = ? AND status = 'sent'", [(int) $idea['id']]);
            $id = Database::insert('quotes', [
                'idea_id' => (int) $idea['id'],
                'amount' => $data['amount'],
                'currency' => $data['currency'],
                'summary' => $data['summary'],
                'timeline_weeks' => $data['timelineWeeks'] ?? null,
                'valid_until' => $data['validUntil'],
                'proposal_file_id' => $fileId,
                'lead_id' => (int) $data['leadId'],
                'target_date' => $data['targetDate'],
                'token_hash' => hash('sha256', $token),
                'sent_by' => (int) $user['id'],
            ]);
            Database::update('ideas', ['status' => 'QUOTE_SENT'], ['id' => (int) $idea['id']]);
            return $id;
        });

        $link = self::link($idea['ref'], $token);
        Notifier::email('client', $idea['email'], "Your proposal for {$idea['title']}", sprintf(
            "Hi %s,\n\nYour proposal for %s is ready: %s %s%s.\n\nReview it and accept online here:\n%s\n\nThis quote is valid until %s. Once you accept, we'll register your project and send your Project ID.\n\nAI Project Connect",
            $idea['name'],
            $idea['title'],
            $data['currency'],
            number_format((float) $data['amount']),
            !empty($data['timelineWeeks']) ? " over about {$data['timelineWeeks']} weeks" : '',
            $link,
            date('j M Y', (int) strtotime($data['validUntil'])),
        ));
        Notifier::sms('client', $idea['phone'], "Your AI Project Connect proposal for {$idea['title']} is ready. Check your email ({$idea['email']}) to review and accept.");
        Activity::staff($user, "Sent a quote for idea {$idea['ref']} ({$data['currency']} " . number_format((float) $data['amount']) . ')');

        $response = ['quote' => self::present(Database::one('SELECT * FROM quotes WHERE id = ?', [$quoteId]), $idea['ref'], null)];
        if (Config::get('otp.expose_in_response') && !Config::isProduction()) {
            $response['devLink'] = $link; // local testing only
        }
        Response::json($response, 201);
    }

    public static function withdraw(Request $r): void
    {
        $user = Auth::requireStaff(['admin', 'lead']);
        $quote = Database::one('SELECT q.*, i.ref FROM quotes q JOIN ideas i ON i.id = q.idea_id WHERE q.id = ?', [(int) $r->params['id']]);
        if ($quote === null) {
            throw HttpError::notFound('Quote not found.');
        }
        if ($quote['status'] !== 'sent') {
            throw HttpError::badRequest('Only an open quote can be withdrawn.');
        }
        Database::update('quotes', ['status' => 'withdrawn'], ['id' => (int) $quote['id']]);
        Database::run("UPDATE ideas SET status = 'REVIEWING' WHERE id = ? AND status = 'QUOTE_SENT'", [(int) $quote['idea_id']]);
        Activity::staff($user, "Withdrew the quote for idea {$quote['ref']}");
        Response::noContent();
    }

    /* ---------------- client (private link) ---------------- */

    public static function show(Request $r): void
    {
        RateLimiter::hit('quote-view:' . $r->ip(), 60, 900);
        [$quote, $idea] = self::fromLink($r->params['ref'], (string) $r->query('token'));
        Response::json(self::present($quote, $idea['ref'], (string) $r->query('token')) + [
            'idea' => ['ref' => $idea['ref'], 'title' => $idea['title'], 'name' => $idea['name'], 'emailMasked' => Presenter::maskEmail($idea['email'])],
        ]);
    }

    public static function proposal(Request $r): void
    {
        [$quote] = self::fromLink($r->params['ref'], (string) $r->query('token'));
        $file = $quote['proposal_file_id'] ? Database::one('SELECT * FROM files WHERE id = ?', [(int) $quote['proposal_file_id']]) : null;
        $path = $file ? Uploads::path($file) : '';
        if (!$file || !is_file($path)) {
            throw HttpError::notFound('No proposal document is attached to this quote.');
        }
        Response::file($path, $file['mime_type'], $file['original_name'], $r->query('download') !== '1');
    }

    public static function accept(Request $r): void
    {
        RateLimiter::hit('quote-respond:' . $r->ip(), 10, 900);
        $data = Validator::validate($r->input(), [
            'token' => 'required|string|max:100',
            'name' => 'required|string|min:2|max:120',
            'agree' => 'required|bool',
        ]);
        if (!$data['agree']) {
            throw HttpError::validation(['agree' => 'Please confirm you agree to the proposal and terms.']);
        }
        [$quote, $idea] = self::fromLink($r->params['ref'], $data['token']);
        self::assertOpen($quote);
        if (!\App\Support\Wallet::isPaid(\App\Support\Wallet::current((int) $idea['id']))) {
            throw new HttpError(409, "Your commitment fee hasn't been confirmed yet, so this quote can't be accepted online. Please contact us and we'll sort it out.");
        }

        $lead =Database::one("SELECT * FROM users WHERE id = ? AND status = 'active' AND role IN ('admin','lead')", [(int) $quote['lead_id']])
            ?? Database::one("SELECT * FROM users WHERE status = 'active' AND role = 'admin' ORDER BY id LIMIT 1");
        if ($lead === null) {
            throw new HttpError(409, "We couldn't register your project automatically. Our team has been notified and will contact you.");
        }
        $target = $quote['target_date'] && $quote['target_date'] > date('Y-m-d')
            ? $quote['target_date']
            : date('Y-m-d', strtotime('+' . max(4, (int) $quote['timeline_weeks']) . ' weeks'));

        $project = Ideas::register($idea, $lead, $target, null, null);
        Database::update('quotes', ['status' => 'accepted', 'accepted_name' => $data['name'], 'responded_at' => date('Y-m-d H:i:s')], ['id' => (int) $quote['id']]);
        Database::run("UPDATE quotes SET status = 'withdrawn' WHERE idea_id = ? AND id <> ? AND status = 'sent'", [(int) $idea['id'], (int) $quote['id']]);
        Activity::system("Quote accepted online by {$data['name']} (idea {$idea['ref']})", (int) $project['id']);

        $sender = $quote['sent_by'] ? Database::one('SELECT email FROM users WHERE id = ?', [(int) $quote['sent_by']]) : null;
        foreach (array_unique(array_filter([$sender['email'] ?? null, (string) Config::get('notifications.admin_email')])) as $to) {
            Notifier::staff($to, "Quote accepted: {$idea['title']}", "{$data['name']} accepted the {$quote['currency']} " . number_format((float) $quote['amount']) . " quote online. Project {$project['code']} is registered and {$lead['name']} is the lead.", (int) $project['id']);
        }

        Response::json(['projectRegistered' => true, 'sentTo' => Presenter::maskEmail($idea['email'])]);
    }

    public static function decline(Request $r): void
    {
        RateLimiter::hit('quote-respond:' . $r->ip(), 10, 900);
        $data = Validator::validate($r->input(), [
            'token' => 'required|string|max:100',
            'reason' => 'nullable|string|max:1000',
        ]);
        [$quote, $idea] = self::fromLink($r->params['ref'], $data['token']);
        self::assertOpen($quote);
        Database::update('quotes', ['status' => 'declined', 'client_note' => $data['reason'] ?? null, 'responded_at' => date('Y-m-d H:i:s')], ['id' => (int) $quote['id']]);
        Database::update('ideas', ['status' => 'REVIEWING'], ['id' => (int) $idea['id']]);
        Activity::system("Quote for idea {$idea['ref']} declined by the client" . (!empty($data['reason']) ? ": {$data['reason']}" : ''));
        $sender = $quote['sent_by'] ? Database::one('SELECT email FROM users WHERE id = ?', [(int) $quote['sent_by']]) : null;
        Notifier::staff((string) ($sender['email'] ?? Config::get('notifications.admin_email')), "Quote declined: {$idea['title']}", ($data['reason'] ?? 'No reason given.') . "\n\nThe idea is back in review so you can send a revised quote.");
        Response::json(['status' => 'declined']);
    }

    /* ---------------- helpers ---------------- */

    /** @return array{0: array, 1: array} */
    private static function fromLink(string $ref, string $token): array
    {
        $ref = strtoupper(trim($ref));
        if (!Codes::isIdeaRef($ref) || strlen($token) < 20) {
            throw HttpError::notFound('This quote link is invalid.');
        }
        $quote = Database::one(
            'SELECT q.* FROM quotes q JOIN ideas i ON i.id = q.idea_id WHERE i.ref = ? AND q.token_hash = ?',
            [$ref, hash('sha256', $token)],
        );
        if ($quote === null) {
            throw HttpError::notFound('This quote link is invalid or has been replaced by a newer quote.');
        }
        $idea = Database::one('SELECT * FROM ideas WHERE id = ?', [(int) $quote['idea_id']]);
        return [$quote, $idea];
    }

    private static function assertOpen(array $quote): void
    {
        if ($quote['status'] === 'accepted') {
            throw HttpError::badRequest('This quote has already been accepted. Check your email for your Project ID.');
        }
        if ($quote['status'] !== 'sent') {
            throw HttpError::badRequest('This quote is no longer open. Please contact us for an updated proposal.');
        }
        if ($quote['valid_until'] < date('Y-m-d')) {
            throw HttpError::badRequest('This quote has expired. Please contact us for an updated proposal.');
        }
    }

    public static function present(array $q, string $ref, ?string $token): array
    {
        $proposal = $q['proposal_file_id'] ? Database::one('SELECT public_id, original_name, size_bytes FROM files WHERE id = ?', [(int) $q['proposal_file_id']]) : null;
        $lead = $q['lead_id'] ? Database::one('SELECT name FROM users WHERE id = ?', [(int) $q['lead_id']]) : null;
        return [
            'id' => (int) $q['id'],
            'amount' => (float) $q['amount'],
            'currency' => $q['currency'],
            'summary' => $q['summary'],
            'timelineWeeks' => $q['timeline_weeks'] !== null ? (int) $q['timeline_weeks'] : null,
            'validUntil' => $q['valid_until'],
            'expired' => $q['status'] === 'sent' && $q['valid_until'] < date('Y-m-d'),
            'status' => $q['status'],
            'leadName' => $lead['name'] ?? null,
            'targetDate' => $q['target_date'],
            'sentAt' => Presenter::iso($q['created_at']),
            'respondedAt' => Presenter::iso($q['responded_at']),
            'acceptedName' => $q['accepted_name'],
            'clientNote' => $q['client_note'],
            'proposal' => $proposal ? [
                'name' => $proposal['original_name'],
                'size' => Uploads::humanSize((int) $proposal['size_bytes']),
                'url' => $token !== null
                    ? '/api/quotes/' . rawurlencode($ref) . '/proposal?token=' . rawurlencode($token)
                    : '/api/staff/files/' . $proposal['public_id'],
            ] : null,
        ];
    }

    private static function link(string $ref, string $token): string
    {
        return \App\Support\Links::quote($ref, $token);
    }
}
