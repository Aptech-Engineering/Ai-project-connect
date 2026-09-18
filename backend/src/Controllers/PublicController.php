<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Database;
use App\Core\HttpError;
use App\Core\Notifier;
use App\Core\RateLimiter;
use App\Core\Request;
use App\Core\Response;
use App\Core\Uploads;
use App\Core\Validator;
use App\Core\Config;
use App\Support\Codes;
use App\Support\Presenter;
use App\Support\SiteContent;

/** Endpoints anyone can call: site content, courses, idea submission, course enquiries. */
final class PublicController
{
    public static function health(Request $r): void
    {
        Database::value('SELECT 1');
        Response::json(['ok' => true, 'time' => date('c')]);
    }

    public static function content(Request $r): void
    {
        Response::json(SiteContent::get());
    }

    public static function courses(Request $r): void
    {
        $rows = Database::all(
            'SELECT c.*, f.public_id AS flier_public_id FROM courses c LEFT JOIN files f ON f.id = c.flier_file_id WHERE c.published = 1 ORDER BY c.sort_order, c.title',
        );
        Response::json(array_map([Presenter::class, 'course'], $rows));
    }

    public static function technologies(Request $r): void
    {
        Response::json(array_map([Presenter::class, 'technology'], Database::all('SELECT * FROM technologies ORDER BY sort_order, name')));
    }

    /** Public images such as course fliers and promotion fliers. */
    public static function file(Request $r): void
    {
        $file = Database::one("SELECT * FROM files WHERE public_id = ? AND visibility = 'public'", [$r->params['id']]);
        $path = $file ? Uploads::path($file) : '';
        if (!$file || !is_file($path)) {
            throw HttpError::notFound('File not found.');
        }
        Response::file($path, $file['mime_type'], $file['original_name'], true, true);
    }

    /** Lets the submitter check progress with their reference. Never reveals the Project ID. */
    public static function ideaStatus(Request $r): void
    {
        RateLimiter::hit('idea-status:' . $r->ip(), 30, 900);
        $ref = strtoupper(trim($r->params['ref']));
        if (!Codes::isIdeaRef($ref)) {
            throw HttpError::validation(['ref' => 'Idea references look like IDEA-4QX7M.']);
        }
        $idea = Database::one('SELECT ref, title, status, created_at, submitted_at, project_id FROM ideas WHERE ref = ?', [$ref]);
        if ($idea === null) {
            throw HttpError::notFound("We couldn't find an idea with that reference.");
        }
        Response::json([
            'ref' => $idea['ref'],
            'title' => $idea['title'],
            'status' => $idea['status'],
            'submittedAt' => Presenter::iso($idea['submitted_at']),
            'projectRegistered' => $idea['project_id'] !== null,
        ]);
    }

    /** Enquiry from the public courses section. Creates a counsellor lead. */
    public static function courseEnquiry(Request $r): void
    {
        RateLimiter::hit('enquiry:' . $r->ip(), 10, 3600);
        $data = Validator::validate($r->input(), [
            'courseId' => 'required|string|max:60',
            'type' => 'required|in:info,enrol',
            'name' => 'required|string|min:2|max:120',
            'contact' => 'required|string|min:6|max:190',
        ]);
        $course = Database::one('SELECT id, title FROM courses WHERE id = ? AND published = 1', [$data['courseId']]);
        if ($course === null) {
            throw HttpError::notFound('Course not found.');
        }
        $id = Database::insert('leads', [
            'client_name' => $data['name'],
            'contact' => $data['contact'],
            'course_id' => $course['id'],
            'type' => $data['type'],
            'source' => 'website',
        ]);
        ReportsController::recordEvent($data['type'] === 'enrol' ? 'enrol' : 'request', $course['id']);
        Notifier::email(
            'counsellor',
            (string) Config::get('notifications.admissions_email'),
            sprintf('New %s from the website: %s', $data['type'] === 'enrol' ? 'enrolment' : 'info request', $course['title']),
            "{$data['name']} ({$data['contact']}) asked about {$course['title']}.",
        );
        Response::json(['id' => $id, 'message' => 'A course counsellor will contact you soon.'], 201);
    }
}
