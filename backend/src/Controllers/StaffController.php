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
use App\Support\Codes;
use App\Support\Presenter;
use App\Support\Projects;
use App\Support\Stages;

/** Engineering Panel: projects, updates, stages, stack, milestones, team, files, messages. */
final class StaffController
{
    private const TEAM_ROLES = ['admin', 'lead', 'engineer'];

    /* ---------------- dashboard & lists ---------------- */

    public static function dashboard(Request $r): void
    {
        $user = Auth::requireStaff();
        [$where, $params] = Projects::visibilityFilter($user);
        $projects = Database::all("SELECT p.* FROM projects p WHERE {$where}", $params);
        $summaries = array_map([Presenter::class, 'projectSummary'], $projects);
        $active = array_filter($summaries, static fn ($s) => $s['stage'] !== 'DELIVERED');
        $gaps = array_filter(array_column($active, 'daysSinceClientUpdate'), static fn ($d) => $d !== null);

        $data = [
            'activeProjects' => count($active),
            'deliveredProjects' => count($summaries) - count($active),
            'pendingApprovals' => array_sum(array_column($summaries, 'pendingUpdates')),
            'needsReply' => count(array_filter($summaries, static fn ($s) => $s['needsReply'])),
            'avgDaysSinceClientUpdate' => $gaps ? round(array_sum($gaps) / count($gaps), 1) : null,
            'staleProjects' => array_values(array_map(
                static fn ($s) => ['code' => $s['code'], 'title' => $s['title'], 'daysSinceClientUpdate' => $s['daysSinceClientUpdate']],
                array_filter($summaries, static fn ($s) => $s['stale']),
            )),
        ];
        if (in_array($user['role'], ['admin', 'lead'], true)) {
            $data['newIdeas'] = (int) Database::value("SELECT COUNT(*) FROM ideas WHERE status = 'NEW'");
        }
        if ($user['role'] === 'admin') {
            // Badge for the notification log: messages still waiting to go out or that failed to send.
            $data['notifications'] = (int) Database::value("SELECT COUNT(*) FROM notifications WHERE status IN ('queued','failed')");
            $data['paymentsToConfirm'] = (int) Database::value("SELECT COUNT(*) FROM idea_payments WHERE status = 'AWAITING_CONFIRMATION'");
            $data['refundsPending'] = (int) Database::value("SELECT COUNT(*) FROM idea_payments WHERE status = 'PAID' AND refund_status IN ('PENDING','PROCESSING')");
        }
        if (in_array($user['role'], ['admin', 'counsellor'], true)) {
            $data['newLeads'] = (int) Database::value("SELECT COUNT(*) FROM leads WHERE status = 'NEW'");
            // Scholarship: transfers to confirm, plus paid applicants with no exam batch yet.
            $data['scholarshipTasks'] = (int) Database::value(
                "SELECT COUNT(*) FROM scholarship_applicants WHERE status = 'AWAITING_CONFIRMATION' OR (status = 'PAID' AND batch_id IS NULL)",
            );
        }
        Response::json($data);
    }

    public static function projects(Request $r): void
    {
        $user = Auth::requireStaff(self::TEAM_ROLES);
        [$where, $params] = Projects::visibilityFilter($user);
        $sql = "SELECT p.*, c.name AS client_name, u.name AS lead_name FROM projects p
                JOIN clients c ON c.id = p.client_id LEFT JOIN users u ON u.id = p.lead_id WHERE {$where}";
        if ($stage = $r->query('stage')) {
            if (!array_key_exists($stage, Stages::ALL)) {
                throw HttpError::validation(['stage' => 'Unknown stage.']);
            }
            $sql .= ' AND p.stage = :stage';
            $params['stage'] = $stage;
        }
        if ($q = trim((string) $r->query('q'))) {
            $sql .= ' AND (p.title LIKE :q1 OR p.code LIKE :q2 OR c.name LIKE :q3 OR u.name LIKE :q4)';
            $like = '%' . str_replace(['%', '_'], ['\\%', '\\_'], $q) . '%';
            $params += ['q1' => $like, 'q2' => $like, 'q3' => $like, 'q4' => $like];
        }
        $sql .= ' ORDER BY p.updated_at DESC';
        Response::json(array_map([Presenter::class, 'projectSummary'], Database::all($sql, $params)));
    }

