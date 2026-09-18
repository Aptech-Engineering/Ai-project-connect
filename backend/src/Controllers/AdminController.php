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
use App\Support\SiteContent;

/** Admin-only: website content, courses & pricing, technologies, images and user accounts. */
final class AdminController
{
    private const CURRENCIES = 'NGN,GHS,KES,ZAR,USD,GBP,EUR,INR,AED';

    /* ---------------- website content ---------------- */

    public static function saveContent(Request $r): void
    {
        $user = Auth::requireStaff(['admin']);
        $input = $r->input();
        if (!is_array($input) || $input === []) {
            throw HttpError::validation(['content' => 'Send the full content document.']);
        }
        $json = json_encode($input);
        if ($json === false || strlen($json) > 500_000) {
            throw HttpError::validation(['content' => 'Content is too large.']);
        }
        self::assertContentShape($input);
        $saved = SiteContent::save($input, (int) $user['id']);
        Activity::staff($user, 'Published website content');
        Response::json($saved);
    }

    public static function resetContent(Request $r): void
    {
        $user = Auth::requireStaff(['admin']);
        SiteContent::reset();
        Activity::staff($user, 'Reset website content to defaults');
        Response::json(SiteContent::get());
    }

    /** Uploads a public image (fliers, course fliers). Returns the id to store in content or a course. */
    public static function uploadImage(Request $r): void
    {
        $user = Auth::requireStaff(['admin']);
        $upload = $r->file('file');
        if ($upload === null) {
            throw HttpError::validation(['file' => 'Choose an image to upload.']);
        }
        $stored = Uploads::store($upload, 'image', 'public', (int) $user['id']);
        Response::json(['id' => $stored['publicId'], 'url' => Presenter::publicFileUrl($stored['publicId']), 'name' => $stored['name'], 'size' => $stored['size']], 201);
    }

    /* ---------------- courses ---------------- */

    public static function courses(Request $r): void
    {
        Auth::requireStaff(['admin']);
        $rows = Database::all('SELECT c.*, f.public_id AS flier_public_id FROM courses c LEFT JOIN files f ON f.id = c.flier_file_id ORDER BY c.sort_order, c.title');
        Response::json(array_map([Presenter::class, 'course'], $rows));
    }

    public static function createCourse(Request $r): void
    {
        $user = Auth::requireStaff(['admin']);
        $data = self::validateCourse($r->input(), true);
        $id = Codes::slug($data['id'] ?? $data['title']);
        $base = $id;
        for ($n = 2; Database::value('SELECT 1 FROM courses WHERE id = ?', [$id]); $n++) {
            $id = substr($base, 0, 55) . '-' . $n;
        }
        Database::insert('courses', ['id' => $id] + self::courseColumns($data) + ['sort_order' => (int) Database::value('SELECT COALESCE(MAX(sort_order), 0) + 1 FROM courses')]);
        Activity::staff($user, "Created course \"{$data['title']}\"");
        Response::json(self::course($id), 201);
    }

    public static function updateCourse(Request $r): void
    {
        $user = Auth::requireStaff(['admin']);
        $id = $r->params['id'];
        if (!Database::value('SELECT 1 FROM courses WHERE id = ?', [$id])) {
            throw HttpError::notFound('Course not found.');
        }
        $data = self::validateCourse($r->input(), false);
        Database::update('courses', self::courseColumns($data), ['id' => $id]);
        Activity::staff($user, "Updated course \"{$id}\"");
        Response::json(self::course($id));
    }

    public static function deleteCourse(Request $r): void
    {
        $user = Auth::requireStaff(['admin']);
        $course = Database::one('SELECT id, title FROM courses WHERE id = ?', [$r->params['id']]);
        if ($course === null) {
            throw HttpError::notFound('Course not found.');
        }
        Database::run('DELETE FROM courses WHERE id = ?', [$course['id']]);
        Activity::staff($user, "Deleted course \"{$course['title']}\"");
        Response::noContent();
    }

