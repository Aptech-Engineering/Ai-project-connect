<?php

declare(strict_types=1);

namespace App\Support;

use App\Core\Database;
use App\Core\Uploads;

/**
 * Converts database rows into API JSON.
 * Field names match the frontend types in lib/types.ts so integration is a drop-in swap.
 */
final class Presenter
{
    public static function roleLabel(string $role): string
    {
        return match ($role) {
            'admin' => 'Admin',
            'lead' => 'Project lead',
            'engineer' => 'Engineer',
            'counsellor' => 'Course counsellor',
            default => ucfirst($role),
        };
    }

    public static function iso(?string $datetime): ?string
    {
        return $datetime ? date('c', (int) strtotime($datetime)) : null;
    }

    public static function maskEmail(string $email): string
    {
        [$local, $domain] = array_pad(explode('@', $email, 2), 2, '');
        return mb_substr($local, 0, 1) . '•••@' . $domain;
    }

    public static function maskPhone(?string $phone): string
    {
        $digits = preg_replace('/\D/', '', (string) $phone) ?? '';
        if (strlen($digits) < 7) {
            return '';
        }
        $prefix = str_starts_with($digits, '0') ? substr($digits, 0, 4) : '+' . substr($digits, 0, 3);
        return $prefix . ' ••• ••• ' . substr($digits, -4);
    }

    public static function shortName(string $name): string
    {
        $parts = preg_split('/\s+/', trim($name)) ?: [];
        $first = $parts[0] ?? $name;
        if (strcasecmp($first, 'Dr.') === 0 && isset($parts[1])) {
            $first .= ' ' . $parts[1];
            array_splice($parts, 1, 1);
        }
        return isset($parts[1]) ? $first . ' ' . mb_substr($parts[1], 0, 1) . '.' : $first;
    }

    public static function user(array $u): array
    {
        return [
            'id' => (int) $u['id'],
            'name' => $u['name'],
            'email' => $u['email'],
            'phone' => $u['phone'] ?? null,
            'role' => $u['role'],
            'roleLabel' => self::roleLabel($u['role']),
            'jobTitle' => $u['job_title'] ?? null,
            'status' => $u['status'] ?? 'active',
            'mustChangePassword' => (bool) ($u['must_change_password'] ?? false),
            'lastLoginAt' => self::iso($u['last_login_at'] ?? null),
        ];
    }

    /** @return array{id:int|null, name:string, role:string} */
    public static function person(?array $u): array
    {
        if ($u === null) {
            return ['id' => null, 'name' => 'Aptech team', 'role' => 'Team'];
        }
        return ['id' => (int) $u['id'], 'name' => $u['name'], 'role' => $u['job_title'] ?: self::roleLabel($u['role'])];
    }

    public static function publicFileUrl(?string $publicId): ?string
    {
        return $publicId ? '/api/files/' . $publicId : null;
    }

    public static function course(array $c): array
    {
        return [
            'id' => $c['id'],
            'title' => $c['title'],
            'description' => $c['description'],
            'duration' => $c['duration'],
            'format' => $c['format'],
            'nextStart' => $c['next_start'] ? self::iso($c['next_start'] . ' 09:30:00') : null,
            'price' => (float) $c['price'],
            'currency' => $c['currency'],
            'discountPercent' => $c['discount_percent'] !== null ? (int) $c['discount_percent'] : null,
            'discountCode' => $c['discount_code'],
            'flierId' => $c['flier_public_id'] ?? null,
            'flierUrl' => self::publicFileUrl($c['flier_public_id'] ?? null),
            'enrolUrl' => $c['enrol_url'],
            'published' => (bool) $c['published'],
            'sortOrder' => (int) $c['sort_order'],
        ];
    }

    public static function technology(array $t): array
    {
        return [
            'id' => $t['id'],
            'name' => $t['name'],
            'category' => $t['category'],
            'plain' => $t['plain_description'],
            'mark' => $t['mark'],
            'color' => $t['color'],
            'courseId' => $t['course_id'] ?? '',
            'sortOrder' => (int) $t['sort_order'],
        ];
    }

