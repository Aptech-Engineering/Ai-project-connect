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
use App\Support\Presenter;
use App\Support\Projects;

/** Client Portal: sign in with Project ID + one-time code, then view and interact with projects. */
final class ClientController
{
    /* ---------------- sign in (CL-01) ---------------- */

    public static function requestCode(Request $r): void
    {
        $data = Validator::validate($r->input(), ['projectCode' => 'required|string|max:20']);
        $code = Codes::normaliseProjectCode($data['projectCode']);
        if (!Codes::isProjectCode($code)) {
            throw HttpError::validation(['projectCode' => 'Project IDs look like APC-26-7KQ9X.']);
        }

        RateLimiter::hit('otp-request-ip:' . $r->ip(), 10, 900);

        $project = Projects::findByCode($code);
        if ($project === null) {
            $revoked = Database::value('SELECT 1 FROM project_revoked_codes WHERE code = ?', [$code]);
            throw HttpError::notFound($revoked
                ? 'This Project ID has been replaced with a new one for security. Check your latest email or SMS.'
                : "We couldn't find a project with that ID. Check for typos and try again.");
        }

        $resend = (int) Config::get('otp.resend_seconds', 60);
        $last = Database::value('SELECT created_at FROM otp_codes WHERE project_id = ? ORDER BY id DESC LIMIT 1', [(int) $project['id']]);
        if ($last && time() - strtotime((string) $last) < $resend) {
            throw HttpError::tooManyRequests($resend - (time() - strtotime((string) $last)));
        }
        RateLimiter::hit('otp-request-project:' . $project['id'], 5, 3600);

        $otp = Codes::otp();
        $ttl = (int) Config::get('otp.ttl_minutes', 10);
        Database::insert('otp_codes', [
            'project_id' => (int) $project['id'],
            'code_hash' => self::hashCode($otp, (int) $project['id']),
            'expires_at' => date('Y-m-d H:i:s', time() + $ttl * 60),
        ]);

        $client = Projects::client($project);
        $message = "Your AI Project Connect sign-in code is {$otp}. It expires in {$ttl} minutes. Never share this code.";
        Notifier::email('client', $client['email'], 'Your sign-in code: ' . $otp, $message, (int) $project['id']);
        Notifier::sms('client', $client['phone'], $message, (int) $project['id']);

        $response = [
            'sentTo' => ['email' => Presenter::maskEmail($client['email']), 'phone' => Presenter::maskPhone($client['phone'])],
            'expiresInMinutes' => $ttl,
            'resendInSeconds' => $resend,
        ];
        if (Config::get('otp.expose_in_response') && !Config::isProduction()) {
            $response['devCode'] = $otp; // local testing only
        }
        Response::json($response);
    }

    public static function verifyCode(Request $r): void
    {
        $data = Validator::validate($r->input(), [
            'projectCode' => 'required|string|max:20',
            'code' => 'required|string|max:10',
        ]);
        RateLimiter::hit('otp-verify-ip:' . $r->ip(), 30, 900);

        $project = Projects::findByCode($data['projectCode']);
        $otp = $project ? Database::one(
            'SELECT * FROM otp_codes WHERE project_id = ? AND consumed_at IS NULL ORDER BY id DESC LIMIT 1',
            [(int) $project['id']],
        ) : null;

        if ($otp === null || strtotime((string) $otp['expires_at']) < time()) {
            throw new HttpError(400, 'That code has expired. Please request a new one.');
        }
        $max = (int) Config::get('otp.max_attempts', 5);
        if ((int) $otp['attempts'] >= $max) {
            throw new HttpError(429, 'Too many incorrect attempts. Please request a new code.');
        }
        if (!hash_equals($otp['code_hash'], self::hashCode(preg_replace('/\D/', '', $data['code']) ?? '', (int) $project['id']))) {
            Database::run('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?', [(int) $otp['id']]);
            $left = $max - (int) $otp['attempts'] - 1;
            throw HttpError::validation(['code' => $left > 0 ? "That code isn't right. {$left} attempt" . ($left === 1 ? '' : 's') . ' left.' : 'Too many incorrect attempts. Please request a new code.']);
        }

        Database::update('otp_codes', ['consumed_at' => date('Y-m-d H:i:s')], ['id' => (int) $otp['id']]);
        Database::run('DELETE FROM otp_codes WHERE project_id = ? AND consumed_at IS NULL', [(int) $project['id']]);
        Auth::loginClient((int) $project['client_id']);
        $client = Projects::client($project);
        Activity::client($client, 'Signed in to the client portal', (int) $project['id']);

        Response::json(['projectCode' => $project['code'], 'client' => ['name' => $client['name'], 'short' => Presenter::shortName($client['name'])], 'projects' => self::projectList((int) $client['id'])]);
    }

