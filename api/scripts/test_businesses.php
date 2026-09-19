<?php

declare(strict_types=1);

use App\Core\Auth\AuthService;
use App\Core\Auth\SessionManager;
use App\Core\Database\Connection;
use App\Core\Security\PasswordHasher;
use App\Modules\Businesses\AuthorizationService;
use App\Modules\Businesses\BusinessService;
use App\Modules\Businesses\ForbiddenException;
use App\Modules\Businesses\Permission;
use App\Modules\Businesses\Role;

require_once __DIR__ . '/../bootstrap.php';

echo "=== INICIANDO PRUEBAS DE COMERCIOS, MEMBRESÍAS Y ROLES V7 (SUBETAPA 1.3) ===" . PHP_EOL . PHP_EOL;

$pdo = Connection::get();
$hasher = new PasswordHasher();
$sessionManager = new SessionManager($pdo);
$authService = new AuthService($pdo, $hasher, $sessionManager);
$businessService = new BusinessService($pdo);
$authzService = $businessService->getAuthorizationService();

$passedCount = 0;
$totalTests = 0;

function assertBiz(string $title, bool $condition, string $details = ''): void
{
    global $passedCount, $totalTests;
    $totalTests++;
    if ($condition) {
        $passedCount++;
        echo " [OK] {$title}" . ($details ? " ({$details})" : "") . PHP_EOL;
    } else {
        echo " [FAIL] {$title}" . ($details ? " ({$details})" : "") . PHP_EOL;
    }
}

// 1. Crear usuarios para pruebas
$timestamp = time();
$userA = $authService->register(['name' => 'Owner Alpha', 'email' => "owner_alpha_{$timestamp}@test.com", 'password' => 'Pass123456!']);
$userB = $authService->register(['name' => 'Owner Beta', 'email' => "owner_beta_{$timestamp}@test.com", 'password' => 'Pass123456!']);
$userC = $authService->register(['name' => 'Manager Charlie', 'email' => "manager_charlie_{$timestamp}@test.com", 'password' => 'Pass123456!']);
$userD = $authService->register(['name' => 'Staff Delta', 'email' => "staff_delta_{$timestamp}@test.com", 'password' => 'Pass123456!']);
$userE = $authService->register(['name' => 'Staff Echo', 'email' => "staff_echo_{$timestamp}@test.com", 'password' => 'Pass123456!']);
$userSuper = $authService->register(['name' => 'Super Admin Platform', 'email' => "superadmin_{$timestamp}@test.com", 'password' => 'Pass123456!']);

// Promover manualmente a Super Admin en DB (simulando seed/consola administrativa protegida)
$pdo->exec("UPDATE `users` SET `is_super_admin` = 1 WHERE `id` = {$userSuper['id']}");

assertBiz("Usuarios de prueba creados exitosamente", $userA['id'] > 0 && $userB['id'] > 0);
assertBiz("Super Admin promovido en base de datos", $authzService->isSuperAdmin($userSuper['id']));
assertBiz("Usuario normal no es Super Admin", !$authzService->isSuperAdmin($userA['id']));

// 2. Creación de Negocios
echo PHP_EOL . "--- 2. Creación de Comercios y Asignación de Propietario ---" . PHP_EOL;
$bizName = "Pizzeria Da Luigi {$timestamp}";
$expectedSlug = "pizzeria-da-luigi-{$timestamp}";
$bizA = $businessService->createBusiness($userA['id'], [
    'name' => $bizName,
    'tax_id' => 'IT12345678901',
]);
assertBiz("Comercio creado con slug generado", $bizA['id'] > 0 && $bizA['slug'] === $expectedSlug, "Slug: {$bizA['slug']}");
assertBiz("Creador asignado como 'owner'", $bizA['role'] === Role::OWNER);
assertBiz("Regla 8B: self_registration_enabled es false por defecto", $bizA['self_registration_enabled'] === false);

// Comprobar inserción en DB
$membershipA = $pdo->query("SELECT * FROM `business_memberships` WHERE `business_id` = {$bizA['id']} AND `user_id` = {$userA['id']}")->fetch();
assertBiz("Membresía persistida en DB para el creador con rol owner", $membershipA !== false && $membershipA['role'] === 'owner');

