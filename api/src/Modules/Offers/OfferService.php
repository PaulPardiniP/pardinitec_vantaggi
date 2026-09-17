<?php

declare(strict_types=1);

namespace App\Modules\Offers;

use App\Core\Database\Connection;
use App\Modules\Loyalty\CapabilityService;
use InvalidArgumentException;
use PDO;
use Throwable;

final class OfferService
{
    private PDO $pdo;
    private CapabilityService $capabilityService;

    public const ALLOWED_TYPES = [
        'standard',
        'vip_exclusive',
        'discount',
        'gift',
    ];

    public function __construct(?PDO $pdo = null, ?CapabilityService $capabilityService = null)
    {
        $this->pdo = $pdo ?? Connection::get();
        $this->capabilityService = $capabilityService ?? new CapabilityService($this->pdo);
    }

    /**
     * Crea un'offerta per il commercio.
     *
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    public function createOffer(int $businessId, array $data): array
    {
        $title = trim((string) ($data['title'] ?? ''));
        if ($title === '') {
            throw new InvalidArgumentException('El título de la oferta es obligatorio.');
        }

        $offerType = isset($data['offer_type']) ? (string) $data['offer_type'] : 'standard';
        if (!in_array($offerType, self::ALLOWED_TYPES, true)) {
            throw new InvalidArgumentException("Tipo de oferta inválido: '{$offerType}'. Permitidos: " . implode(', ', self::ALLOWED_TYPES));
        }

        $description = isset($data['description']) ? trim((string) $data['description']) : null;
        $requiredCap = isset($data['required_capability']) && trim((string) $data['required_capability']) !== ''
            ? trim((string) $data['required_capability'])
            : ($offerType === 'vip_exclusive' ? 'vip_offers' : 'offers');

        $cardProfileId = isset($data['card_profile_id']) && $data['card_profile_id'] !== '' ? (int) $data['card_profile_id'] : null;
        $isSingleUse = isset($data['is_single_use']) ? (bool) $data['is_single_use'] : true;
        $discountPct = isset($data['discount_percentage']) && is_numeric($data['discount_percentage']) ? (float) $data['discount_percentage'] : null;
        $status = isset($data['status']) && in_array($data['status'], ['active', 'inactive', 'expired'], true) ? (string) $data['status'] : 'active';
        $startDate = !empty($data['start_date']) ? (string) $data['start_date'] : null;
        $endDate = !empty($data['end_date']) ? (string) $data['end_date'] : null;

        $stmt = $this->pdo->prepare("
            INSERT INTO `offers` (
                `business_id`, `title`, `description`, `offer_type`, `required_capability`,
                `card_profile_id`, `is_single_use`, `discount_percentage`, `status`,
                `start_date`, `end_date`, `created_at`, `updated_at`
            ) VALUES (
                :business_id, :title, :description, :offer_type, :required_capability,
                :card_profile_id, :is_single_use, :discount_percentage, :status,
                :start_date, :end_date, UTC_TIMESTAMP(), UTC_TIMESTAMP()
            )
        ");
        $stmt->execute([
            'business_id' => $businessId,
            'title' => $title,
            'description' => $description,
            'offer_type' => $offerType,
            'required_capability' => $requiredCap,
            'card_profile_id' => $cardProfileId,
            'is_single_use' => $isSingleUse ? 1 : 0,
            'discount_percentage' => $discountPct,
            'status' => $status,
            'start_date' => $startDate,
            'end_date' => $endDate,
        ]);

        $offerId = (int) $this->pdo->lastInsertId();

        return $this->getOffer($businessId, $offerId) ?? [];
    }

    /**
     * Aggiorna un'offerta esistente.
     *
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    public function updateOffer(int $businessId, int $offerId, array $data): array
    {
        $existing = $this->getOffer($businessId, $offerId);
        if (!$existing) {
            throw new InvalidArgumentException('Oferta no encontrada en este comercio.');
        }

        $title = isset($data['title']) ? trim((string) $data['title']) : $existing['title'];
        if ($title === '') {
            throw new InvalidArgumentException('El título de la oferta no puede estar vacío.');
        }

        $offerType = isset($data['offer_type']) ? (string) $data['offer_type'] : $existing['offer_type'];
        if (!in_array($offerType, self::ALLOWED_TYPES, true)) {
            throw new InvalidArgumentException("Tipo de oferta inválido: '{$offerType}'.");
        }

        $description = array_key_exists('description', $data) ? ($data['description'] !== null ? trim((string) $data['description']) : null) : $existing['description'];
        $requiredCap = isset($data['required_capability']) ? trim((string) $data['required_capability']) : $existing['required_capability'];
        $cardProfileId = array_key_exists('card_profile_id', $data) ? ($data['card_profile_id'] !== null ? (int) $data['card_profile_id'] : null) : $existing['card_profile_id'];
        $isSingleUse = isset($data['is_single_use']) ? (bool) $data['is_single_use'] : (bool) $existing['is_single_use'];
        $discountPct = array_key_exists('discount_percentage', $data) ? ($data['discount_percentage'] !== null ? (float) $data['discount_percentage'] : null) : $existing['discount_percentage'];
        $status = isset($data['status']) && in_array($data['status'], ['active', 'inactive', 'expired'], true) ? (string) $data['status'] : $existing['status'];
        $startDate = array_key_exists('start_date', $data) ? ($data['start_date'] ?: null) : $existing['start_date'];
        $endDate = array_key_exists('end_date', $data) ? ($data['end_date'] ?: null) : $existing['end_date'];

        $stmt = $this->pdo->prepare("
            UPDATE `offers`
            SET `title` = :title,
                `description` = :description,
                `offer_type` = :offer_type,
                `required_capability` = :required_capability,
                `card_profile_id` = :card_profile_id,
                `is_single_use` = :is_single_use,
                `discount_percentage` = :discount_percentage,
                `status` = :status,
                `start_date` = :start_date,
                `end_date` = :end_date,
                `updated_at` = UTC_TIMESTAMP()
            WHERE `id` = :id AND `business_id` = :business_id
        ");
        $stmt->execute([
            'title' => $title,
            'description' => $description,
            'offer_type' => $offerType,
            'required_capability' => $requiredCap,
            'card_profile_id' => $cardProfileId,
            'is_single_use' => $isSingleUse ? 1 : 0,
            'discount_percentage' => $discountPct,
            'status' => $status,
            'start_date' => $startDate,
            'end_date' => $endDate,
            'id' => $offerId,
            'business_id' => $businessId,
        ]);

        return $this->getOffer($businessId, $offerId) ?? [];
    }

    /**
     * Disattiva un'offerta.
     */
    public function deleteOffer(int $businessId, int $offerId): bool
    {
        $stmt = $this->pdo->prepare("
            UPDATE `offers`
            SET `status` = 'inactive',
                `updated_at` = UTC_TIMESTAMP()
            WHERE `id` = :id AND `business_id` = :business_id
        ");
        $stmt->execute([
            'id' => $offerId,
            'business_id' => $businessId,
        ]);

        return $stmt->rowCount() > 0;
    }

    /**
     * Ottiene il dettaglio di un'offerta.
     */
    public function getOffer(int $businessId, int $offerId): ?array
    {
        $stmt = $this->pdo->prepare("
            SELECT o.*, cp.`name` AS `profile_name`, cp.`code` AS `profile_code`
            FROM `offers` o
            LEFT JOIN `card_profiles` cp ON o.`card_profile_id` = cp.`id`
            WHERE o.`id` = :id AND o.`business_id` = :business_id
            LIMIT 1
        ");
        $stmt->execute([
            'id' => $offerId,
            'business_id' => $businessId,
        ]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        return $row ? $this->formatOffer($row) : null;
    }

    /**
     * Elenca le offerte del commercio con filtri opzionali.
     *
     * @return array<int, array<string, mixed>>
     */
    public function listOffers(
        int $businessId,
        bool $onlyActive = true,
        ?int $cardProfileId = null,
        ?string $capability = null
    ): array {
        $where = ['o.`business_id` = :business_id'];
        $params = ['business_id' => $businessId];

        if ($onlyActive) {
            $where[] = "o.`status` = 'active'";
            $where[] = "(o.`start_date` IS NULL OR o.`start_date` <= UTC_TIMESTAMP())";
            $where[] = "(o.`end_date` IS NULL OR o.`end_date` >= UTC_TIMESTAMP())";
        }

        if ($cardProfileId !== null) {
            $where[] = "(o.`card_profile_id` IS NULL OR o.`card_profile_id` = :card_profile_id)";
            $params['card_profile_id'] = $cardProfileId;
        }

        if ($capability !== null) {
            $where[] = "o.`required_capability` = :capability";
            $params['capability'] = $capability;
        }

        $whereSql = implode(' AND ', $where);

        $stmt = $this->pdo->prepare("
            SELECT o.*, cp.`name` AS `profile_name`, cp.`code` AS `profile_code`
            FROM `offers` o
            LEFT JOIN `card_profiles` cp ON o.`card_profile_id` = cp.`id`
            WHERE {$whereSql}
            ORDER BY o.`id` DESC
        ");
        $stmt->execute($params);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        return array_map([$this, 'formatOffer'], $rows);
    }

    /**
     * Riscatta o applica un'offerta su una loyalty_account:
     * - Valida che la capacità richiesta ('offers' o 'vip_offers') sia ammessa per profilo e commercio.
     * - Idempotenza totale tramite operation_id.
     * - Controllo uso singolo (se is_single_use = 1, impedisce il secondo utilizzo).
     * - Registra la transazione in offer_redemptions.
     *
     * @return array{idempotent: bool, redemption: array<string, mixed>}
     */
    public function redeemOffer(
        int $businessId,
        int $loyaltyAccountId,
        int $offerId,
        string $operationId,
        ?int $actorUserId = null
    ): array {
        $operationId = trim($operationId);
        if ($operationId === '') {
            throw new InvalidArgumentException('El identificador de operación (operation_id) es obligatorio para garantizar la idempotencia.');
        }

        // 1. Ottenere offerta
        $offer = $this->getOffer($businessId, $offerId);
        if (!$offer || $offer['status'] !== 'active') {
            throw new InvalidArgumentException('L\'offerta richiesta non esiste o non è attiva.');
        }

        // Comprobar vigencia
        $now = gmdate('Y-m-d H:i:s');
        if ($offer['start_date'] && $offer['start_date'] > $now) {
            throw new InvalidArgumentException('L\'offerta non è ancora valida.');
        }
        if ($offer['end_date'] && $offer['end_date'] < $now) {
            throw new InvalidArgumentException('L\'offerta è scaduta.');
        }

        // 2. Validare capacità del profilo (es. 'offers' o 'vip_offers')
        $requiredCap = $offer['required_capability'] ?? 'offers';
        $account = $this->capabilityService->assertAccountCapability($businessId, $loyaltyAccountId, $requiredCap);

        // Validar corrispondenza del profilo se specificato nell'offerta
        if ($offer['card_profile_id'] !== null && (int) $offer['card_profile_id'] !== (int) $account['card_profile_id']) {
            throw new InvalidArgumentException('Questa offerta è riservata a un profilo di fidelizzazione diverso.');
        }

        // 3. Controllo Idempotenza
        $existing = $this->getRedemptionByOperationId($businessId, $operationId);
        if ($existing !== null) {
            return [
                'idempotent' => true,
                'redemption' => $existing,
            ];
        }

        // 4. Controllo Uso Singolo (is_single_use)
        if ($offer['is_single_use']) {
            $usedStmt = $this->pdo->prepare("
                SELECT COUNT(*)
                FROM `offer_redemptions`
                WHERE `business_id` = :business_id
                  AND `loyalty_account_id` = :account_id
                  AND `offer_id` = :offer_id
            ");
            $usedStmt->execute([
                'business_id' => $businessId,
                'account_id' => $loyaltyAccountId,
                'offer_id' => $offerId,
            ]);
            if ((int) $usedStmt->fetchColumn() > 0) {
                throw new InvalidArgumentException('Questa offerta è monouso ed è già stata utilizzata per questo cliente.');
            }
        }

        // 5. Inserimento atomico
        $this->pdo->beginTransaction();

        try {
            $insertStmt = $this->pdo->prepare("
                INSERT INTO `offer_redemptions` (
                    `business_id`, `loyalty_account_id`, `offer_id`, `actor_user_id`,
                    `operation_id`, `redeemed_at`, `created_at`
                ) VALUES (
                    :business_id, :account_id, :offer_id, :actor_id,
                    :operation_id, UTC_TIMESTAMP(), UTC_TIMESTAMP()
                )
            ");
            $insertStmt->execute([
                'business_id' => $businessId,
                'account_id' => $loyaltyAccountId,
                'offer_id' => $offerId,
                'actor_id' => $actorUserId,
                'operation_id' => $operationId,
            ]);

            $redemptionId = (int) $this->pdo->lastInsertId();

            $this->pdo->commit();

            $redemption = $this->getRedemptionById($redemptionId);

            return [
                'idempotent' => false,
                'redemption' => $redemption ?? [],
            ];
        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e;
        }
    }

    public function getRedemptionByOperationId(int $businessId, string $operationId): ?array
    {
        $stmt = $this->pdo->prepare("
            SELECT ored.*, o.`title` AS `offer_title`, u.`name` AS `actor_name`
            FROM `offer_redemptions` ored
            INNER JOIN `offers` o ON ored.`offer_id` = o.`id`
            LEFT JOIN `users` u ON ored.`actor_user_id` = u.`id`
            WHERE ored.`business_id` = :business_id AND ored.`operation_id` = :operation_id
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
            SELECT ored.*, o.`title` AS `offer_title`, u.`name` AS `actor_name`
            FROM `offer_redemptions` ored
            INNER JOIN `offers` o ON ored.`offer_id` = o.`id`
            LEFT JOIN `users` u ON ored.`actor_user_id` = u.`id`
            WHERE ored.`id` = :id
            LIMIT 1
        ");
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        return $row ? $this->formatRedemption($row) : null;
    }

    private function formatOffer(array $row): array
    {
        return [
            'id' => (int) $row['id'],
            'business_id' => (int) $row['business_id'],
            'title' => (string) $row['title'],
            'description' => $row['description'] ? (string) $row['description'] : null,
            'offer_type' => (string) $row['offer_type'],
            'required_capability' => (string) $row['required_capability'],
            'card_profile_id' => $row['card_profile_id'] !== null ? (int) $row['card_profile_id'] : null,
            'profile_name' => $row['profile_name'] ?? null,
            'profile_code' => $row['profile_code'] ?? null,
            'is_single_use' => (bool) $row['is_single_use'],
            'discount_percentage' => $row['discount_percentage'] !== null ? (float) $row['discount_percentage'] : null,
            'status' => (string) $row['status'],
            'start_date' => $row['start_date'] ? (string) $row['start_date'] : null,
            'end_date' => $row['end_date'] ? (string) $row['end_date'] : null,
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
            'offer_id' => (int) $row['offer_id'],
            'offer_title' => $row['offer_title'] ?? null,
            'actor_user_id' => $row['actor_user_id'] !== null ? (int) $row['actor_user_id'] : null,
            'actor_name' => $row['actor_name'] ?? null,
            'operation_id' => (string) $row['operation_id'],
            'redeemed_at' => (string) $row['redeemed_at'],
            'created_at' => (string) $row['created_at'],
        ];
    }
}
