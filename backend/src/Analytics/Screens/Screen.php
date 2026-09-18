<?php

declare(strict_types=1);

namespace App\Analytics\Screens;

use App\Analytics\Period;
use App\Core\Request;

/**
 * One analytics screen (spec 4 / 9.5). Each screen declares its filters and definitions, builds `data`,
 * and names the tables that can be exported.
 */
abstract class Screen
{
    /** @var list<string> filters shown on this screen (meta.filters) */
    public const FILTERS = [];

    /** @var list<string> metric keys whose definitions go in meta.definitions */
    public const DEFINITIONS = [];

    public const ADMIN_ONLY = false;

    /** @param array<string, mixed> $viewer the signed-in staff user */
    abstract public static function data(Period $p, array $viewer, Request $r): array;

    /**
     * Exportable tables: key => list of flat rows. The default exports every list of rows found in `data`.
     * @return array<string, list<array<string, mixed>>>
     */
    public static function tables(array $data): array
    {
        $tables = [];
        foreach ($data as $key => $value) {
            if (is_array($value) && array_is_list($value) && $value !== [] && is_array($value[0])) {
                $tables[$key] = $value;
            } elseif (is_array($value) && !array_is_list($value)) {
                foreach ($value as $sub => $inner) {
                    if (is_array($inner) && array_is_list($inner) && $inner !== [] && is_array($inner[0])) {
                        $tables[$key . '.' . $sub] = $inner;
                    }
                }
            }
        }
        return $tables;
    }

    protected static function isAdmin(array $viewer): bool
    {
        return $viewer['role'] === 'admin';
    }
}
