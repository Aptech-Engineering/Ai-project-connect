<?php

declare(strict_types=1);

namespace App\Core;

/** Audit trail for stage changes, publishing and permission changes. */
final class Activity
{
    public static function staff(array $user, string $action, ?int $projectId = null): void
    {
        self::write('staff', (int) $user['id'], sprintf('%s (%s)', $user['name'], \App\Support\Presenter::roleLabel((string) $user['role'])), $action, $projectId);
    }

    public static function client(array $client, string $action, int $projectId): void
    {
        self::write('client', (int) $client['id'], $client['name'] . ' (Client)', $action, $projectId);
    }

    public static function system(string $action, ?int $projectId = null): void
    {
        self::write('system', null, 'System', $action, $projectId);
    }

    private static function write(string $type, ?int $actorId, string $name, string $action, ?int $projectId): void
    {
        Database::insert('activity_log', [
            'project_id' => $projectId,
            'actor_type' => $type,
            'actor_id' => $actorId,
            'actor_name' => mb_substr($name, 0, 160),
            'action' => mb_substr($action, 0, 500),
            'ip_address' => PHP_SAPI === 'cli' ? null : ($_SERVER['REMOTE_ADDR'] ?? null),
        ]);
    }
}