    public static function show(Request $r): void
    {
        $user = Auth::requireStaff(self::TEAM_ROLES);
        Response::json(Presenter::project(Projects::forStaff($r->params['code'], $user), 'staff'));
    }

    /** Existing clients for the walk-in registration form. */
    public static function clients(Request $r): void
    {
        Auth::requireStaff(['admin']);
        $params = [];
        $sql = 'SELECT c.*, (SELECT COUNT(*) FROM projects p WHERE p.client_id = c.id) AS project_count FROM clients c';
        if ($q = trim((string) $r->query('q'))) {
            $like = '%' . str_replace(['%', '_'], ['\\%', '\\_'], $q) . '%';
            $sql .= ' WHERE c.name LIKE :q1 OR c.email LIKE :q2 OR c.phone LIKE :q3 OR c.organisation LIKE :q4';
            $params = ['q1' => $like, 'q2' => $like, 'q3' => $like, 'q4' => $like];
        }
        $sql .= ' ORDER BY c.name LIMIT 50';
        Response::json(array_map(static fn ($c) => [
            'id' => (int) $c['id'],
            'name' => $c['name'],
            'email' => $c['email'],
            'phone' => $c['phone'],
            'organisation' => $c['organisation'],
            'country' => $c['country'],
            'state' => $c['state'],
            'projects' => (int) $c['project_count'],
        ], Database::all($sql, $params)));
    }

    /**
     * Creates the project for a converted idea or an accepted quote. Only called from Ideas::register,
     * which requires a PAID commitment fee.
     * @param array<string, mixed> $data
     */
    public static function registerProject(int $clientId, array $data, ?array $actor, ?array $lead, ?int $briefFileId = null, ?string $sharedBy = null): array
    {
        $code = Codes::projectCode();
        $now = date('Y-m-d H:i:s');
        $projectId = Database::insert('projects', [
            'code' => $code,
            'client_id' => $clientId,
            'title' => $data['title'],
            'tagline' => $data['tagline'] ?? null,
            'category' => $data['category'] ?? null,
            'platforms' => $data['platforms'] ?? null,
            'budget' => $data['budget'] ?? null,
            'stage' => 'APPROVED',
            'progress' => Stages::ALL['APPROVED']['min'],
            'lead_id' => $lead ? (int) $lead['id'] : null,
            'start_date' => $data['startDate'] ?? date('Y-m-d'),
            'target_date' => $data['targetDate'] ?? null,
        ]);
        if ($lead) {
            Database::insert('project_members', ['project_id' => $projectId, 'user_id' => (int) $lead['id']]);
        }
        \App\Analytics\StageHistory::record($projectId, null, 'APPROVED', $actor ? (int) $actor['id'] : null, $now);
        Database::insert('updates', [
            'project_id' => $projectId,
            'author_id' => $lead ? (int) $lead['id'] : ($actor ? (int) $actor['id'] : null),
            'author_name' => $lead['name'] ?? $actor['name'] ?? 'Aptech team',
            'author_role' => $lead || $actor ? Presenter::roleLabel($lead['role'] ?? $actor['role']) : 'Team',
            'kind' => 'stage',
            'title' => 'Welcome! Your project is registered',
            'body' => Stages::meaning('APPROVED'),
            'published_at' => $now,
        ]);
        Database::insert('milestones', ['project_id' => $projectId, 'title' => 'Proposal & quote accepted', 'due_date' => date('Y-m-d'), 'completed_at' => $now]);
        if ($briefFileId) {
            Database::insert('project_files', ['project_id' => $projectId, 'file_id' => $briefFileId, 'kind' => 'doc', 'source' => 'client', 'shared_by' => $sharedBy]);
        }
        if ($actor) {
            Activity::staff($actor, "Registered project {$code}", $projectId);
        } else {
            Activity::system("Registered project {$code} after the client accepted the quote online", $projectId);
        }

        $project = Database::one('SELECT * FROM projects WHERE id = ?', [$projectId]);
        $client = Projects::client($project);
        Notifier::client(
            $client,
            'Welcome to AI Project Connect! Your Project ID',
            "Hi {$client['name']},\n\nYour project {$project['title']} is registered. Your Project ID is {$code}.\n\nSign in at " . Projects::portalUrl() . " with this ID and the one-time code we send you to follow progress.\n\nAI Project Connect",
            $projectId,
        );
        if ($lead) {
            Notifier::staff($lead['email'], "You're leading a new project: {$project['title']}", ($actor ? "{$actor['name']} registered" : 'The client accepted the quote online, registering') . " {$project['title']} ({$code}) for {$client['name']}.", $projectId);
        }
        return $project;
    }