// Crear segundo comercio con el mismo nombre para validar unicidad de slug
$bizA2 = $businessService->createBusiness($userA['id'], ['name' => $bizName]);
assertBiz("Slug duplicado se resuelve unívocamente", $bizA2['slug'] === "{$expectedSlug}-2", "Slug: {$bizA2['slug']}");

// 3. Aislamiento Multi-Tenant y Reconocimiento de Super Admin
echo PHP_EOL . "--- 3. Aislamiento Multi-Tenant y Super Admin ---" . PHP_EOL;
$bizB = $businessService->createBusiness($userB['id'], ['name' => "Bar Roma {$timestamp}"]);

$listA = $businessService->listUserBusinesses($userA['id']);
$bizIdsA = array_column($listA, 'id');
assertBiz("User A solo lista sus comercios", in_array($bizA['id'], $bizIdsA, true) && !in_array($bizB['id'], $bizIdsA, true));

$listB = $businessService->listUserBusinesses($userB['id']);
$bizIdsB = array_column($listB, 'id');
assertBiz("User B solo lista sus comercios", in_array($bizB['id'], $bizIdsB, true) && !in_array($bizA['id'], $bizIdsB, true));

// Intento de acceso cruzado entre comercios normales
try {
    $businessService->getBusiness($userA['id'], $bizB['id']);
    assertBiz("User A no puede acceder a comercio de User B (Multi-tenant)", false);
} catch (ForbiddenException $e) {
    assertBiz("User A bloqueado con 403 al acceder a comercio ajeno", true, $e->getMessage());
}

// Super Admin tiene acceso a cualquier comercio sin membresía local previa
$superViewA = $businessService->getBusiness($userSuper['id'], $bizA['id']);
$superViewB = $businessService->getBusiness($userSuper['id'], $bizB['id']);
assertBiz("Super Admin reconocido con acceso a comercio A", $superViewA['id'] === $bizA['id'] && $superViewA['role'] === Role::SUPER_ADMIN);
assertBiz("Super Admin reconocido con acceso a comercio B", $superViewB['id'] === $bizB['id'] && $superViewB['role'] === Role::SUPER_ADMIN);

// 4. Gestión de Membresías y Roles (owner, manager, staff)
echo PHP_EOL . "--- 4. Asignación de Roles y Permisos ---" . PHP_EOL;

// 4.1 Owner (User A) agrega a User C como 'manager'
$memberC = $businessService->addMember($userA['id'], $bizA['id'], [
    'email' => $userC['email'],
    'role' => Role::MANAGER,
]);
assertBiz("Owner agrega exitosamente un 'manager'", $memberC['role'] === Role::MANAGER && $memberC['user_id'] === $userC['id']);

// 4.2 Owner (User A) agrega a User D como 'staff'
$memberD = $businessService->addMember($userA['id'], $bizA['id'], [
    'email' => $userD['email'],
    'role' => Role::STAFF,
]);
assertBiz("Owner agrega exitosamente un 'staff'", $memberD['role'] === Role::STAFF && $memberD['user_id'] === $userD['id']);

// 4.3 Manager (User C) agrega a User E como 'staff'
$memberE = $businessService->addMember($userC['id'], $bizA['id'], [
    'email' => $userE['email'],
    'role' => Role::STAFF,
]);
assertBiz("Manager puede agregar 'staff'", $memberE['role'] === Role::STAFF);

// 4.4 Manager (User C) intenta agregar un 'owner' -> debe ser denegado por PHP
try {
    $businessService->addMember($userC['id'], $bizA['id'], [
        'email' => $userB['email'],
        'role' => Role::OWNER,
    ]);
    assertBiz("Manager no puede ascender ni crear un 'owner'", false);
} catch (ForbiddenException $e) {
    assertBiz("Manager no puede ascender ni crear un 'owner'", true, $e->getMessage());
}

