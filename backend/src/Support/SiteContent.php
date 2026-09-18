<?php

declare(strict_types=1);

namespace App\Support;

use App\Core\Database;

/** Admin-managed website content, stored as one JSON document and merged over the defaults. */
final class SiteContent
{
    /** @var array<string, mixed>|null */
    private static ?array $cache = null;

    /** @return array<string, mixed> */
    public static function defaults(): array
    {
        $json = file_get_contents(APC_ROOT . '/database/default-content.json');
        return json_decode((string) $json, true, 512, JSON_THROW_ON_ERROR);
    }

    /** @return array<string, mixed> */
    public static function get(): array
    {
        if (self::$cache !== null) {
            return self::$cache;
        }
        $defaults = self::defaults();
        $raw = Database::value('SELECT content FROM site_content WHERE id = 1');
        $saved = is_string($raw) ? json_decode($raw, true) : null;
        return self::$cache = is_array($saved) ? self::merge($defaults, $saved) : $defaults;
    }

    /** @param array<string, mixed> $content */
    public static function save(array $content, ?int $userId): array
    {
        $merged = self::merge(self::defaults(), $content);
        Database::run(
            'INSERT INTO site_content (id, content, updated_by) VALUES (1, :content, :user)
             ON DUPLICATE KEY UPDATE content = VALUES(content), updated_by = VALUES(updated_by)',
            ['content' => json_encode($merged, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR), 'user' => $userId],
        );
        return self::$cache = $merged;
    }

    public static function reset(): void
    {
        Database::run('DELETE FROM site_content WHERE id = 1');
        self::$cache = null;
    }

    /**
     * Keeps only known top-level sections and merges each section shallowly,
     * so new default fields appear automatically after upgrades.
     */
    private static function merge(array $defaults, array $saved): array
    {
        $out = $defaults;
        foreach ($defaults as $section => $value) {
            if (!array_key_exists($section, $saved)) {
                continue;
            }
            $out[$section] = is_array($value) && is_array($saved[$section]) && !array_is_list($value)
                ? array_merge($value, array_intersect_key($saved[$section], $value))
                : $saved[$section];
        }
        return $out;
    }
}
