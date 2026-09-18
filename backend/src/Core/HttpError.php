<?php

declare(strict_types=1);

namespace App\Core;

use RuntimeException;

/** Thrown anywhere in a request to return a JSON error with the given status. */
final class HttpError extends RuntimeException
{
    /** @param array<string, string> $errors field => message */
    public function __construct(
        public readonly int $status,
        string $message,
        public readonly array $errors = [],
    ) {
        parent::__construct($message, $status);
    }

    public static function badRequest(string $message = 'Bad request.'): self
    {
        return new self(400, $message);
    }

    public static function unauthorized(string $message = 'Please sign in.'): self
    {
        return new self(401, $message);
    }

    public static function forbidden(string $message = "You don't have permission to do that."): self
    {
        return new self(403, $message);
    }

    public static function notFound(string $message = 'Not found.'): self
    {
        return new self(404, $message);
    }

    /** @param array<string, string> $errors */
    public static function validation(array $errors, string $message = 'Please check the highlighted fields.'): self
    {
        return new self(422, $message, $errors);
    }

    public static function tooManyRequests(int $retryAfterSeconds): self
    {
        return new self(429, "Too many attempts. Please try again in {$retryAfterSeconds} seconds.", ['retryAfter' => (string) $retryAfterSeconds]);
    }
}