// 4.5 Staff (User D) intenta agregar un miembro -> debe ser denegado por falta de permiso members.manage
try {
    $businessService->addMember($userD['id'], $bizA['id'], [
        'email' => $userB['email'],
        'role' => Role::STAFF,
    ]);
    assertBiz("Staff no puede gestionar miembros (members.manage)", false);
} catch (ForbiddenException $e) {
    assertBiz("Staff bloqueado en gestión de miembros", true, $e->getMessage());
}

// 4.6 Staff (User D) puede ver el comercio (business.view)
$staffView = $businessService->getBusiness($userD['id'], $bizA['id']);
assertBiz("Staff tiene autorización de lectura del comercio (business.view)", $staffView['id'] === $bizA['id'] && $staffView['role'] === Role::STAFF);

// 4.7 Verificación de permisos formales con notación de punto
assertBiz("Staff tiene permiso points.adjust", Permission::can(Role::STAFF, Permission::POINTS_ADJUST));
assertBiz("Staff tiene permiso reward.redeem", Permission::can(Role::STAFF, Permission::REWARD_REDEEM));
assertBiz("Staff tiene permiso offer.redeem", Permission::can(Role::STAFF, Permission::OFFER_REDEEM));
assertBiz("Staff NO tiene permiso offer.manage", !Permission::can(Role::STAFF, Permission::OFFER_MANAGE));
assertBiz("Staff NO tiene permiso settings.manage", !Permission::can(Role::STAFF, Permission::SETTINGS_MANAGE));
assertBiz("Manager tiene permiso offer.manage", Permission::can(Role::MANAGER, Permission::OFFER_MANAGE));
assertBiz("Manager tiene permiso offer.redeem", Permission::can(Role::MANAGER, Permission::OFFER_REDEEM));
assertBiz("Owner tiene permiso settings.manage", Permission::can(Role::OWNER, Permission::SETTINGS_MANAGE));
assertBiz("Owner tiene permiso user.manage", Permission::can(Role::OWNER, Permission::USER_MANAGE));
assertBiz("Owner tiene permiso offer.manage", Permission::can(Role::OWNER, Permission::OFFER_MANAGE));
assertBiz("Owner tiene permiso offer.redeem", Permission::can(Role::OWNER, Permission::OFFER_REDEEM));

// 5. Eliminación de Miembros y Protección del Único Propietario
echo PHP_EOL . "--- 5. Reglas de Eliminación y Protección ---" . PHP_EOL;

// 5.1 Manager intenta remover al Owner -> debe ser denegado
try {
    $businessService->removeMember($userC['id'], $bizA['id'], $userA['id']);
    assertBiz("Manager no puede remover al propietario", false);
} catch (ForbiddenException $e) {
    assertBiz("Manager bloqueado al intentar remover al propietario", true, $e->getMessage());
}

// 5.2 Owner intenta removerse a sí mismo siendo el único propietario
try {
    $businessService->removeMember($userA['id'], $bizA['id'], $userA['id']);
    assertBiz("Bloqueo de remoción del único propietario activo", false);
} catch (InvalidArgumentException $e) {
    assertBiz("Bloqueo de remoción del único propietario activo", true, $e->getMessage());
}

// 5.3 Owner remueve a Staff (User D)
$businessService->removeMember($userA['id'], $bizA['id'], $userD['id']);
$checkRemoved = $pdo->query("SELECT COUNT(*) FROM `business_memberships` WHERE `business_id` = {$bizA['id']} AND `user_id` = {$userD['id']}")->fetchColumn();
assertBiz("Miembro staff removido físicamente de la tabla", (int)$checkRemoved === 0);

// 5.4 Comprobar que User D ya no puede acceder
try {
    $businessService->getBusiness($userD['id'], $bizA['id']);
    assertBiz("Usuario revocado ya no tiene acceso", false);
} catch (ForbiddenException $e) {
    assertBiz("Usuario revocado ya no tiene acceso", true, $e->getMessage());
}

// 6. Búsqueda y Paginación Backend de Comercios (Super Admin) y Aislamiento de Clientes
echo PHP_EOL . "--- 6. Búsqueda y Paginación Backend (Super Admin) & Aislamiento ---" . PHP_EOL;

