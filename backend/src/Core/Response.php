<?php

declare(strict_types=1);

namespace App\Core;

final class Response
{
    public static function json(mixed $data, int $status = 200): void
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    }

    /** Redirects the browser (used after the Paystack checkout returns). */
    public static function redirect(string $url, int $status = 302): void
    {
        http_response_code($status);
        header('Location: ' . $url);
        header('Cache-Control: no-store');
    }

    public static function noContent(): void
    {
        http_response_code(204);
    }

    /** Streams a stored file with safe headers. */
    public static function file(string $path, string $mime, string $downloadName, bool $inline, bool $publicCache = false): void
    {
        $safeName = preg_replace('/[^A-Za-z0-9._ -]/', '_', $downloadName) ?: 'file';
        http_response_code(200);
        header('Content-Type: ' . $mime);
        header('Content-Length: ' . (string) filesize($path));
        header('X-Content-Type-Options: nosniff');
        header("Content-Security-Policy: default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
        header(sprintf('Content-Disposition: %s; filename="%s"', $inline ? 'inline' : 'attachment', $safeName));
        header($publicCache ? 'Cache-Control: public, max-age=86400' : 'Cache-Control: private, no-store');
        readfile($path);
    }
}
