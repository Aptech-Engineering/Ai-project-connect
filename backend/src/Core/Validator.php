<?php

declare(strict_types=1);

namespace App\Core;

/**
 * Small declarative validator.
 *
 * Rules per field (pipe-separated): required, nullable, string, max:N, min:N, email, url,
 * int, between:A,B, bool, date, in:a,b,c, array, hexcolor
 */
final class Validator
{
    /**
     * @param array<string, mixed>  $input
     * @param array<string, string> $rules
     * @return array<string, mixed> cleaned values for the fields in $rules (absent optional fields are omitted)
     */
    public static function validate(array $input, array $rules): array
    {
        $clean = [];
        $errors = [];

        foreach ($rules as $field => $ruleString) {
            $ruleList = explode('|', $ruleString);
            $present = array_key_exists($field, $input);
            $value = $input[$field] ?? null;
            if (is_string($value)) {
                $value = trim($value);
            }
            $empty = $value === null || $value === '' || $value === [];

            if (in_array('required', $ruleList, true) && $empty) {
                $errors[$field] = 'This field is required.';
                continue;
            }
            if ($empty) {
                if ($present && in_array('nullable', $ruleList, true)) {
                    $clean[$field] = null;
                }
                continue;
            }

            $error = null;
            foreach ($ruleList as $rule) {
                [$name, $arg] = array_pad(explode(':', $rule, 2), 2, null);
                $error = self::check($name, $arg, $value);
                if ($error !== null) {
                    break;
                }
            }
            if ($error !== null) {
                $errors[$field] = $error;
                continue;
            }

            $clean[$field] = self::cast($ruleList, $value);
        }

        if ($errors !== []) {
            throw HttpError::validation($errors);
        }
        return $clean;
    }

    private static function check(string $name, ?string $arg, mixed $value): ?string
    {
        switch ($name) {
            case 'required':
            case 'nullable':
                return null;
            case 'string':
                return is_string($value) ? null : 'Must be text.';
            case 'max':
                if (is_string($value)) {
                    return mb_strlen($value) <= (int) $arg ? null : "Must be {$arg} characters or fewer.";
                }
                if (is_array($value)) {
                    return count($value) <= (int) $arg ? null : "Choose {$arg} or fewer.";
                }
                return null;
            case 'min':
                return is_string($value) && mb_strlen($value) < (int) $arg ? "Must be at least {$arg} characters." : null;
            case 'email':
                return filter_var($value, FILTER_VALIDATE_EMAIL) !== false ? null : 'Enter a valid email address.';
            case 'url':
                return is_string($value) && preg_match('#^https?://[^\s]+\.[^\s]+$#i', $value) ? null : 'Enter a full link starting with https://';
            case 'int':
                return filter_var($value, FILTER_VALIDATE_INT) !== false ? null : 'Must be a whole number.';
            case 'number':
                return is_numeric($value) ? null : 'Must be a number.';
            case 'between':
                [$lo, $hi] = array_map('floatval', explode(',', (string) $arg));
                return is_numeric($value) && $value >= $lo && $value <= $hi ? null : "Must be between {$lo} and {$hi}.";
            case 'bool':
                return is_bool($value) || in_array($value, [0, 1, '0', '1', 'true', 'false'], true) ? null : 'Must be true or false.';
            case 'date':
                return is_string($value) && preg_match('/^\d{4}-\d{2}-\d{2}/', $value) && strtotime($value) !== false ? null : 'Enter a valid date (YYYY-MM-DD).';
            case 'in':
                return in_array((string) $value, explode(',', (string) $arg), true) ? null : 'Choose a valid option.';
            case 'array':
                return is_array($value) ? null : 'Must be a list.';
            case 'hexcolor':
                return is_string($value) && preg_match('/^#[0-9a-fA-F]{6}$/', $value) ? null : 'Use a colour like #61DAFB.';
            default:
                throw new \LogicException("Unknown validation rule: {$name}");
        }
    }

    /** @param list<string> $rules */
    private static function cast(array $rules, mixed $value): mixed
    {
        if (in_array('int', $rules, true)) {
            return (int) $value;
        }
        if (in_array('number', $rules, true)) {
            return (float) $value;
        }
        if (in_array('bool', $rules, true)) {
            return in_array($value, [true, 1, '1', 'true'], true);
        }
        if (in_array('date', $rules, true)) {
            return substr((string) $value, 0, 10);
        }
        if (in_array('array', $rules, true)) {
            return array_values(array_map(static fn ($v) => is_string($v) ? trim($v) : $v, $value));
        }
        return $value;
    }
}