    public static function logout(Request $r): void
    {
        Auth::logoutClient();
        Response::noContent();
    }

    public static function me(Request $r): void
    {
        $clientId = Auth::requireClient();
        $client = Database::one('SELECT name FROM clients WHERE id = ?', [$clientId]);
        Response::json(['client' => ['name' => $client['name'], 'short' => Presenter::shortName($client['name'])], 'projects' => self::projectList($clientId)]);
    }

    /* ---------------- project ---------------- */

    public static function show(Request $r): void
    {
        $project = Projects::forClient($r->params['code'], Auth::requireClient());
        $data = Presenter::project($project, 'client');
        $data['courseRequests'] = array_map(
            static fn (array $l) => ['techId' => $l['technology_id'], 'type' => $l['type']],
            Database::all('SELECT technology_id, type FROM leads WHERE project_id = ? AND technology_id IS NOT NULL ORDER BY created_at', [(int) $project['id']]),
        );
        Response::json($data);
    }

    /** Ask the team a question (CL-07). */
    public static function message(Request $r): void
    {
        $clientId = Auth::requireClient();
        $project = Projects::forClient($r->params['code'], $clientId);
        RateLimiter::hit('client-message:' . $clientId, 20, 3600);
        $data = Validator::validate($r->input(), ['text' => 'required|string|min:2|max:2000']);
        $client = Projects::client($project);

        $id = Database::insert('messages', ['project_id' => (int) $project['id'], 'sender' => 'client', 'author_name' => $client['name'], 'body' => $data['text']]);
        Activity::client($client, 'Sent a message to the team', (int) $project['id']);
        if ($lead = Projects::lead($project)) {
            Notifier::staff($lead['email'], "New question from {$client['name']} · {$project['title']}", $data['text'], (int) $project['id']);
        }
        Response::json(['id' => $id], 201);
    }

    /** Design sign-off and other client approvals (CL-08). */
    public static function approveMilestone(Request $r): void
    {
        $project = Projects::forClient($r->params['code'], Auth::requireClient());
        $milestone = Database::one('SELECT * FROM milestones WHERE id = ? AND project_id = ?', [(int) $r->params['id'], (int) $project['id']]);
        if ($milestone === null) {
            throw HttpError::notFound('Milestone not found.');
        }
        if (!(int) $milestone['needs_client_approval']) {
            throw HttpError::badRequest("This milestone doesn't need your approval.");
        }
        if ($milestone['client_approved_at'] !== null) {
            Response::json(['approvedAt' => Presenter::iso($milestone['client_approved_at'])]);
            return;
        }
        $now = date('Y-m-d H:i:s');
        Database::update('milestones', ['client_approved_at' => $now, 'completed_at' => $milestone['completed_at'] ?? $now], ['id' => (int) $milestone['id']]);
        $client = Projects::client($project);
        Activity::client($client, "Approved milestone \"{$milestone['title']}\"", (int) $project['id']);
        if ($lead = Projects::lead($project)) {
            Notifier::staff($lead['email'], "{$client['name']} approved \"{$milestone['title']}\"", "The client signed off \"{$milestone['title']}\" on {$project['title']}.", (int) $project['id']);
        }
        Response::json(['approvedAt' => Presenter::iso($now)]);
    }

    /** "Learn this stack" → Request info / Enrol (LS-03). */
    public static function requestCourse(Request $r): void
    {
        $project = Projects::forClient($r->params['code'], Auth::requireClient());
        $data = Validator::validate($r->input(), ['techId' => 'required|string|max:60', 'type' => 'required|in:info,enrol']);

        $row = Database::one(
            'SELECT t.id AS tech_id, t.name AS tech_name, c.id AS course_id, c.title AS course_title
             FROM project_technologies pt JOIN technologies t ON t.id = pt.technology_id
             JOIN courses c ON c.id = t.course_id AND c.published = 1
             WHERE pt.project_id = ? AND pt.technology_id = ?',
            [(int) $project['id'], $data['techId']],
        );
        if ($row === null) {
            throw HttpError::notFound('No course is available for that technology.');
        }
        $existing = Database::value('SELECT id FROM leads WHERE project_id = ? AND technology_id = ? AND type = ?', [(int) $project['id'], $row['tech_id'], $data['type']]);
        if ($existing) {
            Response::json(['id' => (int) $existing]);
            return;
        }

        $client = Projects::client($project);
        $id = Database::insert('leads', [
            'project_id' => (int) $project['id'],
            'client_name' => $client['name'],
            'contact' => trim($client['email'] . ' · ' . ($client['phone'] ?? ''), ' ·'),
            'technology_id' => $row['tech_id'],
            'course_id' => $row['course_id'],
            'type' => $data['type'],
        ]);
        ReportsController::recordEvent($data['type'] === 'enrol' ? 'enrol' : 'request', $row['course_id'], $row['tech_id'], (int) $project['id']);
        Notifier::counsellors(
            sprintf('New %s: %s', $data['type'] === 'enrol' ? 'enrolment' : 'info request', $row['course_title']),
            "{$client['name']} ({$project['title']}) clicked \"" . ($data['type'] === 'enrol' ? 'Enrol' : 'Request info') . "\" on {$row['tech_name']}.",
            (int) $project['id'],
        );
        Response::json(['id' => $id], 201);
    }