    private static function validateCourse(array $input, bool $creating): array
    {
        $req = $creating ? 'required' : 'nullable';
        $data = Validator::validate($input, [
            'id' => 'nullable|string|max:60',
            'title' => "{$req}|string|min:3|max:160",
            'description' => 'nullable|string|max:2000',
            'duration' => "{$req}|string|max:60",
            'format' => "{$req}|string|max:80",
            'nextStart' => 'nullable|date',
            'price' => "{$req}|number|between:0,1000000000",
            'currency' => "{$req}|in:" . self::CURRENCIES,
            'discountPercent' => 'nullable|int|between:0,100',
            'discountCode' => 'nullable|string|max:40',
            'flierId' => 'nullable|string|max:32',
            'enrolUrl' => 'nullable|url|max:500',
            'published' => 'nullable|bool',
        ]);
        if (!empty($data['flierId'])) {
            $fileId = Database::value("SELECT id FROM files WHERE public_id = ? AND visibility = 'public' AND mime_type LIKE 'image/%'", [$data['flierId']]);
            if (!$fileId) {
                throw HttpError::validation(['flierId' => 'Upload the flier image first.']);
            }
            $data['flierFileId'] = (int) $fileId;
        }
        return $data;
    }

    private static function courseColumns(array $d): array
    {
        $map = [
            'title' => 'title', 'description' => 'description', 'duration' => 'duration', 'format' => 'format',
            'nextStart' => 'next_start', 'price' => 'price', 'currency' => 'currency', 'discountPercent' => 'discount_percent',
            'discountCode' => 'discount_code', 'enrolUrl' => 'enrol_url',
        ];
        $cols = [];
        foreach ($map as $in => $col) {
            if (array_key_exists($in, $d)) {
                $cols[$col] = $d[$in];
            }
        }
        if (isset($cols['discount_code'])) {
            $cols['discount_code'] = strtoupper((string) $cols['discount_code']);
        }
        if (array_key_exists('flierId', $d)) {
            $cols['flier_file_id'] = $d['flierFileId'] ?? null;
        }
        if (array_key_exists('published', $d) && $d['published'] !== null) {
            $cols['published'] = $d['published'] ? 1 : 0;
        }
        foreach (['title', 'duration', 'format', 'price', 'currency'] as $required) {
            if (array_key_exists($required, $cols) && $cols[$required] === null) {
                unset($cols[$required]);
            }
        }
        return $cols;
    }

    private static function course(string $id): array
    {
        return Presenter::course(Database::one('SELECT c.*, f.public_id AS flier_public_id FROM courses c LEFT JOIN files f ON f.id = c.flier_file_id WHERE c.id = ?', [$id]));
    }

    /* ---------------- technologies ---------------- */

    public static function createTechnology(Request $r): void
    {
        $user = Auth::requireStaff(['admin']);
        $data = self::validateTechnology($r->input(), true);
        $id = Codes::slug($data['id'] ?? $data['name']);
        $base = $id;
        for ($n = 2; Database::value('SELECT 1 FROM technologies WHERE id = ?', [$id]); $n++) {
            $id = substr($base, 0, 55) . '-' . $n;
        }
        Database::insert('technologies', ['id' => $id] + self::technologyColumns($data) + ['sort_order' => (int) Database::value('SELECT COALESCE(MAX(sort_order), 0) + 1 FROM technologies')]);
        Activity::staff($user, "Created technology \"{$data['name']}\"");
        Response::json(Presenter::technology(Database::one('SELECT * FROM technologies WHERE id = ?', [$id])), 201);
    }

    public static function updateTechnology(Request $r): void
    {
        $user = Auth::requireStaff(['admin']);
        $id = $r->params['id'];
        if (!Database::value('SELECT 1 FROM technologies WHERE id = ?', [$id])) {
            throw HttpError::notFound('Technology not found.');
        }
        $data = self::validateTechnology($r->input(), false);
        Database::update('technologies', self::technologyColumns($data), ['id' => $id]);
        Activity::staff($user, "Updated technology \"{$id}\"");
        Response::json(Presenter::technology(Database::one('SELECT * FROM technologies WHERE id = ?', [$id])));
    }

    public static function deleteTechnology(Request $r): void
    {
        $user = Auth::requireStaff(['admin']);
        $tech = Database::one('SELECT id, name FROM technologies WHERE id = ?', [$r->params['id']]);
        if ($tech === null) {
            throw HttpError::notFound('Technology not found.');
        }
        Database::run('DELETE FROM technologies WHERE id = ?', [$tech['id']]);
        Activity::staff($user, "Deleted technology \"{$tech['name']}\"");
        Response::noContent();
    }