    /**
     * Full project for the client portal or the engineering panel.
     * Clients never receive internal notes, pending updates, activity or team contact details.
     */
    public static function project(array $p, string $audience): array
    {
        $isStaff = $audience === 'staff';
        $id = (int) $p['id'];

        $client = Database::one('SELECT * FROM clients WHERE id = ?', [(int) $p['client_id']]);
        $lead = $p['lead_id'] ? Database::one('SELECT id, name, role, job_title, email FROM users WHERE id = ?', [(int) $p['lead_id']]) : null;
        $team = Database::all(
            'SELECT u.id, u.name, u.role, u.job_title, u.email FROM project_members m JOIN users u ON u.id = m.user_id WHERE m.project_id = ? ORDER BY m.added_at',
            [$id],
        );

        $updateSql = $isStaff
            ? 'SELECT * FROM updates WHERE project_id = ? ORDER BY COALESCE(published_at, created_at) DESC, id DESC'
            : "SELECT * FROM updates WHERE project_id = ? AND visibility = 'client' AND status = 'published' ORDER BY COALESCE(published_at, created_at) DESC, id DESC";
        $updates = array_map(static fn (array $u) => self::update($u, $isStaff), Database::all($updateSql, [$id]));

        $milestones = array_map(static fn (array $m) => [
            'id' => (int) $m['id'],
            'title' => $m['title'],
            'due' => self::iso($m['due_date'] . ' 09:30:00'),
            'completedAt' => self::iso($m['completed_at']),
            'needsClientApproval' => (bool) $m['needs_client_approval'],
            'clientApprovedAt' => self::iso($m['client_approved_at']),
        ], Database::all('SELECT * FROM milestones WHERE project_id = ? ORDER BY due_date, id', [$id]));

        $stack = array_map(static fn (array $s) => ['techId' => $s['technology_id'], 'usage' => $s['usage_note']], Database::all(
            'SELECT pt.technology_id, pt.usage_note FROM project_technologies pt JOIN technologies t ON t.id = pt.technology_id WHERE pt.project_id = ? ORDER BY t.sort_order, pt.added_at',
            [$id],
        ));

        $files = array_map(static fn (array $f) => [
            'id' => (int) $f['id'],
            'name' => $f['original_name'],
            'kind' => $f['kind'],
            'size' => Uploads::humanSize((int) $f['size_bytes']),
            'date' => self::iso($f['created_at']),
            'uploadedBy' => $f['shared_by'],
            'source' => $f['source'],
            'note' => $f['note'],
            'url' => $isStaff ? '/api/staff/files/' . $f['public_id'] : '/api/client/projects/' . rawurlencode((string) $p['code']) . '/files/' . $f['id'],
        ], Database::all(
            'SELECT pf.id, pf.kind, pf.source, pf.note, pf.shared_by, pf.created_at, f.original_name, f.size_bytes, f.public_id FROM project_files pf JOIN files f ON f.id = pf.file_id WHERE pf.project_id = ? ORDER BY pf.created_at DESC',
            [$id],
        ));

        $messages = array_map(static fn (array $m) => [
            'id' => (int) $m['id'],
            'at' => self::iso($m['created_at']),
            'from' => $m['sender'],
            'author' => $m['author_name'],
            'text' => $m['body'],
        ], Database::all('SELECT * FROM messages WHERE project_id = ? ORDER BY created_at, id', [$id]));

        $data = [
            'id' => $isStaff ? $id : null,
            'code' => $p['code'],
            'title' => $p['title'],
            'tagline' => $p['tagline'] ?? '',
            'category' => $p['category'] ?? '',
            'platforms' => $p['platforms'] ?? '',
            'client' => [
                'name' => $client['name'],
                'short' => self::shortName($client['name']),
                'emailMasked' => self::maskEmail($client['email']),
                'phoneMasked' => self::maskPhone($client['phone']),
            ],
            'lead' => self::person($lead),
            'team' => array_map([self::class, 'person'], $team),
            'stage' => $p['stage'],
            'pausedAtStep' => $p['paused_at_step'] !== null ? (int) $p['paused_at_step'] : null,
            'holdReason' => $p['hold_reason'],
            'progress' => (int) $p['progress'],
            'startDate' => $p['start_date'] ? self::iso($p['start_date'] . ' 09:30:00') : null,
            'targetDate' => $p['target_date'] ? self::iso($p['target_date'] . ' 09:30:00') : null,
            'deliveredDate' => self::iso($p['delivered_at']),
            'updates' => $updates,
            'milestones' => $milestones,
            'stack' => $stack,
            'files' => $files,
            'messages' => $messages,
            'rating' => $p['rating_stars'] ? ['stars' => (int) $p['rating_stars'], 'text' => $p['rating_text'], 'at' => self::iso($p['rated_at'])] : null,
            'promosOptOut' => (bool) $p['promos_opt_out'],
            'digestOptOut' => (bool) $client['digest_opt_out'],
            'changeRequests' => array_map(
                [\App\Controllers\ChangeRequestsController::class, 'present'],
                Database::all('SELECT * FROM change_requests WHERE project_id = ? ORDER BY created_at DESC', [$id]),
            ),
            'handover' => \App\Controllers\HandoverController::present($p),
            // Commitment fee ledger from the idea this project was registered from (null for direct registrations)
            'wallet' => Wallet::ledgerForProject($id),
        ];

        if ($isStaff) {
            $data['client'] += ['id' => (int) $client['id'], 'email' => $client['email'], 'phone' => $client['phone'], 'organisation' => $client['organisation']];
            $data['budget'] = $p['budget'];
            $data['team'] = array_map(static fn (array $u) => self::person($u) + ['email' => $u['email']], $team);
            $data['revokedCodes'] = array_column(Database::all('SELECT code FROM project_revoked_codes WHERE project_id = ? ORDER BY revoked_at', [$id]), 'code');
            $data['activity'] = array_map(static fn (array $a) => [
                'id' => (int) $a['id'],
                'at' => self::iso($a['created_at']),
                'actor' => $a['actor_name'],
                'action' => $a['action'],
            ], Database::all('SELECT * FROM activity_log WHERE project_id = ? ORDER BY created_at DESC, id DESC LIMIT 100', [$id]));
        } else {
            unset($data['id']);
        }
        return $data;
    }

