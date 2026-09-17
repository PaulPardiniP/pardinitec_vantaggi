<?php

declare(strict_types=1);

namespace App\Modules\Customers;

use App\Core\Auth\ValidationException;
use App\Core\Database\Connection;
use App\Modules\AccessCredentials\CredentialService;
use App\Modules\Loyalty\LoyaltyService;
use InvalidArgumentException;
use PDO;
use Throwable;

final class CustomerService
{
    private PDO $pdo;
    private LoyaltyService $loyaltyService;
    private CredentialService $credentialService;

    public function __construct(
        ?PDO $pdo = null,
        ?LoyaltyService $loyaltyService = null,
        ?CredentialService $credentialService = null
    ) {
        $this->pdo = $pdo ?? Connection::get();
        $this->loyaltyService = $loyaltyService ?? new LoyaltyService($this->pdo);
        $this->credentialService = $credentialService ?? new CredentialService($this->pdo);
    }

    /**
     * Valida y normaliza datos básicos del cliente.
     */
    private function validateCustomerInput(array $data): array
    {
        $firstName = trim((string) ($data['first_name'] ?? ''));
        $lastName = trim((string) ($data['last_name'] ?? ''));
        $phone = isset($data['phone']) && trim((string) $data['phone']) !== '' ? trim((string) $data['phone']) : null;
        $email = isset($data['email']) && trim((string) $data['email']) !== '' ? trim((string) $data['email']) : null;

        $errors = [];

        if ($firstName === '') {
            $errors['first_name'] = ['El nombre es obligatorio.'];
        } elseif (mb_strlen($firstName) > 100) {
            $errors['first_name'] = ['El nombre no puede exceder los 100 caracteres.'];
        }

        if ($lastName === '') {
            $errors['last_name'] = ['El apellido es obligatorio.'];
        } elseif (mb_strlen($lastName) > 100) {
            $errors['last_name'] = ['El apellido no puede exceder los 100 caracteres.'];
        }

        if ($email !== null) {
            if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
                $errors['email'] = ['El correo electrónico no es válido.'];
            } elseif (mb_strlen($email) > 150) {
                $errors['email'] = ['El correo electrónico no puede exceder los 150 caracteres.'];
            }
        }

        if ($phone !== null && mb_strlen($phone) > 50) {
            $errors['phone'] = ['El teléfono no puede exceder los 50 caracteres.'];
        }

        if (!empty($errors)) {
            throw new ValidationException('Datos del cliente inválidos.', $errors);
        }