    private static function validateTechnology(array $input, bool $creating): array
    {
        $req = $creating ? 'required' : 'nullable';
        $data = Validator::validate($input, [
            'id' => 'nullable|string|max:60',
            'name' => "{$req}|string|min:1|max:80",
            'category' => "{$req}|string|max:60",
            'plain' => "{$req}|string|min:10|max:500",
            'mark' => 'nullable|string|max:3',
            'color' => 'nullable|hexcolor',
            'courseId' => 'nullable|string|max:60',
        ]);
        if (!empty($data['courseId']) && !Database::value('SELECT 1 FROM courses WHERE id = ?', [$data['courseId']])) {
            throw HttpError::validation(['courseId' => 'Choose an existing course.']);
        }
        if ($creating && empty($data['mark'])) {
            $data['mark'] = mb_substr($data['name'], 0, 2);
        }
        return $data;
    }

    private static function technologyColumns(array $d): array
    {
        $map = ['name' => 'name', 'category' => 'category', 'plain' => 'plain_description', 'mark' => 'mark', 'color' => 'color', 'courseId' => 'course_id'];
        $cols = [];
        foreach ($map as $in => $col) {
            if (array_key_exists($in, $d) && !($d[$in] === null && in_array($in, ['name', 'category', 'plain', 'mark', 'color'], true))) {
                $cols[$col] = $in === 'courseId' ? ($d[$in] ?: null) : $d[$in];
            }
        }
        return $cols;
    }

    /* ---------------- users & roles ---------------- */

