<?php

declare(strict_types=1);

namespace App\Support;

use App\Controllers\StaffController;
use App\Core\Activity;
use App\Core\Database;
use App\Core\HttpError;
use App\Core\Validator;

final class Ideas
{
    /** API field => ideas column */
    public const FIELDS = [
        'name' => 'name', 'email' => 'email', 'phone' => 'phone', 'organisation' => 'organisation', 'country' => 'country',
        'state' => 'state', 'title' => 'title', 'category' => 'category', 'platforms' => 'platforms', 'problem' => 'problem',
        'targetUsers' => 'target_users', 'features' => 'features', 'budget' => 'budget', 'timeline' => 'timeline', 'nda' => 'nda',
    ];

    private const COMPLETE_RULES = [
        'name' => 'required|string|min:2|max:120',
        'email' => 'required|email|max:190',
        'phone' => 'required|string|min:7|max:40',
        'organisation' => 'nullable|string|max:160',
        'country' => 'required|string|max:80',
        'state' => 'required|string|max:80',
        'title' => 'required|string|min:2|max:160',
        'category' => 'required|string|max:80',
        'platforms' => 'required|array|max:10',
        'problem' => 'required|string|min:15|max:5000',
        'targetUsers' => 'required|string|min:3|max:2000',
        'features' => 'required|string|min:10|max:5000',
        'budget' => 'required|string|max:80',
        'timeline' => 'required|string|max:80',
        'nda' => 'nullable|bool',
    ];

    /**
     * Validates idea form fields.
     * $complete = true: every required field must be present and valid (submitting).
     * $complete = false: only the fields sent are checked, with lengths and list options (saving a draft).
     * @return array<string, mixed> ideas columns => values for the fields that were sent
     */
    public static function validateFields(array $input, bool $complete): array
    {
        if (isset($input['platforms']) && is_string($input['platforms'])) {
            $decoded = json_decode($input['platforms'], true);
            $input['platforms'] = is_array($decoded) ? $decoded : array_values(array_filter(array_map('trim', explode(',', $input['platforms']))));
        }
        $rules = self::COMPLETE_RULES;
        if (!$complete) {
            $rules = array_map(static fn (string $rule) => implode('|', array_filter(
                explode('|', str_replace('required', 'nullable', $rule)),
                static fn (string $part) => !str_starts_with($part, 'min:'),
            )), $rules);
            $rules['email'] = 'nullable|email|max:190';
            $input = array_intersect_key($input, $rules);
        }
        $data = Validator::validate($input, $rules);

        $options = SiteContent::get()['ideaForm'];
        $errors = [];
        if (!empty($data['category']) && !in_array($data['category'], $options['categories'], true)) {
            $errors['category'] = 'Choose a category from the list.';
        }
        if (!empty($data['platforms']) && array_diff($data['platforms'], $options['platforms']) !== []) {
            $errors['platforms'] = 'Choose platforms from the list.';
        }
        if (!empty($data['budget']) && !in_array($data['budget'], $options['budgets'], true)) {
            $errors['budget'] = 'Choose a budget range from the list.';
        }
        if (!empty($data['timeline']) && !in_array($data['timeline'], $options['timelines'], true)) {
            $errors['timeline'] = 'Choose a timeline from the list.';
        }
        if (!empty($data['phone']) && strlen((string) preg_replace('/\D/', '', $data['phone'])) < 10) {
            $errors['phone'] = 'Enter a phone number we can call or text.';
        }
        if ($errors !== []) {
            throw HttpError::validation($errors);
        }

        $columns = [];
        foreach ($data as $field => $value) {
            $column = self::FIELDS[$field];
            $columns[$column] = match ($field) {
                'email' => $value !== null ? strtolower((string) $value) : null,
                'platforms' => $value !== null ? json_encode($value, JSON_UNESCAPED_UNICODE) : null,
                'nda' => $value === null ? 1 : ($value ? 1 : 0),
                default => $value,
            };
        }
        if ($complete && !array_key_exists('nda', $columns)) {
            $columns['nda'] = 1;
        }
        return $columns;
    }

    /** Checks a saved draft has everything needed to submit (422 listing the missing fields). */
    public static function assertComplete(array $idea): void
    {
        $input = [];
        foreach (self::FIELDS as $field => $column) {
            $value = $idea[$column] ?? null;
            if ($field === 'platforms') {
                $value = $value !== null ? (json_decode((string) $value, true) ?: []) : null;
            }
            if ($value !== null) {
                $input[$field] = $value;
            }
        }
        try {
            self::validateFields($input, true);
        } catch (HttpError $e) {
            throw HttpError::validation($e->errors, 'Please complete these fields before submitting.');
        }
    }

    /** Fields still missing for submission (for the applicant's progress indicator). @return list<string> */
    public static function missingFields(array $idea): array
    {
        try {
            self::assertComplete($idea);
            return [];
        } catch (HttpError $e) {
            return array_keys($e->errors);
        }
    }
    /**
     * Turns an idea into a registered client + project and sends the Project ID.
     * $actor is null when the client accepted a quote online.
     */
    public static function register(array $idea, array $lead, string $targetDate, ?string $startDate, ?array $actor): array
    {
        if ($idea['project_id'] !== null) {
            throw HttpError::badRequest('This idea is already registered as a project.');
        }
        if ($idea['status'] === 'DRAFT') {
            throw new HttpError(409, "This application hasn't been submitted yet.");
        }
        Wallet::assertPaid($idea, 'registering it as a project');
        return Database::transaction(static function () use ($idea, $lead, $targetDate, $startDate, $actor) {
            $clientId = Database::value('SELECT id FROM clients WHERE email = ? ORDER BY id LIMIT 1', [$idea['email']]);
            if (!$clientId) {
                $clientId = Database::insert('clients', [
                    'name' => $idea['name'],
                    'email' => $idea['email'],
                    'phone' => $idea['phone'],
                    'organisation' => $idea['organisation'],
                    'country' => $idea['country'],
                    'state' => $idea['state'],
                ]);
            }
            $project = StaffController::registerProject((int) $clientId, [
                'title' => $idea['title'],
                'tagline' => mb_strlen($idea['problem']) > 250 ? mb_substr($idea['problem'], 0, 247) . '…' : $idea['problem'],
                'category' => $idea['category'],
                'platforms' => implode(' + ', json_decode($idea['platforms'], true) ?: []),
                'budget' => $idea['budget'],
                'startDate' => $startDate ?? date('Y-m-d'),
                'targetDate' => $targetDate,
            ], $actor, $lead, $idea['attachment_file_id'] ? (int) $idea['attachment_file_id'] : null, $idea['name']);

            Database::update('ideas', ['status' => 'ACCEPTED', 'project_id' => (int) $project['id']], ['id' => (int) $idea['id']]);
            if ($actor) {
                Activity::staff($actor, "Registered client & project from idea {$idea['ref']}", (int) $project['id']);
            }
            return $project;
        });
    }
}
