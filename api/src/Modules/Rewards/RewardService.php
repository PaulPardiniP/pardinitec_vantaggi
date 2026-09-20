<?php

declare(strict_types=1);

namespace App\Modules\Rewards;

use App\Core\Database\Connection;
use App\Modules\Loyalty\CapabilityService;
use InvalidArgumentException;
use PDO;
use Throwable;

final class RewardService
{
    private PDO $pdo;
    private CapabilityService $capabilityService;

    public function __construct(?PDO $pdo = null, ?CapabilityService $capabilityService = null)
    {
        $this->pdo = $pdo ?? Connection::get();
        $this->capabilityService = $capabilityService ?? new CapabilityService($this->pdo);
    }

    /**
     * Crea un premio nel catalogo del commercio.
     *
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    /**
     * Cache dei profili di fidelizzazione (code => id)
     * @var array<string, int>|null
     */
    private ?array $profileCodeCache = null;

    private function getProfileIdByCode(string $code): ?int
    {
        if ($this->profileCodeCache === null) {
            $stmt = $this->pdo->query("SELECT `code`, `id` FROM `card_profiles`");
            $this->profileCodeCache = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);
        }
        return isset($this->profileCodeCache[$code]) ? (int) $this->profileCodeCache[$code] : null;
    }

    private function getProfileCodeById(int $id): ?string
    {
        if ($this->profileCodeCache === null) {
            $stmt = $this->pdo->query("SELECT `code`, `id` FROM `card_profiles`");
            $this->profileCodeCache = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);
        }
        $flipped = array_flip($this->profileCodeCache);
        return $flipped[$id] ?? null;
    }

    /**
     * Crea un premio nel catalogo del commercio.
     *
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    public function createReward(int $businessId, array $data): array
    {
        $name = trim((string) ($data['name'] ?? ''));
        if ($name === '') {
            throw new InvalidArgumentException('El nombre del premio es obligatorio.');
        }

        $pointsCost = (int) ($data['points_cost'] ?? 0);
        if ($pointsCost <= 0) {
            throw new InvalidArgumentException('El costo en puntos debe ser mayor a 0.');
        }

        $description = isset($data['description']) ? trim((string) $data['description']) : null;
        $rawProfileId = $data['card_profile_id'] ?? $data['min_profile_id'] ?? null;
        if ($rawProfileId === null || $rawProfileId === '') {
            $rawProfileId = $this->getProfileIdByCode('punti');
        }
        $minProfileId = $rawProfileId !== null ? (int) $rawProfileId : null;
        $status = isset($data['status']) && in_array($data['status'], ['active', 'inactive'], true) ? (string) $data['status'] : 'active';
        $validFrom = !empty($data['valid_from']) ? (string) $data['valid_from'] : null;
        $validUntil = !empty($data['valid_until']) ? (string) $data['valid_until'] : null;

        $stmt = $this->pdo->prepare("
            INSERT INTO `rewards` (
                `business_id`, `name`, `description`, `points_cost`, `min_profile_id`,
                `status`, `valid_from`, `valid_until`, `created_at`, `updated_at`
            ) VALUES (
                :business_id, :name, :description, :points_cost, :min_profile_id,
                :status, :valid_from, :valid_until, UTC_TIMESTAMP(), UTC_TIMESTAMP()
            )
        ");
        $stmt->execute([
            'business_id' => $businessId,
            'name' => $name,
            'description' => $description,
            'points_cost' => $pointsCost,
            'min_profile_id' => $minProfileId,
            'status' => $status,
            'valid_from' => $validFrom,
            'valid_until' => $validUntil,
        ]);

        $rewardId = (int) $this->pdo->lastInsertId();

        return $this->getReward($businessId, $rewardId) ?? [];
    }

    /**
     * Actualiza un premio existente.
     *
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    public function updateReward(int $businessId, int $rewardId, array $data): array
    {
        $existing = $this->getReward($businessId, $rewardId);
        if (!$existing) {
            throw new InvalidArgumentException('Premio no encontrado en este comercio.');
        }

        $name = isset($data['name']) ? trim((string) $data['name']) : $existing['name'];
        if ($name === '') {
            throw new InvalidArgumentException('El nombre del premio no puede estar vacío.');
        }

        $pointsCost = isset($data['points_cost']) ? (int) $data['points_cost'] : $existing['points_cost'];
        if ($pointsCost <= 0) {
            throw new InvalidArgumentException('El costo en puntos debe ser mayor a 0.');
        }

        $description = array_key_exists('description', $data) ? ($data['description'] !== null ? trim((string) $data['description']) : null) : $existing['description'];
        $rawProfileId = array_key_exists('card_profile_id', $data)
            ? $data['card_profile_id']
            : (array_key_exists('min_profile_id', $data) ? $data['min_profile_id'] : $existing['min_profile_id']);
        $minProfileId = $rawProfileId !== null && $rawProfileId !== '' ? (int) $rawProfileId : null;
        $status = isset($data['status']) && in_array($data['status'], ['active', 'inactive'], true) ? (string) $data['status'] : $existing['status'];
        $validFrom = array_key_exists('valid_from', $data) ? ($data['valid_from'] ?: null) : $existing['valid_from'];
        $validUntil = array_key_exists('valid_until', $data) ? ($data['valid_until'] ?: null) : $existing['valid_until'];

        $stmt = $this->pdo->prepare("
            UPDATE `rewards`
            SET `name` = :name,
                `description` = :description,
                `points_cost` = :points_cost,
                `min_profile_id` = :min_profile_id,
                `status` = :status,
                `valid_from` = :valid_from,
                `valid_until` = :valid_until,
                `updated_at` = UTC_TIMESTAMP()
            WHERE `id` = :id AND `business_id` = :business_id
        ");
        $stmt->execute([
            'name' => $name,
            'description' => $description,
            'points_cost' => $pointsCost,
            'min_profile_id' => $minProfileId,
            'status' => $status,
            'valid_from' => $validFrom,
            'valid_until' => $validUntil,
            'id' => $rewardId,
            'business_id' => $businessId,
        ]);

        return $this->getReward($businessId, $rewardId) ?? [];
    }

    /**
     * Desactiva un premio (conserva historial sin borrado físico).
     */
    public function deleteReward(int $businessId, int $rewardId): bool
    {
        $stmt = $this->pdo->prepare("
            UPDATE `rewards`
            SET `status` = 'inactive',
                `updated_at` = UTC_TIMESTAMP()
            WHERE `id` = :id AND `business_id` = :business_id
        ");
        $stmt->execute([
            'id' => $rewardId,
            'business_id' => $businessId,
        ]);

        return $stmt->rowCount() > 0;
    }

    /**
     * Obtiene el detalle de un premio.
     */
    public function getReward(int $businessId, int $rewardId): ?array
    {
        $stmt = $this->pdo->prepare("
            SELECT r.*, cp.`name` AS `min_profile_name`, cp.`code` AS `min_profile_code`
            FROM `rewards` r
            LEFT JOIN `card_profiles` cp ON r.`min_profile_id` = cp.`id`
            WHERE r.`id` = :id AND r.`business_id` = :business_id
            LIMIT 1
        ");
        $stmt->execute([
            'id' => $rewardId,
            'business_id' => $businessId,
        ]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        return $row ? $this->formatReward($row) : null;
    }

    /**
     * Lista premios del comercio.
     *
     * @return array<int, array<string, mixed>>
     */
    public function listRewards(int $businessId, bool $onlyActive = true, ?int $cardProfileId = null, ?string $profileCode = null): array
    {
        if ($cardProfileId === null && $profileCode !== null) {
            $cardProfileId = $this->getProfileIdByCode(strtolower(trim($profileCode)));
        }

        $where = ['r.`business_id` = :business_id'];
        $params = ['business_id' => $businessId];

        if ($onlyActive) {
            $where[] = "r.`status` = 'active'";
            $where[] = "(r.`valid_from` IS NULL OR r.`valid_from` <= UTC_TIMESTAMP())";
            $where[] = "(r.`valid_until` IS NULL OR r.`valid_until` >= UTC_TIMESTAMP())";
        }

        if ($cardProfileId !== null) {
            $profileCode = $this->getProfileCodeById($cardProfileId);
            $puntiId = $this->getProfileIdByCode('punti');
            $vantaggiId = $this->getProfileIdByCode('vantaggi');
            $vipId = $this->getProfileIdByCode('vip');

            if ($profileCode === 'vip') {
                // Cuenta VIP: ve EXCLUSIVAMENTE premios VIP. Nunca premios Punti o Vantaggi.
                if ($vipId !== null) {
                    $where[] = "r.`min_profile_id` = :vip_id";
                    $params['vip_id'] = $vipId;
                } else {
                    $where[] = "1 = 0";
                }
            } elseif ($profileCode === 'vantaggi') {
                // Cuenta Vantaggi: ve premios Vantaggi y hereda premios Punti (NULL o puntiId), pero NUNCA VIP.
                if ($vipId !== null) {
                    $where[] = "(r.`min_profile_id` IS NULL OR r.`min_profile_id` != :vip_id)";
                    $params['vip_id'] = $vipId;
                }
                if ($vantaggiId !== null && $puntiId !== null) {
                    $where[] = "(r.`min_profile_id` IS NULL OR r.`min_profile_id` IN (:vantaggi_id, :punti_id))";
                    $params['vantaggi_id'] = $vantaggiId;
                    $params['punti_id'] = $puntiId;
                }
            } elseif ($profileCode === 'punti') {
                // Cuenta Punti: ve EXCLUSIVAMENTE premios Punti (NULL o puntiId), NUNCA Vantaggi ni VIP.
                if ($vipId !== null) {
                    $where[] = "(r.`min_profile_id` IS NULL OR r.`min_profile_id` != :vip_id)";
                    $params['vip_id'] = $vipId;
                }
                if ($vantaggiId !== null) {
                    $where[] = "(r.`min_profile_id` IS NULL OR r.`min_profile_id` != :vantaggi_id)";
                    $params['vantaggi_id'] = $vantaggiId;
                }
                if ($puntiId !== null) {
                    $where[] = "(r.`min_profile_id` IS NULL OR r.`min_profile_id` = :punti_id)";
                    $params['punti_id'] = $puntiId;
                }
            } else {
                $where[] = "(r.`min_profile_id` IS NULL OR r.`min_profile_id` = :card_profile_id)";
                $params['card_profile_id'] = $cardProfileId;
            }
        }

        $whereSql = implode(' AND ', $where);

        $stmt = $this->pdo->prepare("
            SELECT r.*, cp.`name` AS `min_profile_name`, cp.`code` AS `min_profile_code`
            FROM `rewards` r
            LEFT JOIN `card_profiles` cp ON r.`min_profile_id` = cp.`id`
            WHERE {$whereSql}
            ORDER BY r.`points_cost` ASC, r.`id` ASC
        ");
        $stmt->execute($params);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        return array_map([$this, 'formatReward'], $rows);
    }

    /**
     * Canjea un premio para una cuenta de fidelización:
     * - Valida capacidad 'rewards'.
     * - Idempotencia total mediante operation_id.
     * - Bloqueo pesimista de cuenta con SELECT ... FOR UPDATE.
     * - Descuenta puntos en el ledger inmutable (points_transactions).
     * - Registra el canje en reward_redemptions.
     *
     * @return array{idempotent: bool, redemption: array<string, mixed>, balance: int}
     */
    public function redeemReward(
        int $businessId,
        int $loyaltyAccountId,
        int $rewardId,
        string $operationId,
        ?int $actorUserId = null,
        ?string $notes = null
    ): array {
        $operationId = trim($operationId);
        if ($operationId === '') {
            throw new InvalidArgumentException('El identificador de operación (operation_id) es obligatorio para garantizar la idempotencia.');
        }

        // 1. Validar capacidad 'rewards' para la cuenta y comercio
        $account = $this->capabilityService->assertAccountCapability($businessId, $loyaltyAccountId, 'rewards');

        // 2. Control de Idempotencia
        $existing = $this->getRedemptionByOperationId($businessId, $operationId);
        if ($existing !== null) {
            $accStmt = $this->pdo->prepare("SELECT `balance` FROM `loyalty_accounts` WHERE `id` = :id");
            $accStmt->execute(['id' => $loyaltyAccountId]);
            $currentBalance = (int) $accStmt->fetchColumn();

            return [
                'idempotent' => true,
                'redemption' => $existing,
                'balance' => $currentBalance,
            ];
        }

        // 3. Transacción atómica y bloqueo pesimista
        $this->pdo->beginTransaction();

        try {
            // Bloquear cuenta
            $lockStmt = $this->pdo->prepare("
                SELECT `id`, `business_id`, `card_profile_id`, `balance`, `status`
                FROM `loyalty_accounts`
                WHERE `id` = :id AND `business_id` = :business_id
                FOR UPDATE
            ");
            $lockStmt->execute([
                'id' => $loyaltyAccountId,
                'business_id' => $businessId,
            ]);
            $lockedAccount = $lockStmt->fetch(PDO::FETCH_ASSOC);

            if (!$lockedAccount || $lockedAccount['status'] !== 'active') {
                throw new InvalidArgumentException('Cuenta de fidelización no disponible o inactiva.');
            }

            // Validar premio
            $reward = $this->getReward($businessId, $rewardId);
            if (!$reward || $reward['status'] !== 'active') {
                throw new InvalidArgumentException('El premio solicitado no existe o no se encuentra activo.');
            }

            // Comprobar vigencia
            $now = gmdate('Y-m-d H:i:s');
            if ($reward['valid_from'] && $reward['valid_from'] > $now) {
                throw new InvalidArgumentException('El premio solicitado aún no se encuentra vigente.');
            }
            if ($reward['valid_until'] && $reward['valid_until'] < $now) {
                throw new InvalidArgumentException('El premio solicitado ha expirado.');
            }

            // Comprobar segmentación por perfil
            $accProfileId = (int) $lockedAccount['card_profile_id'];
            $accProfileCode = $this->getProfileCodeById($accProfileId);
            $puntiId = $this->getProfileIdByCode('punti');
            $vantaggiId = $this->getProfileIdByCode('vantaggi');
            $vipId = $this->getProfileIdByCode('vip');
            $rewardProfileId = $reward['min_profile_id'] !== null ? (int) $reward['min_profile_id'] : null;

            if ($accProfileCode === 'vip') {
                if ($rewardProfileId === null || ($vipId !== null && $rewardProfileId !== $vipId)) {
                    throw new InvalidArgumentException('Questo premio non è disponibile per il profilo VIP.');
                }
            } elseif ($accProfileCode === 'punti') {
                if ($rewardProfileId !== null && $puntiId !== null && $rewardProfileId !== $puntiId) {
                    throw new InvalidArgumentException('Questo premio non è abilitato per il profilo Punti.');
                }
            } elseif ($accProfileCode === 'vantaggi') {
                if ($rewardProfileId !== null && $vipId !== null && $rewardProfileId === $vipId) {
                    throw new InvalidArgumentException('Questo premio è riservato esclusivamente ai clienti VIP.');
                }
            }

            $pointsCost = (int) $reward['points_cost'];
            $currentBalance = (int) $lockedAccount['balance'];

            if ($currentBalance < $pointsCost) {
                throw new InvalidArgumentException("Puntos insuficientes para canjear el premio '{$reward['name']}'. Requeridos: {$pointsCost}, disponibles: {$currentBalance}.");
            }

            $newBalance = $currentBalance - $pointsCost;

            // Actualizar saldo de la cuenta
            $updateStmt = $this->pdo->prepare("
                UPDATE `loyalty_accounts`
                SET `balance` = :balance,
                    `updated_at` = UTC_TIMESTAMP()
                WHERE `id` = :id
            ");
            $updateStmt->execute([
                'balance' => $newBalance,
                'id' => $loyaltyAccountId,
            ]);

            $cleanNotes = $notes !== null ? trim($notes) : null;
            $txReason = "Riscatto premio: {$reward['name']}";

            // Registrar en el ledger inmutable de puntos (sin notas internas para preservar privacidad pública)
            $txStmt = $this->pdo->prepare("
                INSERT INTO `points_transactions` (
                    `business_id`, `loyalty_account_id`, `actor_user_id`, `type`, `points`,
                    `balance_after`, `reason`, `operation_id`, `created_at`
                ) VALUES (
                    :business_id, :account_id, :actor_id, 'reward_redeem', :points,
                    :balance_after, :reason, :operation_id, UTC_TIMESTAMP()
                )
            ");
            $txStmt->execute([
                'business_id' => $businessId,
                'account_id' => $loyaltyAccountId,
                'actor_id' => $actorUserId,
                'points' => -$pointsCost,
                'balance_after' => $newBalance,
                'reason' => $txReason,
                'operation_id' => 'pts_' . $operationId,
            ]);

            // Registrar en reward_redemptions con notas internas y timestamp de entrega confirmada
            $redemptStmt = $this->pdo->prepare("
                INSERT INTO `reward_redemptions` (
                    `business_id`, `loyalty_account_id`, `reward_id`, `points_spent`,
                    `notes`, `delivered_at`, `actor_user_id`, `operation_id`, `created_at`
                ) VALUES (
                    :business_id, :account_id, :reward_id, :points_spent,
                    :notes, UTC_TIMESTAMP(), :actor_id, :operation_id, UTC_TIMESTAMP()
                )
            ");
            $redemptStmt->execute([
                'business_id' => $businessId,
                'account_id' => $loyaltyAccountId,
                'reward_id' => $rewardId,
                'points_spent' => $pointsCost,
                'notes' => !empty($cleanNotes) ? $cleanNotes : null,
                'actor_id' => $actorUserId,
                'operation_id' => $operationId,
            ]);

            $redemptionId = (int) $this->pdo->lastInsertId();

            $this->pdo->commit();

            $redemption = $this->getRedemptionById($redemptionId);

            return [
                'idempotent' => false,
                'redemption' => $redemption ?? [],
                'balance' => $newBalance,
            ];
        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e;
        }
    }

    /**
     * Obtiene el próximo premio alcanzable para mostrar progreso al cliente.
     */
    public function getNextAvailableReward(int $businessId, int $currentBalance, ?int $cardProfileId = null): ?array
    {
        $rewards = $this->listRewards($businessId, true, $cardProfileId);
        if (empty($rewards)) {
            return null;
        }

        // Buscar el primer premio cuyo costo supere el saldo actual, o el premio más económico
        $next = null;
        foreach ($rewards as $r) {
            if ($r['points_cost'] > $currentBalance) {
                $next = $r;
                break;
            }
        }

        if ($next === null) {
            // Ya alcanzó todos los premios, tomar el de mayor valor como referencia
            $next = end($rewards);
        }

        $cost = (int) $next['points_cost'];
        $remaining = max(0, $cost - $currentBalance);
        $percent = $cost > 0 ? (int) min(100, max(0, (int) floor(($currentBalance / $cost) * 100))) : 100;

        return [
            'id' => $next['id'],
            'name' => $next['name'],
            'points_cost' => $cost,
            'points_needed' => $remaining,
            'progress_percent' => $percent,
            'progress_percentage' => $percent,
        ];
    }

    public function getRedemptionByOperationId(int $businessId, string $operationId): ?array
    {
        $stmt = $this->pdo->prepare("
            SELECT rr.*, r.`name` AS `reward_name`, u.`name` AS `actor_name`
            FROM `reward_redemptions` rr
            INNER JOIN `rewards` r ON rr.`reward_id` = r.`id`
            LEFT JOIN `users` u ON rr.`actor_user_id` = u.`id`
            WHERE rr.`business_id` = :business_id AND rr.`operation_id` = :operation_id
            LIMIT 1
        ");
        $stmt->execute([
            'business_id' => $businessId,
            'operation_id' => $operationId,
        ]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        return $row ? $this->formatRedemption($row) : null;
    }

    public function getRedemptionById(int $id): ?array
    {
        $stmt = $this->pdo->prepare("
            SELECT rr.*, r.`name` AS `reward_name`, u.`name` AS `actor_name`
            FROM `reward_redemptions` rr
            INNER JOIN `rewards` r ON rr.`reward_id` = r.`id`
            LEFT JOIN `users` u ON rr.`actor_user_id` = u.`id`
            WHERE rr.`id` = :id
            LIMIT 1
        ");
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        return $row ? $this->formatRedemption($row) : null;
    }

    private function formatReward(array $row): array
    {
        return [
            'id' => (int) $row['id'],
            'business_id' => (int) $row['business_id'],
            'name' => (string) $row['name'],
            'description' => $row['description'] ? (string) $row['description'] : null,
            'points_cost' => (int) $row['points_cost'],
            'min_profile_id' => $row['min_profile_id'] !== null ? (int) $row['min_profile_id'] : null,
            'card_profile_id' => $row['min_profile_id'] !== null ? (int) $row['min_profile_id'] : null,
            'min_profile_name' => $row['min_profile_name'] ?? null,
            'min_profile_code' => $row['min_profile_code'] ?? null,
            'status' => (string) $row['status'],
            'valid_from' => $row['valid_from'] ? (string) $row['valid_from'] : null,
            'valid_until' => $row['valid_until'] ? (string) $row['valid_until'] : null,
            'created_at' => (string) $row['created_at'],
            'updated_at' => (string) $row['updated_at'],
        ];
    }

    private function formatRedemption(array $row): array
    {
        return [
            'id' => (int) $row['id'],
            'business_id' => (int) $row['business_id'],
            'loyalty_account_id' => (int) $row['loyalty_account_id'],
            'reward_id' => (int) $row['reward_id'],
            'reward_name' => $row['reward_name'] ?? null,
            'points_spent' => (int) $row['points_spent'],
            'notes' => isset($row['notes']) && $row['notes'] !== null ? (string) $row['notes'] : null,
            'actor_user_id' => $row['actor_user_id'] !== null ? (int) $row['actor_user_id'] : null,
            'actor_name' => $row['actor_name'] ?? null,
            'operation_id' => (string) $row['operation_id'],
            'created_at' => (string) $row['created_at'],
        ];
    }
}
