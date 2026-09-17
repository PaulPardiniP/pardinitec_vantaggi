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

    /**
     * Crea una nueva sesión persistida en base de datos y emite la cookie segura.
     *
     * @return array{id: string, user_id: int, csrf_token: string, expires_at: string}
     */
    public function createSession(int $userId, ?string $ipAddress = null, ?string $userAgent = null): array
    {
        $sessionId = bin2hex(random_bytes(32)); // 64 caracteres
        $csrfToken = Csrf::generateToken();     // 64 caracteres

        $stmt = $this->pdo->prepare("
            INSERT INTO `sessions` (`id`, `user_id`, `csrf_token`, `ip_address`, `user_agent`, `last_activity_at`, `created_at`, `expires_at`)
            VALUES (
                :id,
                :user_id,
                :csrf_token,
                :ip_address,
                :user_agent,
                UTC_TIMESTAMP(),
                UTC_TIMESTAMP(),
                DATE_ADD(UTC_TIMESTAMP(), INTERVAL :abs_timeout SECOND)
            )
        ");

        $stmt->execute([
            'id' => $sessionId,
            'user_id' => $userId,
            'csrf_token' => $csrfToken,
            'ip_address' => $ipAddress,
            'user_agent' => $userAgent,
            'abs_timeout' => $this->absoluteTimeout,
        ]);

        $this->sendSessionCookie($sessionId, time() + $this->absoluteTimeout);

        return [
            'id' => $sessionId,
            'user_id' => $userId,
            'csrf_token' => $csrfToken,
            'expires_at' => gmdate('Y-m-d H:i:s', time() + $this->absoluteTimeout),
        ];
    }

    /**
     * Regenera el ID de sesión (protección contra Session Fixation).
     *
     * @return array{id: string, user_id: int, csrf_token: string}
     */
    public function regenerateSession(string $currentSessionId): ?array
    {
        $newSessionId = bin2hex(random_bytes(32));

        $stmt = $this->pdo->prepare("
            UPDATE `sessions`
            SET `id` = :new_id,
                `last_activity_at` = UTC_TIMESTAMP()
            WHERE `id` = :current_id
        ");

        $stmt->execute([
            'new_id' => $newSessionId,
            'current_id' => $currentSessionId,
        ]);

        if ($stmt->rowCount() === 0) {
            return null;
        }

        $session = $this->getSessionById($newSessionId);
        if ($session === null) {
            return null;
        }

        $this->sendSessionCookie($newSessionId, time() + $this->absoluteTimeout);

        return [
            'id' => $newSessionId,
            'user_id' => (int) $session['user_id'],
            'csrf_token' => (string) $session['csrf_token'],
        ];
    }

    /**
     * Valida la sesión activa comprobando existencia, usuario activo, timeout de inactividad y timeout absoluto.
     *
     * @return array{session_id: string, user_id: int, csrf_token: string, user: array{id: int, email: string, name: string, status: string}}|null
     */
    public function validateSession(?string $sessionId = null): ?array
    {
        $id = $sessionId ?? ($_COOKIE[$this->cookieName] ?? null);
        if ($id === null || trim($id) === '') {
            return null;
        }

        $stmt = $this->pdo->prepare("
            SELECT s.`id` AS session_id, s.`user_id`, s.`csrf_token`, s.`last_activity_at`, s.`created_at`, s.`expires_at`,
                   u.`id` AS u_id, u.`email`, u.`name`, u.`status`
            FROM `sessions` s
            INNER JOIN `users` u ON s.`user_id` = u.`id`
            WHERE s.`id` = :id
            LIMIT 1
        ");
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$row) {
            $this->clearSessionCookie();
            return null;
        }

        // Usuario suspendido o inactivo
        if ($row['status'] !== 'active') {
            $this->destroySession($id);
            return null;
        }

        $now = time();
        $createdAtUtc = strtotime($row['created_at'] . ' UTC');
        $lastActivityUtc = strtotime($row['last_activity_at'] . ' UTC');
        $expiresAtUtc = strtotime($row['expires_at'] . ' UTC');

        // 1. Timeout Absoluto
        if ($now >= $expiresAtUtc || ($now - $createdAtUtc) >= $this->absoluteTimeout) {
            $this->destroySession($id);
            return null;
        }

        // 2. Timeout de Inactividad
        if (($now - $lastActivityUtc) >= $this->inactivityTimeout) {
            $this->destroySession($id);
            return null;
        }

        // Actualizar último acceso (keep-alive)
        $updateStmt = $this->pdo->prepare("
            UPDATE `sessions`
            SET `last_activity_at` = UTC_TIMESTAMP()
            WHERE `id` = :id
        ");
        $updateStmt->execute(['id' => $id]);

        return [
            'session_id' => $row['session_id'],
            'user_id' => (int) $row['user_id'],
            'csrf_token' => $row['csrf_token'],
            'user' => [
                'id' => (int) $row['u_id'],
                'email' => $row['email'],
                'name' => $row['name'],
                'status' => $row['status'],
            ],
        ];
    }

    /**
     * Invalida realmente la sesión eliminándola de la base de datos y limpiando la cookie.
     */
    public function destroySession(?string $sessionId = null): void
    {
        $id = $sessionId ?? ($_COOKIE[$this->cookieName] ?? null);
        if ($id !== null && trim($id) !== '') {
            $stmt = $this->pdo->prepare("DELETE FROM `sessions` WHERE `id` = :id");
            $stmt->execute(['id' => $id]);
        }

        $this->clearSessionCookie();
    }

    public function getSessionById(string $sessionId): ?array
    {
        $stmt = $this->pdo->prepare("SELECT * FROM `sessions` WHERE `id` = :id LIMIT 1");
        $stmt->execute(['id' => $sessionId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row ?: null;
    }

    public function sendSessionCookie(string $sessionId, int $expiresTimestamp): void
    {
        if (headers_sent()) {
            return;
        }

        setcookie($this->cookieName, $sessionId, [
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
