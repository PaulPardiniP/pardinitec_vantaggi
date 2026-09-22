<?php

declare(strict_types=1);

namespace App\Modules\Cards;

use App\Core\Database\Connection;
use App\Modules\AccessCredentials\CredentialService;
use App\Modules\Loyalty\LoyaltyService;
use InvalidArgumentException;
use PDO;
use Throwable;

final class CardService
{
    private PDO $pdo;
    private CredentialService $credentialService;
    private LoyaltyService $loyaltyService;

    // Transiciones válidas según Contrato Técnico v7
    private const VALID_TRANSITIONS = [
        'inventory' => ['issued'],
        'issued' => ['active', 'revoked'],
        'active' => ['suspended', 'revoked', 'replaced', 'issued'],
        'suspended' => ['active', 'revoked', 'replaced', 'issued'],
        'revoked' => [],
        'replaced' => [],
    ];

    public function __construct(
        ?PDO $pdo = null,
        ?CredentialService $credentialService = null,
        ?LoyaltyService $loyaltyService = null
    ) {
        $this->pdo = $pdo ?? Connection::get();
        $this->credentialService = $credentialService ?? new CredentialService($this->pdo);
        $this->loyaltyService = $loyaltyService ?? new LoyaltyService($this->pdo);
    }

    public function getCredentialService(): CredentialService
    {
        return $this->credentialService;
    }

    public function getPhysicalCredentialForCard(int $cardId): ?array
    {
        return $this->credentialService->getPhysicalCredentialForCard($cardId);
    }

    public function getLatestPhysicalCredentialForCard(int $cardId): ?array
    {
        return $this->credentialService->getLatestPhysicalCredentialForCard($cardId);
    }

    /**
     * Valida si una transición de estado es conforme a la máquina de estados.
     */
    public function validateTransition(string $currentStatus, string $newStatus): void
    {
        $allowed = self::VALID_TRANSITIONS[$currentStatus] ?? [];
        if (!in_array($newStatus, $allowed, true)) {
            throw new InvalidArgumentException("Transición de estado inválida: no es posible pasar de '{$currentStatus}' a '{$newStatus}'.");
        }
    }

    // ==========================================
    // OPERACIONES DE SUPER ADMIN (PLATAFORMA)
    // ==========================================

