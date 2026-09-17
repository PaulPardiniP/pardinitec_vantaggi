<?php

declare(strict_types=1);

namespace App\Modules\Loyalty;

use App\Core\Database\Connection;
use InvalidArgumentException;
use PDO;

final class LoyaltyService
{
    private PDO $pdo;

    public function __construct(?PDO $pdo = null)
    {
        $this->pdo = $pdo ?? Connection::get();
    }

    /**
     * Lista los perfiles de fidelización disponibles y activos.
     *
     * @return array<int, array{id: int, code: string, name: string, status: string}>
     */
    public function listProfiles(): array
    {
        $stmt = $this->pdo->query("
            SELECT `id`, `code`, `name`, `status`
            FROM `card_profiles`
            WHERE `status` = 'active'
            ORDER BY `id` ASC
        ");

        return array_map(static function (array $row): array {
            return [
                'id' => (int) $row['id'],
                'code' => (string) $row['code'],
                'name' => (string) $row['name'],
                'status' => (string) $row['status'],
            ];
        }, $stmt->fetchAll(PDO::FETCH_ASSOC));
    }

    /**
     * Obtiene un perfil por su código comercial ('punti', 'vantaggi', 'vip').
     *
     * @return array{id: int, code: string, name: string, status: string}|null
     */
    public function getProfileByCode(string $code): ?array
    {
        $stmt = $this->pdo->prepare("
            SELECT `id`, `code`, `name`, `status`
            FROM `card_profiles`
            WHERE `code` = :code AND `status` = 'active'
            LIMIT 1
        ");
        $stmt->execute(['code' => strtolower(trim($code))]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$row) {
            return null;
        }

        return [
            'id' => (int) $row['id'],
            'code' => (string) $row['code'],
            'name' => (string) $row['name'],
            'status' => (string) $row['status'],
        ];
    }

    /**
     * Obtiene un perfil por su ID numérico.
     *
     * @return array{id: int, code: string, name: string, status: string}|null
     */
    public function getProfileById(int $id): ?array
    {
        $stmt = $this->pdo->prepare("
            SELECT `id`, `code`, `name`, `status`
            FROM `card_profiles`
            WHERE `id` = :id AND `status` = 'active'
            LIMIT 1
        ");
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$row) {
            return null;
        }

        return [
            'id' => (int) $row['id'],
            'code' => (string) $row['code'],
            'name' => (string) $row['name'],
            'status' => (string) $row['status'],
        ];
    }

    /**
     * Crea una cuenta de fidelización para un cliente, con balance inicial 0.
     * Valida existencia del cliente en el negocio, perfil activo y previene duplicados.
     *
     * @return array{id: int, business_id: int, customer_id: int, card_profile_id: int, profile_code: string, profile_name: string, balance: int, status: string, created_at: string}
     */
    public function createAccount(int $businessId, int $customerId, int|string $profileIdOrCode): array
    {
        // 1. Validar que el cliente pertenezca al comercio
        $custStmt = $this->pdo->prepare("
            SELECT `id` FROM `customers`
            WHERE `id` = :customer_id AND `business_id` = :business_id
            LIMIT 1
        ");
        $custStmt->execute([
            'customer_id' => $customerId,
            'business_id' => $businessId,
        ]);
        if (!$custStmt->fetch()) {
            throw new InvalidArgumentException('El cliente no existe o no pertenece a este comercio.');
        }

        // 2. Resolver y validar perfil
        $profile = is_int($profileIdOrCode)
            ? $this->getProfileById($profileIdOrCode)
            : $this->getProfileByCode((string) $profileIdOrCode);

        if (!$profile) {
            throw new InvalidArgumentException("Perfil de fidelización inválido o inactivo: '{$profileIdOrCode}'.");
        }

        // 3. Prevenir duplicado de cuenta activa para el mismo perfil y cliente
        $checkStmt = $this->pdo->prepare("
            SELECT `id` FROM `loyalty_accounts`
            WHERE `business_id` = :business_id
              AND `customer_id` = :customer_id
              AND `card_profile_id` = :profile_id
              AND `status` = 'active'
            LIMIT 1
        ");
        $checkStmt->execute([
            'business_id' => $businessId,
            'customer_id' => $customerId,
            'profile_id' => $profile['id'],
        ]);
        if ($checkStmt->fetch()) {
            throw new InvalidArgumentException("El cliente ya posee una cuenta de fidelización activa para el perfil '{$profile['name']}'.");
        }

        // 4. Insertar cuenta de fidelización con saldo inicial 0
        $insertStmt = $this->pdo->prepare("
            INSERT INTO `loyalty_accounts` (
                `business_id`,
                `customer_id`,
                `card_profile_id`,
                `balance`,
                `status`,
                `created_at`,
                `updated_at`
            ) VALUES (
                :business_id,
                :customer_id,
                :profile_id,
                0,
                'active',
                UTC_TIMESTAMP(),
                UTC_TIMESTAMP()
            )
        ");

        $insertStmt->execute([
            'business_id' => $businessId,
            'customer_id' => $customerId,
            'profile_id' => $profile['id'],
        ]);

        $accountId = (int) $this->pdo->lastInsertId();

        return [
            'id' => $accountId,
            'business_id' => $businessId,
            'customer_id' => $customerId,
            'card_profile_id' => $profile['id'],
            'profile_code' => $profile['code'],
            'profile_name' => $profile['name'],
            'balance' => 0,
            'status' => 'active',
            'created_at' => gmdate('Y-m-d H:i:s'),
        ];
    }

    /**
     * Obtiene las cuentas de fidelización de un cliente en un negocio.
     *
     * @return array<int, array<string, mixed>>
     */
    public function getAccountsByCustomer(int $businessId, int $customerId): array
    {
        $stmt = $this->pdo->prepare("
            SELECT la.`id`, la.`business_id`, la.`customer_id`, la.`card_profile_id`,
                   la.`balance`, la.`status`, la.`created_at`,
                   cp.`code` AS `profile_code`, cp.`name` AS `profile_name`
            FROM `loyalty_accounts` la
            INNER JOIN `card_profiles` cp ON la.`card_profile_id` = cp.`id`
            WHERE la.`business_id` = :business_id
              AND la.`customer_id` = :customer_id
            ORDER BY la.`id` ASC
        ");
        $stmt->execute([
            'business_id' => $businessId,
            'customer_id' => $customerId,
        ]);

        return array_map(static function (array $row): array {
            return [
                'id' => (int) $row['id'],
                'business_id' => (int) $row['business_id'],
                'customer_id' => (int) $row['customer_id'],
                'card_profile_id' => (int) $row['card_profile_id'],
                'profile_code' => (string) $row['profile_code'],
                'profile_name' => (string) $row['profile_name'],
                'balance' => (int) $row['balance'],
                'status' => (string) $row['status'],
                'created_at' => (string) $row['created_at'],
            ];
        }, $stmt->fetchAll(PDO::FETCH_ASSOC));
    }

    /**
     * Obtiene los detalles de una cuenta de fidelización específica por ID.
     *
     * @return array<string, mixed>|null
     */
    public function getAccount(int $businessId, int $accountId): ?array
    {
        $stmt = $this->pdo->prepare("
            SELECT la.`id`, la.`business_id`, la.`customer_id`, la.`card_profile_id`,
                   la.`balance`, la.`status`, la.`created_at`,
                   cp.`code` AS `profile_code`, cp.`name` AS `profile_name`
            FROM `loyalty_accounts` la
            INNER JOIN `card_profiles` cp ON la.`card_profile_id` = cp.`id`
            WHERE la.`id` = :account_id
              AND la.`business_id` = :business_id
            LIMIT 1
        ");
        $stmt->execute([
            'account_id' => $accountId,
            'business_id' => $businessId,
        ]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$row) {
            return null;
        }

        return [
            'id' => (int) $row['id'],
            'business_id' => (int) $row['business_id'],
            'customer_id' => (int) $row['customer_id'],
            'card_profile_id' => (int) $row['card_profile_id'],
            'profile_code' => (string) $row['profile_code'],
            'profile_name' => (string) $row['profile_name'],
            'balance' => (int) $row['balance'],
            'status' => (string) $row['status'],
            'created_at' => (string) $row['created_at'],
        ];
    }

    /**
     * Actualiza el estado de una cuenta de fidelización ('active', 'suspended', 'closed').
     */
    public function updateAccountStatus(int $businessId, int $accountId, string $newStatus): bool
    {
        if (!in_array($newStatus, ['active', 'suspended', 'closed'], true)) {
            throw new InvalidArgumentException("Estado de cuenta no válido: '{$newStatus}'.");
        }

        $stmt = $this->pdo->prepare("
            UPDATE `loyalty_accounts`
            SET `status` = :status,
                `updated_at` = UTC_TIMESTAMP()
            WHERE `id` = :id AND `business_id` = :business_id
        ");
        $stmt->execute([
            'status' => $newStatus,
            'id' => $accountId,
            'business_id' => $businessId,
        ]);

        return $stmt->rowCount() > 0;
    }
}
