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
        // 1. Capacidad contractual de Campañas: regulada canónicamente por el plan contratado
        if ($capabilityCode === 'campaigns') {
            $planService = new \App\Modules\Plans\PlanService($this->pdo, new \App\Core\Audit\AuditLogger($this->pdo));
            $plan = $planService->getPlanForBusiness($businessId);
            return !empty($plan['modules']) && in_array('campaigns', $plan['modules'], true);
        }

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
            // Solo se il commercio non ha alcuna riga in business_modules (es. legacy non migrato), inizializza con i default
            $countStmt = $this->pdo->prepare("SELECT COUNT(*) FROM `business_modules` WHERE `business_id` = :business_id");
            $countStmt->execute(['business_id' => $businessId]);
            if ((int) $countStmt->fetchColumn() === 0) {
                $this->enableDefaultModulesForBusiness($businessId);
                return true;
            }
            return false;
        }

        return (bool) $val;
    }

    /**
     * Comprueba si una capacidad está permitida para el perfil de fidelización de la cuenta.
     */
    public function isCapabilityAllowedForProfile(int $cardProfileId, string $capabilityCode): bool
    {
        // Reglas canónicas:
        // - 'points' y 'rewards' permitidos para perfiles 'punti' y 'vantaggi'
        // - 'offers', 'benefits', 'discounts' permitidos para perfil 'vantaggi'
        // - 'vip_offers' permitido exclusivamente para perfil 'vip'
        $pStmt = $this->pdo->prepare("SELECT `code` FROM `card_profiles` WHERE `id` = :id LIMIT 1");
        $pStmt->execute(['id' => $cardProfileId]);
        $pCode = $pStmt->fetchColumn();

        if ($pCode !== false) {
            if ($capabilityCode === 'points' || $capabilityCode === 'rewards') {
                return in_array($pCode, ['punti', 'vantaggi'], true);
            }
            if (in_array($capabilityCode, ['offers', 'benefits', 'discounts'], true)) {
                return $pCode === 'vantaggi';
            }
            if ($capabilityCode === 'vip_offers') {
                return $pCode === 'vip';
            }
        }

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
        $countStmt = $this->pdo->prepare("SELECT COUNT(*) FROM `business_modules` WHERE `business_id` = :business_id");
        $countStmt->execute(['business_id' => $businessId]);
        if ((int) $countStmt->fetchColumn() === 0) {
            $this->enableDefaultModulesForBusiness($businessId);
        }

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

    /**
     * Retorna el estado consolidado de los paquetes comerciales (Punti, Vantaggi, VIP, Campagne).
     *
     * @return array{punti: bool, vantaggi: bool, vip: bool, campaigns: bool}
     */
    public function getBusinessPackages(int $businessId): array
    {
        $modules = $this->getBusinessModules($businessId);
        $modMap = [];
        foreach ($modules as $m) {
            $modMap[$m['code']] = (bool) $m['is_enabled'];
        }

        // 1. Profilo Punti: accumulo punti e catalogo premi
        $puntiEnabled = !empty($modMap['points']);

        // 2. Profilo Vantaggi: ampliamento di Punti (conserva punti e premi, aggiunge offerte e benefici)
        $vantaggiEnabled = !empty($modMap['offers']) && !empty($modMap['benefits']);

        // 3. Profilo VIP: offerte esclusive riservate ai VIP
        $vipEnabled = !empty($modMap['vip_offers']);

        // 4. Add-on Campagne: regolato canonicamente dal piano contrattuale (plan_modules / business_plans)
        $planService = new \App\Modules\Plans\PlanService($this->pdo, new \App\Core\Audit\AuditLogger($this->pdo));
        $plan = $planService->getPlanForBusiness($businessId);
        $campaignsEnabled = !empty($plan['modules']) && in_array('campaigns', $plan['modules'], true);

        return [
            'punti' => $puntiEnabled,
            'vantaggi' => $vantaggiEnabled,
            'vip' => $vipEnabled,
            'campaigns' => $campaignsEnabled,
        ];
    }

    /**
     * Activa o desactiva atómicamente un paquete comercial para un comercio.
     *
     * @param 'punti'|'vantaggi'|'vip'|'campaigns' $packageCode
     */
    public function setBusinessPackage(int $businessId, string $packageCode, bool $enable): void
    {
        if (!$enable) {
            $currentPkgs = $this->getBusinessPackages($businessId);
            if ($packageCode === 'punti') {
                if (!empty($currentPkgs['vantaggi'])) {
                    throw new \InvalidArgumentException('Per disattivare Punti devi prima disattivare il profilo Vantaggi.');
                }
                if (empty($currentPkgs['vip'])) {
                    throw new \InvalidArgumentException('È obbligatorio mantenere attivo almeno un profilo tra Punti o VIP.');
                }
            }
            if ($packageCode === 'vip' && empty($currentPkgs['punti']) && empty($currentPkgs['vantaggi'])) {
                throw new \InvalidArgumentException('È obbligatorio mantenere attivo almeno un profilo tra Punti o VIP.');
            }
        }

        switch ($packageCode) {
            case 'punti':
                // Profilo Punti: points e rewards
                $this->setBusinessModule($businessId, 'points', $enable);
                $this->setBusinessModule($businessId, 'rewards', $enable);
                if (!$enable) {
                    // Se disattiva i punti alla radice, disattiva anche l'ampliamento offerte
                    $this->setBusinessModule($businessId, 'offers', false);
                    $this->setBusinessModule($businessId, 'benefits', false);
                    $this->setBusinessModule($businessId, 'discounts', false);
                }
                break;

            case 'vantaggi':
                // Profilo Vantaggi: AMPLIAMENTO di Punti.
                // Conserva punti, premi, saldo e credenziali; aggiunge offerte, benefici e sconti.
                if ($enable) {
                    $this->setBusinessModule($businessId, 'points', true);
                    $this->setBusinessModule($businessId, 'rewards', true);
                    $this->setBusinessModule($businessId, 'offers', true);
                    $this->setBusinessModule($businessId, 'benefits', true);
                    $this->setBusinessModule($businessId, 'discounts', true);
                } else {
                    // Alla disattivazione dei vantaggi promozionali, conserva saldo punti e catalogo premi
                    $this->setBusinessModule($businessId, 'offers', false);
                    $this->setBusinessModule($businessId, 'benefits', false);
                    $this->setBusinessModule($businessId, 'discounts', false);
                }
                break;

            case 'vip':
                // Profilo VIP: offerte esclusive per clienti VIP
                $this->setBusinessModule($businessId, 'vip_offers', $enable);
                break;

            case 'campaigns':
                // Add-on Campagne: regolato canonicamente da business_plans / plan_modules
                $planService = new \App\Modules\Plans\PlanService($this->pdo, new \App\Core\Audit\AuditLogger($this->pdo));
                $plan = $planService->getPlanForBusiness($businessId);

                if ($enable) {
                    if ($plan === null || !in_array('campaigns', $plan['modules'] ?? [], true)) {
                        // Assegna il piano attivo che include campaigns con prezzo minimo (es. Plan 2 'Business')
                        $stmt = $this->pdo->prepare("
                            SELECT p.`id`
                            FROM `plans` p
                            INNER JOIN `plan_modules` pm ON p.`id` = pm.`plan_id`
                            WHERE p.`is_active` = 1 AND pm.`module_code` = 'campaigns'
                            ORDER BY p.`price_eur` ASC
                            LIMIT 1
                        ");
                        $stmt->execute();
                        $targetPlanId = (int) $stmt->fetchColumn();
                        if ($targetPlanId <= 0) {
                            $targetPlanId = 2; // Default piano Business con campagne
                        }
                        $planService->assignPlanToBusiness($businessId, $targetPlanId, null);
                    }
                } else {
                    if ($plan !== null && in_array('campaigns', $plan['modules'] ?? [], true)) {
                        // Assegna il piano senza campagne (es. Plan 1 'Starter')
                        $stmt = $this->pdo->prepare("
                            SELECT p.`id`
                            FROM `plans` p
                            WHERE p.`is_active` = 1
                              AND p.`id` NOT IN (SELECT `plan_id` FROM `plan_modules` WHERE `module_code` = 'campaigns')
                            ORDER BY p.`price_eur` ASC
                            LIMIT 1
                        ");
                        $stmt->execute();
                        $targetPlanId = (int) $stmt->fetchColumn();
                        if ($targetPlanId <= 0) {
                            $targetPlanId = 1; // Default piano Starter senza campagne
                        }
                        $planService->assignPlanToBusiness($businessId, $targetPlanId, null);
                    }
                }
                break;

            default:
                throw new InvalidArgumentException("Pacchetto commerciale sconosciuto: '{$packageCode}'.");
        }
    }

    /**
     * Aplica atómicamente los paquetes iniciales a un nuevo comercio según la selección del Super Admin.
     *
     * @param array{punti?: bool, vantaggi?: bool, vip?: bool, campaigns?: bool} $packages
     * @throws \InvalidArgumentException
     */
    public function applyInitialPackages(int $businessId, array $packages): void
    {
        $punti = !empty($packages['punti']);
        $vantaggi = !empty($packages['vantaggi']);
        $vip = !empty($packages['vip']);
        $campaigns = !empty($packages['campaigns']);

        // Vantaggi è un ampliamento di Punti: se attivo, include e conserva anche punti e catalogo premi
        if ($vantaggi) {
            $punti = true;
        }

        if (!$punti && !$vip) {
            throw new \InvalidArgumentException('È obbligatorio selezionare almeno un profilo contrattuale tra Punti o VIP.');
        }

        $modulesStmt = $this->pdo->query("SELECT `id`, `code` FROM `modules` WHERE `status` = 'active'");
        $allModules = $modulesStmt->fetchAll(PDO::FETCH_ASSOC);

        $stmt = $this->pdo->prepare("
            INSERT INTO `business_modules` (`business_id`, `module_id`, `is_enabled`, `created_at`, `updated_at`)
            VALUES (:biz_id, :mod_id, :is_enabled, UTC_TIMESTAMP(), UTC_TIMESTAMP())
            ON DUPLICATE KEY UPDATE `is_enabled` = :is_enabled2, `updated_at` = UTC_TIMESTAMP()
        ");

        foreach ($allModules as $mod) {
            $code = $mod['code'];
            $modId = (int) $mod['id'];
            $enabled = 0;

            if ($code === 'points' || $code === 'rewards') {
                $enabled = ($punti || $vantaggi) ? 1 : 0;
            } elseif ($code === 'offers' || $code === 'benefits' || $code === 'discounts') {
                $enabled = $vantaggi ? 1 : 0;
            } elseif ($code === 'vip_offers') {
                $enabled = $vip ? 1 : 0;
            }

            $stmt->execute([
                'biz_id' => $businessId,
                'mod_id' => $modId,
                'is_enabled' => $enabled,
                'is_enabled2' => $enabled,
            ]);
        }

        // Configurazione contrattuale del piano per Add-on Campagne
        $planService = new \App\Modules\Plans\PlanService($this->pdo, new \App\Core\Audit\AuditLogger($this->pdo));
        if ($campaigns) {
            $pStmt = $this->pdo->prepare("
                SELECT p.`id`
                FROM `plans` p
                INNER JOIN `plan_modules` pm ON p.`id` = pm.`plan_id`
                WHERE p.`is_active` = 1 AND pm.`module_code` = 'campaigns'
                ORDER BY p.`price_eur` ASC
                LIMIT 1
            ");
            $pStmt->execute();
            $targetPlanId = (int) $pStmt->fetchColumn();
            if ($targetPlanId <= 0) {
                $targetPlanId = 2;
            }
            $planService->assignPlanToBusiness($businessId, $targetPlanId, null);
        } else {
            $pStmt = $this->pdo->prepare("
                SELECT p.`id`
                FROM `plans` p
                WHERE p.`is_active` = 1
                  AND p.`id` NOT IN (SELECT `plan_id` FROM `plan_modules` WHERE `module_code` = 'campaigns')
                ORDER BY p.`price_eur` ASC
                LIMIT 1
            ");
            $pStmt->execute();
            $targetPlanId = (int) $pStmt->fetchColumn();
            if ($targetPlanId <= 0) {
                $targetPlanId = 1;
            }
            $planService->assignPlanToBusiness($businessId, $targetPlanId, null);
        }
    }
}