    /**
     * Crea una tarjeta física en inventario y genera su credencial física asociada.
     *
     * @return array{id: int, status: string, design_profile_id: ?int, created_at: string, token: string, public_url: string}
     */
    public function createCardInInventory(?int $designProfileId = null, ?int $createdByUserId = null, bool $isReprogrammable = true): array
    {
        $this->pdo->beginTransaction();

        try {
            $stmt = $this->pdo->prepare("
                INSERT INTO `cards` (
                    `business_id`,
                    `loyalty_account_id`,
                    `design_profile_id`,
                    `created_by_user_id`,
                    `is_reprogrammable`,
                    `status`,
                    `created_at`,
                    `updated_at`
                ) VALUES (
                    NULL,
                    NULL,
                    :design_profile_id,
                    :created_by_user_id,
                    :is_reprogrammable,
                    'inventory',
                    UTC_TIMESTAMP(),
                    UTC_TIMESTAMP()
                )
            ");
            $stmt->execute([
                'design_profile_id' => $designProfileId,
                'created_by_user_id' => $createdByUserId,
                'is_reprogrammable' => $isReprogrammable ? 1 : 0,
            ]);
            $cardId = (int) $this->pdo->lastInsertId();

            // Emitir credencial física con hash SHA-256 en MariaDB
            $credential = $this->credentialService->issuePhysicalCredential(null, $cardId, null);

            $this->pdo->commit();

            return [
                'id' => $cardId,
                'status' => 'inventory',
                'design_profile_id' => $designProfileId,
                'created_by_user_id' => $createdByUserId,
                'is_reprogrammable' => $isReprogrammable,
                'created_at' => gmdate('Y-m-d H:i:s'),
                'token' => $credential['token'], // Entregado por única vez
                'public_url' => "/c/{$credential['token']}",
            ];
        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e;
        }
    }

    /**
     * Crea un lote de tarjetas físicas en inventario en una única transacción.
     *
     * @return array<int, array{id: int, status: string, design_profile_id: ?int, created_by_user_id: ?int, is_reprogrammable: bool, token: string, public_url: string}>
     */
    public function createBatchInInventory(int $count, ?int $designProfileId = null, ?int $createdByUserId = null, bool $isReprogrammable = true): array
    {
        if ($count < 1 || $count > 500) {
            throw new InvalidArgumentException('El tamaño del lote debe estar entre 1 y 500 unidades.');
        }

        $batchId = sprintf(
            '%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
            mt_rand(0, 0xffff), mt_rand(0, 0xffff),
            mt_rand(0, 0xffff),
            mt_rand(0, 0x0fff) | 0x4000,
            mt_rand(0, 0x3fff) | 0x8000,
            mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
        );

        $this->pdo->beginTransaction();

        try {
            $batch = [];

            for ($i = 0; $i < $count; $i++) {
                $stmt = $this->pdo->prepare("
                    INSERT INTO `cards` (
                        `business_id`,
                        `loyalty_account_id`,
                        `design_profile_id`,
                        `batch_id`,
                        `created_by_user_id`,
                        `is_reprogrammable`,
                        `status`,
                        `created_at`,
                        `updated_at`
                    ) VALUES (
                        NULL,
                        NULL,
                        :design_profile_id,
                        :batch_id,
                        :created_by_user_id,
                        :is_reprogrammable,
                        'inventory',
                        UTC_TIMESTAMP(),
                        UTC_TIMESTAMP()
                    )
                ");
                $stmt->execute([
                    'design_profile_id' => $designProfileId,
                    'batch_id' => $batchId,
                    'created_by_user_id' => $createdByUserId,
                    'is_reprogrammable' => $isReprogrammable ? 1 : 0,
                ]);
                $cardId = (int) $this->pdo->lastInsertId();

                $credential = $this->credentialService->issuePhysicalCredential(null, $cardId, null);

                $batch[] = [
                    'id' => $cardId,
                    'status' => 'inventory',
                    'design_profile_id' => $designProfileId,
                    'batch_id' => $batchId,
                    'created_by_user_id' => $createdByUserId,
                    'is_reprogrammable' => $isReprogrammable,
                    'token' => $credential['token'],
                    'public_url' => "/c/{$credential['token']}",
                ];
            }

            $this->pdo->commit();

            return $batch;
        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e;
        }
    }

    /**
     * Asigna un conjunto de tarjetas desde inventario a un comercio (inventory -> issued).
     *
     * @param int[] $cardIds
     * @return array<int, array<string, mixed>>
     */
    public function assignCardsToBusiness(array $cardIds, int $businessId, ?int $assignedByUserId = null): array
    {
        if (empty($cardIds)) {
            throw new InvalidArgumentException('Debe proporcionar al menos un ID de tarjeta para asignar.');
        }

        // 1. Validar que el comercio exista
        $bizStmt = $this->pdo->prepare("SELECT `id`, `name` FROM `businesses` WHERE `id` = :id LIMIT 1");
        $bizStmt->execute(['id' => $businessId]);
        if (!$bizStmt->fetch()) {
            throw new InvalidArgumentException("El comercio ID {$businessId} no existe.");
        }

        $this->pdo->beginTransaction();

        try {
            $updatedCards = [];

            foreach ($cardIds as $cardId) {
                $cardId = (int) $cardId;

                $cardStmt = $this->pdo->prepare("SELECT * FROM `cards` WHERE `id` = :id LIMIT 1");
                $cardStmt->execute(['id' => $cardId]);
                $card = $cardStmt->fetch(PDO::FETCH_ASSOC);

                if (!$card) {
                    throw new InvalidArgumentException("Tarjeta ID {$cardId} no encontrada.");
                }

                $this->validateTransition($card['status'], 'issued');

                // Actualizar tarjeta a issued
                $updateStmt = $this->pdo->prepare("
                    UPDATE `cards`
                    SET `status` = 'issued',
                        `business_id` = :business_id,
                        `assigned_by_user_id` = :assigned_by_user_id,
                        `issued_at` = UTC_TIMESTAMP(),
                        `updated_at` = UTC_TIMESTAMP()
                    WHERE `id` = :id
                ");
                $updateStmt->execute([
                    'business_id' => $businessId,
                    'assigned_by_user_id' => $assignedByUserId,
                    'id' => $cardId,
                ]);

                // Actualizar credencial física vinculándola al business_id
                $this->credentialService->updatePhysicalCredentialLinks($cardId, $businessId, null);

                $updatedCards[] = $this->getCard($cardId);
            }

            $this->pdo->commit();

            return $updatedCards;
        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e;
        }
    }

    /**
     * Lista tarjetas a nivel global / administrativo.
     */
    public function listCards(array $filters = [], int $page = 1, int $perPage = 50): array
    {
        $page = max(1, $page);
        $perPage = max(1, min(200, $perPage));
        $offset = ($page - 1) * $perPage;

        $where = [];
        $params = [];

        if (!empty($filters['status'])) {
            $where[] = "c.`status` = :status";
            $params['status'] = $filters['status'];
        }

        if (isset($filters['business_id']) && $filters['business_id'] !== '') {
            $where[] = "c.`business_id` = :business_id";
            $params['business_id'] = (int) $filters['business_id'];
        }

        $whereSql = !empty($where) ? ('WHERE ' . implode(' AND ', $where)) : '';

        $countStmt = $this->pdo->prepare("SELECT COUNT(*) FROM `cards` c {$whereSql}");
        $countStmt->execute($params);
        $total = (int) $countStmt->fetchColumn();

        $dataStmt = $this->pdo->prepare("
            SELECT c.*, b.`name` AS `business_name`
            FROM `cards` c
            LEFT JOIN `businesses` b ON c.`business_id` = b.`id`
            {$whereSql}
            ORDER BY c.`id` DESC
            LIMIT {$perPage} OFFSET {$offset}
        ");
        $dataStmt->execute($params);
        $items = $dataStmt->fetchAll(PDO::FETCH_ASSOC);

        return [
            'data' => array_map([$this, 'formatCardRow'], $items),
            'pagination' => [
                'page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'total_pages' => (int) ceil($total / $perPage),
            ],
        ];
    }

    /**
     * Obtiene detalle de tarjeta a nivel administrativo.
     */
    public function getCard(int $cardId): ?array
    {
        $stmt = $this->pdo->prepare("
            SELECT c.*, b.`name` AS `business_name`,
                   la.`customer_id`, la.`balance`,
                   cp.`code` AS `profile_code`, cp.`name` AS `profile_name`
            FROM `cards` c
            LEFT JOIN `businesses` b ON c.`business_id` = b.`id`
            LEFT JOIN `loyalty_accounts` la ON c.`loyalty_account_id` = la.`id`
            LEFT JOIN `card_profiles` cp ON la.`card_profile_id` = cp.`id`
            WHERE c.`id` = :id
            LIMIT 1
        ");
        $stmt->execute(['id' => $cardId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        return $row ? $this->formatCardRow($row) : null;
    }

    // ==========================================
    // OPERACIONES DEL COMERCIO (MULTI-TENANT)
    // ==========================================

    /**
     * Lista tarjetas de un comercio específico con paginación y filtros.
     */
    public function listBusinessCards(int $businessId, array $filters = [], int $page = 1, int $perPage = 50): array
    {
        $filters['business_id'] = $businessId;
        return $this->listCards($filters, $page, $perPage);
    }

    /**
     * Obtiene detalle de tarjeta validando estrictamente que pertenezca al comercio.
     */
    public function getBusinessCard(int $businessId, int $cardId): array
    {
        $card = $this->getCard($cardId);
        if (!$card || $card['business_id'] !== $businessId) {
            throw new InvalidArgumentException('Tarjeta no encontrada en este comercio.');
        }

        return $card;
    }

    /**
     * Activa una tarjeta en estado 'issued' en el local, vinculándola a una loyalty_account existente.
     * Transacción atómica.
     *
     * @return array<string, mixed>
     */
    public function activateCard(int $businessId, int $cardId, int $loyaltyAccountId, ?int $assignedByUserId = null): array
    {
        // 1. Validar que la loyalty_account exista, pertenezca al comercio y esté activa
        $account = $this->loyaltyService->getAccount($businessId, $loyaltyAccountId);
        if (!$account) {
            throw new InvalidArgumentException('La cuenta de fidelización no existe o no pertenece a este comercio.');
        }
        if ($account['status'] !== 'active') {
            throw new InvalidArgumentException('No es posible vincular una tarjeta a una cuenta de fidelización inactiva o suspendida.');
        }

        $this->pdo->beginTransaction();

        try {
            // Bloqueo pesimista de la fila de la tarjeta
            $lockStmt = $this->pdo->prepare("
                SELECT * FROM `cards`
                WHERE `id` = :id AND `business_id` = :business_id
                FOR UPDATE
            ");
            $lockStmt->execute(['id' => $cardId, 'business_id' => $businessId]);
            $card = $lockStmt->fetch(PDO::FETCH_ASSOC);
            if (!$card) {
                throw new InvalidArgumentException('Tarjeta no encontrada en este comercio.');
            }

            // 2. Validar máquina de estados bajo bloqueo: solo issued -> active
            $this->validateTransition($card['status'], 'active');

            // 3. Actualizar tarjeta
            $stmt = $this->pdo->prepare("
                UPDATE `cards`
                SET `status` = 'active',
                    `loyalty_account_id` = :loyalty_account_id,
                    `assigned_by_user_id` = :assigned_by_user_id,
                    `assigned_at` = UTC_TIMESTAMP(),
                    `updated_at` = UTC_TIMESTAMP()
                WHERE `id` = :id AND `business_id` = :business_id
            ");
            $stmt->execute([
                'loyalty_account_id' => $loyaltyAccountId,
                'assigned_by_user_id' => $assignedByUserId,
                'id' => $cardId,
                'business_id' => $businessId,
            ]);

            // 4. Tarjeta preprogramada: vincular la credencial física existente a la loyalty_account SIN rotar el token.
            // Si no existe credencial (caso legacy), emitir una nueva.
            $existingCred = $this->credentialService->getPhysicalCredentialForCard($cardId);
            if ($existingCred) {
                // Ruta principal (tarjeta preprogramada): actualizar los vínculos conservando el token permanente
                $this->credentialService->updatePhysicalCredentialLinks($cardId, $businessId, $loyaltyAccountId);
                // El token en claro ya fue entregado al programar la tarjeta (createCardInInventory / createBatchInInventory).
                // No se expone de nuevo aquí para evitar que circulen tokens en logs de activación.
            } else {
                // Ruta legacy: emitir nueva credencial física si nunca existió ninguna
                $this->credentialService->issuePhysicalCredential($businessId, $cardId, $loyaltyAccountId);
            }

            $this->pdo->commit();

            $cardData = $this->getBusinessCard($businessId, $cardId);
            // public_url construida a partir del hash, no del token en claro (que permanece permanente y no se retorna aquí)
            $cardData['public_url'] = "/c/{token_permanente_en_tarjeta}";

            return $cardData;
        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e;
        }
    }

    /**
     * Suspende temporalmente una tarjeta activa.
     */
    public function suspendCard(int $businessId, int $cardId): array
    {
        $card = $this->getBusinessCard($businessId, $cardId);
        $this->validateTransition($card['status'], 'suspended');

        $this->pdo->beginTransaction();

        try {
            $stmt = $this->pdo->prepare("
                UPDATE `cards`
                SET `status` = 'suspended',
                    `updated_at` = UTC_TIMESTAMP()
                WHERE `id` = :id AND `business_id` = :business_id
            ");
            $stmt->execute([
                'id' => $cardId,
                'business_id' => $businessId,
            ]);

            // Suspender credencial física
            $this->credentialService->suspendPhysicalCredentialForCard($cardId);

            $this->pdo->commit();

            return $this->getBusinessCard($businessId, $cardId);
        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e;
        }
    }

    /**
     * Reactiva una tarjeta suspendida.
     */
    public function reactivateCard(int $businessId, int $cardId): array
    {
        $card = $this->getBusinessCard($businessId, $cardId);
        $this->validateTransition($card['status'], 'active');

        $this->pdo->beginTransaction();

        try {
            $stmt = $this->pdo->prepare("
                UPDATE `cards`
                SET `status` = 'active',
                    `updated_at` = UTC_TIMESTAMP()
                WHERE `id` = :id AND `business_id` = :business_id
            ");
            $stmt->execute([
                'id' => $cardId,
                'business_id' => $businessId,
            ]);

            // Tarjeta preprogramada: reactivar la credencial suspendida SIN rotar ni reemitir el token.
            // El token está impreso en la tarjeta física y no debe cambiar al reactivar.
            $this->credentialService->reactivatePhysicalCredentialForCard($cardId);

            $this->pdo->commit();

            $cardData = $this->getBusinessCard($businessId, $cardId);
            // No se incluye 'token' ni 'requires_reprogramming' porque el token permanece idéntico

            return $cardData;
        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e;
        }
    }

    /**
     * Revoca definitivamente una tarjeta física por extravío o fraude.
     * La cuenta de fidelización, su saldo, historial y credencial digital permanecen intactos.
     */
    public function revokeCard(int $businessId, int $cardId): array
    {
        $card = $this->getBusinessCard($businessId, $cardId);
        $this->validateTransition($card['status'], 'revoked');

        $this->pdo->beginTransaction();

        try {
            $stmt = $this->pdo->prepare("
                UPDATE `cards`
                SET `status` = 'revoked',
                    `revoked_at` = UTC_TIMESTAMP(),
                    `updated_at` = UTC_TIMESTAMP()
                WHERE `id` = :id AND `business_id` = :business_id
            ");
            $stmt->execute([
                'id' => $cardId,
                'business_id' => $businessId,
            ]);

            // Revocar credencial física
            $this->credentialService->revokePhysicalCredentialForCard($cardId);

            $this->pdo->commit();

            return $this->getBusinessCard($businessId, $cardId);
        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e;
        }
    }

    /**
     * Reemplazo seguro de tarjeta extraviada/dañada:
     * - Tarjeta antigua pasa a 'replaced' con revoked_at y replaced_by_card_id = newCardId.
     * - Su credencial física se revoca/reemplaza.
     * - La nueva tarjeta ('issued') se activa vinculada a la MISMA loyalty_account.
     * - Su credencial física se enlaza a la misma cuenta.
     * - Saldo, historial y credencial digital del cliente se mantienen 100% INTACTOS.
     *
     * @return array{old_card: array, new_card: array}
     */
    public function replaceCard(int $businessId, int $oldCardId, int $newCardId, ?int $assignedByUserId = null): array
    {
        if ($oldCardId === $newCardId) {
            throw new InvalidArgumentException('La nueva tarjeta debe ser distinta de la tarjeta que se reemplaza.');
        }

        $this->pdo->beginTransaction();

        try {
            // Bloqueo pesimista ordenado de ambas tarjetas para evitar condiciones de carrera y deadlocks
            $minId = min($oldCardId, $newCardId);
            $maxId = max($oldCardId, $newCardId);

            $lockStmt = $this->pdo->prepare("
                SELECT * FROM `cards`
                WHERE `id` IN (:id1, :id2) AND `business_id` = :business_id
                ORDER BY `id` ASC
                FOR UPDATE
            ");
            $lockStmt->execute([
                'id1' => $minId,
                'id2' => $maxId,
                'business_id' => $businessId,
            ]);
            $lockedCards = [];
            while ($row = $lockStmt->fetch(PDO::FETCH_ASSOC)) {
                $lockedCards[(int) $row['id']] = $row;
            }

            if (!isset($lockedCards[$oldCardId])) {
                throw new InvalidArgumentException("Tarjeta a reemplazar ID {$oldCardId} no encontrada en este comercio.");
            }
            if (!isset($lockedCards[$newCardId])) {
                throw new InvalidArgumentException("Nueva tarjeta ID {$newCardId} no encontrada en este comercio.");
            }

            $oldCard = $lockedCards[$oldCardId];
            $newCard = $lockedCards[$newCardId];

            // 1. Validar máquina de estados bajo bloqueo
            $this->validateTransition($oldCard['status'], 'replaced');

            if ($oldCard['loyalty_account_id'] === null) {
                throw new InvalidArgumentException('La tarjeta a reemplazar no posee una cuenta de fidelización vinculada.');
            }

            if ($newCard['status'] !== 'issued') {
                throw new InvalidArgumentException("La nueva tarjeta debe estar en estado 'issued' (actual: '{$newCard['status']}').");
            }
            if ($newCard['loyalty_account_id'] !== null) {
                throw new InvalidArgumentException('La nueva tarjeta ya se encuentra vinculada a otra cuenta de fidelización.');
            }

            $loyaltyAccountId = (int) $oldCard['loyalty_account_id'];

            // 2. Comprobar credencial activa de la tarjeta antigua y de la nueva tarjeta
            $oldCred = $this->credentialService->getPhysicalCredentialForCard($oldCardId);
            $newCred = $this->credentialService->getPhysicalCredentialForCard($newCardId);

            if (!$newCred) {
                throw new InvalidArgumentException("La nueva tarjeta ID {$newCardId} no posee una credencial física activa.");
            }

            // 3. Revocar/reemplazar la credencial física de la tarjeta anterior si corresponde
            if ($oldCred) {
                $updateCredStmt = $this->pdo->prepare("
                    UPDATE `access_credentials`
                    SET `status` = 'replaced',
                        `revoked_at` = UTC_TIMESTAMP(),
                        `updated_at` = UTC_TIMESTAMP()
                    WHERE `id` = :old_cred_id
                ");
                $updateCredStmt->execute([
                    'old_cred_id' => $oldCred['id'],
                ]);
            }

            // Marcar tarjeta anterior como replaced
            $updateOldStmt = $this->pdo->prepare("
                UPDATE `cards`
                SET `status` = 'replaced',
                    `revoked_at` = UTC_TIMESTAMP(),
                    `replaced_by_card_id` = :new_card_id,
                    `updated_at` = UTC_TIMESTAMP()
                WHERE `id` = :old_id
            ");
            $updateOldStmt->execute([
                'new_card_id' => $newCardId,
                'old_id' => $oldCardId,
            ]);

            // 4. Revocar credencial previa de la nueva tarjeta y emitir nueva credencial física vinculada a la cuenta
            $this->credentialService->revokePhysicalCredentialForCard($newCardId);
            $newIssuedCred = $this->credentialService->issuePhysicalCredential($businessId, $newCardId, $loyaltyAccountId);

            if ($oldCred) {
                $linkStmt = $this->pdo->prepare("
                    UPDATE `access_credentials`
                    SET `replaced_by_credential_id` = :new_cred_id
                    WHERE `id` = :old_cred_id
                ");
                $linkStmt->execute([
                    'new_cred_id' => $newIssuedCred['id'],
                    'old_cred_id' => $oldCred['id'],
                ]);
            }

            // Activar nueva tarjeta con la misma loyalty_account
            $updateNewStmt = $this->pdo->prepare("
                UPDATE `cards`
                SET `status` = 'active',
                    `loyalty_account_id` = :loyalty_account_id,
                    `assigned_by_user_id` = :assigned_by_user_id,
                    `assigned_at` = UTC_TIMESTAMP(),
                    `updated_at` = UTC_TIMESTAMP()
                WHERE `id` = :new_id
            ");
            $updateNewStmt->execute([
                'loyalty_account_id' => $loyaltyAccountId,
                'assigned_by_user_id' => $assignedByUserId,
                'new_id' => $newCardId,
            ]);

            // 5. Confirmar la transacción
            $this->pdo->commit();

            return [
                'old_card'   => $this->getBusinessCard($businessId, $oldCardId),
                'new_card'   => $this->getBusinessCard($businessId, $newCardId),
                'token'      => $newIssuedCred['token'],
                'public_url' => "/c/{$newIssuedCred['token']}",
            ];
        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e;
        }
    }

    /**
     * Reasigna una tarjeta a otra cuenta cumpliendo la regla de seguridad del Contrato v7:
     * - Solamente dentro del mismo negocio.
     * - Requiere soporte reprogramable.
     * - El token/credencial anterior se revoca y se rota a un nuevo token para evitar que el titular anterior acceda.
     * - No mueve ni mezcla saldos o historiales de las cuentas.
     * - Devuelve requires_reprogramming = true porque NFC/QR debe actualizarse.
     *
     * @return array{card: array, token: string, url: string, requires_reprogramming: bool}
     */
    public function reassignCard(int $businessId, int $cardId, int $newLoyaltyAccountId, ?int $assignedByUserId = null): array
    {
        $account = $this->loyaltyService->getAccount($businessId, $newLoyaltyAccountId);
        if (!$account || (int) $account['business_id'] !== $businessId) {
            throw new InvalidArgumentException('La nueva cuenta de fidelización no existe o no pertenece a este comercio.');
        }

        if ($account['status'] !== 'active') {
            throw new InvalidArgumentException('La nueva cuenta de fidelización debe encontrarse activa.');
        }

        $this->pdo->beginTransaction();

        try {
            // Bloquear primero la fila de cards correspondiente mediante SELECT ... FOR UPDATE
            $lockStmt = $this->pdo->prepare("
                SELECT * FROM `cards`
                WHERE `id` = :id AND `business_id` = :business_id
                FOR UPDATE
            ");
            $lockStmt->execute(['id' => $cardId, 'business_id' => $businessId]);
            $card = $lockStmt->fetch(PDO::FETCH_ASSOC);
            if (!$card) {
                throw new InvalidArgumentException('Tarjeta no encontrada en este comercio.');
            }

            if (!in_array($card['status'], ['active', 'suspended'], true)) {
                throw new InvalidArgumentException("Solo se pueden reasignar tarjetas en estado activo o suspendido (actual: '{$card['status']}').");
            }

            // Rechazar si el soporte físico se declara no reprogramable
            if (isset($card['is_reprogrammable']) && !$card['is_reprogrammable']) {
                throw new InvalidArgumentException('No es posible reasignar la tarjeta: el soporte físico se encuentra declarado como no reprogramable.');
            }

            if ((int) $card['loyalty_account_id'] === $newLoyaltyAccountId) {
                throw new InvalidArgumentException('La tarjeta ya se encuentra vinculada a esta cuenta de fidelización.');
            }

            // Rotar credencial física obligatoriamente bajo el mismo bloqueo:
            // 1. comprueba credencial activa;
            // 2. revoca/reemplaza la anterior;
            // 3. inserta la nueva credencial física activa;
            $newCred = $this->credentialService->rotatePhysicalCredentialForCard($cardId, $businessId, $newLoyaltyAccountId);

            // Actualizar tarjeta vinculada a la nueva cuenta y registrar el usuario que reasigna
            $updateStmt = $this->pdo->prepare("
                UPDATE `cards`
                SET `status` = 'active',
                    `loyalty_account_id` = :loyalty_account_id,
                    `assigned_by_user_id` = :assigned_by_user_id,
                    `assigned_at` = UTC_TIMESTAMP(),
                    `updated_at` = UTC_TIMESTAMP()
                WHERE `id` = :id AND `business_id` = :business_id
            ");
            $updateStmt->execute([
                'loyalty_account_id' => $newLoyaltyAccountId,
                'assigned_by_user_id' => $assignedByUserId,
                'id' => $cardId,
                'business_id' => $businessId,
            ]);

            // 4. Confirmar la transacción
            $this->pdo->commit();

            return [
                'card' => $this->getBusinessCard($businessId, $cardId),
                'token' => $newCred['token'],
                'url' => "/c/{$newCred['token']}",
                'requires_reprogramming' => true,
            ];
        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e;
        }
    }

    /**
     * Desasocia una tarjeta física de la cuenta de cliente:
     * - La tarjeta vuelve a estado 'issued' dentro del mismo comercio, con loyalty_account_id = NULL.
     * - Conserva la cuenta del cliente, su saldo e histórico de movimientos intactos.
     * - Conserva exactamente el mismo token NFC permanente en la tarjeta (actualiza credencial física a loyalty_account_id = NULL).
     *
     * @return array<string, mixed>
     */
    public function unassignCard(int $businessId, int $cardId, ?int $userId = null): array
    {
        $this->pdo->beginTransaction();

        try {
            $lockStmt = $this->pdo->prepare("
                SELECT * FROM `cards`
                WHERE `id` = :id AND `business_id` = :business_id
                FOR UPDATE
            ");
            $lockStmt->execute(['id' => $cardId, 'business_id' => $businessId]);
            $card = $lockStmt->fetch(PDO::FETCH_ASSOC);

            if (!$card) {
                throw new InvalidArgumentException('Tarjeta no encontrada en este comercio.');
            }

            if (!in_array($card['status'], ['active', 'suspended'], true) && $card['loyalty_account_id'] === null) {
                throw new InvalidArgumentException('La tarjeta no se encuentra actualmente asociada a ninguna cuenta.');
            }

            // Actualizar tarjeta a 'issued' desvinculando la cuenta
            $stmt = $this->pdo->prepare("
                UPDATE `cards`
                SET `status` = 'issued',
                    `loyalty_account_id` = NULL,
                    `assigned_by_user_id` = NULL,
                    `assigned_at` = NULL,
                    `updated_at` = UTC_TIMESTAMP()
                WHERE `id` = :id AND `business_id` = :business_id
            ");
            $stmt->execute([
                'id' => $cardId,
                'business_id' => $businessId,
            ]);

            // Actualizar credencial física conservando el token permanente
            $this->credentialService->updatePhysicalCredentialLinks($cardId, $businessId, null);

            $this->pdo->commit();

            return $this->getBusinessCard($businessId, $cardId);
        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e;
        }
    }

    /**
     * Eliminación definitiva de una tarjeta de inventario (Super Admin).
     * Solo permitido si la tarjeta está en estado 'inventory' sin asignar ni histórico.
     */
    public function deleteCardFromInventory(int $cardId): array
    {
        $this->pdo->beginTransaction();

        try {
            $stmt = $this->pdo->prepare("SELECT * FROM `cards` WHERE `id` = :id FOR UPDATE");
            $stmt->execute(['id' => $cardId]);
            $card = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$card) {
                throw new InvalidArgumentException('Tarjeta no encontrada.');
            }

            if ($card['status'] !== 'inventory' || $card['business_id'] !== null || $card['loyalty_account_id'] !== null) {
                throw new InvalidArgumentException('Solo se pueden eliminar definitivamente tarjetas en inventario sin asignar.');
            }

            // Eliminar credencial física asociada
            $delCred = $this->pdo->prepare("DELETE FROM `access_credentials` WHERE `card_id` = :id");
            $delCred->execute(['id' => $cardId]);

            // Eliminar tarjeta
            $delCard = $this->pdo->prepare("DELETE FROM `cards` WHERE `id` = :id");
            $delCard->execute(['id' => $cardId]);

            $this->pdo->commit();

            return ['id' => $cardId, 'deleted' => true];
        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e;
        }
    }

    private function formatCardRow(array $row): array
    {
        return [
            'id' => (int) $row['id'],
            'business_id' => $row['business_id'] !== null ? (int) $row['business_id'] : null,
            'business_name' => $row['business_name'] ?? null,
            'loyalty_account_id' => $row['loyalty_account_id'] !== null ? (int) $row['loyalty_account_id'] : null,
            'design_profile_id' => $row['design_profile_id'] !== null ? (int) $row['design_profile_id'] : null,
            'batch_id' => $row['batch_id'] ?? null,
            'created_by_user_id' => $row['created_by_user_id'] !== null ? (int) $row['created_by_user_id'] : null,
            'assigned_by_user_id' => $row['assigned_by_user_id'] !== null ? (int) $row['assigned_by_user_id'] : null,
            'is_reprogrammable' => isset($row['is_reprogrammable']) ? (bool) $row['is_reprogrammable'] : true,
            'status' => (string) $row['status'],
            'issued_at' => $row['issued_at'] ? (string) $row['issued_at'] : null,
            'assigned_at' => $row['assigned_at'] ? (string) $row['assigned_at'] : null,
            'revoked_at' => $row['revoked_at'] ? (string) $row['revoked_at'] : null,
            'replaced_by_card_id' => $row['replaced_by_card_id'] !== null ? (int) $row['replaced_by_card_id'] : null,
            'created_at' => (string) $row['created_at'],
            'updated_at' => (string) $row['updated_at'],
            'profile_code' => $row['profile_code'] ?? null,
            'profile_name' => $row['profile_name'] ?? null,
        ];
    }
}