    /** Marketing consent and weekly email preference. Opting out never removes status access. */
    public static function preferences(Request $r): void
    {
        $project = Projects::forClient($r->params['code'], Auth::requireClient());
        $data = Validator::validate($r->input(), ['promosOptOut' => 'nullable|bool', 'digestOptOut' => 'nullable|bool']);
        $client = Projects::client($project);
        if (isset($data['promosOptOut'])) {
            Database::update('projects', ['promos_opt_out' => $data['promosOptOut'] ? 1 : 0], ['id' => (int) $project['id']]);
            Activity::client($client, $data['promosOptOut'] ? 'Turned off course suggestions' : 'Turned on course suggestions', (int) $project['id']);
        }
        if (isset($data['digestOptOut'])) {
            Database::update('clients', ['digest_opt_out' => $data['digestOptOut'] ? 1 : 0], ['id' => (int) $client['id']]);
            Activity::client($client, $data['digestOptOut'] ? 'Turned off weekly progress emails' : 'Turned on weekly progress emails', (int) $project['id']);
        }
        $fresh = Database::one('SELECT p.promos_opt_out, c.digest_opt_out FROM projects p JOIN clients c ON c.id = p.client_id WHERE p.id = ?', [(int) $project['id']]);
        Response::json(['promosOptOut' => (bool) $fresh['promos_opt_out'], 'digestOptOut' => (bool) $fresh['digest_opt_out']]);
    }

    /** Clients share content, logos and documents with their team. */
    public static function uploadFile(Request $r): void
    {
        $clientId = Auth::requireClient();
        $project = Projects::forClient($r->params['code'], $clientId);
        RateLimiter::hit('client-upload:' . $clientId, 30, 3600);
        $data = Validator::validate($r->input(), ['note' => 'nullable|string|max:500']);
        $upload = $r->file('file');
        if ($upload === null) {
            throw HttpError::validation(['file' => 'Choose a file to upload.']);
        }
        $stored = Uploads::store($upload, 'document', 'private');
        $client = Projects::client($project);
        $id = Database::insert('project_files', [
            'project_id' => (int) $project['id'],
            'file_id' => $stored['id'],
            'kind' => 'doc',
            'source' => 'client',
            'note' => $data['note'] ?? null,
            'shared_by' => $client['name'],
        ]);
        Activity::client($client, "Uploaded {$stored['name']}", (int) $project['id']);
        if ($lead = Projects::lead($project)) {
            Notifier::staff($lead['email'], "{$client['name']} uploaded a file · {$project['title']}", "{$stored['name']} (" . Uploads::humanSize($stored['size']) . ')' . (!empty($data['note']) ? "\n\n{$data['note']}" : ''), (int) $project['id']);
        }
        Response::json(['id' => $id, 'name' => $stored['name'], 'size' => Uploads::humanSize($stored['size'])], 201);
    }