    public static function updateDetails(Request $r): void
    {
        $user = Auth::requireStaff(self::TEAM_ROLES);
        $project = Projects::forStaff($r->params['code'], $user);
        Projects::requireLeadOf($project, $user);
        $data = Validator::validate($r->input(), [
            'title' => 'nullable|string|min:2|max:160',
            'tagline' => 'nullable|string|max:255',
            'category' => 'nullable|string|max:80',
            'platforms' => 'nullable|string|max:160',
            'budget' => 'nullable|string|max:80',
            'startDate' => 'nullable|date',
            'targetDate' => 'nullable|date',
        ]);
        $map = ['title' => 'title', 'tagline' => 'tagline', 'category' => 'category', 'platforms' => 'platforms', 'budget' => 'budget', 'startDate' => 'start_date', 'targetDate' => 'target_date'];
        $changes = [];
        foreach ($map as $in => $col) {
            if (array_key_exists($in, $data)) {
                $changes[$col] = $data[$in];
            }
        }
        if (isset($changes['title']) && $changes['title'] === null) {
            unset($changes['title']);
        }
        Database::update('projects', $changes, ['id' => (int) $project['id']]);
        if ($changes) {
            Activity::staff($user, 'Edited project details (' . implode(', ', array_keys($changes)) . ')', (int) $project['id']);
        }
        Response::json(Presenter::project(Projects::findByCode($project['code']), 'staff'));
    }

    /* ---------------- updates (EN-03, EN-06) ---------------- */

    public static function postUpdate(Request $r): void
    {
        $user = Auth::requireStaff(self::TEAM_ROLES);
        $project = Projects::forStaff($r->params['code'], $user);
        $data = Validator::validate($r->input(), [
            'title' => 'required|string|min:3|max:160',
            'body' => 'required|string|min:5|max:5000',
            'visibility' => 'required|in:client,internal',
            'demoLink' => 'nullable|url|max:500',
            'screenshot' => 'nullable|in:onboarding,payment,dashboard,design',
        ]);

        // Engineers' client-visible updates wait for lead approval before clients see them.
        $pending = $data['visibility'] === 'client' && $user['role'] === 'engineer';
        $now = date('Y-m-d H:i:s');
        $id = Database::insert('updates', [
            'project_id' => (int) $project['id'],
            'author_id' => (int) $user['id'],
            'author_name' => $user['name'],
            'author_role' => $user['job_title'] ?: Presenter::roleLabel($user['role']),
            'kind' => 'update',
            'visibility' => $data['visibility'],
            'status' => $pending ? 'pending' : 'published',
            'title' => $data['title'],
            'body' => $data['body'],
            'demo_link' => $data['demoLink'] ?? null,
            'screenshot' => $data['screenshot'] ?? null,
            'published_at' => $pending ? null : $now,
        ]);

        if ($data['visibility'] === 'internal') {
            Activity::staff($user, "Added internal note \"{$data['title']}\"", (int) $project['id']);
        } elseif ($pending) {
            Activity::staff($user, "Submitted \"{$data['title']}\" for approval", (int) $project['id']);
            if ($lead = Projects::lead($project)) {
                Notifier::staff($lead['email'], "Update waiting for your approval · {$project['title']}", "{$user['name']} wrote: {$data['title']}\n\n{$data['body']}", (int) $project['id']);
            }
        } else {
            Activity::staff($user, "Published \"{$data['title']}\"", (int) $project['id']);
            Projects::announceUpdate($project, $data['title'], $data['body']);
        }

        Response::json(Presenter::update(Database::one('SELECT * FROM updates WHERE id = ?', [$id])), 201);
    }

