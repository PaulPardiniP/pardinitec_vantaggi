<?php

declare(strict_types=1);

namespace App\Core\Security;

use App\Core\Database\Connection;
use PDO;

final class RateLimiter
{
    private PDO $pdo;

    public function __construct(?PDO $pdo = null)
    {
        $this->pdo = $pdo ?? Connection::get();
    }

    /**
     * Registra un intento y determina si se permite la operación según la ventana temporal configurada.
     * Almacena únicamente el hash SHA-256 del identificador para evitar almacenar PII o tokens planos.
     *
     * @return array{allowed: bool, hits: int, remaining: int, retry_after: int}
     */
    public function hit(string $action, string $rawIdentifier, int $maxAttempts, int $decaySeconds): array
    {
        $identifierHash = hash('sha256', $rawIdentifier);

        // Actualización atómica del contador con ON DUPLICATE KEY UPDATE:
        // MariaDB adquiere un bloqueo exclusivo de fila (X-lock) sobre la clave única (action, identifier_hash).
        // - Si no existe: se inserta con hits = 1 y expires_at = ahora + decay.
        // - Si existe pero ya expiró (expires_at <= UTC_TIMESTAMP()): reinicia hits = 1 y nueva ventana.
        // - Si existe y sigue activa: incrementa hits = hits + 1 atómicamente a nivel de motor.
        // Esto previene de forma absoluta la pérdida de incrementos simultáneos sin condiciones de carrera en PHP.
        $upsert = $this->pdo->prepare("
            INSERT INTO `rate_limits` (
                `action`, `identifier_hash`, `hits`, `first_hit_at`, `last_hit_at`, `expires_at`
            ) VALUES (
                :action, :hash, 1, UTC_TIMESTAMP(), UTC_TIMESTAMP(), DATE_ADD(UTC_TIMESTAMP(), INTERVAL :decay SECOND)
            )
            ON DUPLICATE KEY UPDATE
                `hits` = IF(`expires_at` <= UTC_TIMESTAMP(), 1, `hits` + 1),
                `first_hit_at` = IF(`expires_at` <= UTC_TIMESTAMP(), UTC_TIMESTAMP(), `first_hit_at`),
                `last_hit_at` = UTC_TIMESTAMP(),
                `expires_at` = IF(`expires_at` <= UTC_TIMESTAMP(), DATE_ADD(UTC_TIMESTAMP(), INTERVAL :decay2 SECOND), `expires_at`)
        ");
        $upsert->execute([
            'action' => $action,
            'hash' => $identifierHash,
            'decay' => $decaySeconds,
            'decay2' => $decaySeconds,
        ]);

        // Consulta del estado atómico final registrado en MariaDB
        $stmt = $this->pdo->prepare("
            SELECT `hits`,
                   TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), `expires_at`) AS `seconds_remaining`
            FROM `rate_limits`
            WHERE `action` = :action AND `identifier_hash` = :hash
            LIMIT 1
        ");
        $stmt->execute([
            'action' => $action,
            'hash' => $identifierHash,
        ]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        $hits = $row ? (int) $row['hits'] : 1;
        $secondsRemaining = $row ? (int) $row['seconds_remaining'] : $decaySeconds;
        $retryAfter = max(1, $secondsRemaining);

        return [
            'allowed' => $hits <= $maxAttempts,
            'hits' => $hits,
            'remaining' => max(0, $maxAttempts - $hits),
            'retry_after' => $retryAfter,
        ];
    }

    /**
     * Consulta el estado de rate limit sin incrementar el conteo.
     *
     * @return array{allowed: bool, hits: int, remaining: int, retry_after: int}
     */
    public function check(string $action, string $rawIdentifier, int $maxAttempts): array
    {
        $identifierHash = hash('sha256', $rawIdentifier);

        $stmt = $this->pdo->prepare("
            SELECT `hits`,
                   TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), `expires_at`) AS `seconds_remaining`
            FROM `rate_limits`
            WHERE `action` = :action AND `identifier_hash` = :hash
            LIMIT 1
        ");
        $stmt->execute([
            'action' => $action,
            'hash' => $identifierHash,
        ]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$row || (int) $row['seconds_remaining'] <= 0) {
            return [
                'allowed' => true,
                'hits' => 0,
                'remaining' => $maxAttempts,
                'retry_after' => 0,
            ];
        }

        $hits = (int) $row['hits'];
        $remaining = max(0, $maxAttempts - $hits);
        $retryAfter = max(0, (int) $row['seconds_remaining']);

        return [
            'allowed' => $hits <= $maxAttempts,
            'hits' => $hits,
            'remaining' => $remaining,
            'retry_after' => $retryAfter,
        ];
    }

    /**
     * Reinicia el límite para un identificador específico (por ejemplo, tras login exitoso).
     */
    public function reset(string $action, string $rawIdentifier): void
    {
        $identifierHash = hash('sha256', $rawIdentifier);

        $stmt = $this->pdo->prepare("
            DELETE FROM `rate_limits`
            WHERE `action` = :action AND `identifier_hash` = :hash
        ");
        $stmt->execute([
            'action' => $action,
            'hash' => $identifierHash,
        ]);
    }

    /**
     * Limpia registros expirados para mantenimiento.
     */
    public function clearExpired(): int
    {
        $stmt = $this->pdo->prepare("
            DELETE FROM `rate_limits`
            WHERE `expires_at` <= UTC_TIMESTAMP()
        ");
        $stmt->execute();
        return $stmt->rowCount();
    }
}
