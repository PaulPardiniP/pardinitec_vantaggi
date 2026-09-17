<?php

declare(strict_types=1);

namespace App\Modules\AccessCredentials;

use App\Core\Database\Connection;
use InvalidArgumentException;
use PDO;

final class CredentialService
{
    private PDO $pdo;

    public function __construct(?PDO $pdo = null)
    {
        $this->pdo = $pdo ?? Connection::get();
    }

    /**
     * Emite una credencial digital generando un token criptográficamente seguro de 32 bytes (64 hex).
     * En MariaDB se almacena ÚNICAMENTE el hash SHA-256. El token plano se retorna por única vez.
     * Regla 8: Cada loyalty_account puede tener como máximo una credencial digital activa.
     *
     * @return array{id: int, business_id: int, loyalty_account_id: int, type: string, status: string, issued_at: string, token: string}
     */
    public function issueDigitalCredential(int $businessId, int $loyaltyAccountId): array
    {
        // Regla 8: Validar que no exista ya una credencial digital activa para esta cuenta
        $activeStmt = $this->pdo->prepare("
            SELECT `id` FROM `access_credentials`
            WHERE `loyalty_account_id` = :account_id
              AND `type` = 'digital'
              AND `status` = 'active'
            LIMIT 1
        ");
        $activeStmt->execute(['account_id' => $loyaltyAccountId]);
        if ($activeStmt->fetch()) {
            throw new InvalidArgumentException('La cuenta de fidelización ya posee una credencial digital activa. Para sustituirla debe utilizar la rotación de credenciales.');
        }

        // Generar 32 bytes de entropía criptográfica (64 caracteres hexadecimales)
        $rawToken = bin2hex(random_bytes(32));
        $tokenHash = hash('sha256', $rawToken);

        $stmt = $this->pdo->prepare("
            INSERT INTO `access_credentials` (
                `business_id`,
                `loyalty_account_id`,
                `card_id`,
                `type`,
                `public_token_hash`,
                `status`,
                `issued_at`,
                `created_at`,
                `updated_at`
            ) VALUES (
                :business_id,
                :loyalty_account_id,
                NULL,
                'digital',
                :token_hash,
                'active',
                UTC_TIMESTAMP(),
                UTC_TIMESTAMP(),
                UTC_TIMESTAMP()
            )
        ");

        $stmt->execute([
            'business_id' => $businessId,
            'loyalty_account_id' => $loyaltyAccountId,
            'token_hash' => $tokenHash,
        ]);

        $credentialId = (int) $this->pdo->lastInsertId();

        return [
            'id' => $credentialId,
            'business_id' => $businessId,
            'loyalty_account_id' => $loyaltyAccountId,
            'type' => 'digital',
            'status' => 'active',
            'issued_at' => gmdate('Y-m-d H:i:s'),
            'token' => $rawToken,
        ];
    }

    /**
     * Busca una credencial a partir de su token en texto plano computando su hash SHA-256.
     *
     * @return array<string, mixed>|null
     */
    public function findByRawToken(string $rawToken): ?array
    {
        $tokenHash = hash('sha256', trim($rawToken));

        $stmt = $this->pdo->prepare("
            SELECT * FROM `access_credentials`
            WHERE `public_token_hash` = :token_hash
            LIMIT 1
        ");
        $stmt->execute(['token_hash' => $tokenHash]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        return $row ?: null;
    }

    /**
     * Emite una credencial física generando un token criptográficamente seguro de 32 bytes (64 hex).
     * En MariaDB se almacena ÚNICAMENTE el hash SHA-256. El token plano se retorna por única vez.
     * Regla: Máximo 1 credencial física activa por tarjeta.
     *
     * @return array{id: int, business_id: ?int, loyalty_account_id: ?int, card_id: int, type: string, status: string, issued_at: string, token: string}
     */
    public function issuePhysicalCredential(?int $businessId, int $cardId, ?int $loyaltyAccountId = null): array
    {
        $startedTransaction = false;
        if (!$this->pdo->inTransaction()) {
            $this->pdo->beginTransaction();
            $startedTransaction = true;
        }

        try {
            // Bloquear primero la fila de cards correspondiente mediante SELECT ... FOR UPDATE
            $lockStmt = $this->pdo->prepare("SELECT `id` FROM `cards` WHERE `id` = :card_id FOR UPDATE");
            $lockStmt->execute(['card_id' => $cardId]);
            if (!$lockStmt->fetch()) {
                throw new InvalidArgumentException("Tarjeta ID {$cardId} no encontrada.");
            }

            // 1. Comprobar credencial activa
            $activeStmt = $this->pdo->prepare("
                SELECT `id` FROM `access_credentials`
                WHERE `card_id` = :card_id
                  AND `type` = 'physical'
                  AND `status` = 'active'
                LIMIT 1
            ");
            $activeStmt->execute(['card_id' => $cardId]);
            if ($activeStmt->fetch()) {
                throw new InvalidArgumentException('La tarjeta física ya posee una credencial activa. Para sustituirla debe utilizar rotación o reemplazo.');
            }

            $rawToken = bin2hex(random_bytes(32));
            $tokenHash = hash('sha256', $rawToken);

            // 2. Insertar la nueva credencial física
            $stmt = $this->pdo->prepare("
                INSERT INTO `access_credentials` (
                    `business_id`,
                    `loyalty_account_id`,
                    `card_id`,
                    `type`,
                    `public_token_hash`,
                    `status`,
                    `issued_at`,
                    `created_at`,
                    `updated_at`
                ) VALUES (
                    :business_id,
                    :loyalty_account_id,
                    :card_id,
                    'physical',
                    :token_hash,
                    'active',
                    UTC_TIMESTAMP(),
                    UTC_TIMESTAMP(),
                    UTC_TIMESTAMP()
                )
            ");

            $stmt->execute([
                'business_id' => $businessId,
                'loyalty_account_id' => $loyaltyAccountId,
                'card_id' => $cardId,
                'token_hash' => $tokenHash,
            ]);

            $credentialId = (int) $this->pdo->lastInsertId();

            if ($startedTransaction && $this->pdo->inTransaction()) {
                $this->pdo->commit();
            }

            return [
                'id' => $credentialId,
                'business_id' => $businessId,
                'loyalty_account_id' => $loyaltyAccountId,
                'card_id' => $cardId,
                'type' => 'physical',
                'status' => 'active',
                'issued_at' => gmdate('Y-m-d H:i:s'),
                'token' => $rawToken,
            ];
        } catch (\Throwable $e) {
            if ($startedTransaction && $this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e;
        }
    }

    /**
     * Obtiene la credencial física activa asociada a una tarjeta.
     */
    public function getPhysicalCredentialForCard(int $cardId): ?array
    {
        $stmt = $this->pdo->prepare("
            SELECT `id`, `business_id`, `loyalty_account_id`, `card_id`, `type`, `status`, `issued_at`, `revoked_at`, `replaced_by_credential_id`
            FROM `access_credentials`
            WHERE `card_id` = :card_id AND `type` = 'physical' AND `status` = 'active'
            LIMIT 1
        ");
        $stmt->execute(['card_id' => $cardId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        return $row ?: null;
    }

    /**
     * Revoca la credencial física de una tarjeta (sin afectar credenciales digitales).
     */
    public function revokePhysicalCredentialForCard(int $cardId): bool
    {
        $stmt = $this->pdo->prepare("
            UPDATE `access_credentials`
            SET `status` = 'revoked',
                `revoked_at` = UTC_TIMESTAMP(),
                `updated_at` = UTC_TIMESTAMP()
            WHERE `card_id` = :card_id
              AND `type` = 'physical'
              AND `status` = 'active'
        ");
        $stmt->execute(['card_id' => $cardId]);

        return $stmt->rowCount() > 0;
    }

    /**
     * Suspende la credencial física de una tarjeta.
     */
    public function suspendPhysicalCredentialForCard(int $cardId): bool
    {
        $stmt = $this->pdo->prepare("
            UPDATE `access_credentials`
            SET `status` = 'suspended',
                `updated_at` = UTC_TIMESTAMP()
            WHERE `card_id` = :card_id
              AND `type` = 'physical'
              AND `status` = 'active'
        ");
        $stmt->execute(['card_id' => $cardId]);

        return $stmt->rowCount() > 0;
    }

    /**
     * Reactiva la credencial física de una tarjeta suspendida.
     */
    public function reactivatePhysicalCredentialForCard(int $cardId): bool
    {
        $stmt = $this->pdo->prepare("
            UPDATE `access_credentials`
            SET `status` = 'active',
                `updated_at` = UTC_TIMESTAMP()
            WHERE `card_id` = :card_id
              AND `type` = 'physical'
              AND `status` = 'suspended'
        ");
        $stmt->execute(['card_id' => $cardId]);

        return $stmt->rowCount() > 0;
    }

    /**
     * Actualiza los vínculos de negocio y cuenta de fidelización de la credencial física activa.
     */
    public function updatePhysicalCredentialLinks(int $cardId, ?int $businessId, ?int $loyaltyAccountId): void
    {
        $stmt = $this->pdo->prepare("
            UPDATE `access_credentials`
            SET `business_id` = :business_id,
                `loyalty_account_id` = :loyalty_account_id,
                `updated_at` = UTC_TIMESTAMP()
            WHERE `card_id` = :card_id
              AND `type` = 'physical'
              AND `status` = 'active'
        ");
        $stmt->execute([
            'business_id' => $businessId,
            'loyalty_account_id' => $loyaltyAccountId,
            'card_id' => $cardId,
        ]);
    }

    /**
     * Rota la credencial física de una tarjeta: marca la anterior como 'replaced' y emite una nueva.
     */
    public function rotatePhysicalCredentialForCard(int $cardId, ?int $businessId = null, ?int $loyaltyAccountId = null): array
    {
        $startedTransaction = false;
        if (!$this->pdo->inTransaction()) {
            $this->pdo->beginTransaction();
            $startedTransaction = true;
        }

        try {
            // Bloquear primero la fila de cards correspondiente mediante SELECT ... FOR UPDATE
            $lockStmt = $this->pdo->prepare("SELECT `id` FROM `cards` WHERE `id` = :card_id FOR UPDATE");
            $lockStmt->execute(['card_id' => $cardId]);
            if (!$lockStmt->fetch()) {
                throw new InvalidArgumentException("Tarjeta ID {$cardId} no encontrada.");
            }

            // 1. Comprobar credencial activa
            $old = $this->getPhysicalCredentialForCard($cardId);
            if (!$old) {
                throw new InvalidArgumentException('No existe credencial física activa para esta tarjeta.');
            }

            // 2. Revocar/reemplazar la anterior
            $updateStmt = $this->pdo->prepare("
                UPDATE `access_credentials`
                SET `status` = 'replaced',
                    `revoked_at` = UTC_TIMESTAMP(),
                    `updated_at` = UTC_TIMESTAMP()
                WHERE `id` = :old_id
            ");
            $updateStmt->execute(['old_id' => $old['id']]);

            // 3. Insertar la nueva
            $bizId = $businessId ?? ($old['business_id'] !== null ? (int) $old['business_id'] : null);
            $accId = $loyaltyAccountId ?? ($old['loyalty_account_id'] !== null ? (int) $old['loyalty_account_id'] : null);

            $newCredential = $this->issuePhysicalCredential($bizId, $cardId, $accId);

            $linkStmt = $this->pdo->prepare("
                UPDATE `access_credentials`
                SET `replaced_by_credential_id` = :new_id
                WHERE `id` = :old_id
            ");
            $linkStmt->execute([
                'new_id' => $newCredential['id'],
                'old_id' => $old['id'],
            ]);

            // 4. Confirmar la transacción
            if ($startedTransaction && $this->pdo->inTransaction()) {
                $this->pdo->commit();
            }

            return $newCredential;
        } catch (\Throwable $e) {
            if ($startedTransaction && $this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e;
        }
    }

    /**
     * Resuelve la vista segura de una credencial para la interfaz /c/<token>.
     * Adapta la respuesta al tipo de credencial, estado y rol del observador autenticado.
     *
     * @return array<string, mixed>|null
     */
    public function getPublicCredentialView(string $rawToken, ?array $authenticatedViewer = null): ?array
    {
        $tokenHash = hash('sha256', trim($rawToken));

        $stmt = $this->pdo->prepare("
            SELECT ac.`id` AS `credential_id`, ac.`type` AS `credential_type`, ac.`status` AS `credential_status`,
                   ac.`card_id`, ac.`issued_at`,
                   c.`status` AS `card_status`, c.`design_profile_id`, c.`business_id` AS `card_business_id`,
                   la.`id` AS `loyalty_account_id`, la.`balance`, la.`status` AS `account_status`,
                   la.`customer_id`,
                   cust.`first_name` AS `customer_first_name`, cust.`last_name` AS `customer_last_name`,
                   cust.`phone` AS `customer_phone`, cust.`email` AS `customer_email`,
                   cp.`code` AS `profile_code`, cp.`name` AS `profile_name`,
                   b.`id` AS `business_id`, b.`name` AS `business_name`, b.`slug` AS `business_slug`
            FROM `access_credentials` ac
            LEFT JOIN `cards` c ON ac.`card_id` = c.`id`
            LEFT JOIN `loyalty_accounts` la ON ac.`loyalty_account_id` = la.`id`
            LEFT JOIN `customers` cust ON la.`customer_id` = cust.`id`
            LEFT JOIN `card_profiles` cp ON la.`card_profile_id` = cp.`id`
            LEFT JOIN `businesses` b ON (ac.`business_id` = b.`id` OR c.`business_id` = b.`id`)
            WHERE ac.`public_token_hash` = :token_hash
            LIMIT 1
        ");
        $stmt->execute(['token_hash' => $tokenHash]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$row) {
            return null;
        }

        $credStatus = (string) $row['credential_status'];
        $credType = (string) $row['credential_type'];
        $cardStatus = $row['card_status'] !== null ? (string) $row['card_status'] : null;

        // 1. Estados no disponibles (revoked o replaced)
        if ($credStatus === 'revoked' || $credStatus === 'replaced' || in_array($cardStatus, ['revoked', 'replaced'], true)) {
            return [
                'state' => 'not_available',
                'message' => 'Carta non disponibile.',
                'credential_type' => $credType,
            ];
        }

        // 2. Estado suspendido (temporalmente bloqueada)
        if ($credStatus === 'suspended' || $cardStatus === 'suspended' || (string) ($row['account_status'] ?? '') === 'suspended') {
            return [
                'state' => 'suspended',
                'message' => 'Carta temporaneamente sospesa.',
                'credential_type' => $credType,
            ];
        }

        // 3. Tarjeta física en INVENTORY
        if ($credType === 'physical' && $cardStatus === 'inventory') {
            if ($authenticatedViewer !== null && !empty($authenticatedViewer['is_super_admin'])) {
                return [
                    'state' => 'inventory',
                    'mode' => 'super_admin',
                    'card_id' => (int) $row['card_id'],
                    'message' => 'Carta in inventario. Assegnabile a un commercio.',
                ];
            }
            return [
                'state' => 'inventory',
                'mode' => 'anonymous',
                'message' => 'Carta non attivata.',
            ];
        }

        // 4. Tarjeta física en ISSUED (asignada a comercio, pendiente de vincular a cliente)
        if ($credType === 'physical' && $cardStatus === 'issued') {
            $cardBizId = (int) ($row['business_id'] ?? $row['card_business_id']);

            if ($authenticatedViewer !== null) {
                $viewerBizId = (int) ($authenticatedViewer['business_id'] ?? 0);
                $isSuperAdmin = !empty($authenticatedViewer['is_super_admin']);

                if ($isSuperAdmin || ($viewerBizId === $cardBizId && $cardBizId > 0)) {
                    return [
                        'state' => 'issued',
                        'mode' => 'staff',
                        'can_activate' => true,
                        'card_id' => (int) $row['card_id'],
                        'business_id' => $cardBizId,
                        'business_name' => (string) ($row['business_name'] ?? ''),
                        'message' => 'Carta assegnata al commercio. Pronta per attivazione in negozio.',
                    ];
                }

                // Usuario de otro comercio
                return [
                    'state' => 'forbidden',
                    'mode' => 'cross_tenant',
                    'message' => 'Accesso negato.',
                ];
            }

            // Anónimo: Regla 8B - No permitir autoregistro, mensaje para dirigirse al personal
            return [
                'state' => 'issued',
                'mode' => 'anonymous',
                'message' => 'Carta non ancora attivata. Rivolgersi al personale del punto vendita.',
            ];
        }

        // 5. Credencial y tarjeta ACTIVAS
        $bizId = (int) ($row['business_id'] ?? 0);

        // Comprobación de observador autenticado
        if ($authenticatedViewer !== null) {
            $viewerBizId = (int) ($authenticatedViewer['business_id'] ?? 0);
            $isSuperAdmin = !empty($authenticatedViewer['is_super_admin']);

            if ($isSuperAdmin || ($viewerBizId === $bizId && $bizId > 0)) {
                // Personal del mismo comercio -> Ficha operativa completa
                return [
                    'state' => 'active',
                    'mode' => 'staff',
                    'credential_id' => (int) $row['credential_id'],
                    'credential_type' => $credType,
                    'business' => [
                        'id' => $bizId,
                        'name' => (string) $row['business_name'],
                        'slug' => (string) $row['business_slug'],
                    ],
                    'customer' => [
                        'id' => (int) $row['customer_id'],
                        'first_name' => (string) $row['customer_first_name'],
                        'last_name' => (string) $row['customer_last_name'],
                        'phone' => $row['customer_phone'] ? (string) $row['customer_phone'] : null,
                        'email' => $row['customer_email'] ? (string) $row['customer_email'] : null,
                    ],
                    'loyalty_account' => [
                        'id' => (int) $row['loyalty_account_id'],
                        'profile_code' => (string) $row['profile_code'],
                        'profile_name' => (string) $row['profile_name'],
                        'balance' => (int) $row['balance'],
                        'status' => (string) $row['account_status'],
                    ],
                ];
            }

            // Usuario autenticado de otro negocio -> Denegar datos del cliente
            return [
                'state' => 'forbidden',
                'mode' => 'cross_tenant',
                'message' => 'Accesso negato.',
            ];
        }

        // Observador anónimo -> Vista pública mínima (Reglas 5, 6, 7 y 10: Cero PII, solo perfil y balance)
        return [
            'state' => 'active',
            'mode' => 'public',
            'credential_id' => (int) $row['credential_id'],
            'credential_type' => $credType,
            'business' => [
                'id' => $bizId,
                'name' => (string) $row['business_name'],
                'slug' => (string) $row['business_slug'],
            ],
            'loyalty_account' => [
                'profile_code' => (string) $row['profile_code'],
                'profile_name' => (string) $row['profile_name'],
                'balance' => (int) $row['balance'],
            ],
        ];
    }

    /**
     * Revoca una credencial activa.
     */
    public function revokeCredential(int $businessId, int $credentialId): bool
    {
        $stmt = $this->pdo->prepare("
            UPDATE `access_credentials`
            SET `status` = 'revoked',
                `revoked_at` = UTC_TIMESTAMP(),
                `updated_at` = UTC_TIMESTAMP()
            WHERE `id` = :id
              AND `business_id` = :business_id
              AND `status` = 'active'
        ");
        $stmt->execute([
            'id' => $credentialId,
            'business_id' => $businessId,
        ]);

        return $stmt->rowCount() > 0;
    }

    /**
     * Rota una credencial: marca la anterior como 'replaced' y emite una nueva vinculada a la misma cuenta.
     * Retorna la nueva credencial con su nuevo token en claro por única vez.
     * Garantiza que la cuenta conserve en todo momento como máximo 1 credencial digital activa.
     *
     * @return array{id: int, business_id: int, loyalty_account_id: int, type: string, status: string, issued_at: string, token: string}
     */
    public function rotateCredential(int $businessId, int $credentialId): array
    {
        $stmt = $this->pdo->prepare("
            SELECT `id`, `business_id`, `loyalty_account_id`, `type`, `status`
            FROM `access_credentials`
            WHERE `id` = :id AND `business_id` = :business_id
            LIMIT 1
        ");
        $stmt->execute([
            'id' => $credentialId,
            'business_id' => $businessId,
        ]);
        $old = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$old) {
            throw new InvalidArgumentException('Credencial no encontrada.');
        }

        if ($old['status'] !== 'active') {
            throw new InvalidArgumentException('Solo se pueden rotar credenciales en estado activo.');
        }

        $loyaltyAccountId = (int) $old['loyalty_account_id'];

        $this->pdo->beginTransaction();

        try {
            // Desactivar credencial anterior como replaced
            $updateStmt = $this->pdo->prepare("
                UPDATE `access_credentials`
                SET `status` = 'replaced',
                    `revoked_at` = UTC_TIMESTAMP(),
                    `updated_at` = UTC_TIMESTAMP()
                WHERE `id` = :old_id
            ");
            $updateStmt->execute(['old_id' => $credentialId]);

            // Emisión de nueva credencial digital (cumple Regla 8)
            $newCredential = $this->issueDigitalCredential($businessId, $loyaltyAccountId);

            // Enlazar credencial anterior con la nueva
            $linkStmt = $this->pdo->prepare("
                UPDATE `access_credentials`
                SET `replaced_by_credential_id` = :new_id
                WHERE `id` = :old_id
            ");
            $linkStmt->execute([
                'new_id' => $newCredential['id'],
                'old_id' => $credentialId,
            ]);

            $this->pdo->commit();

            return $newCredential;
        } catch (\Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e;
        }
    }

    /**
     * Lista las credenciales asociadas a una cuenta de fidelización.
     * Nunca expone hashes de tokens completos.
     *
     * @return array<int, array{id: int, type: string, status: string, issued_at: string, revoked_at: ?string, replaced_by_credential_id: ?int}>
     */
    public function getCredentialsByAccount(int $businessId, int $loyaltyAccountId): array
    {
        $stmt = $this->pdo->prepare("
            SELECT `id`, `type`, `status`, `issued_at`, `revoked_at`, `replaced_by_credential_id`, `created_at`
            FROM `access_credentials`
            WHERE `business_id` = :business_id
              AND `loyalty_account_id` = :account_id
            ORDER BY `id` DESC
        ");
        $stmt->execute([
            'business_id' => $businessId,
            'account_id' => $loyaltyAccountId,
        ]);

        return array_map(static function (array $row): array {
            return [
                'id' => (int) $row['id'],
                'type' => (string) $row['type'],
                'status' => (string) $row['status'],
                'issued_at' => (string) $row['issued_at'],
                'revoked_at' => $row['revoked_at'] ? (string) $row['revoked_at'] : null,
                'replaced_by_credential_id' => $row['replaced_by_credential_id'] !== null ? (int) $row['replaced_by_credential_id'] : null,
            ];
        }, $stmt->fetchAll(PDO::FETCH_ASSOC));
    }
}
