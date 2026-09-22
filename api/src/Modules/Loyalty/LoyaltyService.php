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

        $targetCode = $profile['code'];

        // 3. Validación Contractual Obligatoria según paquetes contratados por el comercio
        $capabilityService = new CapabilityService($this->pdo);
        $packages = $capabilityService->getBusinessPackages($businessId);

        if ($targetCode === 'punti') {
            if (empty($packages['punti']) && empty($packages['vantaggi'])) {
                throw new InvalidArgumentException('Il profilo Punti non è incluso nei pacchetti contrattuali del commercio.');
            }
        } elseif ($targetCode === 'vantaggi') {
            if (empty($packages['vantaggi'])) {
                throw new InvalidArgumentException('Il profilo Vantaggi non è incluso nei pacchetti contrattuali del commercio.');
            }
        } elseif ($targetCode === 'vip') {
            if (empty($packages['vip'])) {
                throw new InvalidArgumentException('Il profilo VIP non è incluso nei pacchetti contrattuali del commercio.');
            }
        }

        // 4. Reglas de Negocio Definitivas (Punti, Vantaggi, VIP):
        $existingStmt = $this->pdo->prepare("
            SELECT la.`id`, la.`card_profile_id`, la.`balance`, la.`status`,
                   cp.`code` AS `profile_code`, cp.`name` AS `profile_name`
            FROM `loyalty_accounts` la
            INNER JOIN `card_profiles` cp ON la.`card_profile_id` = cp.`id`
            WHERE la.`business_id` = :business_id
              AND la.`customer_id` = :customer_id
              AND la.`status` = 'active'
        ");
        $existingStmt->execute([
            'business_id' => $businessId,
            'customer_id' => $customerId,
        ]);
        $existingAccounts = $existingStmt->fetchAll(PDO::FETCH_ASSOC);

        $hasVip = false;
        $standardAccount = null;
        foreach ($existingAccounts as $acc) {
            if ($acc['profile_code'] === 'vip') {
                $hasVip = true;
            } elseif (in_array($acc['profile_code'], ['punti', 'vantaggi'], true)) {
                $standardAccount = $acc;
            }
        }

        if ($targetCode === 'vip') {
            if ($hasVip) {
                throw new InvalidArgumentException('Il cliente possiede già un conto VIP attivo.');
            }
        } elseif ($targetCode === 'punti') {
            if ($standardAccount !== null) {
                if ($standardAccount['profile_code'] === 'punti') {
                    throw new InvalidArgumentException('Il cliente possiede già un conto Punti attivo.');
                }
                if ($standardAccount['profile_code'] === 'vantaggi') {
                    throw new InvalidArgumentException('Il cliente possiede già il profilo Vantaggi attivo, che include tutte le funzioni di Punti.');
                }
            }
        } elseif ($targetCode === 'vantaggi') {
            if ($standardAccount !== null) {
                if ($standardAccount['profile_code'] === 'vantaggi') {
                    throw new InvalidArgumentException('Il cliente possiede già il profilo Vantaggi attivo.');
                }
                if ($standardAccount['profile_code'] === 'punti') {
                    // Ampliación de cuenta estándar Punti -> Vantaggi (mismo account_id, mismo saldo, misma credencial)
                    $updStmt = $this->pdo->prepare("
                        UPDATE `loyalty_accounts`
                        SET `card_profile_id` = :new_profile_id,
                            `updated_at` = UTC_TIMESTAMP()
                        WHERE `id` = :account_id AND `business_id` = :business_id
                    ");
                    $updStmt->execute([
                        'new_profile_id' => $profile['id'],
                        'account_id' => $standardAccount['id'],
                        'business_id' => $businessId,
                    ]);

                    $updated = $this->getAccount($businessId, (int) $standardAccount['id']);
                    if (!$updated) {
                        throw new InvalidArgumentException('Error al actualizar el perfil de la cuenta.');
                    }
                    $updated['upgraded'] = true;
                    return $updated;
                }
            }
        }

        // 4. Insertar nueva cuenta de fidelización con saldo inicial 0
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
            'upgraded' => false,
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

    /**
     * Obtiene una vista previa interna segura y autenticada de la carta del cliente.
     * Cero mutaciones, cero tokens planos, cero PII.
     *
     * @return array<string, mixed>
     */
    public function getAccountPreview(int $businessId, int $accountId): array
    {
        $stmt = $this->pdo->prepare("
            SELECT la.*, cp.`code` AS `profile_code`, cp.`name` AS `profile_name`,
                   b.`name` AS `business_name`, b.`slug` AS `business_slug`,
                   cust.`first_name` AS `customer_first_name`, cust.`last_name` AS `customer_last_name`
            FROM `loyalty_accounts` la
            INNER JOIN `card_profiles` cp ON la.`card_profile_id` = cp.`id`
            INNER JOIN `businesses` b ON la.`business_id` = b.`id`
            LEFT JOIN `customers` cust ON la.`customer_id` = cust.`id`
            WHERE la.`id` = :id AND la.`business_id` = :business_id
            LIMIT 1
        ");
        $stmt->execute([
            'id' => $accountId,
            'business_id' => $businessId,
        ]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$row) {
            throw new InvalidArgumentException('Conto di fidelizzazione non trovato.');
        }

        $cardProfileId = (int) $row['card_profile_id'];
        $profileCode = (string) $row['profile_code'];

        $capabilityService = new \App\Modules\Loyalty\CapabilityService($this->pdo);
        $rewardService = new \App\Modules\Rewards\RewardService($this->pdo, $capabilityService);
        $offerService = new \App\Modules\Offers\OfferService($this->pdo, $capabilityService);
        $pointsService = new \App\Modules\Points\PointsService($this->pdo, $capabilityService);
        $programService = new \App\Modules\Points\LoyaltyProgramService($this->pdo);

        $hasPoints = $capabilityService->isCapabilityEnabledForBusiness($businessId, 'points')
            && $capabilityService->isCapabilityAllowedForProfile($cardProfileId, 'points');
        $hasRewards = $capabilityService->isCapabilityEnabledForBusiness($businessId, 'rewards')
            && $capabilityService->isCapabilityAllowedForProfile($cardProfileId, 'rewards');
        $hasOffers = $capabilityService->isCapabilityEnabledForBusiness($businessId, 'offers')
            && $capabilityService->isCapabilityAllowedForProfile($cardProfileId, 'offers')
            && $profileCode === 'vantaggi';
        $hasVipOffers = $capabilityService->isCapabilityEnabledForBusiness($businessId, 'vip_offers')
            && $capabilityService->isCapabilityAllowedForProfile($cardProfileId, 'vip_offers')
            && $profileCode === 'vip';

        $availableRewards = $hasRewards ? $rewardService->listRewards($businessId, true, $cardProfileId) : [];
        $nextReward = ($hasRewards && $hasPoints) ? $rewardService->getNextAvailableReward($businessId, (int) $row['balance'], $cardProfileId) : null;
        $availableOffers = ($hasOffers || $hasVipOffers) ? $offerService->listOffers($businessId, true, $cardProfileId) : [];

        $loyaltyAccountData = [
            'id' => $accountId,
            'customer_id' => (int) $row['customer_id'],
            'profile_code' => $profileCode,
            'profile_name' => (string) $row['profile_name'],
            'status' => (string) $row['status'],
        ];
        if ($hasPoints) {
            $loyaltyAccountData['balance'] = (int) $row['balance'];
        }

        $preview = [
            'state' => 'active',
            'mode' => 'preview',
            'is_preview' => true,
            'business' => [
                'id' => $businessId,
                'name' => (string) $row['business_name'],
                'slug' => (string) $row['business_slug'],
            ],
            'loyalty_account' => $loyaltyAccountData,
        ];

        if (!empty($row['customer_id'])) {
            $preview['customer'] = [
                'id' => (int) $row['customer_id'],
                'first_name' => (string) ($row['customer_first_name'] ?? ''),
                'last_name' => (string) ($row['customer_last_name'] ?? ''),
                'display_name' => trim(($row['customer_first_name'] ?? '') . ' ' . ($row['customer_last_name'] ?? '')),
            ];
        }

        if ($hasPoints) {
            $preview['program'] = $programService->getProgram($businessId);
            $rawTx = $pointsService->getAccountTransactions($businessId, $accountId, 1, 20)['data'];
            $preview['recent_transactions'] = array_map(static function (array $tx): array {
                return [
                    'id' => (int) $tx['id'],
                    'points' => (int) $tx['points'],
                    'points_delta' => (int) $tx['points'],
                    'type' => (string) $tx['type'],
                    'reason' => $tx['reason'] !== null ? (string) $tx['reason'] : null,
                    'created_at' => (string) $tx['created_at'],
                ];
            }, $rawTx);
        }

        if ($hasRewards && !empty($availableRewards)) {
            if ($nextReward !== null) {
                $preview['next_reward'] = $nextReward;
            }
            $preview['rewards'] = $availableRewards;
        }

        if (($hasOffers || $hasVipOffers) && !empty($availableOffers)) {
            $preview['offers'] = $availableOffers;
        }

        return $preview;
    }

    /**
     * Modifica il profilo di un conto standard (Punti <-> Vantaggi) senza alterare account_id,
     * saldo, storico movimenti, consensi né credenziali fisiche/digitali (token e URL permangono invariati).
     *
     * @return array<string, mixed>
     */
    public function changeAccountProfile(int $businessId, int $accountId, int|string $newProfileIdOrCode): array
    {
        $account = $this->getAccount($businessId, $accountId);
        if (!$account) {
            throw new InvalidArgumentException('Conto di fidelizzazione non trovato per questo commercio.');
        }

        if ($account['status'] !== 'active') {
            throw new InvalidArgumentException('Impossibile modificare il profilo di un conto non attivo.');
        }

        $currentProfileCode = $account['profile_code'];
        if ($currentProfileCode === 'vip') {
            throw new InvalidArgumentException('I conti VIP sono autonomi e non possono essere convertiti in conti standard.');
        }

        $targetProfile = is_int($newProfileIdOrCode)
            ? $this->getProfileById($newProfileIdOrCode)
            : $this->getProfileByCode((string) $newProfileIdOrCode);

        if (!$targetProfile) {
            throw new InvalidArgumentException("Profilo di fidelizzazione target non valido: '{$newProfileIdOrCode}'.");
        }

        $targetCode = $targetProfile['code'];
        if ($targetCode === 'vip') {
            throw new InvalidArgumentException('Un conto standard non può essere convertito in conto VIP. Crea un conto VIP separato.');
        }

        // Validación contractual
        $capabilityService = new CapabilityService($this->pdo);
        $packages = $capabilityService->getBusinessPackages($businessId);

        if ($targetCode === 'vantaggi' && empty($packages['vantaggi'])) {
            throw new InvalidArgumentException('Il profilo Vantaggi non è incluso nei pacchetti contrattuali del commercio.');
        }
        if ($targetCode === 'punti' && empty($packages['punti']) && empty($packages['vantaggi'])) {
            throw new InvalidArgumentException('Il profilo Punti non è incluso nei pacchetti contrattuali del commercio.');
        }

        if ($currentProfileCode === $targetCode) {
            return $account;
        }

        // Actualizar card_profile_id manteniendo account_id, saldo y credenciales intactos
        $updStmt = $this->pdo->prepare("
            UPDATE `loyalty_accounts`
            SET `card_profile_id` = :new_profile_id,
                `updated_at` = UTC_TIMESTAMP()
            WHERE `id` = :account_id AND `business_id` = :business_id
        ");
        $updStmt->execute([
            'new_profile_id' => $targetProfile['id'],
            'account_id' => $accountId,
            'business_id' => $businessId,
        ]);

        $updated = $this->getAccount($businessId, $accountId);
        if (!$updated) {
            throw new InvalidArgumentException('Errore durante l\'aggiornamento del profilo.');
        }
        $updated['upgraded'] = ($targetCode === 'vantaggi');
        return $updated;
    }
}