        return [
            'first_name' => $firstName,
            'last_name' => $lastName,
            'phone' => $phone,
            'email' => $email,
        ];
    }

    /**
     * Registra un cliente de forma aislada (exige consentimiento de privacidad obligatorio).
     *
     * @return array<string, mixed>
     */
    public function createCustomer(int $businessId, array $data): array
    {
        // 1. Validar consentimiento de privacidad obligatorio
        $privacyAccepted = filter_var($data['privacy_accepted'] ?? false, FILTER_VALIDATE_BOOLEAN);
        if (!$privacyAccepted) {
            throw new ValidationException('El consentimiento de privacidad es obligatorio para registrar al cliente.', [
                'privacy_accepted' => ['Debe aceptar la política de privacidad.'],
            ]);
        }

        // 2. Validar campos
        $input = $this->validateCustomerInput($data);

        $stmt = $this->pdo->prepare("
            INSERT INTO `customers` (
                `business_id`,
                `first_name`,
                `last_name`,
                `phone`,
                `email`,
                `created_at`,
                `updated_at`
            ) VALUES (
                :business_id,
                :first_name,
                :last_name,
                :phone,
                :email,
                UTC_TIMESTAMP(),
                UTC_TIMESTAMP()
            )
        ");

        $stmt->execute([
            'business_id' => $businessId,
            'first_name' => $input['first_name'],
            'last_name' => $input['last_name'],
            'phone' => $input['phone'],
            'email' => $input['email'],
        ]);

        $customerId = (int) $this->pdo->lastInsertId();

        // 3. Registrar consentimiento obligatorio de privacidad
        $this->recordConsent($businessId, $customerId, 'privacy', 'granted', $data['source'] ?? 'in_store_staff');

        // 4. Si se otorgó marketing opcional, registrarlo
        $marketingAccepted = filter_var($data['marketing_accepted'] ?? false, FILTER_VALIDATE_BOOLEAN);
        if ($marketingAccepted) {
            $this->recordConsent($businessId, $customerId, 'marketing', 'granted', $data['source'] ?? 'in_store_staff');
        }

        return $this->getCustomer($businessId, $customerId);
    }

    /**
     * Flujo Integrado de Onboarding Comercial (Transacción Atómica):
     * 1. Crea el cliente
     * 2. Registra privacidad (obligatoria) y marketing (opcional)
     * 3. Crea la cuenta de fidelización con balance 0 y perfil asignado
     * 4. Emite la credencial digital, guarda SHA-256 en DB y entrega token plano por única vez.
     *
     * @return array{customer: array, consents: array, loyalty_account: array, access_credential: array, token: string, public_url: string}
     */
    public function onboardCustomer(int $businessId, array $data): array
    {
        // 1. Validar consentimiento de privacidad obligatorio antes de abrir transacción
        $privacyAccepted = filter_var($data['privacy_accepted'] ?? false, FILTER_VALIDATE_BOOLEAN);
        if (!$privacyAccepted) {
            throw new ValidationException('El consentimiento de privacidad es obligatorio para registrar al cliente.', [
                'privacy_accepted' => ['Debe aceptar la política de privacidad.'],
            ]);
        }

        // 2. Validar campos del cliente
        $input = $this->validateCustomerInput($data);

        // 3. Resolver perfil de fidelización (por defecto 'punti')
        $profileCode = trim((string) ($data['card_profile_code'] ?? $data['card_profile'] ?? 'punti'));
        $profile = $this->loyaltyService->getProfileByCode($profileCode);
        if (!$profile) {
            throw new InvalidArgumentException("Perfil de fidelización inválido o inactivo: '{$profileCode}'.");
        }

        // 4. Iniciar Transacción PDO Atómica
        $this->pdo->beginTransaction();

        try {
            // A. Insertar cliente
            $stmt = $this->pdo->prepare("
                INSERT INTO `customers` (
                    `business_id`,
                    `first_name`,
                    `last_name`,
                    `phone`,
                    `email`,
                    `created_at`,
                    `updated_at`
                ) VALUES (
                    :business_id,
                    :first_name,
                    :last_name,
                    :phone,
                    :email,
                    UTC_TIMESTAMP(),
                    UTC_TIMESTAMP()
                )
            ");
            $stmt->execute([
                'business_id' => $businessId,
                'first_name' => $input['first_name'],
                'last_name' => $input['last_name'],
                'phone' => $input['phone'],
                'email' => $input['email'],
            ]);
            $customerId = (int) $this->pdo->lastInsertId();

            // B. Registrar consentimiento obligatorio de privacidad
            $source = trim((string) ($data['source'] ?? 'in_store_staff'));
            $this->recordConsent($businessId, $customerId, 'privacy', 'granted', $source);

            // C. Registrar consentimiento opcional de marketing
            $marketingAccepted = filter_var($data['marketing_accepted'] ?? false, FILTER_VALIDATE_BOOLEAN);
            if ($marketingAccepted) {
                $this->recordConsent($businessId, $customerId, 'marketing', 'granted', $source);
            }

            // D. Crear cuenta de fidelización con saldo 0
            $account = $this->loyaltyService->createAccount($businessId, $customerId, $profile['id']);

            // E. Emitir credencial digital (32 bytes aleatorios, guarda SHA-256 en DB)
            $credential = $this->credentialService->issueDigitalCredential($businessId, $account['id']);

            // F. Confirmar transacción
            $this->pdo->commit();

            return [
                'customer' => [
                    'id' => $customerId,
                    'business_id' => $businessId,
                    'first_name' => $input['first_name'],
                    'last_name' => $input['last_name'],
                    'phone' => $input['phone'],
                    'email' => $input['email'],
                    'created_at' => gmdate('Y-m-d H:i:s'),
                ],
                'consents' => [
                    'privacy' => 'granted',
                    'marketing' => $marketingAccepted ? 'granted' : 'not_granted',
                ],
                'loyalty_account' => [
                    'id' => $account['id'],
                    'card_profile_id' => $profile['id'],
                    'profile_code' => $profile['code'],
                    'profile_name' => $profile['name'],
                    'balance' => 0,
                    'status' => 'active',
                ],
                'access_credential' => [
                    'id' => $credential['id'],
                    'type' => 'digital',
                    'status' => 'active',
                    'issued_at' => $credential['issued_at'],
                ],
                'token' => $credential['token'], // Entregado en texto plano POR ÚNICA VEZ
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
     * Obtiene el detalle de un cliente perteneciente al negocio, incluyendo sus cuentas y consentimientos.
     */
    public function getCustomer(int $businessId, int $customerId): array
    {
        $stmt = $this->pdo->prepare("
            SELECT `id`, `business_id`, `first_name`, `last_name`, `phone`, `email`, `created_at`, `updated_at`
            FROM `customers`
            WHERE `id` = :customer_id AND `business_id` = :business_id
            LIMIT 1
        ");
        $stmt->execute([
            'customer_id' => $customerId,
            'business_id' => $businessId,
        ]);
        $customer = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$customer) {
            throw new InvalidArgumentException('Cliente no encontrado en este comercio.');
        }

        $accounts = $this->loyaltyService->getAccountsByCustomer($businessId, $customerId);
        $consents = $this->getConsents($businessId, $customerId);

        return [
            'id' => (int) $customer['id'],
            'business_id' => (int) $customer['business_id'],
            'first_name' => (string) $customer['first_name'],
            'last_name' => (string) $customer['last_name'],
            'phone' => $customer['phone'] !== null ? (string) $customer['phone'] : null,
            'email' => $customer['email'] !== null ? (string) $customer['email'] : null,
            'created_at' => (string) $customer['created_at'],
            'updated_at' => (string) $customer['updated_at'],
            'consents' => $consents,
            'loyalty_accounts' => $accounts,
        ];
    }

    /**
     * Lista clientes con paginación y filtros de búsqueda por comercio.
     *
     * @return array{data: array, pagination: array{page: int, per_page: int, total: int, total_pages: int}}
     */
    public function listCustomers(int $businessId, array $filters = [], int $page = 1, int $perPage = 20): array
    {
        $page = max(1, $page);
        $perPage = max(1, min(100, $perPage));
        $offset = ($page - 1) * $perPage;

        $where = ['`business_id` = :business_id'];
        $params = ['business_id' => $businessId];

        if (!empty($filters['search'])) {
            $search = '%' . trim((string) $filters['search']) . '%';
            $where[] = "(`first_name` LIKE :search_fname OR `last_name` LIKE :search_lname OR `phone` LIKE :search_phone OR `email` LIKE :search_email)";
            $params['search_fname'] = $search;
            $params['search_lname'] = $search;
            $params['search_phone'] = $search;
            $params['search_email'] = $search;
        }

        if (!empty($filters['phone'])) {
            $where[] = "`phone` LIKE :phone";
            $params['phone'] = '%' . trim((string) $filters['phone']) . '%';
        }

        if (!empty($filters['email'])) {
            $where[] = "`email` LIKE :email";
            $params['email'] = '%' . trim((string) $filters['email']) . '%';
        }

        $whereSql = implode(' AND ', $where);

        // Conteo eficiente mediante aggregate COUNT(*)
        $countStmt = $this->pdo->prepare("SELECT COUNT(*) FROM `customers` WHERE {$whereSql}");
        $countStmt->execute($params);
        $total = (int) $countStmt->fetchColumn();

        // Consulta paginada con LIMIT y OFFSET
        $dataStmt = $this->pdo->prepare("
            SELECT `id`, `business_id`, `first_name`, `last_name`, `phone`, `email`, `created_at`
            FROM `customers`
            WHERE {$whereSql}
            ORDER BY `id` DESC
            LIMIT {$perPage} OFFSET {$offset}
        ");
        $dataStmt->execute($params);
        $rows = $dataStmt->fetchAll(PDO::FETCH_ASSOC);

        $items = array_map(static function (array $row): array {
            return [
                'id' => (int) $row['id'],
                'business_id' => (int) $row['business_id'],
                'first_name' => (string) $row['first_name'],
                'last_name' => (string) $row['last_name'],
                'phone' => $row['phone'] !== null ? (string) $row['phone'] : null,
                'email' => $row['email'] !== null ? (string) $row['email'] : null,
                'created_at' => (string) $row['created_at'],
            ];
        }, $rows);

        return [
            'data' => $items,
            'pagination' => [
                'page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'total_pages' => (int) ceil($total / $perPage),
            ],
        ];
    }

    /**
     * Actualiza información de un cliente existente.
     */
    public function updateCustomer(int $businessId, int $customerId, array $data): array
    {
        // Verificar existencia previa en el comercio
        $this->getCustomer($businessId, $customerId);

        $input = $this->validateCustomerInput($data);

        $stmt = $this->pdo->prepare("
            UPDATE `customers`
            SET `first_name` = :first_name,
                `last_name` = :last_name,
                `phone` = :phone,
                `email` = :email,
                `updated_at` = UTC_TIMESTAMP()
            WHERE `id` = :customer_id AND `business_id` = :business_id
        ");

        $stmt->execute([
            'first_name' => $input['first_name'],
            'last_name' => $input['last_name'],
            'phone' => $input['phone'],
            'email' => $input['email'],
            'customer_id' => $customerId,
            'business_id' => $businessId,
        ]);

        return $this->getCustomer($businessId, $customerId);
    }

    /**
     * Registra un consentimiento ('privacy' o 'marketing').
     */
    public function recordConsent(
        int $businessId,
        int $customerId,
        string $type,
        string $status = 'granted',
        string $source = 'in_store_staff',
        string $textVersion = 'v1.0'
    ): array {
        if (!in_array($type, ['privacy', 'marketing'], true)) {
            throw new InvalidArgumentException("Tipo de consentimiento inválido: '{$type}'.");
        }

        if (!in_array($status, ['granted', 'revoked'], true)) {
            throw new InvalidArgumentException("Estado de consentimiento inválido: '{$status}'.");
        }

        $revokedAt = ($status === 'revoked') ? gmdate('Y-m-d H:i:s') : null;

        $stmt = $this->pdo->prepare("
            INSERT INTO `consents` (
                `business_id`,
                `customer_id`,
                `type`,
                `status`,
                `source`,
                `text_version`,
                `granted_at`,
                `revoked_at`,
                `created_at`,
                `updated_at`
            ) VALUES (
                :business_id,
                :customer_id,
                :type,
                :status,
                :source,
                :text_version,
                UTC_TIMESTAMP(),
                :revoked_at,
                UTC_TIMESTAMP(),
                UTC_TIMESTAMP()
            )
        ");

        $stmt->execute([
            'business_id' => $businessId,
            'customer_id' => $customerId,
            'type' => $type,
            'status' => $status,
            'source' => $source,
            'text_version' => $textVersion,
            'revoked_at' => $revokedAt,
        ]);

        $consentId = (int) $this->pdo->lastInsertId();

        return [
            'id' => $consentId,
            'business_id' => $businessId,
            'customer_id' => $customerId,
            'type' => $type,
            'status' => $status,
            'source' => $source,
            'text_version' => $textVersion,
            'granted_at' => gmdate('Y-m-d H:i:s'),
            'revoked_at' => $revokedAt,
        ];
    }

    /**
     * Revoca explícitamente el consentimiento de marketing para un cliente.
     */
    public function revokeMarketingConsent(int $businessId, int $customerId, string $source = 'in_store_staff'): array
    {
        // Verificar que el cliente existe en el negocio
        $this->getCustomer($businessId, $customerId);

        return $this->recordConsent($businessId, $customerId, 'marketing', 'revoked', $source);
    }

    /**
     * Obtiene el historial y estado consolidado de consentimientos de un cliente.
     *
     * @return array<string, mixed>
     */
    public function getConsents(int $businessId, int $customerId): array
    {
        $stmt = $this->pdo->prepare("
            SELECT `id`, `type`, `status`, `source`, `text_version`, `granted_at`, `revoked_at`, `created_at`
            FROM `consents`
            WHERE `business_id` = :business_id AND `customer_id` = :customer_id
            ORDER BY `id` DESC
        ");
        $stmt->execute([
            'business_id' => $businessId,
            'customer_id' => $customerId,
        ]);

        $records = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $latestPrivacy = null;
        $latestMarketing = null;

        foreach ($records as $r) {
            if ($r['type'] === 'privacy' && $latestPrivacy === null) {
                $latestPrivacy = ($r['status'] === 'granted');
            }
            if ($r['type'] === 'marketing' && $latestMarketing === null) {
                $latestMarketing = ($r['status'] === 'granted');
            }
        }

        return [
            'privacy_granted' => $latestPrivacy ?? false,
            'marketing_granted' => $latestMarketing ?? false,
            'history' => array_map(static function (array $r): array {
                return [
                    'id' => (int) $r['id'],
                    'type' => (string) $r['type'],
                    'status' => (string) $r['status'],
                    'source' => (string) $r['source'],
                    'text_version' => (string) $r['text_version'],
                    'granted_at' => (string) $r['granted_at'],
                    'revoked_at' => $r['revoked_at'] ? (string) $r['revoked_at'] : null,
                ];
            }, $records),
        ];
    }
}