    public static function approveUpdate(Request $r): void
    {
        $user = Auth::requireStaff(['admin', 'lead']);
        [$update, $project] = self::updateWithProject((int) $r->params['id'], $user);
        Projects::requireLeadOf($project, $user);
        if ($update['status'] !== 'pending') {
            throw HttpError::badRequest('This update is already published.');
        }
        Database::update('updates', ['status' => 'published', 'approved_by' => (int) $user['id'], 'published_at' => date('Y-m-d H:i:s')], ['id' => (int) $update['id']]);
        Activity::staff($user, "Approved and published \"{$update['title']}\"", (int) $project['id']);
        Projects::announceUpdate($project, $update['title'], $update['body']);
        Response::json(Presenter::update(Database::one('SELECT * FROM updates WHERE id = ?', [(int) $update['id']])));
    }

    /** Reject a pending update or delete a published one (stage-change records are kept for audit). */
    public static function deleteUpdate(Request $r): void
    {
        $user = Auth::requireStaff(['admin', 'lead']);
        [$update, $project] = self::updateWithProject((int) $r->params['id'], $user);
        Projects::requireLeadOf($project, $user);
        if ($update['kind'] === 'stage') {
            throw HttpError::badRequest('Stage-change updates are kept for the audit trail.');
        }
        Database::run('DELETE FROM updates WHERE id = ?', [(int) $update['id']]);
        Activity::staff($user, ($update['status'] === 'pending' ? 'Rejected' : 'Deleted') . " update \"{$update['title']}\"", (int) $project['id']);
        Response::noContent();
    }

    public static function approvals(Request $r): void
    {
        $user = Auth::requireStaff(self::TEAM_ROLES);
        [$where, $params] = Projects::visibilityFilter($user);
        $rows = Database::all(
            "SELECT u.*, p.code AS project_code, p.title AS project_title, p.lead_id, l.name AS lead_name
             FROM updates u JOIN projects p ON p.id = u.project_id LEFT JOIN users l ON l.id = p.lead_id
             WHERE u.status = 'pending' AND {$where} ORDER BY u.created_at",
            $params,
        );
        // canApprove mirrors Projects::requireLeadOf, so the panel can disable the button instead of showing a 403.
        $isAdmin = $user['role'] === 'admin';
        Response::json(array_map(static fn ($u) => Presenter::update($u) + [
            'projectCode' => $u['project_code'],
            'projectTitle' => $u['project_title'],
            'leadName' => $u['lead_name'],
            'canApprove' => $isAdmin || ($user['role'] === 'lead' && (int) $u['lead_id'] === (int) $user['id']),
        ], $rows));
    }

    /* ---------------- stage & progress (EN-02) ---------------- */

    public static function changeStage(Request $r): void
    {
        $user = Auth::requireStaff(['admin', 'lead']);
        $project = Projects::forStaff($r->params['code'], $user);
        $data = Validator::validate($r->input(), [
            'stage' => 'required|in:' . Stages::keys(),
            'progress' => 'nullable|int|between:0,100',
            'holdReason' => 'nullable|string|max:500',
        ]);
        $updated = Projects::changeStage($project, $user, $data['stage'], $data['progress'] ?? null, $data['holdReason'] ?? null);
        Response::json(Presenter::project($updated, 'staff'));
    }

    /* ---------------- tech stack (EN-04) ---------------- */

