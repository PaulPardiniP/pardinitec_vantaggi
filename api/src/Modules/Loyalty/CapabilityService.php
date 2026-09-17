<?php

declare(strict_types=1);

namespace App\Modules\Loyalty;

use App\Core\Database\Connection;
use App\Modules\Businesses\AuthorizationService;
use App\Modules\Businesses\ForbiddenException;
use InvalidArgumentException;
use PDO;

final class CapabilityService
{
    private PDO $pdo;
    private AuthorizationService $authzService;

    public function __construct(?PDO $pdo = null, ?AuthorizationService $authzService = null)
    {
        $this->pdo = $pdo ?? Connection::get();
        $this->authzService = $authzService ?? new AuthorizationService($this->pdo);
    }

    /**
     * Comprueba si un módulo/capacidad se encuentra contratado y activo para un negocio.
     */
    public function isCapabilityEnabledForBusiness(int $businessId, string $capabilityCode): bool
    {
        $stmt = $this->pdo->prepare("
            SELECT bm.`is_enabled`
            FROM `business_modules` bm
            INNER JOIN `modules` m ON bm.`module_id` = m.`id`
            WHERE bm.`business_id` = :business_id
              AND m.`code` = :code
              AND m.`status` = 'active'
            LIMIT 1
        ");
        $stmt->execute([
            'business_id' => $businessId,
            'code' => $capabilityCode,
        ]);
        $val = $stmt->fetchColumn();

        if ($val === false) {
            // Si el negocio no tiene filas en business_modules, inicializar con los módulos estándar
            $this->enableDefaultModulesForBusiness($businessId);
            return true;
        }

        return (bool) $val;
    }

    /**
     * Comprueba si una capacidad está permitida para el perfil de fidelización de la cuenta.
     */
    public function isCapabilityAllowedForProfile(int $cardProfileId, string $capabilityCode): bool
    {
        $stmt = $this->pdo->prepare("
            SELECT COUNT(*)
            FROM `card_profile_modules` cpm
            INNER JOIN `modules` m ON cpm.`module_id` = m.`id`
            WHERE cpm.`card_profile_id` = :profile_id
              AND m.`code` = :code
              AND m.`status` = 'active'
        ");
        $stmt->execute([
            'profile_id' => $cardProfileId,
            'code' => $capabilityCode,
        ]);

        return ((int) $stmt->fetchColumn()) > 0;
    }

    /**
     * Valida obligatoriamente en backend que la cuenta, el perfil y el negocio posean la capacidad solicitada,
     * y opcionalmente comprueba los permisos del usuario operador.
     *
     * @return array<string, mixed> Datos de la loyalty_account verificada
     * @throws ForbiddenException Si la capacidad está inactiva en el negocio, no permitida en el perfil o sin permisos
     * @throws InvalidArgumentException Si la cuenta no existe o no pertenece al negocio
     */
    public function assertAccountCapability(
        int $businessId,
        int $loyaltyAccountId,
        string $capabilityCode,
        ?int $userId = null,
        ?string $permission = null
    ): array {
        // 1. Obtener la cuenta de fidelización y su perfil
        $stmt = $this->pdo->prepare("
            SELECT la.*, cp.`code` AS `profile_code`, cp.`name` AS `profile_name`
            FROM `loyalty_accounts` la
            INNER JOIN `card_profiles` cp ON la.`card_profile_id` = cp.`id`
            WHERE la.`id` = :id AND la.`business_id` = :business_id
            LIMIT 1
        ");
        $stmt->execute([
            'id' => $loyaltyAccountId,
            'business_id' => $businessId,
        ]);
        $account = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$account) {
            throw new InvalidArgumentException('La cuenta de fidelización no existe o no pertenece a este comercio.');
        }

        if ($account['status'] !== 'active') {
            throw new ForbiddenException('La cuenta de fidelización se encuentra inactiva o suspendida.');
        }

        // 2. Nivel Negocio: ¿El comercio tiene habilitado el módulo?
        if (!$this->isCapabilityEnabledForBusiness($businessId, $capabilityCode)) {
            throw new ForbiddenException("El módulo '{$capabilityCode}' no está habilitado para este comercio.");
        }

        // 3. Nivel Perfil: ¿El perfil de la cuenta permite esta capacidad?
        if (!$this->isCapabilityAllowedForProfile((int) $account['card_profile_id'], $capabilityCode)) {
            throw new ForbiddenException("La capacidad '{$capabilityCode}' no está permitida para el perfil '{$account['profile_code']}'.");
        }

        // 4. Nivel Operador: ¿El usuario tiene el permiso necesario?
        if ($userId !== null && $permission !== null) {
            $this->authzService->requirePermission($userId, $businessId, $permission);
        }

        return $account;
    }

    /**
     * Habilita los módulos por defecto para un nuevo comercio.
     */
    public function enableDefaultModulesForBusiness(int $businessId): void
    {
        $stmt = $this->pdo->prepare("
            INSERT IGNORE INTO `business_modules` (`business_id`, `module_id`, `is_enabled`)
            SELECT :business_id, `id`, 1
            FROM `modules`
        ");
        $stmt->execute(['business_id' => $businessId]);
    }

    /**
     * Modifica el estado de un módulo para un comercio (por ejemplo, por el Super Admin u Owner).
     */
    public function setBusinessModule(int $businessId, string $moduleCode, bool $isEnabled): void
    {
        $stmt = $this->pdo->prepare("
            INSERT INTO `business_modules` (`business_id`, `module_id`, `is_enabled`)
            SELECT :business_id, `id`, :is_enabled
            FROM `modules`
            WHERE `code` = :code
            ON DUPLICATE KEY UPDATE `is_enabled` = :is_enabled2, `updated_at` = UTC_TIMESTAMP()
        ");
        $stmt->execute([
            'business_id' => $businessId,
            'code' => $moduleCode,
            'is_enabled' => $isEnabled ? 1 : 0,
            'is_enabled2' => $isEnabled ? 1 : 0,
        ]);
    }

    /**
     * Retorna la lista de módulos y su estado de activación para un comercio.
     *
     * @return array<int, array{code: string, name: string, is_enabled: bool}>
     */
    public function getBusinessModules(int $businessId): array
    {
        $this->enableDefaultModulesForBusiness($businessId);

        $stmt = $this->pdo->prepare("
            SELECT m.`code`, m.`name`, m.`description`, bm.`is_enabled`
            FROM `modules` m
            LEFT JOIN `business_modules` bm ON m.`id` = bm.`module_id` AND bm.`business_id` = :business_id
            WHERE m.`status` = 'active'
            ORDER BY m.`id` ASC
        ");
        $stmt->execute(['business_id' => $businessId]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        return array_map(static fn(array $r) => [
            'code' => (string) $r['code'],
            'name' => (string) $r['name'],
            'description' => $r['description'] ? (string) $r['description'] : null,
            'is_enabled' => (bool) $r['is_enabled'],
        ], $rows);
    }

    /**
     * Retorna las capacidades asignadas a un perfil.
     *
     * @return array<int, string>
     */
    public function getProfileCapabilities(int $cardProfileId): array
    {
        $stmt = $this->pdo->prepare("
            SELECT m.`code`
            FROM `card_profile_modules` cpm
            INNER JOIN `modules` m ON cpm.`module_id` = m.`id`
            WHERE cpm.`card_profile_id` = :profile_id
              AND m.`status` = 'active'
        ");
        $stmt->execute(['profile_id' => $cardProfileId]);

        return $stmt->fetchAll(PDO::FETCH_COLUMN);
    }
}
