<?php

declare(strict_types=1);

namespace App\Core;

final class Request
{
    /** @var array<string, string> route parameters, e.g. {code} */
    public array $params = [];

    /** @var array<string, mixed>|null */
    private ?array $json = null;

    public function __construct(
        public readonly string $method,
        public readonly string $path,
    ) {
    }

    public static function fromGlobals(): self
    {
        $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
        $path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
        $path = '/' . trim(rawurldecode($path), '/');
        return new self($method, $path);
    }

    public function header(string $name): ?string
    {
        $key = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
        $value = $_SERVER[$key] ?? null;
        if ($value === null && strcasecmp($name, 'Content-Type') === 0) {
            $value = $_SERVER['CONTENT_TYPE'] ?? null;
        }
        return is_string($value) ? $value : null;
    }

    public function query(string $key, ?string $default = null): ?string
    {
        $value = $_GET[$key] ?? $default;
        return is_string($value) ? $value : $default;
    }

    /** JSON body for application/json requests, or form fields for multipart uploads. */
    public function input(): array
    {
        if ($this->json !== null) {
            return $this->json;
        }
        $type = (string) $this->header('Content-Type');
        if (str_contains($type, 'application/json')) {
            $raw = file_get_contents('php://input') ?: '';
            if (strlen($raw) > 1_000_000) {
                throw new HttpError(413, 'Request body is too large.');
            }
            $decoded = $raw === '' ? [] : json_decode($raw, true);
            if (!is_array($decoded)) {
                throw HttpError::badRequest('Invalid JSON body.');
            }
            return $this->json = $decoded;
        }
        return $this->json = $_POST;
    }

    /** Unparsed request body (webhook signatures are computed over the exact bytes). */
    public function rawBody(int $maxBytes = 1_000_000): string
    {
        $raw = file_get_contents('php://input', false, null, 0, $maxBytes + 1) ?: '';
        if (strlen($raw) > $maxBytes) {
            throw new HttpError(413, 'Request body is too large.');
        }
        return $raw;
    }

    /** @return array{name:string,type:string,tmp_name:string,error:int,size:int}|null */
    public function file(string $field): ?array
    {
        $file = $_FILES[$field] ?? null;
        if (!is_array($file) || ($file['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
            return null;
        }
        return $file;
    }

    public function ip(): string
    {
        // REMOTE_ADDR only: X-Forwarded-For is client-controlled on shared hosting.
        return (string) ($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0');
    }
}
