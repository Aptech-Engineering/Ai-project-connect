<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Activity;
use App\Core\Auth;
use App\Core\Config;
use App\Core\Notifier;
use App\Core\Database;
use App\Core\HttpError;
use App\Core\RateLimiter;
use App\Core\Request;
use App\Core\Response;
use App\Core\Validator;
use App\Support\Presenter;

final class StaffAuthController
{
    public static function login(Request $r): void
    {
        $data = Validator::validate($r->input(), [
            'email' => 'required|string|max:190',
            'password' => 'required|string|max:200',
        ]);
        $email = strtolower($data['email']);
        $bucket = 'staff-login:' . $r->ip() . ':' . $email;
        RateLimiter::ensureAllowed($bucket, 5, 900);
        RateLimiter::hit('staff-login-ip:' . $r->ip(), 30, 900);

        $user = Database::one('SELECT * FROM users WHERE email = ?', [$email]);
        // Always run a hash check so response time doesn't reveal whether the email exists.
        $hash = $user['password_hash'] ?? password_hash(bin2hex(random_bytes(12)), PASSWORD_DEFAULT);
        $valid = password_verify($data['password'], $hash);

        if (!$user || !$valid || $user['status'] !== 'active') {
            RateLimiter::hit($bucket, 5, 900);
            throw new HttpError(401, 'Incorrect email or password.');
        }

        RateLimiter::clear($bucket);
        if (password_needs_rehash($user['password_hash'], PASSWORD_DEFAULT)) {
            Database::update('users', ['password_hash' => password_hash($data['password'], PASSWORD_DEFAULT)], ['id' => (int) $user['id']]);
        }
        Database::update('users', ['last_login_at' => date('Y-m-d H:i:s')], ['id' => (int) $user['id']]);
        Auth::loginStaff($user);
        Response::json(['user' => Presenter::user($user)]);
    }

    public static function logout(Request $r): void
    {
        Auth::logoutStaff();
        Response::noContent();
    }

    public static function me(Request $r): void
    {
        Response::json(['user' => Presenter::user(Auth::requireStaff())]);
    }

    public static function changePassword(Request $r): void
    {
        $user = Auth::requireStaff();
        RateLimiter::hit('change-password:' . $user['id'], 5, 900);
        $data = Validator::validate($r->input(), [
            'currentPassword' => 'required|string|max:200',
            'newPassword' => 'required|string|min:10|max:200',
        ]);
        $hash = (string) Database::value('SELECT password_hash FROM users WHERE id = ?', [(int) $user['id']]);
        if (!password_verify($data['currentPassword'], $hash)) {
            throw HttpError::validation(['currentPassword' => 'Your current password is incorrect.']);
        }
        if (password_verify($data['newPassword'], $hash)) {
            throw HttpError::validation(['newPassword' => 'Choose a different password from your current one.']);
        }
        Database::update('users', ['password_hash' => password_hash($data['newPassword'], PASSWORD_DEFAULT), 'must_change_password' => 0], ['id' => (int) $user['id']]);
        session_regenerate_id(true);
        Response::json(['message' => 'Password updated.']);
    }

    /** Always answers the same way so the form can't be used to discover staff emails. */
    public static function forgotPassword(Request $r): void
    {
        $data = Validator::validate($r->input(), ['email' => 'required|email|max:190']);
        $email = strtolower($data['email']);
        RateLimiter::hit('forgot-ip:' . $r->ip(), 10, 900);
        $response = ['message' => 'If that email belongs to an active staff account, a reset link is on its way. It expires in 1 hour.'];

        $user = Database::one("SELECT * FROM users WHERE email = ? AND status = 'active'", [$email]);
        $recent = $user ? (int) Database::value('SELECT COUNT(*) FROM password_resets WHERE user_id = ? AND created_at > (NOW() - INTERVAL 1 HOUR)', [(int) $user['id']]) : 0;
        if ($user && $recent < 3) {
            $token = bin2hex(random_bytes(32));
            Database::run('DELETE FROM password_resets WHERE user_id = ? AND used_at IS NULL', [(int) $user['id']]);
            Database::insert('password_resets', ['user_id' => (int) $user['id'], 'token_hash' => hash('sha256', $token), 'expires_at' => date('Y-m-d H:i:s', time() + 3600)]);
            $link = rtrim((string) Config::get('app.url'), '/') . '/engineering?reset=' . $token;
            Notifier::staff($user['email'], 'Reset your AI Project Connect password', "Hi {$user['name']},\n\nSomeone asked to reset the password for your staff account. Choose a new password here (the link expires in 1 hour and works once):\n{$link}\n\nIf this wasn't you, you can ignore this email.");
            if (Config::get('otp.expose_in_response') && !Config::isProduction()) {
                $response['devToken'] = $token; // local testing only
            }
        }
        Response::json($response);
    }

    public static function resetPassword(Request $r): void
    {
        RateLimiter::hit('reset-ip:' . $r->ip(), 20, 900);
        $data = Validator::validate($r->input(), [
            'token' => 'required|string|max:100',
            'password' => 'required|string|min:10|max:200',
        ]);
        $reset = Database::one(
            "SELECT pr.*, u.name, u.email, u.role, u.status FROM password_resets pr JOIN users u ON u.id = pr.user_id
             WHERE pr.token_hash = ? AND pr.used_at IS NULL AND pr.expires_at > NOW()",
            [hash('sha256', $data['token'])],
        );
        if ($reset === null || $reset['status'] !== 'active') {
            throw HttpError::badRequest('This reset link is invalid or has expired. Request a new one.');
        }
        Database::transaction(static function () use ($reset, $data) {
            Database::update('users', ['password_hash' => password_hash($data['password'], PASSWORD_DEFAULT), 'must_change_password' => 0], ['id' => (int) $reset['user_id']]);
            Database::update('password_resets', ['used_at' => date('Y-m-d H:i:s')], ['id' => (int) $reset['id']]);
            Database::run('DELETE FROM password_resets WHERE user_id = ? AND used_at IS NULL', [(int) $reset['user_id']]);
        });
        RateLimiter::clear('staff-login:' . $r->ip() . ':' . $reset['email']);
        Activity::staff(['id' => $reset['user_id'], 'name' => $reset['name'], 'role' => $reset['role']], 'Reset password with an email link');
        Notifier::staff($reset['email'], 'Your password was changed', "Hi {$reset['name']},\n\nThe password for your AI Project Connect staff account was just changed. If this wasn't you, contact an admin immediately.");
        Response::json(['message' => 'Password updated. You can sign in now.']);
    }
}