    public static function addTechnology(Request $r): void
    {
        $user = Auth::requireStaff(self::TEAM_ROLES);
        $project = Projects::forStaff($r->params['code'], $user);
        $data = Validator::validate($r->input(), ['techId' => 'required|string|max:60', 'usage' => 'required|string|min:2|max:120']);
        $tech = Database::one('SELECT id, name FROM technologies WHERE id = ?', [$data['techId']]);
        if ($tech === null) {
            throw HttpError::validation(['techId' => 'Choose a technology from the managed list.']);
        }
        Database::run(
            'INSERT INTO project_technologies (project_id, technology_id, usage_note) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE usage_note = VALUES(usage_note)',
            [(int) $project['id'], $tech['id'], $data['usage']],
        );
        Activity::staff($user, "Tagged {$tech['name']} ({$data['usage']})", (int) $project['id']);
        Response::json(['techId' => $tech['id'], 'usage' => $data['usage']], 201);
    }

    public static function removeTechnology(Request $r): void
    {
        $user = Auth::requireStaff(self::TEAM_ROLES);
        $project = Projects::forStaff($r->params['code'], $user);
        $removed = Database::run('DELETE FROM project_technologies WHERE project_id = ? AND technology_id = ?', [(int) $project['id'], $r->params['techId']])->rowCount();
        if ($removed) {
            Activity::staff($user, "Removed {$r->params['techId']} from the stack", (int) $project['id']);
        }
        Response::noContent();
    }

    /* ---------------- milestones (EN-05) ---------------- */

    public static function addMilestone(Request $r): void
    {
        $user = Auth::requireStaff(['admin', 'lead']);
        $project = Projects::forStaff($r->params['code'], $user);
        Projects::requireLeadOf($project, $user);
        $data = Validator::validate($r->input(), [
            'title' => 'required|string|min:2|max:160',
            'dueDate' => 'required|date',
            'needsClientApproval' => 'nullable|bool',
        ]);
        $id = Database::insert('milestones', [
            'project_id' => (int) $project['id'],
            'title' => $data['title'],
            'due_date' => $data['dueDate'],
            'needs_client_approval' => !empty($data['needsClientApproval']) ? 1 : 0,
        ]);
        Activity::staff($user, "Added milestone \"{$data['title']}\" due {$data['dueDate']}", (int) $project['id']);
        Response::json(['id' => $id], 201);
    }

    public static function updateMilestone(Request $r): void
    {
        $user = Auth::requireStaff(['admin', 'lead']);
        [$milestone, $project] = self::milestoneWithProject((int) $r->params['id'], $user);
        Projects::requireLeadOf($project, $user);
        $data = Validator::validate($r->input(), [
            'title' => 'nullable|string|min:2|max:160',
            'dueDate' => 'nullable|date',
            'completed' => 'nullable|bool',
            'needsClientApproval' => 'nullable|bool',
        ]);
        $changes = [];
        if (!empty($data['title'])) {
            $changes['title'] = $data['title'];
        }
        if (!empty($data['dueDate'])) {
            $changes['due_date'] = $data['dueDate'];
        }
        if (array_key_exists('needsClientApproval', $data) && $data['needsClientApproval'] !== null) {
            $changes['needs_client_approval'] = $data['needsClientApproval'] ? 1 : 0;
        }
        if (array_key_exists('completed', $data) && $data['completed'] !== null) {
            $changes['completed_at'] = $data['completed'] ? ($milestone['completed_at'] ?? date('Y-m-d H:i:s')) : null;
            Activity::staff($user, ($data['completed'] ? 'Completed' : 'Reopened') . " milestone \"{$milestone['title']}\"", (int) $project['id']);
        }
        Database::update('milestones', $changes, ['id' => (int) $milestone['id']]);
        Response::json(['id' => (int) $milestone['id']]);
    }

    public static function deleteMilestone(Request $r): void
    {
        $user = Auth::requireStaff(['admin', 'lead']);
        [$milestone, $project] = self::milestoneWithProject((int) $r->params['id'], $user);
        Projects::requireLeadOf($project, $user);
        Database::run('DELETE FROM milestones WHERE id = ?', [(int) $milestone['id']]);
        Activity::staff($user, "Deleted milestone \"{$milestone['title']}\"", (int) $project['id']);
        Response::noContent();
    }

    /* ---------------- team (AD-06) ---------------- */

