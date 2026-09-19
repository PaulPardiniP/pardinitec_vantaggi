<?php

declare(strict_types=1);

namespace App\Core\Auth;

use App\Core\Database\Connection;
use App\Core\Security\Csrf;
use PDO;

final class SessionManager
{
    private PDO $pdo;
    private string $cookieName;
    private int $inactivityTimeout;
    private int $absoluteTimeout;

    public function __construct(
        ?PDO $pdo = null,
        string $cookieName = 'vantaggi_session',
        int $inactivityTimeout = 1800, // 30 minutos
        int $absoluteTimeout = 28800   // 8 horas
    ) {
        $this->pdo = $pdo ?? Connection::get();
        $this->cookieName = $cookieName;
        $this->inactivityTimeout = (int) ($_ENV['SESSION_INACTIVITY_TIMEOUT'] ?? $inactivityTimeout);
        $this->absoluteTimeout = (int) ($_ENV['SESSION_ABSOLUTE_TIMEOUT'] ?? $absoluteTimeout);
    }

    public function getCookieName(): string
    {
        return $this->cookieName;
    }

    public function getInactivityTimeout(): int
    {
        return $this->inactivityTimeout;
    }

    public function getAbsoluteTimeout(): int
    {
        return $this->absoluteTimeout;
    }

    public function isSecure(): bool
    {
        return (($_ENV['APP_ENV'] ?? 'local') === 'production');
    }

    public static function hashToken(string $plainToken): string
    {
        return hash('sha256', $plainToken);
    }

