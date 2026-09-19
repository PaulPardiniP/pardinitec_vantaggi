<?php

declare(strict_types=1);

namespace App\Core\Audit;

use PDO;
use RuntimeException;

final class AuditLogger
{
    private PDO $pdo;

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    public function log(
        string $action,
        string $resource,
        ?int $resourceId = null,
        array $meta = [],
        ?int $actorUserId = null,
        ?int $businessId = null
    ): void {
        try {
            $stmt = $this->pdo->prepare("
                INSERT INTO `audit_logs` (
                    `business_id`,
                    `actor_user_id`,
                    `action`,
                    `resource`,
                    `resource_id`,
                    `meta`,
                    `ip_address`,
                    `created_at`
                ) VALUES (
                    :business_id,
                    :actor_user_id,
                    :action,
                    :resource,
                    :resource_id,
                    :meta,
                    :ip_address,
                    UTC_TIMESTAMP()
                )
            ");

            // Filter out sensitive data from meta just in case
            unset($meta['password'], $meta['password_hash'], $meta['totp_secret'], $meta['recovery_codes']);

            $ip = $_SERVER['REMOTE_ADDR'] ?? null;
            if (isset($_SERVER['HTTP_X_FORWARDED_FOR'])) {
                $ip = explode(',', (string) $_SERVER['HTTP_X_FORWARDED_FOR'])[0];
            }

            $stmt->execute([
                'business_id'   => $businessId,
                'actor_user_id' => $actorUserId,
                'action'        => $action,
                'resource'      => $resource,
                'resource_id'   => $resourceId,
                'meta'          => empty($meta) ? null : json_encode($meta, JSON_UNESCAPED_UNICODE),
                'ip_address'    => $ip ? substr(trim($ip), 0, 45) : null,
            ]);
        } catch (\Throwable $e) {
            // Depending on policy, we might not want to crash the app if audit fails, 
            // but for security-critical apps, audit failure should block the action.
            // We'll throw to ensure audit is atomic with the transaction if active.
            throw new RuntimeException('Failed to write audit log: ' . $e->getMessage(), 0, $e);
        }
    }
}
