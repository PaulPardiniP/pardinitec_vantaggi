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

    public static function formatBenefit(string $discountType, float $discountValue): string
    {
        if ($discountType === 'percentage') {
            $valStr = rtrim(rtrim(number_format($discountValue, 2, ',', ''), '0'), ',');
            return "Sconto {$valStr}%";
        }
        $valStr = number_format($discountValue, 2, ',', '.');
        return "Sconto €{$valStr}";
    }

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
     * Valida e normalizza il payload per creazione/aggiornamento offerta.
     *
     * @param array<string, mixed> $data
     * @param array<string, mixed>|null $existing
     * @return array<string, mixed>
     */
    private function validateAndNormalizePayload(array $data, ?array $existing = null): array
    {
        $title = isset($data['title']) ? trim((string) $data['title']) : ($existing['title'] ?? '');
        if ($title === '') {
            throw new InvalidArgumentException('Il titolo dell\'offerta è obbligatorio.');
        }

        $description = array_key_exists('description', $data)
            ? ($data['description'] !== null ? trim((string) $data['description']) : null)
            : ($existing['description'] ?? null);

        // 1. Tipo e Valore dello Sconto
        $discountType = $data['discount_type'] ?? ($existing['discount_type'] ?? null);
        if ($discountType === 'fixed_amount') {
            $discountType = 'fixed';
        }
        if ($discountType === null && isset($data['offer_type'])) {
            $discountType = $data['offer_type'] === 'discount' ? 'fixed' : 'percentage';
        }
        $discountType = $discountType ?? 'percentage';

        if (!in_array($discountType, ['percentage', 'fixed'], true)) {
            throw new InvalidArgumentException("Tipo sconto non valido: '{$discountType}'. Valori ammessi: 'percentage', 'fixed'.");
        }

        $rawVal = $data['discount_value'] ?? $data['discount_percentage'] ?? ($existing['discount_value'] ?? null);
        if ($rawVal === null || !is_numeric($rawVal)) {
            throw new InvalidArgumentException('Il valore dello sconto è obbligatorio e deve essere un numero valido.');
        }
        $discountValue = (float) $rawVal;

        if ($discountType === 'percentage') {
            if ($discountValue <= 0.0 || $discountValue > 100.0) {
                throw new InvalidArgumentException('La percentuale di sconto deve essere compresa tra 0.01% e 100%.');
            }
        } else {
            if ($discountValue <= 0.0) {
                throw new InvalidArgumentException('L\'importo fisso di sconto deve essere maggiore di zero.');
            }
        }
        $discountValue = round($discountValue, 2);

        // 2. Segmentazione Destinatari (target_audience)
        // Ammessi: 'vantaggi', 'vip', 'vantaggi_vip' ('all' è accettato come alias per retrocompatibilità)
        $targetAudience = $data['target_audience'] ?? null;
        if ($targetAudience === 'all') {
            $targetAudience = 'vantaggi_vip';
        }

        $puntiId = $this->getProfileIdByCode('punti');
        $vantaggiId = $this->getProfileIdByCode('vantaggi');
        $vipId = $this->getProfileIdByCode('vip');

        if ($targetAudience === null) {
            // Mappare da campi legacy o existing
            if (array_key_exists('card_profile_id', $data) || array_key_exists('is_vip', $data)) {
                $isVip = !empty($data['is_vip']);
                $cardProfileId = array_key_exists('card_profile_id', $data) && $data['card_profile_id'] !== '' && $data['card_profile_id'] !== null
                    ? (int) $data['card_profile_id']
                    : null;

                if ($puntiId !== null && $cardProfileId === $puntiId) {
                    throw new InvalidArgumentException('Il profilo Punti non supporta la gestione di offerte.');
                }

                // Controllo contraddizioni
                if ($isVip && $vantaggiId !== null && $cardProfileId === $vantaggiId) {
                    throw new InvalidArgumentException('Configurazione destinatari contraddittoria: Offerta VIP non può essere assegnata al profilo Vantaggi.');
                }

                if ($isVip || ($vipId !== null && $cardProfileId === $vipId)) {
                    $targetAudience = 'vip';
                } elseif ($vantaggiId !== null && $cardProfileId === $vantaggiId) {
                    $targetAudience = 'vantaggi';
                } else {
                    $targetAudience = 'vantaggi_vip';
                }
            } elseif ($existing !== null) {
                $targetAudience = $existing['target_audience'] ?? 'vantaggi_vip';
                if ($targetAudience === 'all') {
                    $targetAudience = 'vantaggi_vip';
                }
            } else {
                $targetAudience = 'vantaggi_vip';
            }
        }

        if (!in_array($targetAudience, ['vantaggi', 'vip', 'vantaggi_vip'], true)) {
            throw new InvalidArgumentException("Destinatari dell'offerta non validi: '{$targetAudience}'. Valori ammessi: 'vantaggi', 'vip', 'vantaggi_vip'.");
        }

        // Calcolo card_profile_id, offer_type e required_capability in base alla matrice canonica
        if ($targetAudience === 'vantaggi') {
            $cardProfileId = $vantaggiId;
            $offerType = $discountType === 'fixed' ? 'discount' : 'standard';
            $requiredCap = 'offers';
        } elseif ($targetAudience === 'vip') {
            $cardProfileId = $vipId;
            $offerType = $discountType === 'fixed' ? 'discount' : 'vip_exclusive';
            $requiredCap = $discountType === 'fixed' ? 'discounts' : 'vip_offers';
        } else { // 'vantaggi_vip' (esclude esplicitamente Punti)
            $cardProfileId = null;
            $offerType = $discountType === 'fixed' ? 'discount' : 'standard';
            $requiredCap = 'offers';
        }

        $isSingleUse = array_key_exists('is_single_use', $data)
            ? (bool) $data['is_single_use']
            : (bool) ($existing['is_single_use'] ?? true);

        $status = isset($data['status']) && in_array($data['status'], ['active', 'inactive', 'expired'], true)
            ? (string) $data['status']
            : ($existing['status'] ?? 'active');

        $startDate = array_key_exists('start_date', $data)
            ? ($data['start_date'] ?: null)
            : ($existing['start_date'] ?? null);

        $endDate = array_key_exists('end_date', $data)
            ? ($data['end_date'] ?: null)
            : ($existing['end_date'] ?? null);

        return [
            'title' => $title,
            'description' => $description,
            'offer_type' => $offerType,
            'required_capability' => $requiredCap,
            'card_profile_id' => $cardProfileId,
            'is_single_use' => $isSingleUse ? 1 : 0,
            'discount_percentage' => $discountValue,
            'status' => $status,
            'start_date' => $startDate,
            'end_date' => $endDate,
            'target_audience' => $targetAudience,
            'discount_type' => $discountType,
            'discount_value' => $discountValue,
        ];
    }

    /**
     * Crea un'offerta per il commercio.
     *
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    public function createOffer(int $businessId, array $data): array
    {
        $normalized = $this->validateAndNormalizePayload($data);

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
            'title' => $normalized['title'],
            'description' => $normalized['description'],
            'offer_type' => $normalized['offer_type'],
            'required_capability' => $normalized['required_capability'],
            'card_profile_id' => $normalized['card_profile_id'],
            'is_single_use' => $normalized['is_single_use'],
            'discount_percentage' => $normalized['discount_percentage'],
            'status' => $normalized['status'],
            'start_date' => $normalized['start_date'],
            'end_date' => $normalized['end_date'],
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
            throw new InvalidArgumentException('Offerta non trovata in questo commercio.');
        }

        $normalized = $this->validateAndNormalizePayload($data, $existing);

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
            'title' => $normalized['title'],
            'description' => $normalized['description'],
            'offer_type' => $normalized['offer_type'],
            'required_capability' => $normalized['required_capability'],
            'card_profile_id' => $normalized['card_profile_id'],
            'is_single_use' => $normalized['is_single_use'],
            'discount_percentage' => $normalized['discount_percentage'],
            'status' => $normalized['status'],
            'start_date' => $normalized['start_date'],
            'end_date' => $normalized['end_date'],
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
        ?string $capability = null,
        ?string $targetAudience = null
    ): array {
        $puntiId = $this->getProfileIdByCode('punti');
        $vantaggiId = $this->getProfileIdByCode('vantaggi');
        $vipId = $this->getProfileIdByCode('vip');

        // Regola: Il profilo Punti non possiede la capacità di offerte
        if ($puntiId !== null && $cardProfileId === $puntiId) {
            return [];
        }

        $where = ['o.`business_id` = :business_id'];
        $params = ['business_id' => $businessId];

        if ($onlyActive) {
            $where[] = "o.`status` = 'active'";
            $where[] = "(o.`start_date` IS NULL OR o.`start_date` <= UTC_TIMESTAMP())";
            $where[] = "(o.`end_date` IS NULL OR o.`end_date` >= UTC_TIMESTAMP())";
        }

        if ($targetAudience !== null) {
            if ($targetAudience === 'vantaggi') {
                $where[] = "o.`card_profile_id` = :aud_vantaggi_id";
                $params['aud_vantaggi_id'] = $vantaggiId;
            } elseif ($targetAudience === 'vip') {
                $where[] = "(o.`card_profile_id` = :aud_vip_id OR o.`offer_type` = 'vip_exclusive')";
                $params['aud_vip_id'] = $vipId;
            } elseif ($targetAudience === 'vantaggi_vip') {
                $where[] = "(o.`card_profile_id` IS NULL AND o.`offer_type` != 'vip_exclusive')";
            }
        }

        if ($cardProfileId !== null) {
            if ($vantaggiId !== null && $cardProfileId === $vantaggiId) {
                // Vantaggi: vede offerte assegnate a Vantaggi o a Vantaggi+VIP (card_profile_id IS NULL e non VIP esclusivo)
                $where[] = "(o.`card_profile_id` = :vantaggi_id OR (o.`card_profile_id` IS NULL AND o.`offer_type` != 'vip_exclusive'))";
                $params['vantaggi_id'] = $vantaggiId;
            } elseif ($vipId !== null && $cardProfileId === $vipId) {
                // VIP: vede offerte assegnate a VIP o a Vantaggi+VIP (card_profile_id IS NULL)
                $where[] = "(o.`card_profile_id` = :vip_id OR o.`offer_type` = 'vip_exclusive' OR o.`card_profile_id` IS NULL)";
                $params['vip_id'] = $vipId;
            } else {
                return [];
            }
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

        // 2. Validare capacità del profilo (es. 'offers' o 'vip_offers' o 'discounts')
        $requiredCap = $offer['required_capability'] ?? 'offers';
        $account = $this->capabilityService->assertAccountCapability($businessId, $loyaltyAccountId, $requiredCap);

        $accProfileId = (int) ($account['card_profile_id'] ?? 0);
        $puntiId = $this->getProfileIdByCode('punti');
        $vantaggiId = $this->getProfileIdByCode('vantaggi');
        $vipId = $this->getProfileIdByCode('vip');

        if ($puntiId !== null && $accProfileId === $puntiId) {
            throw new InvalidArgumentException('Il profilo Punti non supporta la gestione di offerte.');
        }

        // Validar corrispondenza del profilo / destinatari
        if ($offer['target_audience'] === 'vip' && $vipId !== null && $accProfileId !== $vipId) {
            throw new InvalidArgumentException('Questa offerta è riservata ai clienti VIP.');
        }
        if ($offer['target_audience'] === 'vantaggi' && $vantaggiId !== null && $accProfileId !== $vantaggiId) {
            throw new InvalidArgumentException('Questa offerta è riservata al profilo Vantaggi.');
        }
        if ($offer['card_profile_id'] !== null && (int) $offer['card_profile_id'] !== $accProfileId) {
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
        $discountType = ($row['offer_type'] === 'discount' || ($row['required_capability'] ?? '') === 'discounts')
            ? 'fixed'
            : 'percentage';
        $discountValue = $row['discount_percentage'] !== null ? (float) $row['discount_percentage'] : 0.0;
        $formattedBenefit = self::formatBenefit($discountType, $discountValue);

        $cardProfileId = $row['card_profile_id'] !== null ? (int) $row['card_profile_id'] : null;
        $vantaggiId = $this->getProfileIdByCode('vantaggi');
        $vipId = $this->getProfileIdByCode('vip');

        $isVip = (($vipId !== null && $cardProfileId === $vipId) || $row['offer_type'] === 'vip_exclusive');

        $targetAudience = ($vantaggiId !== null && $cardProfileId === $vantaggiId)
            ? 'vantaggi'
            : ($isVip ? 'vip' : 'vantaggi_vip');

        return [
            'id' => (int) $row['id'],
            'business_id' => (int) $row['business_id'],
            'title' => (string) $row['title'],
            'description' => $row['description'] ? (string) $row['description'] : null,
            'offer_type' => (string) $row['offer_type'],
            'required_capability' => (string) $row['required_capability'],
            'card_profile_id' => $cardProfileId,
            'profile_name' => $row['profile_name'] ?? null,
            'profile_code' => $row['profile_code'] ?? null,
            'target_audience' => $targetAudience,
            'is_vip' => $isVip,
            'discount_type' => $discountType,
            'discount_value' => $discountValue,
            'formatted_benefit' => $formattedBenefit,
            'is_single_use' => (bool) $row['is_single_use'],
            'discount_percentage' => $discountValue,
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