    /**
     * Crea una nueva sesión persistiendo ÚNICAMENTE el hash SHA-256 en MariaDB.
     * El token plano original se envía exclusivamente a la cookie del cliente.
     *
     * @return array{id: string, token_hash: string, user_id: int, csrf_token: string, expires_at: string}
     */
    public function createSession(int $userId, ?string $ipAddress = null, ?string $userAgent = null, string $state = 'active'): array
    {
        $plainToken = bin2hex(random_bytes(32)); // 64 caracteres hex (token original para cookie)
        $tokenHash = self::hashToken($plainToken); // Hash SHA-256 almacenado en DB
        $csrfToken = Csrf::generateToken();       // 64 caracteres hex

        $stmt = $this->pdo->prepare("
            INSERT INTO `sessions` (`id`, `user_id`, `state`, `csrf_token`, `ip_address`, `user_agent`, `last_activity_at`, `created_at`, `expires_at`)
            VALUES (
                :id,
                :user_id,
                :state,
                :csrf_token,
                :ip_address,
                :user_agent,
                UTC_TIMESTAMP(),
                UTC_TIMESTAMP(),
                DATE_ADD(UTC_TIMESTAMP(), INTERVAL :abs_timeout SECOND)
            )
        ");

        $stmt->execute([
            'id' => $tokenHash,
            'user_id' => $userId,
            'state' => $state,
            'csrf_token' => $csrfToken,
            'ip_address' => $ipAddress,
            'user_agent' => $userAgent,
            'abs_timeout' => $this->absoluteTimeout,
        ]);

        $this->sendSessionCookie($plainToken, time() + $this->absoluteTimeout);

        return [
            'id' => $plainToken,
            'token_hash' => $tokenHash,
            'user_id' => $userId,
            'csrf_token' => $csrfToken,
            'expires_at' => gmdate('Y-m-d H:i:s', time() + $this->absoluteTimeout),
        ];
    }

    /**
     * Regenera el ID de sesión.
     *
     * @return array{id: string, token_hash: string, user_id: int, csrf_token: string}|null
     */
    public function regenerateSession(string $currentPlainToken): ?array
    {
        $currentHash = self::hashToken($currentPlainToken);
        $newPlainToken = bin2hex(random_bytes(32));
        $newHash = self::hashToken($newPlainToken);

        $stmt = $this->pdo->prepare("
            UPDATE `sessions`
            SET `id` = :new_id,
                `last_activity_at` = UTC_TIMESTAMP()
            WHERE `id` = :current_id
        ");

        $stmt->execute([
            'new_id' => $newHash,
            'current_id' => $currentHash,
        ]);

        if ($stmt->rowCount() === 0) {
            return null;
        }

        $session = $this->getSessionByHash($newHash);
        if ($session === null) {
            return null;
        }

        $this->sendSessionCookie($newPlainToken, time() + $this->absoluteTimeout);

        return [
            'id' => $newPlainToken,
            'token_hash' => $newHash,
            'user_id' => (int) $session['user_id'],
            'csrf_token' => (string) $session['csrf_token'],
        ];
    }

    /**
     * Valida la sesión activa buscando por el hash SHA-256 del token provisto en la cookie.
     *
     * @return array{session_id: string, token_hash: string, user_id: int, csrf_token: string, user: array{id: int, email: string, name: string, status: string}}|null
     */
    public function validateSession(?string $plainToken = null): ?array
    {
        $token = $plainToken ?? ($_COOKIE[$this->cookieName] ?? null);
        if ($token === null || trim($token) === '') {
            return null;
        }

        $tokenHash = self::hashToken($token);

        $stmt = $this->pdo->prepare("
            SELECT s.`id` AS token_hash, s.`user_id`, s.`state`, s.`csrf_token`, s.`last_activity_at`, s.`created_at`, s.`expires_at`,
                   u.`id` AS u_id, u.`email`, u.`name`, u.`status`, u.`is_super_admin`, u.`totp_enabled`
            FROM `sessions` s
            INNER JOIN `users` u ON s.`user_id` = u.`id`
            WHERE s.`id` = :id
            LIMIT 1
        ");
        $stmt->execute(['id' => $tokenHash]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$row) {
            $this->clearSessionCookie();
            return null;
        }

        // Usuario suspendido o inactivo
        if ($row['status'] !== 'active') {
            $this->destroySession($token);
            return null;
        }

        $now = time();
        $createdAtUtc = strtotime($row['created_at'] . ' UTC');
        $lastActivityUtc = strtotime($row['last_activity_at'] . ' UTC');
        $expiresAtUtc = strtotime($row['expires_at'] . ' UTC');

        // 1. Timeout Absoluto
        if ($now >= $expiresAtUtc || ($now - $createdAtUtc) >= $this->absoluteTimeout) {
            $this->destroySession($token);
            return null;
        }

        // 2. Timeout de Inactividad
        if (($now - $lastActivityUtc) >= $this->inactivityTimeout) {
            $this->destroySession($token);
            return null;
        }

        // Actualizar último acceso (keep-alive)
        $updateStmt = $this->pdo->prepare("
            UPDATE `sessions`
            SET `last_activity_at` = UTC_TIMESTAMP()
            WHERE `id` = :id
        ");
        $updateStmt->execute(['id' => $tokenHash]);

        return [
            'session_id' => $token,
            'token_hash' => $tokenHash,
            'user_id' => (int) $row['user_id'],
            'csrf_token' => $row['csrf_token'],
            'state' => $row['state'],
            'user' => [
                'id' => (int) $row['u_id'],
                'email' => (string) $row['email'],
                'name' => (string) $row['name'],
                'status' => (string) $row['status'],
                'is_super_admin' => (bool) $row['is_super_admin'],
                'totp_enabled' => (bool) ($row['totp_enabled'] ?? false),
            ],
        ];
    }

    /**
     * Invalida realmente la sesión eliminando el hash de la base de datos y limpiando la cookie.
     */
    public function destroySession(?string $plainToken = null): void
    {
        $token = $plainToken ?? ($_COOKIE[$this->cookieName] ?? null);
        if ($token !== null && trim($token) !== '') {
            $tokenHash = self::hashToken($token);
            $stmt = $this->pdo->prepare("DELETE FROM `sessions` WHERE `id` = :id");
            $stmt->execute(['id' => $tokenHash]);
        }

        $this->clearSessionCookie();
    }

    public function getSessionByHash(string $tokenHash): ?array
    {
        $stmt = $this->pdo->prepare("SELECT * FROM `sessions` WHERE `id` = :id LIMIT 1");
        $stmt->execute(['id' => $tokenHash]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row ?: null;
    }

    public function sendSessionCookie(string $plainToken, int $expiresTimestamp): void
    {
        if (headers_sent()) {
            return;
        }

        setcookie($this->cookieName, $plainToken, [
            'expires' => $expiresTimestamp,
            'path' => '/',
            'domain' => '',
            'secure' => $this->isSecure(),
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
    }

    public function clearSessionCookie(): void
    {
        if (headers_sent()) {
            return;
        }

        setcookie($this->cookieName, '', [
            'expires' => time() - 3600,
            'path' => '/',
            'domain' => '',
            'secure' => $this->isSecure(),
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
    }
}
