<?php

declare(strict_types=1);

namespace App\Modules\Businesses;

use App\Core\Database\Connection;
use PDO;

final class AuthorizationService
{
    private PDO $pdo;

    public function __construct(?PDO $pdo = null)
    {
        $this->pdo = $pdo ?? Connection::get();
    }

    /**
     * Comprueba si el usuario tiene privilegios de Super Admin en la plataforma.
     */
    public function isSuperAdmin(int $userId): bool
    {
        $stmt = $this->pdo->prepare("SELECT `is_super_admin` FROM `users` WHERE `id` = :id AND `status` = 'active' LIMIT 1");
        $stmt->execute(['id' => $userId]);
        $val = $stmt->fetchColumn();
        return (bool) $val;
    }

    /**
     * Obtiene la membresía activa del usuario en el comercio, reconociendo también al Super Admin.
     *
     * @return array{id: int, business_id: int, user_id: int, role: string, status: string}|null
     */
    public function getMembership(int $userId, int $businessId): ?array
    {
        // 1. Reconocimiento de Super Admin a nivel de plataforma
        if ($this->isSuperAdmin($userId)) {
            // Verificar existencia del comercio
            $bizStmt = $this->pdo->prepare("SELECT `id` FROM `businesses` WHERE `id` = :id LIMIT 1");
            $bizStmt->execute(['id' => $businessId]);
            if ($bizStmt->fetch()) {
                return [
                    'id' => 0,
                    'business_id' => $businessId,
                    'user_id' => $userId,
                    'role' => Role::SUPER_ADMIN,
                    'status' => 'active',
                ];
            }
            return null;
        }

        // 2. Membresía local del comercio
        $stmt = $this->pdo->prepare("
            SELECT bm.`id`, bm.`business_id`, bm.`user_id`, bm.`role`, bm.`status`
            FROM `business_memberships` bm
            INNER JOIN `businesses` b ON bm.`business_id` = b.`id`
            WHERE bm.`user_id` = :user_id
              AND bm.`business_id` = :business_id
              AND bm.`status` = 'active'
              AND b.`status` = 'active'
            LIMIT 1
        ");

        $stmt->execute([
            'user_id' => $userId,
            'business_id' => $businessId,
        ]);

        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$row) {
            return null;
        }

        return [
            'id' => (int) $row['id'],
            'business_id' => (int) $row['business_id'],
            'user_id' => (int) $row['user_id'],
            'role' => (string) $row['role'],
            'status' => (string) $row['status'],
        ];
    }

    /**
     * Valida obligatoriamente en PHP que el usuario pertenezca al comercio (o sea Super Admin).
     *
     * @return array{id: int, business_id: int, user_id: int, role: string, status: string}
     * @throws ForbiddenException
     */
    public function requireMembership(int $userId, int $businessId): array
    {
        $membership = $this->getMembership($userId, $businessId);
        if ($membership === null) {
            throw new ForbiddenException('No tiene acceso a este comercio.');
        }

        return $membership;
    }

    /**
     * Valida obligatoriamente en PHP que el usuario tenga un permiso específico en el comercio.
     *
     * @return array{id: int, business_id: int, user_id: int, role: string, status: string}
     * @throws ForbiddenException
     */
    public function requirePermission(int $userId, int $businessId, string $permission): array
    {
        $membership = $this->requireMembership($userId, $businessId);

        if (!Permission::can($membership['role'], $permission)) {
            throw new ForbiddenException("No tiene permisos para ejecutar la acción '{$permission}' en este comercio.");
        }

        return $membership;
    }
}