// 6.1 Super Admin puede listar comercios paginados
$pagedAll = $businessService->listBusinessesPaginated($userSuper['id'], '', 'all', 1, 10);
assertBiz("Super Admin obtiene lista paginada de comercios", is_array($pagedAll['data']) && isset($pagedAll['pagination']));
assertBiz("Pagination metadata estructurada correctamente", $pagedAll['pagination']['page'] === 1 && $pagedAll['pagination']['per_page'] === 10 && $pagedAll['pagination']['total'] >= 2);

// 6.2 Usuario normal recibe 403 Forbidden al intentar listar comercios paginados
try {
    $businessService->listBusinessesPaginated($userA['id'], '', 'all', 1, 10);
    assertBiz("Usuario normal bloqueado con 403 para listBusinessesPaginated", false);
} catch (ForbiddenException $e) {
    assertBiz("Usuario normal bloqueado con 403 para listBusinessesPaginated", true, $e->getMessage());
}

// 6.3 Búsqueda por nombre de comercio
$pagedSearch = $businessService->listBusinessesPaginated($userSuper['id'], "Pizzeria Da Luigi {$timestamp}", 'all', 1, 10);
assertBiz("Búsqueda por nombre exacto/parcial encuentra el comercio", count($pagedSearch['data']) >= 1 && $pagedSearch['data'][0]['name'] === $bizName);

// 6.4 Búsqueda por ID exacto
$pagedId = $businessService->listBusinessesPaginated($userSuper['id'], (string)$bizA['id'], 'all', 1, 10);
$foundId = false;
foreach ($pagedId['data'] as $b) {
    if ($b['id'] === $bizA['id']) {
        $foundId = true;
        break;
    }
}
assertBiz("Búsqueda por ID numérico encuentra el comercio correcto", $foundId && count($pagedId['data']) >= 1);

// 6.5 Filtro por estado active/inactive
$pagedActive = $businessService->listBusinessesPaginated($userSuper['id'], '', 'active', 1, 50);
$allActive = true;
foreach ($pagedActive['data'] as $b) {
    if ($b['status'] !== 'active') { $allActive = false; break; }
}
assertBiz("Filtro status=active devuelve solo comercios activos", $allActive && count($pagedActive['data']) > 0);

// 6.6 Límites de per_page (clamping)
$pagedClamped = $businessService->listBusinessesPaginated($userSuper['id'], '', 'all', -5, 9999);
assertBiz("Paginación normaliza page negativa a 1", $pagedClamped['pagination']['page'] === 1);
assertBiz("Paginación limita per_page excesivo a 100", $pagedClamped['pagination']['per_page'] === 100);

// 6.7 Aislamiento estricto de clientes por business_id
$customerService = new \App\Modules\Customers\CustomerService($pdo);
$custA = $customerService->createCustomer($bizA['id'], ['first_name' => 'Cliente', 'last_name' => 'Alfa', 'email' => "alfa_{$timestamp}@test.local", 'privacy_accepted' => true]);
$custB = $customerService->createCustomer($bizB['id'], ['first_name' => 'Cliente', 'last_name' => 'Beta', 'email' => "beta_{$timestamp}@test.local", 'privacy_accepted' => true]);

$listBizA = $customerService->listCustomers($bizA['id']);
$listBizB = $customerService->listCustomers($bizB['id']);

$onlyA = true;
foreach ($listBizA['data'] as $c) {
    if ($c['business_id'] !== $bizA['id']) { $onlyA = false; break; }
}
$onlyB = true;
foreach ($listBizB['data'] as $c) {
    if ($c['business_id'] !== $bizB['id']) { $onlyB = false; break; }
}
assertBiz("Aislamiento multiempresa: listCustomers(bizA) retorna exclusivamente clientes de bizA", $onlyA && count($listBizA['data']) >= 1);
assertBiz("Aislamiento multiempresa: listCustomers(bizB) retorna exclusivamente clientes de bizB", $onlyB && count($listBizB['data']) >= 1);

echo PHP_EOL . "==========================================" . PHP_EOL;
echo "RESULTADO PRUEBAS BACKEND COMERCIOS: {$passedCount} de {$totalTests} pruebas superadas." . PHP_EOL;
echo "==========================================" . PHP_EOL;

if ($passedCount !== $totalTests) {
    exit(1);
}
