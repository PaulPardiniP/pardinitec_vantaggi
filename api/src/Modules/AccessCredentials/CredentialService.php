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
     * Resuelve la vista pública de una credencial para la interfaz /c/<token>.
     * Conforme a las Reglas 5, 6 y 7: expone ÚNICAMENTE los datos y perfil de la loyalty_account vinculada.
     * Una credencial VIP solo expone VIP; una credencial Punti solo expone puntos.
     *
     * @return array<string, mixed>|null
     */
    public function getPublicCredentialView(string $rawToken): ?array
    {
        $tokenHash = hash('sha256', trim($rawToken));

        $stmt = $this->pdo->prepare("
            SELECT ac.`id` AS `credential_id`, ac.`type` AS `credential_type`, ac.`status` AS `credential_status`,
                   ac.`issued_at`,
                   la.`id` AS `loyalty_account_id`, la.`balance`, la.`status` AS `account_status`,
                   cp.`code` AS `profile_code`, cp.`name` AS `profile_name`,
                   b.`id` AS `business_id`, b.`name` AS `business_name`, b.`slug` AS `business_slug`
            FROM `access_credentials` ac
            INNER JOIN `loyalty_accounts` la ON ac.`loyalty_account_id` = la.`id`
            INNER JOIN `card_profiles` cp ON la.`card_profile_id` = cp.`id`
            INNER JOIN `businesses` b ON ac.`business_id` = b.`id`
            WHERE ac.`public_token_hash` = :token_hash
            LIMIT 1
        ");
        $stmt->execute(['token_hash' => $tokenHash]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$row) {
            return null;
        }

        return [
            'credential_id' => (int) $row['credential_id'],
            'credential_type' => (string) $row['credential_type'],
            'credential_status' => (string) $row['credential_status'],
            'issued_at' => (string) $row['issued_at'],
            'business' => [
                'id' => (int) $row['business_id'],
                'name' => (string) $row['business_name'],
                'slug' => (string) $row['business_slug'],
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