    public static function addMember(Request $r): void
    {
        $user = Auth::requireStaff(['admin', 'lead']);
        $project = Projects::forStaff($r->params['code'], $user);
        Projects::requireLeadOf($project, $user);
        $data = Validator::validate($r->input(), ['userId' => 'required|int']);
        $member = self::activeUser($data['userId'], self::TEAM_ROLES);
        Database::run('INSERT IGNORE INTO project_members (project_id, user_id) VALUES (?, ?)', [(int) $project['id'], (int) $member['id']]);
        Activity::staff($user, "Assigned {$member['name']} (" . Presenter::roleLabel($member['role']) . ')', (int) $project['id']);
        Notifier::staff($member['email'], "You've been assigned to {$project['title']}", "{$user['name']} added you to {$project['title']} ({$project['code']}).", (int) $project['id']);
        Response::json(Presenter::person($member), 201);
    }

    public static function removeMember(Request $r): void
    {
        $user = Auth::requireStaff(['admin', 'lead']);
        $project = Projects::forStaff($r->params['code'], $user);
        Projects::requireLeadOf($project, $user);
        $memberId = (int) $r->params['userId'];
        if ($memberId === (int) $project['lead_id']) {
            throw HttpError::badRequest('Choose a new project lead before removing the current one.');
        }
        $member = Database::one('SELECT name FROM users WHERE id = ?', [$memberId]);
        Database::run('DELETE FROM project_members WHERE project_id = ? AND user_id = ?', [(int) $project['id'], $memberId]);
        if ($member) {
            Activity::staff($user, "Removed {$member['name']} from the team", (int) $project['id']);
        }
        Response::noContent();
    }

    public static function changeLead(Request $r): void
    {
        $user = Auth::requireStaff(['admin']);
        $project = Projects::forStaff($r->params['code'], $user);
        $data = Validator::validate($r->input(), ['userId' => 'required|int']);
        $lead = self::activeUser($data['userId'], ['admin', 'lead']);
        Database::update('projects', ['lead_id' => (int) $lead['id']], ['id' => (int) $project['id']]);
        Database::run('INSERT IGNORE INTO project_members (project_id, user_id) VALUES (?, ?)', [(int) $project['id'], (int) $lead['id']]);
        Activity::staff($user, "Changed project lead to {$lead['name']}", (int) $project['id']);
        Notifier::staff($lead['email'], "You're now leading {$project['title']}", "{$user['name']} made you project lead for {$project['title']} ({$project['code']}).", (int) $project['id']);
        Response::json(Presenter::person($lead));
    }

    /** Active staff for assignment dropdowns. */
    public static function users(Request $r): void
    {
        Auth::requireStaff(self::TEAM_ROLES);
        $rows = Database::all("SELECT * FROM users WHERE status = 'active' ORDER BY FIELD(role, 'admin', 'lead', 'engineer', 'counsellor'), name");
        Response::json(array_map(static fn ($u) => Presenter::user($u), $rows));
    }

    /* ---------------- files (EN-08, CL-06) ---------------- */

    public static function uploadFile(Request $r): void
    {
        $user = Auth::requireStaff(self::TEAM_ROLES);
        $project = Projects::forStaff($r->params['code'], $user);
        $input = $r->input();
        $data = Validator::validate($input, ['kind' => 'nullable|in:proposal,design,doc']);
        $upload = $r->file('file');
        if ($upload === null) {
            throw HttpError::validation(['file' => 'Choose a file to upload.']);
        }
        $stored = Uploads::store($upload, 'document', 'private', (int) $user['id']);
        $id = Database::insert('project_files', ['project_id' => (int) $project['id'], 'file_id' => $stored['id'], 'kind' => $data['kind'] ?? 'doc', 'shared_by' => $user['name']]);
        Activity::staff($user, "Shared file {$stored['name']}", (int) $project['id']);
        Notifier::email('client', Projects::client($project)['email'], "New file shared on {$project['title']}", "{$stored['name']} is ready to view and download in your portal.", (int) $project['id']);
        Response::json(['id' => $id, 'name' => $stored['name'], 'size' => Uploads::humanSize($stored['size'])], 201);
    }

