<?php

declare(strict_types=1);

namespace App\Modules\Businesses;

use App\Core\Auth\ValidationException;
use App\Core\Database\Connection;
use InvalidArgumentException;
use PDO;

final class BusinessService
{
    private PDO $pdo;
    private AuthorizationService $auth;

    public function __construct(?PDO $pdo = null, ?AuthorizationService $auth = null)
    {
        $this->pdo = $pdo ?? Connection::get();
        $this->auth = $auth ?? new AuthorizationService($this->pdo);
    }

    public function getAuthorizationService(): AuthorizationService
    {
        return $this->auth;
    }

    /**
     * Crea un comercio y asocia al usuario autenticado como 'owner'.
     * Regla 8B: self_registration_enabled es false por defecto.
     *
     * @return array{id: int, name: string, slug: string, tax_id: ?string, role: string, status: string, self_registration_enabled: bool}
     */
    public function createBusiness(int $userId, array $data): array
    {
        $name = trim((string) ($data['name'] ?? ''));
        $taxId = isset($data['tax_id']) ? trim((string) $data['tax_id']) : null;

        $errors = [];
        if (mb_strlen($name) < 2 || mb_strlen($name) > 150) {
            $errors['name'] = 'El nombre del comercio debe tener entre 2 y 150 caracteres.';
        }

        if ($taxId !== null && $taxId !== '' && mb_strlen($taxId) > 50) {
            $errors['tax_id'] = 'El identificador fiscal no puede superar los 50 caracteres.';
        }

        if (!empty($errors)) {
            throw new ValidationException('Datos de comercio inválidos.', $errors);
        }

        // Si el usuario especificó un slug, respetarlo y validar unicidad
        $customSlug = trim((string) ($data['slug'] ?? ''));
        if ($customSlug !== '') {
            $slug = $this->generateSlug($customSlug);
            $checkStmt = $this->pdo->prepare("SELECT `id` FROM `businesses` WHERE `slug` = :slug LIMIT 1");
            $checkStmt->execute(['slug' => $slug]);
            if ($checkStmt->fetch()) {
                throw new ValidationException('El slug especificado ya está en uso.', [
                    'slug' => 'El slug ya está en uso por otro comercio.',
                ]);
            }
        } else {
            // Generar slug base desde el nombre y garantizar unicidad
            $baseSlug = $this->generateSlug($name);
            $slug = $this->resolveUniqueSlug($baseSlug);
        }

        if (!empty($data['self_registration_enabled'])) {
            throw new ValidationException('Datos de comercio inválidos.', [
                'self_registration_enabled' => 'L\'autoregistrazione non è disponibile nel MVP (sezioni 8B e 22 del Contrato).',
            ]);
        }
        $selfReg = 0;

        $packagesInput = $data['packages'] ?? null;
        if ($packagesInput !== null) {
            $punti = !empty($packagesInput['punti']);
            $vantaggi = !empty($packagesInput['vantaggi']);
            $vip = !empty($packagesInput['vip']);
            if ($vantaggi) {
                $punti = true;
                $packagesInput['punti'] = true;
            }
            if (!$punti && !$vip) {
                throw new ValidationException('Dati contrattuali non validi.', [
                    'packages' => 'È obbligatorio selezionare almeno un profilo contrattuale tra Punti o VIP.',
                ]);
            }
        } else {
            // Default contrattuale sicuro per chiamate senza pacchetti espliciti: Punti attivo
            $packagesInput = [
                'punti' => true,
                'vantaggi' => false,
                'vip' => false,
                'campaigns' => false,
            ];
        }

        $this->pdo->beginTransaction();
        try {
            $stmt = $this->pdo->prepare("
                INSERT INTO `businesses` (`name`, `slug`, `tax_id`, `status`, `self_registration_enabled`, `created_at`, `updated_at`)
                VALUES (:name, :slug, :tax_id, 'active', :self_reg, UTC_TIMESTAMP(), UTC_TIMESTAMP())
            ");
            $stmt->execute([
                'name' => $name,
                'slug' => $slug,
                'tax_id' => $taxId !== '' ? $taxId : null,
                'self_reg' => $selfReg,
            ]);

            $businessId = (int) $this->pdo->lastInsertId();

            $ownerEmail = isset($data['owner_email']) ? strtolower(trim((string) $data['owner_email'])) : '';
            $ownerFirstName = isset($data['owner_first_name']) ? trim((string) $data['owner_first_name']) : '';
            $ownerLastName = isset($data['owner_last_name']) ? trim((string) $data['owner_last_name']) : '';

            $invitationData = null;

            if ($ownerEmail !== '') {
                // Comprobar si el usuario ya existe
                $uStmt = $this->pdo->prepare("SELECT `id`, `name`, `email` FROM `users` WHERE `email` = :email LIMIT 1");
                $uStmt->execute(['email' => $ownerEmail]);
                $existingUser = $uStmt->fetch(PDO::FETCH_ASSOC);

                if ($existingUser) {
                    $ownerUserId = (int) $existingUser['id'];
                    $memberStmt = $this->pdo->prepare("
                        INSERT INTO `business_memberships` (`business_id`, `user_id`, `role`, `status`, `created_at`, `updated_at`)
                        VALUES (:business_id, :user_id, :role, 'active', UTC_TIMESTAMP(), UTC_TIMESTAMP())
                        ON DUPLICATE KEY UPDATE `role` = :role_upd, `status` = 'active', `updated_at` = UTC_TIMESTAMP()
                    ");
                    $memberStmt->execute([
                        'business_id' => $businessId,
                        'user_id' => $ownerUserId,
                        'role' => Role::OWNER,
                        'role_upd' => Role::OWNER,
                    ]);
                } else {
                    // Crear invitación pendiente
                    $plainToken = bin2hex(random_bytes(32));
                    $tokenHash = hash('sha256', $plainToken);
                    $expiresAt = gmdate('Y-m-d H:i:s', time() + (7 * 86400)); // 7 días

                    $invStmt = $this->pdo->prepare("
                        INSERT INTO `business_invitations` (
                            `business_id`, `email`, `first_name`, `last_name`, `role`, `token_hash`, `status`, `expires_at`, `created_by_user_id`, `created_at`, `updated_at`
                        ) VALUES (
                            :business_id, :email, :first_name, :last_name, 'owner', :token_hash, 'pending', :expires_at, :created_by_user_id, UTC_TIMESTAMP(), UTC_TIMESTAMP()
                        )
                    ");
                    $invStmt->execute([
                        'business_id' => $businessId,
                        'email' => $ownerEmail,
                        'first_name' => $ownerFirstName !== '' ? $ownerFirstName : 'Proprietario',
                        'last_name' => $ownerLastName !== '' ? $ownerLastName : $name,
                        'token_hash' => $tokenHash,
                        'expires_at' => $expiresAt,
                        'created_by_user_id' => $userId,
                    ]);
                    $invId = (int) $this->pdo->lastInsertId();

                    // Registrar evento en outbox_events para envío seguro de invitación
                    $outboxPayload = json_encode([
                        'invitation_id' => $invId,
                        'business_id' => $businessId,
                        'business_name' => $name,
                        'email' => $ownerEmail,
                        'first_name' => $ownerFirstName,
                        'last_name' => $ownerLastName,
                        'role' => 'owner',
                        'invitation_url' => "/invitations/{$plainToken}",
                        'expires_at' => $expiresAt,
                    ]);
                    $outboxStmt = $this->pdo->prepare("
                        INSERT INTO `outbox_events` (`business_id`, `event_type`, `payload`, `status`, `created_at`, `updated_at`)
                        VALUES (:business_id, 'owner.invitation', :payload, 'pending', UTC_TIMESTAMP(), UTC_TIMESTAMP())
                    ");
                    $outboxStmt->execute([
                        'business_id' => $businessId,
                        'payload' => $outboxPayload,
                    ]);

                    $invitationData = [
                        'id' => $invId,
                        'email' => $ownerEmail,
                        'status' => 'pending',
                        'token' => $plainToken, // Entregado por única vez para testing o dev
                        'invitation_url' => "/invitations/{$plainToken}",
                        'expires_at' => $expiresAt,
                    ];
                }
            } else {
                // Modo legado: asignar al creador como 'owner'
                $memberStmt = $this->pdo->prepare("
                    INSERT INTO `business_memberships` (`business_id`, `user_id`, `role`, `status`, `created_at`, `updated_at`)
                    VALUES (:business_id, :user_id, :role, 'active', UTC_TIMESTAMP(), UTC_TIMESTAMP())
                ");
                $memberStmt->execute([
                    'business_id' => $businessId,
                    'user_id' => $userId,
                    'role' => Role::OWNER,
                ]);
            }

            // Assegnazione transazionale e atomica dei pacchetti contrattuali iniziali
            $capService = new \App\Modules\Loyalty\CapabilityService($this->pdo);
            $capService->applyInitialPackages($businessId, $packagesInput);

            $this->pdo->commit();

            return [
                'id' => $businessId,
                'name' => $name,
                'slug' => $slug,
                'tax_id' => $taxId !== '' ? $taxId : null,
                'role' => Role::OWNER,
                'status' => 'active',
                'self_registration_enabled' => (bool) $selfReg,
                'packages' => $capService->getBusinessPackages($businessId),
                'invitation' => $invitationData,
            ];
        } catch (\Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e;
        }
    }

    /**
     * Actualiza los datos de un comercio existente.
     *
     * @return array{id: int, name: string, slug: string, tax_id: ?string, role: string, status: string, self_registration_enabled: bool}
     */
    public function updateBusiness(int $userId, int $businessId, array $data): array
    {
        $membership = $this->auth->requirePermission($userId, $businessId, Permission::BUSINESS_UPDATE);

        $stmt = $this->pdo->prepare("SELECT * FROM `businesses` WHERE `id` = :id LIMIT 1");
        $stmt->execute(['id' => $businessId]);
        $existing = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$existing) {
            throw new InvalidArgumentException('Comercio no encontrado.');
        }

        $name = isset($data['name']) ? trim((string) $data['name']) : (string) $existing['name'];
        $taxId = array_key_exists('tax_id', $data)
            ? ($data['tax_id'] !== null && trim((string) $data['tax_id']) !== '' ? trim((string) $data['tax_id']) : null)
            : $existing['tax_id'];
        $status = isset($data['status']) && in_array($data['status'], ['active', 'inactive'], true)
            ? (string) $data['status']
            : (string) $existing['status'];
        $selfRegistration = 0;

        $errors = [];
        if (!empty($data['self_registration_enabled'])) {
            $errors['self_registration_enabled'] = 'L\'autoregistrazione non è disponibile nel MVP (sezioni 8B e 22 del Contrato).';
        }
        if (mb_strlen($name) < 2 || mb_strlen($name) > 150) {
            $errors['name'] = 'El nombre del comercio debe tener entre 2 y 150 caracteres.';
        }

        if ($taxId !== null && mb_strlen($taxId) > 50) {
            $errors['tax_id'] = 'El identificador fiscal no puede superar los 50 caracteres.';
        }

        $slug = (string) $existing['slug'];
        if (isset($data['slug']) && trim((string) $data['slug']) !== '') {
            $requestedSlug = $this->generateSlug((string) $data['slug']);
            if ($requestedSlug !== $existing['slug']) {
                $slugCheck = $this->pdo->prepare("SELECT `id` FROM `businesses` WHERE `slug` = :slug AND `id` != :id LIMIT 1");
                $slugCheck->execute(['slug' => $requestedSlug, 'id' => $businessId]);
                if ($slugCheck->fetch()) {
                    $errors['slug'] = 'El slug especificado ya está en uso por otro comercio.';
                } else {
                    $slug = $requestedSlug;
                }
            }
        }

        if (!empty($errors)) {
            throw new ValidationException('Datos de comercio inválidos.', $errors);
        }

        $updateStmt = $this->pdo->prepare("
            UPDATE `businesses`
            SET `name` = :name,
                `slug` = :slug,
                `tax_id` = :tax_id,
                `status` = :status,
                `self_registration_enabled` = :self_registration_enabled,
                `updated_at` = UTC_TIMESTAMP()
            WHERE `id` = :id
        ");
        $updateStmt->execute([
            'name' => $name,
            'slug' => $slug,
            'tax_id' => $taxId,
            'status' => $status,
            'self_registration_enabled' => $selfRegistration,
            'id' => $businessId,
        ]);

        return [
            'id' => $businessId,
            'name' => $name,
            'slug' => $slug,
            'tax_id' => $taxId,
            'role' => $membership['role'],
            'status' => $status,
            'self_registration_enabled' => (bool) $selfRegistration,
        ];
    }

    /**
     * Alterna el estado activo/inactivo del comercio sin eliminar registros físicos.
     */
    public function toggleBusinessStatus(int $userId, int $businessId, ?string $status = null): array
    {
        $membership = $this->auth->requirePermission($userId, $businessId, Permission::BUSINESS_UPDATE);

        $stmt = $this->pdo->prepare("SELECT * FROM `businesses` WHERE `id` = :id LIMIT 1");
        $stmt->execute(['id' => $businessId]);
        $existing = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$existing) {
            throw new InvalidArgumentException('Comercio no encontrado.');
        }

        $newStatus = $status ?? ($existing['status'] === 'active' ? 'inactive' : 'active');

        $upd = $this->pdo->prepare("UPDATE `businesses` SET `status` = :status, `updated_at` = UTC_TIMESTAMP() WHERE `id` = :id");
        $upd->execute(['status' => $newStatus, 'id' => $businessId]);

        if ($newStatus !== 'active') {
            $revStmt = $this->pdo->prepare("
                DELETE s FROM `sessions` s
                INNER JOIN `business_memberships` bm ON s.`user_id` = bm.`user_id`
                WHERE bm.`business_id` = :bid
            ");
            $revStmt->execute(['bid' => $businessId]);
        }

        return [
            'id' => $businessId,
            'name' => (string) $existing['name'],
            'slug' => (string) $existing['slug'],
            'tax_id' => $existing['tax_id'],
            'role' => $membership['role'],
            'status' => $newStatus,
            'self_registration_enabled' => (bool) $existing['self_registration_enabled'],
        ];
    }

    /**
     * Lista todos los comercios donde el usuario tiene membresía activa o todos si es Super Admin.
     */
    public function listUserBusinesses(int $userId): array
    {
        if ($this->auth->isSuperAdmin($userId)) {
            $stmt = $this->pdo->query("
                SELECT b.`id`, b.`name`, b.`slug`, b.`tax_id`, b.`status`, b.`self_registration_enabled`, 'super_admin' AS `role`, b.`created_at` AS joined_at
                FROM `businesses` b
                ORDER BY b.`name` ASC
            ");
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

            return array_map(static function (array $row): array {
                return [
                    'id' => (int) $row['id'],
                    'name' => (string) $row['name'],
                    'slug' => (string) $row['slug'],
                    'tax_id' => $row['tax_id'] !== null ? (string) $row['tax_id'] : null,
                    'role' => (string) $row['role'],
                    'status' => (string) $row['status'],
                    'self_registration_enabled' => (bool) $row['self_registration_enabled'],
                    'joined_at' => (string) $row['joined_at'],
                ];
            }, $rows ?: []);
        }

        $stmt = $this->pdo->prepare("
            SELECT b.`id`, b.`name`, b.`slug`, b.`tax_id`, b.`status`, b.`self_registration_enabled`, bm.`role`, bm.`created_at` AS joined_at
            FROM `businesses` b
            INNER JOIN `business_memberships` bm ON b.`id` = bm.`business_id`
            WHERE bm.`user_id` = :user_id
              AND bm.`status` = 'active'
              AND b.`status` = 'active'
            ORDER BY b.`name` ASC
        ");
        $stmt->execute(['user_id' => $userId]);

        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        return array_map(static function (array $row): array {
            return [
                'id' => (int) $row['id'],
                'name' => (string) $row['name'],
                'slug' => (string) $row['slug'],
                'tax_id' => $row['tax_id'] !== null ? (string) $row['tax_id'] : null,
                'role' => (string) $row['role'],
                'status' => (string) $row['status'],
                'self_registration_enabled' => (bool) $row['self_registration_enabled'],
                'joined_at' => (string) $row['joined_at'],
            ];
        }, $rows ?: []);
    }

    /**
     * Lista paginada de comercios para Super Admin con filtros de búsqueda.
     * Solo accesible si el usuario es Super Admin.
     *
     * @return array{data: array, pagination: array{page: int, per_page: int, total: int, total_pages: int}}
     */
    public function listBusinessesPaginated(int $userId, string $search = '', string $status = 'all', int $page = 1, int $perPage = 25): array
    {
        if (!$this->auth->isSuperAdmin($userId)) {
            throw new ForbiddenException('Acceso reservado a Super Admin.');
        }

        $page    = max(1, $page);
        $perPage = max(1, min(100, $perPage));
        $offset  = ($page - 1) * $perPage;

        $where  = [];
        $params = [];

        if ($search !== '') {
            $q = '%' . $search . '%';
            if (ctype_digit($search)) {
                $where[]               = '(`id` = :exact_id OR `name` LIKE :search_name OR `slug` LIKE :search_slug OR `tax_id` LIKE :search_tax)';
                $params['exact_id']    = (int) $search;
                $params['search_name'] = $q;
                $params['search_slug'] = $q;
                $params['search_tax']  = $q;
            } else {
                $where[]               = '(`name` LIKE :search_name OR `slug` LIKE :search_slug OR `tax_id` LIKE :search_tax)';
                $params['search_name'] = $q;
                $params['search_slug'] = $q;
                $params['search_tax']  = $q;
            }
        }

        if ($status === 'active') {
            $where[]          = '`status` = :status AND `is_archived` = 0';
            $params['status'] = 'active';
        } elseif ($status === 'inactive') {
            $where[]          = '`status` != :status AND `is_archived` = 0';
            $params['status'] = 'active';
        } elseif ($status === 'archived') {
            $where[]          = '`is_archived` = 1';
        }

        $whereSql = $where ? ('WHERE ' . implode(' AND ', $where)) : '';

        $countStmt = $this->pdo->prepare("SELECT COUNT(*) FROM `businesses` {$whereSql}");
        $countStmt->execute($params);
        $total = (int) $countStmt->fetchColumn();

        $orderBy = '`name` ASC';
        $dataParams = $params;
        if ($search !== '' && ctype_digit($search)) {
            $orderBy = '(`id` = :exact_id_order) DESC, `name` ASC';
            $dataParams['exact_id_order'] = (int) $search;
        }

        $dataStmt = $this->pdo->prepare("
            SELECT `id`, `name`, `slug`, `tax_id`, `status`, `self_registration_enabled`, `is_archived`, `terminated_at`, `scheduled_deletion_at`, `created_at`
            FROM `businesses`
            {$whereSql}
            ORDER BY {$orderBy}
            LIMIT {$perPage} OFFSET {$offset}
        ");
        $dataStmt->execute($dataParams);
        $rows = $dataStmt->fetchAll(PDO::FETCH_ASSOC);

        $items = array_map(static function (array $row): array {
            return [
                'id'                        => (int) $row['id'],
                'name'                      => (string) $row['name'],
                'slug'                      => (string) $row['slug'],
                'tax_id'                    => $row['tax_id'] !== null ? (string) $row['tax_id'] : null,
                'status'                    => (string) $row['status'],
                'self_registration_enabled' => (bool) $row['self_registration_enabled'],
                'is_archived'               => !empty($row['is_archived']),
                'terminated_at'             => $row['terminated_at'] !== null ? (string) $row['terminated_at'] : null,
                'scheduled_deletion_at'     => $row['scheduled_deletion_at'] !== null ? (string) $row['scheduled_deletion_at'] : null,
                'role'                      => 'super_admin',
                'joined_at'                 => (string) $row['created_at'],
            ];
        }, $rows ?: []);

        return [
            'data'       => $items,
            'pagination' => [
                'page'        => $page,
                'per_page'    => $perPage,
                'total'       => $total,
                'total_pages' => max(1, (int) ceil($total / $perPage)),
            ],
        ];
    }

    /**
     * Obtiene el comercio si el usuario tiene permiso business.view.
     */
    public function getBusiness(int $userId, int $businessId): array
    {
        $membership = $this->auth->requirePermission($userId, $businessId, Permission::BUSINESS_VIEW);

        $stmt = $this->pdo->prepare("
            SELECT `id`, `name`, `slug`, `tax_id`, `status`, `self_registration_enabled`, `created_at`
            FROM `businesses`
            WHERE `id` = :id AND `status` = 'active'
            LIMIT 1
        ");
        $stmt->execute(['id' => $businessId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$row) {
            throw new InvalidArgumentException('Comercio no encontrado.');
        }

        return [
            'id' => (int) $row['id'],
            'name' => (string) $row['name'],
            'slug' => (string) $row['slug'],
            'tax_id' => $row['tax_id'] !== null ? (string) $row['tax_id'] : null,
            'role' => $membership['role'],
            'status' => (string) $row['status'],
            'self_registration_enabled' => (bool) $row['self_registration_enabled'],
            'created_at' => (string) $row['created_at'],
        ];
    }

    /**
     * Lista los miembros de un comercio.
     */
    public function listMembers(int $userId, int $businessId): array
    {
        $this->auth->requirePermission($userId, $businessId, Permission::MEMBERS_VIEW);

        $stmt = $this->pdo->prepare("
            SELECT bm.`id`, bm.`user_id`, bm.`role`, bm.`status`, bm.`created_at`,
                   u.`name`, u.`email`
            FROM `business_memberships` bm
            INNER JOIN `users` u ON bm.`user_id` = u.`id`
            WHERE bm.`business_id` = :business_id
            ORDER BY bm.`role` ASC, u.`name` ASC
        ");
        $stmt->execute(['business_id' => $businessId]);

        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        return array_map(static function (array $row): array {
            return [
                'membership_id' => (int) $row['id'],
                'user_id' => (int) $row['user_id'],
                'name' => (string) $row['name'],
                'email' => (string) $row['email'],
                'role' => (string) $row['role'],
                'status' => (string) $row['status'],
                'created_at' => (string) $row['created_at'],
            ];
        }, $rows ?: []);
    }

    /**
     * Agrega un nuevo miembro a un comercio con un rol específico (owner, manager, staff).
     */
    public function addMember(int $userId, int $businessId, array $data): array
    {
        $currentMembership = $this->auth->requirePermission($userId, $businessId, Permission::MEMBERS_MANAGE);

        $email = strtolower(trim((string) ($data['email'] ?? '')));
        $role = trim((string) ($data['role'] ?? ''));

        $errors = [];
        if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $errors['email'] = 'Debe proporcionar un correo electrónico válido.';
        }

        if (!Role::isValid($role)) {
            $errors['role'] = 'El rol especificado es inválido. Valores válidos: ' . implode(', ', Role::businessRoles());
        }

        if (!empty($errors)) {
            throw new ValidationException('Datos de membresía inválidos.', $errors);
        }

        // Restricción: un manager no puede crear owners ni otros managers (solo staff)
        if ($currentMembership['role'] === Role::MANAGER && in_array($role, [Role::OWNER, Role::MANAGER], true)) {
            throw new ForbiddenException('Un administrador no tiene autorización para asignar roles de propietario o administrador.');
        }

        // Buscar al usuario
        $userStmt = $this->pdo->prepare("SELECT `id`, `name`, `email` FROM `users` WHERE `email` = :email LIMIT 1");
        $userStmt->execute(['email' => $email]);
        $targetUser = $userStmt->fetch(PDO::FETCH_ASSOC);

        if (!$targetUser) {
            throw new InvalidArgumentException('El usuario con el correo especificado no existe en el sistema.');
        }

        $targetUserId = (int) $targetUser['id'];

        // Comprobar si ya es miembro
        $existing = $this->pdo->prepare("SELECT `id` FROM `business_memberships` WHERE `business_id` = :bid AND `user_id` = :uid LIMIT 1");
        $existing->execute(['bid' => $businessId, 'uid' => $targetUserId]);
        if ($existing->fetch()) {
            throw new InvalidArgumentException('El usuario ya es miembro de este comercio.');
        }

        $insertStmt = $this->pdo->prepare("
            INSERT INTO `business_memberships` (`business_id`, `user_id`, `role`, `status`, `created_at`, `updated_at`)
            VALUES (:business_id, :user_id, :role, 'active', UTC_TIMESTAMP(), UTC_TIMESTAMP())
        ");
        $insertStmt->execute([
            'business_id' => $businessId,
            'user_id' => $targetUserId,
            'role' => $role,
        ]);

        return [
            'membership_id' => (int) $this->pdo->lastInsertId(),
            'business_id' => $businessId,
            'user_id' => $targetUserId,
            'name' => (string) $targetUser['name'],
            'email' => (string) $targetUser['email'],
            'role' => $role,
            'status' => 'active',
        ];
    }

    /**
     * Remueve un miembro del comercio.
     */
    public function removeMember(int $userId, int $businessId, int $targetUserId): void
    {
        $currentMembership = $this->auth->requirePermission($userId, $businessId, Permission::MEMBERS_MANAGE);

        $stmt = $this->pdo->prepare("SELECT `id`, `role` FROM `business_memberships` WHERE `business_id` = :bid AND `user_id` = :uid LIMIT 1");
        $stmt->execute(['bid' => $businessId, 'uid' => $targetUserId]);
        $targetMembership = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$targetMembership) {
            throw new InvalidArgumentException('El miembro no pertenece a este comercio.');
        }

        // Un manager no puede remover owners ni managers
        if ($currentMembership['role'] === Role::MANAGER && in_array($targetMembership['role'], [Role::OWNER, Role::MANAGER], true)) {
            throw new ForbiddenException('Un administrador no puede remover a propietarios ni a otros administradores.');
        }

        // Si es el único owner, no se puede remover
        if ($targetMembership['role'] === Role::OWNER) {
            $ownerCountStmt = $this->pdo->prepare("
                SELECT COUNT(*) FROM `business_memberships`
                WHERE `business_id` = :bid AND `role` = :owner AND `status` = 'active'
            ");
            $ownerCountStmt->execute(['bid' => $businessId, 'owner' => Role::OWNER]);
            $ownerCount = (int) $ownerCountStmt->fetchColumn();

            if ($ownerCount <= 1) {
                throw new InvalidArgumentException('No es posible remover al único propietario activo del comercio.');
            }
        }

        $deleteStmt = $this->pdo->prepare("DELETE FROM `business_memberships` WHERE `id` = :id");
        $deleteStmt->execute(['id' => $targetMembership['id']]);
    }

    private function generateSlug(string $name): string
    {
        $slug = strtolower(trim($name));
        $slug = preg_replace('/[^a-z0-9]+/i', '-', $slug);
        $slug = trim((string) $slug, '-');
        return $slug !== '' ? $slug : 'comercio-' . bin2hex(random_bytes(3));
    }

    private function resolveUniqueSlug(string $baseSlug): string
    {
        $slug = $baseSlug;
        $counter = 1;

        while (true) {
            $stmt = $this->pdo->prepare("SELECT `id` FROM `businesses` WHERE `slug` = :slug LIMIT 1");
            $stmt->execute(['slug' => $slug]);
            if (!$stmt->fetch()) {
                return $slug;
            }
            $counter++;
            $slug = "{$baseSlug}-{$counter}";
        }
    }

    // ==========================================
    // GESTIÓN DE INVITACIONES (SUPER ADMIN / ONBOARDING / COLLABORATORI)
    // ==========================================

    public function createMemberInvitation(int $userId, int $businessId, array $data): array
    {
        $currentMembership = $this->auth->requirePermission($userId, $businessId, Permission::MEMBERS_MANAGE);

        $email = strtolower(trim((string) ($data['email'] ?? '')));
        $firstName = trim((string) ($data['first_name'] ?? ''));
        $lastName = trim((string) ($data['last_name'] ?? ''));
        $role = trim((string) ($data['role'] ?? 'staff'));

        $errors = [];
        if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $errors['email'] = 'È necessario fornire un indirizzo email valido.';
        }

        if (!in_array($role, [Role::STAFF, Role::MANAGER], true)) {
            $errors['role'] = 'Ruolo non valido. È consentito invitare solo Staff o Manager (non Owner).';
        }

        if ($currentMembership['role'] === Role::MANAGER && $role === Role::MANAGER) {
            throw new ForbiddenException('Un manager non è autorizzato ad invitare altri manager.');
        }

        if (!empty($errors)) {
            throw new ValidationException('Dati invito non validi.', $errors);
        }

        // 1. Evitare membri duplicati attivi per lo stesso commercio
        $userStmt = $this->pdo->prepare("SELECT `id` FROM `users` WHERE `email` = :email LIMIT 1");
        $userStmt->execute(['email' => $email]);
        $existingUser = $userStmt->fetch(PDO::FETCH_ASSOC);

        if ($existingUser) {
            $memCheck = $this->pdo->prepare("
                SELECT `id` FROM `business_memberships`
                WHERE `business_id` = :bid AND `user_id` = :uid AND `status` = 'active'
                LIMIT 1
            ");
            $memCheck->execute(['bid' => $businessId, 'uid' => (int) $existingUser['id']]);
            if ($memCheck->fetch()) {
                throw new InvalidArgumentException('L\'utente specificato è già un membro attivo di questo punto vendita.');
            }
        }

        // 2. Evitare inviti duplicati pendenti non scaduti
        $invCheck = $this->pdo->prepare("
            SELECT `id` FROM `business_invitations`
            WHERE `business_id` = :bid AND `email` = :email AND `status` = 'pending' AND `expires_at` > UTC_TIMESTAMP()
            LIMIT 1
        ");
        $invCheck->execute(['bid' => $businessId, 'email' => $email]);
        if ($invCheck->fetch()) {
            throw new InvalidArgumentException('È già presente un invito in attesa per questo indirizzo email.');
        }

        $plainToken = bin2hex(random_bytes(32));
        $tokenHash = hash('sha256', $plainToken);
        $expiresAt = gmdate('Y-m-d H:i:s', time() + (7 * 86400));

        $stmt = $this->pdo->prepare("
            INSERT INTO `business_invitations` (
                `business_id`, `email`, `first_name`, `last_name`, `role`,
                `token_hash`, `status`, `expires_at`, `created_at`, `updated_at`
            ) VALUES (
                :bid, :email, :first_name, :last_name, :role,
                :token_hash, 'pending', :expires_at, UTC_TIMESTAMP(), UTC_TIMESTAMP()
            )
        ");
        $stmt->execute([
            'bid' => $businessId,
            'email' => $email,
            'first_name' => $firstName,
            'last_name' => $lastName,
            'role' => $role,
            'token_hash' => $tokenHash,
            'expires_at' => $expiresAt,
        ]);
        $invId = (int) $this->pdo->lastInsertId();

        $bizStmt = $this->pdo->prepare("SELECT `name` FROM `businesses` WHERE `id` = :id LIMIT 1");
        $bizStmt->execute(['id' => $businessId]);
        $bizName = (string) $bizStmt->fetchColumn();

        $outboxPayload = json_encode([
            'invitation_id' => $invId,
            'business_id' => $businessId,
            'business_name' => $bizName,
            'email' => $email,
            'first_name' => $firstName,
            'last_name' => $lastName,
            'role' => $role,
            'invitation_url' => "/invitations/{$plainToken}",
            'expires_at' => $expiresAt,
        ]);
        $outboxStmt = $this->pdo->prepare("
            INSERT INTO `outbox_events` (`business_id`, `event_type`, `payload`, `status`, `created_at`, `updated_at`)
            VALUES (:business_id, 'member.invitation', :payload, 'pending', UTC_TIMESTAMP(), UTC_TIMESTAMP())
        ");
        $outboxStmt->execute([
            'business_id' => $businessId,
            'payload' => $outboxPayload,
        ]);

        $audit = new \App\Core\Audit\AuditLogger($this->pdo);
        $audit->log('member.invited', 'business_invitations', $invId, [
            'email' => $email,
            'role' => $role,
            'first_name' => $firstName,
            'last_name' => $lastName,
        ], $userId, $businessId);

        return [
            'id' => $invId,
            'business_id' => $businessId,
            'email' => $email,
            'first_name' => $firstName,
            'last_name' => $lastName,
            'role' => $role,
            'status' => 'pending',
            'token' => $plainToken,
            'invitation_url' => "/invitations/{$plainToken}",
            'expires_at' => $expiresAt,
        ];
    }

    public function listInvitations(int $userId, int $businessId): array
    {
        $this->auth->requirePermission($userId, $businessId, Permission::MEMBERS_VIEW);

        $stmt = $this->pdo->prepare("
            SELECT `id`, `business_id`, `email`, `first_name`, `last_name`, `role`, `status`, `expires_at`, `accepted_at`, `created_at`
            FROM `business_invitations`
            WHERE `business_id` = :business_id
            ORDER BY `created_at` DESC
        ");
        $stmt->execute(['business_id' => $businessId]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $now = gmdate('Y-m-d H:i:s');
        return array_map(static function (array $r) use ($now): array {
            $status = $r['status'];
            if ($status === 'pending' && $r['expires_at'] < $now) {
                $status = 'expired';
            }
            return [
                'id' => (int) $r['id'],
                'business_id' => (int) $r['business_id'],
                'email' => (string) $r['email'],
                'first_name' => (string) $r['first_name'],
                'last_name' => (string) $r['last_name'],
                'role' => (string) $r['role'],
                'status' => $status,
                'expires_at' => (string) $r['expires_at'],
                'accepted_at' => $r['accepted_at'] ? (string) $r['accepted_at'] : null,
                'created_at' => (string) $r['created_at'],
            ];
        }, $rows ?: []);
    }

    public function resendInvitation(int $userId, int $businessId, int $invitationId): array
    {
        $this->auth->requirePermission($userId, $businessId, Permission::MEMBERS_MANAGE);

        $stmt = $this->pdo->prepare("SELECT * FROM `business_invitations` WHERE `id` = :id AND `business_id` = :bid LIMIT 1");
        $stmt->execute(['id' => $invitationId, 'bid' => $businessId]);
        $inv = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$inv) {
            throw new InvalidArgumentException('Invito non trovato.');
        }

        if ($inv['status'] === 'accepted') {
            throw new InvalidArgumentException('L\'invito è già stato accettato.');
        }

        $plainToken = bin2hex(random_bytes(32));
        $tokenHash = hash('sha256', $plainToken);
        $expiresAt = gmdate('Y-m-d H:i:s', time() + (7 * 86400));

        $upd = $this->pdo->prepare("
            UPDATE `business_invitations`
            SET `token_hash` = :token_hash,
                `status` = 'pending',
                `expires_at` = :expires_at,
                `updated_at` = UTC_TIMESTAMP()
            WHERE `id` = :id
        ");
        $upd->execute([
            'token_hash' => $tokenHash,
            'expires_at' => $expiresAt,
            'id' => $invitationId,
        ]);

        $bizStmt = $this->pdo->prepare("SELECT `name` FROM `businesses` WHERE `id` = :id LIMIT 1");
        $bizStmt->execute(['id' => $businessId]);
        $bizName = (string) $bizStmt->fetchColumn();

        $eventType = ($inv['role'] === 'owner') ? 'owner.invitation' : 'member.invitation';

        $outboxPayload = json_encode([
            'invitation_id' => $invitationId,
            'business_id' => $businessId,
            'business_name' => $bizName,
            'email' => $inv['email'],
            'first_name' => $inv['first_name'],
            'last_name' => $inv['last_name'],
            'role' => $inv['role'],
            'invitation_url' => "/invitations/{$plainToken}",
            'expires_at' => $expiresAt,
        ]);
        $outboxStmt = $this->pdo->prepare("
            INSERT INTO `outbox_events` (`business_id`, `event_type`, `payload`, `status`, `created_at`, `updated_at`)
            VALUES (:business_id, :event_type, :payload, 'pending', UTC_TIMESTAMP(), UTC_TIMESTAMP())
        ");
        $outboxStmt->execute([
            'business_id' => $businessId,
            'event_type' => $eventType,
            'payload' => $outboxPayload,
        ]);

        $audit = new \App\Core\Audit\AuditLogger($this->pdo);
        $audit->log('invitation.resent', 'business_invitations', $invitationId, [
            'email' => $inv['email'],
            'role' => $inv['role'],
        ], $userId, $businessId);

        return [
            'id' => $invitationId,
            'email' => $inv['email'],
            'status' => 'pending',
            'token' => $plainToken,
            'invitation_url' => "/invitations/{$plainToken}",
            'expires_at' => $expiresAt,
        ];
    }

    public function cancelInvitation(int $userId, int $businessId, int $invitationId): array
    {
        $this->auth->requirePermission($userId, $businessId, Permission::MEMBERS_MANAGE);

        $stmt = $this->pdo->prepare("SELECT * FROM `business_invitations` WHERE `id` = :id AND `business_id` = :bid LIMIT 1");
        $stmt->execute(['id' => $invitationId, 'bid' => $businessId]);
        $inv = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$inv) {
            throw new InvalidArgumentException('Invito non trovato.');
        }

        if ($inv['status'] === 'accepted') {
            throw new InvalidArgumentException('Non è possibile annullare un invito già accettato.');
        }

        $upd = $this->pdo->prepare("
            UPDATE `business_invitations`
            SET `status` = 'cancelled',
                `updated_at` = UTC_TIMESTAMP()
            WHERE `id` = :id
        ");
        $upd->execute(['id' => $invitationId]);

        $audit = new \App\Core\Audit\AuditLogger($this->pdo);
        $audit->log('invitation.cancelled', 'business_invitations', $invitationId, [
            'email' => $inv['email'],
            'role' => $inv['role'],
        ], $userId, $businessId);

        return [
            'id' => $invitationId,
            'status' => 'cancelled',
        ];
    }

    public function validateInvitation(string $plainToken): array
    {
        $tokenHash = hash('sha256', $plainToken);
        $stmt = $this->pdo->prepare("
            SELECT bi.*, b.`name` AS `business_name`, b.`slug` AS `business_slug`, b.`status` AS `business_status`
            FROM `business_invitations` bi
            INNER JOIN `businesses` b ON bi.`business_id` = b.`id`
            WHERE bi.`token_hash` = :token_hash
            LIMIT 1
        ");
        $stmt->execute(['token_hash' => $tokenHash]);
        $inv = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$inv) {
            throw new InvalidArgumentException('Invito non valido o non trovato.');
        }

        if ($inv['business_status'] !== 'active') {
            throw new InvalidArgumentException('Il commercio di destinazione non è attualmente attivo.');
        }

        if ($inv['status'] === 'accepted') {
            throw new InvalidArgumentException('Questo invito è già stato utilizzato.');
        }

        if ($inv['status'] === 'cancelled') {
            throw new InvalidArgumentException('Questo invito è stato annullato dall\'amministratore.');
        }

        if ($inv['expires_at'] < gmdate('Y-m-d H:i:s')) {
            throw new InvalidArgumentException('Questo invito è scaduto.');
        }

        $userCheck = $this->pdo->prepare("SELECT `id` FROM `users` WHERE `email` = :email LIMIT 1");
        $userCheck->execute(['email' => $inv['email']]);
        $userExists = (bool) $userCheck->fetch();

        return [
            'id' => (int) $inv['id'],
            'email' => (string) $inv['email'],
            'first_name' => (string) $inv['first_name'],
            'last_name' => (string) $inv['last_name'],
            'business_id' => (int) $inv['business_id'],
            'business_name' => (string) $inv['business_name'],
            'role' => (string) $inv['role'],
            'user_exists' => $userExists,
        ];
    }

    public function acceptInvitation(string $plainToken, string $password = '', ?int $authUserId = null): array
    {
        $invData = $this->validateInvitation($plainToken);
        $tokenHash = hash('sha256', $plainToken);

        $this->pdo->beginTransaction();

        try {
            // Verificar si el usuario ya existe o crearlo
            $uStmt = $this->pdo->prepare("SELECT `id`, `name`, `email`, `password_hash` FROM `users` WHERE `email` = :email LIMIT 1");
            $uStmt->execute(['email' => $invData['email']]);
            $existingUser = $uStmt->fetch(PDO::FETCH_ASSOC);

            if ($existingUser) {
                $userId = (int) $existingUser['id'];

                if ($authUserId !== null && $authUserId === $userId) {
                    // Verificato via sessione attiva del medesimo utente
                } else {
                    if ($password === '') {
                        throw new ValidationException('È necessario inserire la password del proprio account per confermare l\'invito.', [
                            'password' => 'Password richiesta.',
                        ]);
                    }
                    $hasher = new \App\Core\Security\PasswordHasher();
                    if (!$hasher->verify($password, (string) $existingUser['password_hash'])) {
                        throw new ValidationException('La password inserita non è corretta.', [
                            'password' => 'Password non corretta per questo account.',
                        ]);
                    }
                }
            } else {
                if (strlen($password) < 8) {
                    throw new ValidationException('La password deve contenere almeno 8 caratteri.', [
                        'password' => 'La password deve contenere almeno 8 caratteri.',
                    ]);
                }
                $hasher = new \App\Core\Security\PasswordHasher();
                $pwdHash = $hasher->hash($password);
                $fullName = trim($invData['first_name'] . ' ' . $invData['last_name']);
                $insUser = $this->pdo->prepare("
                    INSERT INTO `users` (`name`, `email`, `password_hash`, `status`, `is_super_admin`, `created_at`, `updated_at`)
                    VALUES (:name, :email, :password_hash, 'active', 0, UTC_TIMESTAMP(), UTC_TIMESTAMP())
                ");
                $insUser->execute([
                    'name' => $fullName !== '' ? $fullName : $invData['email'],
                    'email' => $invData['email'],
                    'password_hash' => $pwdHash,
                ]);
                $userId = (int) $this->pdo->lastInsertId();
            }

            // Asociar membresía con el rol especificado
            $insMem = $this->pdo->prepare("
                INSERT INTO `business_memberships` (`business_id`, `user_id`, `role`, `status`, `created_at`, `updated_at`)
                VALUES (:business_id, :user_id, :role, 'active', UTC_TIMESTAMP(), UTC_TIMESTAMP())
                ON DUPLICATE KEY UPDATE `role` = :role_upd, `status` = 'active', `updated_at` = UTC_TIMESTAMP()
            ");
            $insMem->execute([
                'business_id' => $invData['business_id'],
                'user_id' => $userId,
                'role' => $invData['role'],
                'role_upd' => $invData['role'],
            ]);

            // Marcar invitación como aceptada
            $updInv = $this->pdo->prepare("
                UPDATE `business_invitations`
                SET `status` = 'accepted',
                    `accepted_at` = UTC_TIMESTAMP(),
                    `updated_at` = UTC_TIMESTAMP()
                WHERE `token_hash` = :token_hash
            ");
            $updInv->execute(['token_hash' => $tokenHash]);

            $audit = new \App\Core\Audit\AuditLogger($this->pdo);
            $audit->log('invitation.accepted', 'business_invitations', $invData['id'], [
                'business_id' => $invData['business_id'],
                'role' => $invData['role'],
                'user_id' => $userId,
            ], $userId, $invData['business_id']);

            $this->pdo->commit();

            return [
                'user_id' => $userId,
                'email' => $invData['email'],
                'business_id' => $invData['business_id'],
                'business_name' => $invData['business_name'],
                'role' => $invData['role'],
            ];
        } catch (\Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e;
        }
    }

    // ==========================================
    // CICLO DE VIDA Y GDPR (SUPER ADMIN)
    // ==========================================

    public function archiveBusiness(int $userId, int $businessId, bool $isArchived = true): array
    {
        if (!$this->auth->isSuperAdmin($userId)) {
            throw new ForbiddenException('Azione riservata esclusivamente a Super Admin.');
        }

        $stmt = $this->pdo->prepare("SELECT * FROM `businesses` WHERE `id` = :id LIMIT 1");
        $stmt->execute(['id' => $businessId]);
        $biz = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$biz) {
            throw new InvalidArgumentException('Commercio non trovato.');
        }

        $upd = $this->pdo->prepare("
            UPDATE `businesses`
            SET `is_archived` = :archived,
                `updated_at` = UTC_TIMESTAMP()
            WHERE `id` = :id
        ");
        $upd->execute([
            'archived' => $isArchived ? 1 : 0,
            'id' => $businessId,
        ]);

        $audit = new \App\Core\Audit\AuditLogger($this->pdo);
        $audit->log($isArchived ? 'business.archived' : 'business.unarchived', 'businesses', $businessId, [], $userId, $businessId);

        return [
            'id' => $businessId,
            'is_archived' => $isArchived,
        ];
    }

    public function terminateBusiness(int $userId, int $businessId, int $daysRetention = 30): array
    {
        if (!$this->auth->isSuperAdmin($userId)) {
            throw new ForbiddenException('Azione riservata esclusivamente a Super Admin.');
        }

        $stmt = $this->pdo->prepare("SELECT * FROM `businesses` WHERE `id` = :id LIMIT 1");
        $stmt->execute(['id' => $businessId]);
        $biz = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$biz) {
            throw new InvalidArgumentException('Commercio non trovato.');
        }

        $days = max(1, min(365, $daysRetention));
        $deletionDate = gmdate('Y-m-d H:i:s', time() + ($days * 86400));

        $this->pdo->beginTransaction();
        try {
            $upd = $this->pdo->prepare("
                UPDATE `businesses`
                SET `status` = 'suspended',
                    `terminated_at` = UTC_TIMESTAMP(),
                    `scheduled_deletion_at` = :scheduled_del,
                    `updated_at` = UTC_TIMESTAMP()
                WHERE `id` = :id
            ");
            $upd->execute([
                'scheduled_del' => $deletionDate,
                'id' => $businessId,
            ]);

            // Revocar sesiones de los usuarios miembros de este comercio
            $revStmt = $this->pdo->prepare("
                DELETE s FROM `sessions` s
                INNER JOIN `business_memberships` bm ON s.`user_id` = bm.`user_id`
                WHERE bm.`business_id` = :bid
            ");
            $revStmt->execute(['bid' => $businessId]);

            // Cancelar invitaciones pendientes
            $invCancel = $this->pdo->prepare("
                UPDATE `business_invitations`
                SET `status` = 'cancelled', `updated_at` = UTC_TIMESTAMP()
                WHERE `business_id` = :bid AND `status` = 'pending'
            ");
            $invCancel->execute(['bid' => $businessId]);

            $audit = new \App\Core\Audit\AuditLogger($this->pdo);
            $audit->log('business.terminated', 'businesses', $businessId, [
                'scheduled_deletion_at' => $deletionDate,
                'retention_days' => $days,
            ], $userId, $businessId);

            $this->pdo->commit();

            return [
                'id' => $businessId,
                'status' => 'suspended',
                'terminated_at' => gmdate('Y-m-d H:i:s'),
                'scheduled_deletion_at' => $deletionDate,
            ];
        } catch (\Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e;
        }
    }

    public function cancelTermination(int $userId, int $businessId): array
    {
        if (!$this->auth->isSuperAdmin($userId)) {
            throw new ForbiddenException('Azione riservata esclusivamente a Super Admin.');
        }

        $stmt = $this->pdo->prepare("SELECT * FROM `businesses` WHERE `id` = :id LIMIT 1");
        $stmt->execute(['id' => $businessId]);
        $biz = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$biz) {
            throw new InvalidArgumentException('Commercio non trovato.');
        }

        $upd = $this->pdo->prepare("
            UPDATE `businesses`
            SET `status` = 'active',
                `terminated_at` = NULL,
                `scheduled_deletion_at` = NULL,
                `updated_at` = UTC_TIMESTAMP()
            WHERE `id` = :id
        ");
        $upd->execute(['id' => $businessId]);

        $audit = new \App\Core\Audit\AuditLogger($this->pdo);
        $audit->log('business.termination_cancelled', 'businesses', $businessId, [], $userId, $businessId);

        return [
            'id' => $businessId,
            'status' => 'active',
            'terminated_at' => null,
            'scheduled_deletion_at' => null,
        ];
    }

    public function deleteEmptyBusiness(int $userId, int $businessId, string $confirmSlug): array
    {
        if (!$this->auth->isSuperAdmin($userId)) {
            throw new ForbiddenException('Azione riservata esclusivamente a Super Admin.');
        }

        $stmt = $this->pdo->prepare("SELECT * FROM `businesses` WHERE `id` = :id LIMIT 1");
        $stmt->execute(['id' => $businessId]);
        $biz = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$biz) {
            throw new InvalidArgumentException('Commercio non trovato.');
        }

        if (trim($confirmSlug) !== $biz['slug'] && trim($confirmSlug) !== $biz['name']) {
            throw new ValidationException('La conferma non corrisponde allo slug o nome esatto del commercio.', [
                'confirm_slug' => 'Devi digitare esattamente lo slug o nome del commercio per confermare.',
            ]);
        }

        // Verificación estricta de dependencias: 0 clientes, 0 cuentas, 0 transacciones, 0 tarjetas asignadas, 0 campañas, 0 consentimientos
        $custCount = (int) $this->pdo->query("SELECT COUNT(*) FROM `customers` WHERE `business_id` = {$businessId}")->fetchColumn();
        $accountCount = (int) $this->pdo->query("SELECT COUNT(*) FROM `loyalty_accounts` WHERE `business_id` = {$businessId}")->fetchColumn();
        $cardCount = (int) $this->pdo->query("SELECT COUNT(*) FROM `cards` WHERE `business_id` = {$businessId}")->fetchColumn();
        $campaignCount = (int) $this->pdo->query("SELECT COUNT(*) FROM `campaigns` WHERE `business_id` = {$businessId}")->fetchColumn();
        $consentCount = (int) $this->pdo->query("SELECT COUNT(*) FROM `consents` WHERE `business_id` = {$businessId}")->fetchColumn();
        $txCount = (int) $this->pdo->query("SELECT COUNT(*) FROM `points_transactions` WHERE `business_id` = {$businessId}")->fetchColumn();

        if ($custCount > 0 || $accountCount > 0 || $cardCount > 0 || $campaignCount > 0 || $consentCount > 0 || $txCount > 0) {
            throw new ValidationException("Impossibile eliminare definitivamente: il commercio contiene dati operativi ({$custCount} clienti, {$cardCount} carte, {$txCount} movimenti). Utilizza la disattivazione o terminazione GDPR con periodo di conservazione.", [
                'dependencies' => 'Il commercio non è vuoto.',
            ]);
        }

        $this->pdo->beginTransaction();
        try {
            // Eliminar registros secundarios seguros (business_modules, business_plans, business_invitations, business_memberships)
            $this->pdo->exec("DELETE FROM `business_modules` WHERE `business_id` = {$businessId}");
            $this->pdo->exec("DELETE FROM `business_plans` WHERE `business_id` = {$businessId}");
            $this->pdo->exec("DELETE FROM `business_invitations` WHERE `business_id` = {$businessId}");
            $this->pdo->exec("DELETE FROM `business_memberships` WHERE `business_id` = {$businessId}");
            $this->pdo->exec("DELETE FROM `businesses` WHERE `id` = {$businessId}");

            $audit = new \App\Core\Audit\AuditLogger($this->pdo);
            $audit->log('business.deleted_empty', 'businesses', $businessId, [
                'slug' => $biz['slug'],
                'name' => $biz['name'],
            ], $userId, null);

            $this->pdo->commit();

            return [
                'id' => $businessId,
                'deleted' => true,
            ];
        } catch (\Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e;
        }
    }

    /**
     * Esporta tutti i dati di un commercio in formato JSON strutturato (diritto alla portabilità e backup GDPR).
     * Riservato esclusivamente a Super Admin.
     *
     * @return array<string, mixed>
     */
    public function exportBusinessData(int $userId, int $businessId): array
    {
        if (!$this->auth->isSuperAdmin($userId)) {
            throw new ForbiddenException('Azione riservata esclusivamente a Super Admin.');
        }

        $stmt = $this->pdo->prepare("SELECT * FROM `businesses` WHERE `id` = :id LIMIT 1");
        $stmt->execute(['id' => $businessId]);
        $biz = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$biz) {
            throw new InvalidArgumentException('Commercio non trovato.');
        }

        $membersStmt = $this->pdo->prepare("
            SELECT bm.`id`, bm.`user_id`, u.`email`, u.`name`, bm.`role`, bm.`status`, bm.`created_at`
            FROM `business_memberships` bm
            INNER JOIN `users` u ON bm.`user_id` = u.`id`
            WHERE bm.`business_id` = :bid
        ");
        $membersStmt->execute(['bid' => $businessId]);
        $members = $membersStmt->fetchAll(PDO::FETCH_ASSOC);

        $custStmt = $this->pdo->prepare("
            SELECT `id`, `first_name`, `last_name`, `phone`, `email`, `created_at`, `updated_at`
            FROM `customers`
            WHERE `business_id` = :bid
        ");
        $custStmt->execute(['bid' => $businessId]);
        $customers = $custStmt->fetchAll(PDO::FETCH_ASSOC);

        $laStmt = $this->pdo->prepare("
            SELECT `id`, `customer_id`, `card_profile_id`, `balance`, `status`, `created_at`
            FROM `loyalty_accounts`
            WHERE `business_id` = :bid
        ");
        $laStmt->execute(['bid' => $businessId]);
        $loyaltyAccounts = $laStmt->fetchAll(PDO::FETCH_ASSOC);

        $cardsStmt = $this->pdo->prepare("
            SELECT `id`, `loyalty_account_id`, `status`, `assigned_at`, `created_at`
            FROM `cards`
            WHERE `business_id` = :bid
        ");
        $cardsStmt->execute(['bid' => $businessId]);
        $cards = $cardsStmt->fetchAll(PDO::FETCH_ASSOC);

        $txStmt = $this->pdo->prepare("
            SELECT `id`, `loyalty_account_id`, `points`, `balance_after`, `type`, `reason`, `operation_id`, `created_at`
            FROM `points_transactions`
            WHERE `business_id` = :bid
        ");
        $txStmt->execute(['bid' => $businessId]);
        $transactions = $txStmt->fetchAll(PDO::FETCH_ASSOC);

        $redStmt = $this->pdo->prepare("
            SELECT `id`, `loyalty_account_id`, `reward_id`, `points_spent`, `notes`, `delivered_at`, `created_at`
            FROM `reward_redemptions`
            WHERE `business_id` = :bid
        ");
        $redStmt->execute(['bid' => $businessId]);
        $redemptions = $redStmt->fetchAll(PDO::FETCH_ASSOC);

        $consentsStmt = $this->pdo->prepare("
            SELECT `id`, `customer_id`, `type`, `status`, `source`, `text_version`, `granted_at`, `revoked_at`, `created_at`
            FROM `consents`
            WHERE `business_id` = :bid
        ");
        $consentsStmt->execute(['bid' => $businessId]);
        $consents = $consentsStmt->fetchAll(PDO::FETCH_ASSOC);

        $campaignsStmt = $this->pdo->prepare("
            SELECT `id`, `name`, `channel`, `status`, `scheduled_at`, `confirmed_at`, `completed_at`, `recipient_count`, `sent_count`, `failed_count`, `created_at`
            FROM `campaigns`
            WHERE `business_id` = :bid
        ");
        $campaignsStmt->execute(['bid' => $businessId]);
        $campaigns = $campaignsStmt->fetchAll(PDO::FETCH_ASSOC);

        $audit = new \App\Core\Audit\AuditLogger($this->pdo);
        $audit->log('business.gdpr_exported', 'businesses', $businessId, [
            'exported_at' => gmdate('c'),
            'total_customers' => count($customers),
            'total_transactions' => count($transactions),
        ], $userId, $businessId);

        return [
            'export_version' => '1.0',
            'exported_at' => gmdate('c'),
            'business' => [
                'id' => (int) $biz['id'],
                'name' => (string) $biz['name'],
                'slug' => (string) $biz['slug'],
                'tax_id' => $biz['tax_id'],
                'status' => (string) $biz['status'],
                'terminated_at' => $biz['terminated_at'],
                'scheduled_deletion_at' => $biz['scheduled_deletion_at'],
                'created_at' => $biz['created_at'],
            ],
            'members' => $members,
            'customers' => $customers,
            'loyalty_accounts' => $loyaltyAccounts,
            'cards' => $cards,
            'points_transactions' => $transactions,
            'reward_redemptions' => $redemptions,
            'consents' => $consents,
            'campaigns' => $campaigns,
        ];
    }

    /**
     * Esegue il processo automatico/cron di eliminazione definitiva o anonimizzazione GDPR
     * per tutti i commerci con scheduled_deletion_at scaduto.
     *
     * @return int Numero di commerci anonimizzati
     */
    public function processExpiredGdprDeletions(): int
    {
        $stmt = $this->pdo->prepare("
            SELECT `id`, `name`, `slug`
            FROM `businesses`
            WHERE `terminated_at` IS NOT NULL
              AND `scheduled_deletion_at` IS NOT NULL
              AND `scheduled_deletion_at` <= UTC_TIMESTAMP()
              AND `name` NOT LIKE 'Ex-Commercio Anonimizzato %'
        ");
        $stmt->execute();
        $expiredBusinesses = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $processed = 0;

        foreach ($expiredBusinesses as $biz) {
            $bizId = (int) $biz['id'];

            $this->pdo->beginTransaction();
            try {
                // 1. Anonimizzare clienti rimuovendo tutti i PII (nome generico, email e telefono nulli)
                $anonCust = $this->pdo->prepare("
                    UPDATE `customers`
                    SET `first_name` = 'ANONIMO',
                        `last_name` = 'GDPR',
                        `phone` = NULL,
                        `email` = NULL,
                        `updated_at` = UTC_TIMESTAMP()
                    WHERE `business_id` = :bid
                ");
                $anonCust->execute(['bid' => $bizId]);

                // 2. Rimuovere credenziali di accesso crittografiche
                $delCred = $this->pdo->prepare("DELETE FROM `access_credentials` WHERE `business_id` = :bid");
                $delCred->execute(['bid' => $bizId]);

                // 3. Rimuovere consensi personali
                $delCons = $this->pdo->prepare("DELETE FROM `consents` WHERE `business_id` = :bid");
                $delCons->execute(['bid' => $bizId]);

                // 4. Anonimizzare indirizzi dei destinatari di campagne
                $anonRec = $this->pdo->prepare("
                    UPDATE `campaign_recipients` cr
                    INNER JOIN `campaigns` cmp ON cr.`campaign_id` = cmp.`id`
                    SET cr.`channel_address` = 'anonimo@gdpr.local'
                    WHERE cmp.`business_id` = :bid
                ");
                $anonRec->execute(['bid' => $bizId]);

                // 5. Revocare carte fisiche e scollegarle da conti
                $revCards = $this->pdo->prepare("
                    UPDATE `cards`
                    SET `status` = 'revoked',
                        `loyalty_account_id` = NULL,
                        `updated_at` = UTC_TIMESTAMP()
                    WHERE `business_id` = :bid
                ");
                $revCards->execute(['bid' => $bizId]);

                // 6. Chiudere conti fedeltà e azzerare saldo
                $closeLa = $this->pdo->prepare("
                    UPDATE `loyalty_accounts`
                    SET `status` = 'closed',
                        `balance` = 0,
                        `updated_at` = UTC_TIMESTAMP()
                    WHERE `business_id` = :bid
                ");
                $closeLa->execute(['bid' => $bizId]);

                // 7. Rimuovere note interne da riscatti premi (conservando il registro contabile punti)
                $cleanNotes = $this->pdo->prepare("
                    UPDATE `reward_redemptions`
                    SET `notes` = NULL
                    WHERE `business_id` = :bid
                ");
                $cleanNotes->execute(['bid' => $bizId]);

                // 8. Rimuovere inviti pendenti
                $delInv = $this->pdo->prepare("DELETE FROM `business_invitations` WHERE `business_id` = :bid");
                $delInv->execute(['bid' => $bizId]);

                // 8b. Eliminare eventi outbox pendenti/falliti e anonimizzare i payload per eliminare PII residue
                $delOutbox = $this->pdo->prepare("
                    DELETE FROM `outbox_events`
                    WHERE `business_id` = :bid AND `status` IN ('pending', 'failed', 'processing')
                ");
                $delOutbox->execute(['bid' => $bizId]);

                $anonOutbox = $this->pdo->prepare("
                    UPDATE `outbox_events`
                    SET `payload` = JSON_OBJECT('status', 'gdpr_anonymized')
                    WHERE `business_id` = :bid
                ");
                $anonOutbox->execute(['bid' => $bizId]);

                // 9. Aggiornare stato del commercio a 'suspended' e anonimizzare ragione sociale e partita IVA
                $updBiz = $this->pdo->prepare("
                    UPDATE `businesses`
                    SET `name` = CONCAT('Ex-Commercio Anonimizzato #', `id`),
                        `slug` = CONCAT('anonimizzato-', `id`),
                        `tax_id` = NULL,
                        `status` = 'suspended',
                        `updated_at` = UTC_TIMESTAMP()
                    WHERE `id` = :bid
                ");
                $updBiz->execute(['bid' => $bizId]);

                // 10. Audit log append-only per conformità legale GDPR
                $audit = new \App\Core\Audit\AuditLogger($this->pdo);
                $audit->log('business.gdpr_anonymized', 'businesses', $bizId, [
                    'anonymized_at' => gmdate('c'),
                    'original_name' => $biz['name'],
                ], null, $bizId);

                $this->pdo->commit();
                $processed++;
            } catch (Throwable $e) {
                if ($this->pdo->inTransaction()) {
                    $this->pdo->rollBack();
                }
                error_log("GDPR Anonymization error for business {$bizId}: " . $e->getMessage());
            }
        }

        return $processed;
    }
}

