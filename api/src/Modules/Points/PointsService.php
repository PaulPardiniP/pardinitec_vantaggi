<?php

declare(strict_types=1);

namespace App\Modules\Points;

use App\Core\Database\Connection;
use App\Modules\Loyalty\CapabilityService;
use InvalidArgumentException;
use PDO;
use Throwable;

final class PointsService
{
    private PDO $pdo;
    private CapabilityService $capabilityService;

    public const ALLOWED_TYPES = [
        'purchase_fixed',
        'purchase_amount',
        'bonus',
        'reward_redeem',
        'correction',
        'manual_adjustment',
    ];

    public function __construct(?PDO $pdo = null, ?CapabilityService $capabilityService = null)
    {
        $this->pdo = $pdo ?? Connection::get();
        $this->capabilityService = $capabilityService ?? new CapabilityService($this->pdo);
    }

    /**
     * Ajusta puntos sobre una cuenta de fidelización de forma atómica, inmutable e idempotente.
     * Garantiza:
     * - Verificación de capacidad 'points' para el negocio y el perfil de la cuenta.
     * - Idempotencia total mediante operation_id (evita dobles clics o reintentos duplicados).
     * - Bloqueo pesimista con SELECT ... FOR UPDATE sobre la fila de loyalty_accounts.
     * - Rechazo estricto de saldo negativo (balance < 0).
     * - Registro en el ledger inmutable points_transactions (nunca se borra ni se modifica).
     *
     * @return array{idempotent: bool, transaction: array<string, mixed>, balance: int, account: array<string, mixed>}
     */
    public function adjustPoints(
        int $businessId,
        int $loyaltyAccountId,
        int $pointsDelta,
        string $type,
        ?string $reason,
        string $operationId,
        ?int $actorUserId = null,
        ?float $spentAmount = null
    ): array {
        $operationId = trim($operationId);
        if ($operationId === '') {
            throw new InvalidArgumentException('El identificador de operación (operation_id) es obligatorio para garantizar la idempotencia.');
        }

        if (!in_array($type, self::ALLOWED_TYPES, true)) {
            throw new InvalidArgumentException("Tipo de transacción inválido: '{$type}'. Permitidos: " . implode(', ', self::ALLOWED_TYPES));
        }

        // 1. Validar capacidades de negocio y perfil (rechaza si la cuenta o negocio no admiten puntos)
        $account = $this->capabilityService->assertAccountCapability($businessId, $loyaltyAccountId, 'points');

        // 2. Control de Idempotencia: ¿Ya existe una transacción con este operation_id en este negocio?
        $existing = $this->getTransactionByOperationId($businessId, $operationId);
        if ($existing !== null) {
            // Ya procesada: retornar el resultado existente sin re-ejecutar ni alterar saldo
            $accStmt = $this->pdo->prepare("SELECT `balance` FROM `loyalty_accounts` WHERE `id` = :id");
            $accStmt->execute(['id' => $loyaltyAccountId]);
            $currentBalance = (int) $accStmt->fetchColumn();

            return [
                'idempotent' => true,
                'transaction' => $existing,
                'balance' => $currentBalance,
                'account' => $account,
            ];
        }

        // 3. Transacción atómica con bloqueo pesimista
        $this->pdo->beginTransaction();

        try {
            // Bloqueo pesimista de la fila de la cuenta
            $lockStmt = $this->pdo->prepare("
                SELECT `id`, `business_id`, `customer_id`, `card_profile_id`, `balance`, `status`
                FROM `loyalty_accounts`
                WHERE `id` = :id AND `business_id` = :business_id
                FOR UPDATE
            ");
            $lockStmt->execute([
                'id' => $loyaltyAccountId,
                'business_id' => $businessId,
            ]);
            $lockedAccount = $lockStmt->fetch(PDO::FETCH_ASSOC);

            if (!$lockedAccount) {
                throw new InvalidArgumentException('Cuenta de fidelización no encontrada.');
            }

            if ($lockedAccount['status'] !== 'active') {
                throw new InvalidArgumentException('No es posible modificar puntos en una cuenta inactiva o suspendida.');
            }

            $currentBalance = (int) $lockedAccount['balance'];
            $newBalance = $currentBalance + $pointsDelta;

            // 4. Impedir saldo negativo
            if ($newBalance < 0) {
                throw new InvalidArgumentException("Saldo insuficiente: la operación requeriría {$pointsDelta} puntos, dejando el saldo en {$newBalance}. Los puntos no pueden ser negativos.");
            }

            // 5. Actualizar saldo rápido en loyalty_accounts
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

            // 6. Insertar en el ledger inmutable points_transactions
            $insertStmt = $this->pdo->prepare("
                INSERT INTO `points_transactions` (
                    `business_id`,
                    `loyalty_account_id`,
                    `actor_user_id`,
                    `type`,
                    `points`,
                    `balance_after`,
                    `spent_amount`,
                    `reason`,
                    `operation_id`,
                    `created_at`
                ) VALUES (
                    :business_id,
                    :account_id,
                    :actor_id,
                    :type,
                    :points,
                    :balance_after,
                    :spent_amount,
                    :reason,
                    :operation_id,
                    UTC_TIMESTAMP()
                )
            ");
            $insertStmt->execute([
                'business_id' => $businessId,
                'account_id' => $loyaltyAccountId,
                'actor_id' => $actorUserId,
                'type' => $type,
                'points' => $pointsDelta,
                'balance_after' => $newBalance,
                'spent_amount' => $spentAmount,
                'reason' => $reason,
                'operation_id' => $operationId,
            ]);

            $txId = (int) $this->pdo->lastInsertId();

            $this->pdo->commit();

            $tx = $this->getTransactionById($txId);

            return [
                'idempotent' => false,
                'transaction' => $tx ?? [],
                'balance' => $newBalance,
                'account' => $account,
            ];
        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e;
        }
    }

    /**
     * Consulta una transacción por su ID de operación (idempotency key).
     */
    public function getTransactionByOperationId(int $businessId, string $operationId): ?array
    {
        $stmt = $this->pdo->prepare("
            SELECT pt.*, u.`name` AS `actor_name`
            FROM `points_transactions` pt
            LEFT JOIN `users` u ON pt.`actor_user_id` = u.`id`
            WHERE pt.`business_id` = :business_id AND pt.`operation_id` = :operation_id
            LIMIT 1
        ");
        $stmt->execute([
            'business_id' => $businessId,
            'operation_id' => $operationId,
        ]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        return $row ? $this->formatTransaction($row) : null;
    }

    /**
     * Consulta una transacción por su ID primaria.
     */
    public function getTransactionById(int $id): ?array
    {
        $stmt = $this->pdo->prepare("
            SELECT pt.*, u.`name` AS `actor_name`
            FROM `points_transactions` pt
            LEFT JOIN `users` u ON pt.`actor_user_id` = u.`id`
            WHERE pt.`id` = :id
            LIMIT 1
        ");
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        return $row ? $this->formatTransaction($row) : null;
    }

    /**
     * Lista el historial paginado de movimientos de una cuenta de fidelización.
     *
     * @return array{data: array<int, array<string, mixed>>, pagination: array<string, int>}
     */
    public function getAccountTransactions(int $businessId, int $loyaltyAccountId, int $page = 1, int $perPage = 20): array
    {
        $page = max(1, $page);
        $perPage = max(1, min(100, $perPage));
        $offset = ($page - 1) * $perPage;

        // Conteo total
        $countStmt = $this->pdo->prepare("
            SELECT COUNT(*)
            FROM `points_transactions`
            WHERE `business_id` = :business_id AND `loyalty_account_id` = :account_id
        ");
        $countStmt->execute([
            'business_id' => $businessId,
            'account_id' => $loyaltyAccountId,
        ]);
        $total = (int) $countStmt->fetchColumn();

        // Datos paginados
        $stmt = $this->pdo->prepare("
            SELECT pt.*, u.`name` AS `actor_name`
            FROM `points_transactions` pt
            LEFT JOIN `users` u ON pt.`actor_user_id` = u.`id`
            WHERE pt.`business_id` = :business_id AND pt.`loyalty_account_id` = :account_id
            ORDER BY pt.`id` DESC
            LIMIT {$perPage} OFFSET {$offset}
        ");
        $stmt->execute([
            'business_id' => $businessId,
            'account_id' => $loyaltyAccountId,
        ]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        return [
            'data' => array_map([$this, 'formatTransaction'], $rows),
            'pagination' => [
                'page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'total_pages' => (int) ceil($total / $perPage),
            ],
        ];
    }

    /**
     * Formatea un registro de transacción.
     */
    private function formatTransaction(array $row): array
    {
        return [
            'id' => (int) $row['id'],
            'business_id' => (int) $row['business_id'],
            'loyalty_account_id' => (int) $row['loyalty_account_id'],
            'actor_user_id' => $row['actor_user_id'] !== null ? (int) $row['actor_user_id'] : null,
            'actor_name' => $row['actor_name'] ?? null,
            'type' => (string) $row['type'],
            'points' => (int) $row['points'],
            'balance_after' => (int) $row['balance_after'],
            'spent_amount' => $row['spent_amount'] !== null ? (float) $row['spent_amount'] : null,
            'reason' => $row['reason'] ? (string) $row['reason'] : null,
            'operation_id' => (string) $row['operation_id'],
            'created_at' => (string) $row['created_at'],
        ];
    }
}