    /** Invite a team member to a course (LS-08). */
    public static function inviteToCourse(Request $r): void
    {
        $clientId = Auth::requireClient();
        $project = Projects::forClient($r->params['code'], $clientId);
        RateLimiter::hit('course-invite:' . $clientId, 10, 86400);
        $data = Validator::validate($r->input(), [
            'techId' => 'required|string|max:60',
            'name' => 'required|string|min:2|max:120',
            'email' => 'required|email|max:190',
            'message' => 'nullable|string|max:500',
        ]);
        $row = Database::one(
            'SELECT t.id AS tech_id, t.name AS tech_name, c.* FROM project_technologies pt JOIN technologies t ON t.id = pt.technology_id
             JOIN courses c ON c.id = t.course_id AND c.published = 1 WHERE pt.project_id = ? AND pt.technology_id = ?',
            [(int) $project['id'], $data['techId']],
        );
        if ($row === null) {
            throw HttpError::notFound('No course is available for that technology.');
        }
        $client = Projects::client($project);
        $id = Database::insert('leads', [
            'project_id' => (int) $project['id'],
            'client_name' => $data['name'],
            'contact' => strtolower($data['email']),
            'technology_id' => $row['tech_id'],
            'course_id' => $row['id'],
            'type' => 'info',
            'source' => 'invite',
            'invited_by' => $client['name'],
            'notes' => $data['message'] ?? null,
        ]);
        ReportsController::recordEvent('invite', $row['id'], $row['tech_id'], (int) $project['id']);

        $price = $row['currency'] . ' ' . number_format((float) $row['price']);
        $discount = $row['discount_percent'] ? " Use code {$row['discount_code']} for {$row['discount_percent']}% off." : '';
        Notifier::email('client', strtolower($data['email']), "{$client['name']} invited you to learn {$row['tech_name']}", sprintf(
            "Hi %s,\n\n%s is building %s with Aptech and thinks you'd enjoy learning %s, the technology behind it.\n%s\nCourse: %s\n%s · %s · starts %s · %s.%s\n\nA course counsellor will contact you with details.\n\nAptech",
            $data['name'],
            $client['name'],
            $project['title'],
            $row['tech_name'],
            !empty($data['message']) ? "\n\"{$data['message']}\"\n" : '',
            $row['title'],
            $row['duration'],
            $row['format'],
            $row['next_start'] ? date('j M Y', (int) strtotime($row['next_start'])) : 'soon',
            $price,
            $discount,
        ), (int) $project['id']);
        Notifier::counsellors("Course invite: {$row['title']}", "{$client['name']} ({$project['title']}) invited {$data['name']} <{$data['email']}> to {$row['title']}.", (int) $project['id']);
        Activity::client($client, "Invited {$data['name']} to the {$row['tech_name']} course", (int) $project['id']);
        Response::json(['id' => $id], 201);
    }

    /** Rating and testimonial at delivery (CL-10). */
    public static function rate(Request $r): void
    {
        $project = Projects::forClient($r->params['code'], Auth::requireClient());
        if ($project['stage'] !== 'DELIVERED') {
            throw HttpError::badRequest('You can rate the project once it is delivered.');
        }
        $data = Validator::validate($r->input(), ['stars' => 'required|int|between:1,5', 'text' => 'nullable|string|max:2000']);
        Database::update('projects', ['rating_stars' => $data['stars'], 'rating_text' => $data['text'] ?? null, 'rated_at' => date('Y-m-d H:i:s')], ['id' => (int) $project['id']]);
        $client = Projects::client($project);
        Activity::client($client, "Rated the project {$data['stars']}/5", (int) $project['id']);
        if ($lead = Projects::lead($project)) {
            Notifier::staff($lead['email'], "{$client['name']} rated {$project['title']} {$data['stars']}/5", $data['text'] ?? 'No written testimonial.', (int) $project['id']);
        }
        Response::json(['stars' => $data['stars']]);
    }

    /** Download a file shared on the project (CL-06). */
    public static function file(Request $r): void
    {
        $project = Projects::forClient($r->params['code'], Auth::requireClient());
        $file = Database::one(
            'SELECT f.* FROM project_files pf JOIN files f ON f.id = pf.file_id WHERE pf.id = ? AND pf.project_id = ?',
            [(int) $r->params['id'], (int) $project['id']],
        );
        $path = $file ? Uploads::path($file) : '';
        if (!$file || !is_file($path)) {
            throw HttpError::notFound('File not found.');
        }
        Response::file($path, $file['mime_type'], $file['original_name'], $r->query('download') !== '1' && $file['mime_type'] === 'application/pdf');
    }

    /* ---------------- helpers ---------------- */

    private static function hashCode(string $code, int $projectId): string
    {
        return hash_hmac('sha256', $projectId . ':' . $code, (string) Config::get('app.key'));
    }

    private static function projectList(int $clientId): array
    {
        return array_map(static fn (array $p) => [
            'code' => $p['code'],
            'title' => $p['title'],
            'stage' => $p['stage'],
            'progress' => (int) $p['progress'],
        ], Database::all('SELECT code, title, stage, progress FROM projects WHERE client_id = ? ORDER BY created_at', [$clientId]));
    }
}