    public static function deleteFile(Request $r): void
    {
        $user = Auth::requireStaff(['admin', 'lead']);
        $row = Database::one('SELECT pf.*, p.code FROM project_files pf JOIN projects p ON p.id = pf.project_id WHERE pf.id = ?', [(int) $r->params['id']]);
        if ($row === null) {
            throw HttpError::notFound('File not found.');
        }
        $project = Projects::forStaff($row['code'], $user);
        Projects::requireLeadOf($project, $user);
        $name = (string) Database::value('SELECT original_name FROM files WHERE id = ?', [(int) $row['file_id']]);
        Database::run('DELETE FROM project_files WHERE id = ?', [(int) $row['id']]);
        $stillUsed = Database::value('SELECT 1 FROM project_files WHERE file_id = ? UNION SELECT 1 FROM ideas WHERE attachment_file_id = ?', [(int) $row['file_id'], (int) $row['file_id']]);
        if (!$stillUsed) {
            Uploads::delete((int) $row['file_id']);
        }
        Activity::staff($user, "Removed file {$name}", (int) $project['id']);
        Response::noContent();
    }

    /** Staff download of project files, idea attachments and public images. */
    public static function downloadFile(Request $r): void
    {
        $user = Auth::requireStaff();
        $file = Database::one('SELECT * FROM files WHERE public_id = ?', [$r->params['id']]);
        if ($file === null) {
            throw HttpError::notFound('File not found.');
        }
        $allowed = $file['visibility'] === 'public';
        if (!$allowed && in_array($user['role'], ['admin', 'lead'], true)) {
            $allowed = (bool) Database::value("SELECT 1 FROM ideas WHERE attachment_file_id = ? AND (status <> 'DRAFT' OR ? = 'admin')", [(int) $file['id'], $user['role']]);
        }
        if (!$allowed && $user['role'] === 'admin') {
            // Proof of transfer for the commitment fee
            $allowed = (bool) Database::value('SELECT 1 FROM idea_payments WHERE proof_file_id = ?', [(int) $file['id']]);
        }
        if (!$allowed) {
            foreach (Database::all('SELECT p.* FROM project_files pf JOIN projects p ON p.id = pf.project_id WHERE pf.file_id = ?', [(int) $file['id']]) as $project) {
                if (Projects::staffCanView($project, $user)) {
                    $allowed = true;
                    break;
                }
            }
        }
        $path = Uploads::path($file);
        if (!$allowed || !is_file($path)) {
            throw HttpError::notFound('File not found.');
        }
        Response::file($path, $file['mime_type'], $file['original_name'], $r->query('download') !== '1' && in_array($file['mime_type'], ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif'], true));
    }

    /* ---------------- Project ID (AD-08) ---------------- */

    public static function regenerateCode(Request $r): void
    {
        $user = Auth::requireStaff(['admin', 'lead']);
        $project = Projects::forStaff($r->params['code'], $user);
        Projects::requireLeadOf($project, $user);

        $newCode = Database::transaction(static function () use ($project, $user) {
            $newCode = Codes::projectCode();
            Database::insert('project_revoked_codes', ['code' => $project['code'], 'project_id' => (int) $project['id']]);
            Database::update('projects', ['code' => $newCode], ['id' => (int) $project['id']]);
            Database::run('DELETE FROM otp_codes WHERE project_id = ?', [(int) $project['id']]);
            // Sign the client out of every existing session.
            Database::run('UPDATE clients SET session_version = session_version + 1 WHERE id = ?', [(int) $project['client_id']]);
            Activity::staff($user, "Regenerated Project ID ({$project['code']} → {$newCode}). Old ID revoked.", (int) $project['id']);
            return $newCode;
        });

        Notifier::client(
            Projects::client($project),
            'Your Project ID has changed',
            "For your security we issued a new Project ID for {$project['title']}: {$newCode}. Your old ID no longer works.",
            (int) $project['id'],
        );
        Response::json(['code' => $newCode, 'revoked' => $project['code']]);
    }

    /* ---------------- messages (CL-07, NT-02) ---------------- */

    public static function reply(Request $r): void
    {
        $user = Auth::requireStaff(self::TEAM_ROLES);
        $project = Projects::forStaff($r->params['code'], $user);
        $data = Validator::validate($r->input(), ['text' => 'required|string|min:2|max:2000']);
        $id = Database::insert('messages', ['project_id' => (int) $project['id'], 'sender' => 'team', 'user_id' => (int) $user['id'], 'author_name' => $user['name'], 'body' => $data['text']]);
        Activity::staff($user, 'Replied to the client', (int) $project['id']);
        Notifier::email('client', Projects::client($project)['email'], "{$user['name']} replied about {$project['title']}", $data['text'] . "\n\nSign in with your Project ID to reply.", (int) $project['id']);
        Response::json(['id' => $id], 201);
    }

    public static function messageThreads(Request $r): void
    {
        $user = Auth::requireStaff(self::TEAM_ROLES);
        [$where, $params] = Projects::visibilityFilter($user);
        $rows = Database::all(
            "SELECT p.code, p.title, c.name AS client_name, m.sender, m.author_name, m.body, m.created_at,
                    (SELECT COUNT(*) FROM messages mc WHERE mc.project_id = p.id) AS message_count
             FROM projects p JOIN clients c ON c.id = p.client_id
             JOIN messages m ON m.id = (SELECT m2.id FROM messages m2 WHERE m2.project_id = p.id ORDER BY m2.created_at DESC, m2.id DESC LIMIT 1)
             WHERE {$where}
             ORDER BY (m.sender = 'client') DESC, m.created_at DESC",
            $params,
        );
        Response::json(array_map(static fn ($t) => [
            'projectCode' => $t['code'],
            'projectTitle' => $t['title'],
            'clientName' => $t['client_name'],
            'needsReply' => $t['sender'] === 'client',
            'messageCount' => (int) $t['message_count'],
            'last' => ['from' => $t['sender'], 'author' => $t['author_name'], 'text' => $t['body'], 'at' => Presenter::iso($t['created_at'])],
        ], $rows));
    }

    /* ---------------- notifications log ---------------- */

    public static function notifications(Request $r): void
    {
        Auth::requireStaff(['admin']);
        $params = [];
        $sql = 'SELECT n.*, p.code AS project_code FROM notifications n LEFT JOIN projects p ON p.id = n.project_id WHERE 1 = 1';
        if ($audience = $r->query('audience')) {
            $sql .= ' AND n.audience = :audience';
            $params['audience'] = $audience;
        }
        if ($status = $r->query('status')) {
            $sql .= ' AND n.status = :status';
            $params['status'] = $status;
        }
        $sql .= ' ORDER BY n.created_at DESC, n.id DESC LIMIT 200';
        Response::json(array_map([Presenter::class, 'notification'], Database::all($sql, $params)));
    }

    /* ---------------- helpers ---------------- */

    private static function activeUser(int $id, array $roles): array
    {
        $user = Database::one("SELECT * FROM users WHERE id = ? AND status = 'active'", [$id]);
        if ($user === null || !in_array($user['role'], $roles, true)) {
            throw HttpError::validation(['userId' => 'Choose an active team member with the right role.']);
        }
        return $user;
    }

    /** @return array{0: array, 1: array} */
    private static function updateWithProject(int $updateId, array $user): array
    {
        $update = Database::one('SELECT u.*, p.code FROM updates u JOIN projects p ON p.id = u.project_id WHERE u.id = ?', [$updateId]);
        if ($update === null) {
            throw HttpError::notFound('Update not found.');
        }
        return [$update, Projects::forStaff($update['code'], $user)];
    }

    /** @return array{0: array, 1: array} */
    private static function milestoneWithProject(int $milestoneId, array $user): array
    {
        $milestone = Database::one('SELECT m.*, p.code FROM milestones m JOIN projects p ON p.id = m.project_id WHERE m.id = ?', [$milestoneId]);
        if ($milestone === null) {
            throw HttpError::notFound('Milestone not found.');
        }
        return [$milestone, Projects::forStaff($milestone['code'], $user)];
    }
}
