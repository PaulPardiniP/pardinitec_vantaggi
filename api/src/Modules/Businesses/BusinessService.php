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

            // Asignar al creador como 'owner'
            $memberStmt = $this->pdo->prepare("
                INSERT INTO `business_memberships` (`business_id`, `user_id`, `role`, `status`, `created_at`, `updated_at`)
                VALUES (:business_id, :user_id, :role, 'active', UTC_TIMESTAMP(), UTC_TIMESTAMP())
            ");
            $memberStmt->execute([
                'business_id' => $businessId,
                'user_id' => $userId,
                'role' => Role::OWNER,
            ]);

            $this->pdo->commit();

            return [
                'id' => $businessId,
                'name' => $name,
                'slug' => $slug,
                'tax_id' => $taxId !== '' ? $taxId : null,
                'role' => Role::OWNER,
                'status' => 'active',
                'self_registration_enabled' => (bool) $selfReg,
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
            $where[]          = '`status` = :status';
            $params['status'] = 'active';
        } elseif ($status === 'inactive') {
            $where[]          = '`status` != :status';
            $params['status'] = 'active';
        }

        $whereSql = $where ? ('WHERE ' . implode(' AND ', $where)) : '';

        $countStmt = $this->pdo->prepare("SELECT COUNT(*) FROM `businesses` {$whereSql}");
        $countStmt->execute($params);
        $total = (int) $countStmt->fetchColumn();

        $dataStmt = $this->pdo->prepare("
            SELECT `id`, `name`, `slug`, `tax_id`, `status`, `self_registration_enabled`, `created_at`
            FROM `businesses`
            {$whereSql}
            ORDER BY `name` ASC
            LIMIT {$perPage} OFFSET {$offset}
        ");
        $dataStmt->execute($params);
        $rows = $dataStmt->fetchAll(PDO::FETCH_ASSOC);

        $items = array_map(static function (array $row): array {
            return [
                'id'                        => (int) $row['id'],
                'name'                      => (string) $row['name'],
                'slug'                      => (string) $row['slug'],
                'tax_id'                    => $row['tax_id'] !== null ? (string) $row['tax_id'] : null,
                'status'                    => (string) $row['status'],
                'self_registration_enabled' => (bool) $row['self_registration_enabled'],
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
}
