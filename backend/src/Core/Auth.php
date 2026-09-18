<?php

declare(strict_types=1);

namespace App\Core;

/**
 * Cookie sessions for staff and clients.
 * Staff sign in with email + password; clients with Project ID + one-time code.
 */
final class Auth
{
    public const ROLES = ['admin', 'lead', 'engineer', 'counsellor'];

    /** @var array<string, mixed>|null */
    private static ?array $staffCache = null;

    public static function startSession(): void
    {
        if (session_status() === PHP_SESSION_ACTIVE) {
            return;
        }
        $lifetime = (int) Config::get('session.lifetime_minutes', 120) * 60;
        session_name((string) Config::get('session.name', 'apc_session'));
        session_set_cookie_params([
            'lifetime' => 0,
            'path' => '/',
            'secure' => (bool) Config::get('session.secure', true),
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
        ini_set('session.use_strict_mode', '1');
        ini_set('session.gc_maxlifetime', (string) $lifetime);
        session_start();

        // Idle timeout
        $now = time();
        if (isset($_SESSION['last_seen']) && $now - (int) $_SESSION['last_seen'] > $lifetime) {
            $_SESSION = [];
            session_regenerate_id(true);
        }
        $_SESSION['last_seen'] = $now;
    }

    /* ---------------- staff ---------------- */

    public static function loginStaff(array $user): void
    {
        session_regenerate_id(true);
        $_SESSION['staff_id'] = (int) $user['id'];
        self::$staffCache = null;
    }

    public static function logoutStaff(): void
    {
        unset($_SESSION['staff_id']);
        session_regenerate_id(true);
        self::$staffCache = null;
    }

    /** @return array<string, mixed>|null */
    public static function staff(): ?array
    {
        $id = $_SESSION['staff_id'] ?? null;
        if (!$id) {
            return null;
        }
        if (self::$staffCache === null || (int) self::$staffCache['id'] !== (int) $id) {
            self::$staffCache = Database::one(
                "SELECT id, name, email, phone, role, job_title, status FROM users WHERE id = ? AND status = 'active'",
                [(int) $id],
            );
            if (self::$staffCache === null) {
                unset($_SESSION['staff_id']);
            }
        }
        return self::$staffCache;
    }

    /**
     * Requires a signed-in staff member with one of the given roles.
     * @param list<string> $roles empty = any staff role
     * @return array<string, mixed>
     */
    public static function requireStaff(array $roles = []): array
    {
        $user = self::staff();
        if ($user === null) {
            throw HttpError::unauthorized('Please sign in to the Engineering Panel.');
        }
        if ($roles !== [] && !in_array($user['role'], $roles, true)) {
            throw HttpError::forbidden();
        }
        return $user;
    }

    /** Leads and admins can change stages, approve updates, manage teams (PRD section 09). */
    public static function canLead(array $user): bool
    {
        return in_array($user['role'], ['admin', 'lead'], true);
    }

    /* ---------------- clients ---------------- */

    public static function loginClient(int $clientId): void
    {
        session_regenerate_id(true);
        $_SESSION['client_id'] = $clientId;
        $_SESSION['client_version'] = (int) Database::value('SELECT session_version FROM clients WHERE id = ?', [$clientId]);
    }

    public static function logoutClient(): void
    {
        unset($_SESSION['client_id'], $_SESSION['client_version']);
        session_regenerate_id(true);
    }

    public static function clientId(): ?int
    {
        $id = $_SESSION['client_id'] ?? null;
        if (!$id) {
            return null;
        }
        // Signed out everywhere when the team regenerates a Project ID.
        $version = Database::value('SELECT session_version FROM clients WHERE id = ?', [(int) $id]);
        if ($version === null || (int) $version !== (int) ($_SESSION['client_version'] ?? 0)) {
            unset($_SESSION['client_id'], $_SESSION['client_version']);
            return null;
        }
        return (int) $id;
    }

    public static function requireClient(): int
    {
        $id = self::clientId();
        if ($id === null) {
            throw HttpError::unauthorized('Please sign in with your Project ID and one-time code.');
        }
        return $id;
    }
}