    public static function update(array $u, bool $isStaff = true): array
    {
        $data = [
            'id' => (int) $u['id'],
            'date' => self::iso($u['published_at'] ?? $u['created_at']),
            'title' => $u['title'],
            'body' => $u['body'],
            'author' => ['name' => $u['author_name'], 'role' => $u['author_role']],
            'kind' => $u['kind'],
            'demoLink' => $u['demo_link'],
            'screenshot' => $u['screenshot'],
        ];
        if ($isStaff) {
            $data['visibility'] = $u['visibility'];
            $data['pending'] = $u['status'] === 'pending';
            $data['createdAt'] = self::iso($u['created_at']);
        }
        return $data;
    }

    /** Short project summary for lists and dashboards. */
    public static function projectSummary(array $p): array
    {
        $lastClientUpdate = Database::value(
            "SELECT MAX(COALESCE(published_at, created_at)) FROM updates WHERE project_id = ? AND visibility = 'client' AND status = 'published'",
            [(int) $p['id']],
        );
        $lastMessage = Database::one('SELECT sender FROM messages WHERE project_id = ? ORDER BY created_at DESC, id DESC LIMIT 1', [(int) $p['id']]);
        $daysSince = $lastClientUpdate ? (int) floor((time() - strtotime((string) $lastClientUpdate)) / 86400) : null;
        return [
            'id' => (int) $p['id'],
            'code' => $p['code'],
            'title' => $p['title'],
            'clientName' => $p['client_name'] ?? null,
            'leadName' => $p['lead_name'] ?? null,
            'stage' => $p['stage'],
            'progress' => (int) $p['progress'],
            'targetDate' => $p['target_date'] ? self::iso($p['target_date'] . ' 09:30:00') : null,
            'lastClientUpdateAt' => self::iso($lastClientUpdate ? (string) $lastClientUpdate : null),
            'daysSinceClientUpdate' => $daysSince,
            'stale' => $p['stage'] !== 'DELIVERED' && ($daysSince === null || $daysSince >= Stages::STALE_DAYS),
            'pendingUpdates' => (int) Database::value("SELECT COUNT(*) FROM updates WHERE project_id = ? AND status = 'pending'", [(int) $p['id']]),
            'needsReply' => ($lastMessage['sender'] ?? null) === 'client',
        ];
    }