    public static function users(Request $r): void
    {
        Auth::requireStaff(['admin']);
        // Workload per user in one grouped query: active projects they lead or are on the team of.
        $counts = array_column(Database::all(
            "SELECT user_id, COUNT(DISTINCT project_id) AS projects FROM (
                 SELECT lead_id AS user_id, id AS project_id FROM projects WHERE stage <> 'DELIVERED' AND lead_id IS NOT NULL
                 UNION
                 SELECT pm.user_id, pm.project_id FROM project_members pm JOIN projects p ON p.id = pm.project_id WHERE p.stage <> 'DELIVERED'
             ) assignments GROUP BY user_id",
        ), 'projects', 'user_id');
        Response::json(array_map(
            static fn (array $u) => Presenter::user($u) + ['projectCount' => (int) ($counts[(int) $u['id']] ?? 0)],
            Database::all('SELECT * FROM users ORDER BY status, name'),
        ));
    }

    public static function createUser(Request $r): void
    {
        $admin = Auth::requireStaff(['admin']);
        $data = Validator::validate($r->input(), [
            'name' => 'required|string|min:2|max:120',
            'email' => 'required|email|max:190',
            'phone' => 'nullable|string|max:40',
            'role' => 'required|in:' . implode(',', Auth::ROLES),
            'jobTitle' => 'nullable|string|max:120',
            'password' => 'required|string|min:10|max:200',
        ]);
        $email = strtolower($data['email']);
        if (Database::value('SELECT 1 FROM users WHERE email = ?', [$email])) {
            throw HttpError::validation(['email' => 'A user with this email already exists.']);
        }
        $id = Database::insert('users', [
            'name' => $data['name'],
            'email' => $email,
            'phone' => $data['phone'] ?? null,
            'role' => $data['role'],
            'job_title' => $data['jobTitle'] ?? null,
            'password_hash' => password_hash($data['password'], PASSWORD_DEFAULT),
            'must_change_password' => 1,
        ]);
        Activity::staff($admin, "Created {$data['role']} account for {$data['name']}");
        Notifier::staff($email, 'Your AI Project Connect staff account', "Hi {$data['name']},\n\nAn admin created a " . Presenter::roleLabel($data['role']) . " account for you. Sign in at " . \App\Support\Links::engineering() . " with {$email} and the temporary password your admin shares with you. You'll be asked to choose a new password.");
        Response::json(Presenter::user(Database::one('SELECT * FROM users WHERE id = ?', [$id])), 201);
    }

    public static function updateUser(Request $r): void
    {
        $admin = Auth::requireStaff(['admin']);
        $id = (int) $r->params['id'];
        $user = Database::one('SELECT * FROM users WHERE id = ?', [$id]);
        if ($user === null) {
            throw HttpError::notFound('User not found.');
        }
        $data = Validator::validate($r->input(), [
            'name' => 'nullable|string|min:2|max:120',
            'phone' => 'nullable|string|max:40',
            'role' => 'nullable|in:' . implode(',', Auth::ROLES),
            'jobTitle' => 'nullable|string|max:120',
            'status' => 'nullable|in:active,disabled',
            'password' => 'nullable|string|min:10|max:200',
        ]);
        if ($id === (int) $admin['id'] && ((isset($data['role']) && $data['role'] !== 'admin') || ($data['status'] ?? 'active') === 'disabled')) {
            throw HttpError::badRequest("You can't remove your own admin access.");
        }
        $losesAdmin = $user['role'] === 'admin' && $user['status'] === 'active' && ((isset($data['role']) && $data['role'] !== 'admin') || ($data['status'] ?? 'active') === 'disabled');
        if ($losesAdmin && (int) Database::value("SELECT COUNT(*) FROM users WHERE role = 'admin' AND status = 'active'") <= 1) {
            throw HttpError::badRequest('Keep at least one active admin.');
        }
        $changes = array_filter([
            'name' => $data['name'] ?? null,
            'role' => $data['role'] ?? null,
            'status' => $data['status'] ?? null,
            'password_hash' => !empty($data['password']) ? password_hash($data['password'], PASSWORD_DEFAULT) : null,
            'must_change_password' => !empty($data['password']) ? 1 : null,
        ], static fn ($v) => $v !== null);
        foreach (['phone' => 'phone', 'jobTitle' => 'job_title'] as $in => $col) {
            if (array_key_exists($in, $data)) {
                $changes[$col] = $data[$in];
            }
        }
        Database::update('users', $changes, ['id' => $id]);

        $summary = [];
        if (isset($changes['role']) && $changes['role'] !== $user['role']) {
            $summary[] = "role {$user['role']} → {$changes['role']}";
        }
        if (isset($changes['status']) && $changes['status'] !== $user['status']) {
            $summary[] = "status → {$changes['status']}";
        }
        if (isset($changes['password_hash'])) {
            $summary[] = 'password reset';
        }
        if ($summary) {
            Activity::staff($admin, "Changed {$user['name']}: " . implode(', ', $summary));
        }
        Response::json(Presenter::user(Database::one('SELECT * FROM users WHERE id = ?', [$id])));
    }

    /* ---------------- helpers ---------------- */

    /** Basic structure checks so a bad request can't break the public site. */
    private static function assertContentShape(array $content): void
    {
        $errors = [];
        $lists = ['nav.links', 'hero.trustPoints', 'fliers.items', 'supportPlans.plans', 'ideaForm.categories', 'ideaForm.platforms', 'ideaForm.budgets', 'ideaForm.timelines', 'footer.columns'];
        foreach ($lists as $path) {
            [$section, $key] = explode('.', $path);
            if (isset($content[$section][$key]) && !is_array($content[$section][$key])) {
                $errors[$path] = 'Must be a list.';
            }
        }
        foreach (['categories', 'platforms', 'budgets', 'timelines'] as $key) {
            if (isset($content['ideaForm'][$key]) && is_array($content['ideaForm'][$key]) && count(array_filter($content['ideaForm'][$key], 'is_string')) === 0) {
                $errors["ideaForm.{$key}"] = 'Add at least one option.';
            }
        }
        foreach (is_array($content['fliers']['items'] ?? null) ? $content['fliers']['items'] : [] as $i => $flier) {
            if (is_array($flier) && !empty($flier['imageId']) && !Database::value("SELECT 1 FROM files WHERE public_id = ? AND visibility = 'public'", [(string) $flier['imageId']])) {
                $errors["fliers.items.{$i}.imageId"] = 'Upload the flier image first.';
            }
        }
        // Only the client-facing wording lives in content; the fee, bank details and keys are in Settings → Payments.
        $payments = $content['payments'] ?? null;
        if ($payments !== null) {
            if (!is_array($payments) || array_is_list($payments)) {
                $errors['payments'] = 'Must be an object.';
            } else {
                foreach (['feeTitle', 'feeExplainer', 'transferInstructions', 'confirmationTime'] as $key) {
                    if (array_key_exists($key, $payments) && !is_string($payments[$key])) {
                        $errors["payments.{$key}"] = 'Must be text.';
                    }
                }
                if (isset($payments['confirmationTime']) && is_string($payments['confirmationTime']) && trim($payments['confirmationTime']) === '') {
                    $errors['payments.confirmationTime'] = 'Tell clients how long confirmation takes, e.g. "1 working day".';
                }
            }
        }
        if ($errors) {
            throw HttpError::validation($errors);
        }
    }
}