    public static function idea(array $i, bool $full = false): array
    {
        $payment = Wallet::current((int) $i['id']);
        $data = [
            'id' => (int) $i['id'],
            'ref' => $i['ref'],
            'submittedAt' => self::iso($i['submitted_at'] ?? ($i['status'] === 'DRAFT' ? null : $i['created_at'])),
            'createdAt' => self::iso($i['created_at']),
            'lastSavedAt' => self::iso($i['last_saved_at'] ?? null),
            'source' => $i['source'] ?? 'online',
            'name' => $i['name'],
            'email' => $i['email'],
            'phone' => $i['phone'],
            'organisation' => $i['organisation'],
            'country' => $i['country'],
            'state' => $i['state'],
            'location' => implode(', ', array_filter([$i['state'], $i['country']])),
            'title' => $i['title'],
            'category' => $i['category'],
            'platforms' => json_decode((string) $i['platforms'], true) ?: [],
            'problem' => $i['problem'],
            'targetUsers' => $i['target_users'],
            'features' => $i['features'],
            'budget' => $i['budget'],
            'timeline' => $i['timeline'],
            'nda' => (bool) $i['nda'],
            'status' => $i['status'],
            'notes' => $i['notes'],
            'projectCode' => $i['project_code'] ?? null,
            'attachment' => null,
            'quote' => null,
            'paymentStatus' => Wallet::statusOf($payment),
            'payment' => Wallet::payment($payment, 'staff'),
            'wallet' => Wallet::ledger($i),
        ];
        $quote = Database::one("SELECT * FROM quotes WHERE idea_id = ? AND status <> 'withdrawn' ORDER BY id DESC LIMIT 1", [(int) $i['id']]);
        if ($quote) {
            $data['quote'] = \App\Controllers\QuotesController::present($quote, $i['ref'], null);
        }
        if (!empty($i['attachment_file_id'])) {
            $f = Database::one('SELECT public_id, original_name, size_bytes, mime_type FROM files WHERE id = ?', [(int) $i['attachment_file_id']]);
            if ($f) {
                $data['attachment'] = ['id' => $f['public_id'], 'name' => $f['original_name'], 'size' => (int) $f['size_bytes'], 'type' => $f['mime_type'], 'url' => '/api/staff/files/' . $f['public_id']];
            }
        }
        return $data;
    }

    public static function lead(array $l): array
    {
        return [
            'id' => (int) $l['id'],
            'at' => self::iso($l['created_at']),
            'projectCode' => $l['project_code'] ?? '',
            'projectTitle' => $l['project_title'] ?? 'Website visitor',
            'clientName' => $l['client_name'],
            'contact' => $l['contact'],
            'techId' => $l['technology_id'] ?? '',
            'courseId' => $l['course_id'] ?? '',
            'courseTitle' => $l['course_title'] ?? null,
            'type' => $l['type'],
            'source' => $l['source'] ?? 'portal',
            'invitedBy' => $l['invited_by'] ?? null,
            'status' => $l['status'],
            'notes' => $l['notes'],
        ];
    }

    public static function notification(array $n): array
    {
        return [
            'id' => (int) $n['id'],
            'at' => self::iso($n['created_at']),
            'audience' => $n['audience'],
            'channel' => $n['channel'],
            'to' => $n['recipient'],
            'subject' => $n['subject'],
            'body' => $n['body'],
            'projectCode' => $n['project_code'] ?? null,
            'status' => $n['status'],
            'error' => $n['error'],
        ];
    }
}
