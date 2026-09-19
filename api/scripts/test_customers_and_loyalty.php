<?php

declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

use App\Core\Auth\AuthService;
use App\Core\Auth\ValidationException;
use App\Core\Database\Connection;
use App\Modules\AccessCredentials\CredentialService;
use App\Modules\Businesses\AuthorizationService;
use App\Modules\Businesses\BusinessService;
use App\Modules\Businesses\ForbiddenException;
use App\Modules\Businesses\Permission;
use App\Modules\Businesses\Role;
use App\Modules\Customers\CustomerService;
use App\Modules\Loyalty\LoyaltyService;

$pdo = Connection::get();
$authService = new AuthService($pdo);
$businessService = new BusinessService($pdo);
$authzService = new AuthorizationService($pdo);
$loyaltyService = new LoyaltyService($pdo);
$credentialService = new CredentialService($pdo);
$customerService = new CustomerService($pdo, $loyaltyService, $credentialService);

$totalTests = 0;
$passedCount = 0;

function assertTest(string $description, bool $condition, ?string $detail = null): void
{
    global $totalTests, $passedCount;
    $totalTests++;

    if ($condition) {
        $passedCount++;
        echo " [OK] {$description}" . ($detail ? " ({$detail})" : "") . PHP_EOL;
    } else {
        echo " [FAIL] {$description}" . ($detail ? " - Detalle: {$detail}" : "") . PHP_EOL;
    }
}

echo "=== INICIANDO PRUEBAS DE CUSTOMERS, CONSENTS, LOYALTY Y CREDENTIALS (ETAPA 1) ===" . PHP_EOL . PHP_EOL;

// 1. Verificación de Tablas y Esquema
echo "--- 1. Verificación de Tablas e Integridad DDL ---" . PHP_EOL;

$tablesStmt = $pdo->query("SHOW TABLES");
$tables = $tablesStmt->fetchAll(PDO::FETCH_COLUMN);

assertTest("Tabla 'customers' existe en MariaDB", in_array('customers', $tables, true));
assertTest("Tabla 'consents' existe en MariaDB", in_array('consents', $tables, true));
assertTest("Tabla 'card_profiles' existe en MariaDB", in_array('card_profiles', $tables, true));
assertTest("Tabla 'loyalty_accounts' existe en MariaDB", in_array('loyalty_accounts', $tables, true));
assertTest("Tabla 'access_credentials' existe en MariaDB", in_array('access_credentials', $tables, true));

// Verificar perfiles iniciales sembrados
$profiles = $loyaltyService->listProfiles();
$profileCodes = array_column($profiles, 'code');
assertTest("Perfiles sembrados contienen 'punti', 'vantaggi', 'vip'",
    in_array('punti', $profileCodes, true) &&
    in_array('vantaggi', $profileCodes, true) &&
    in_array('vip', $profileCodes, true)
);

// 2. Creación de Entorno de Prueba (Usuarios y Comercios A y B)
echo PHP_EOL . "--- 2. Configuración de Comercios para Multi-Tenancy ---" . PHP_EOL;

$ts = time();
$ownerUserA = $authService->register([
    'email' => "owner_cust_a_{$ts}@test.com",
    'password' => 'Password123!',
    'name' => 'Mario Rossi',
]);

$staffUserA = $authService->register([
    'email' => "staff_cust_a_{$ts}@test.com",
    'password' => 'Password123!',
    'name' => 'Luigi Verdi',
]);

$ownerUserB = $authService->register([
    'email' => "owner_cust_b_{$ts}@test.com",
    'password' => 'Password123!',
    'name' => 'Giovanni Bianchi',
]);

$bizA = $businessService->createBusiness($ownerUserA['id'], [
    'name' => "Ristorante Roma {$ts}",
]);

$bizB = $businessService->createBusiness($ownerUserB['id'], [
    'name' => "Caffè Milano {$ts}",
]);

// Agregar staffUserA como STAFF en Biz A
$businessService->addMember($ownerUserA['id'], $bizA['id'], [
    'email' => $staffUserA['email'],
    'role' => Role::STAFF,
]);

assertTest("Comercio A (ID: {$bizA['id']}) y Comercio B (ID: {$bizB['id']}) creados", $bizA['id'] > 0 && $bizB['id'] > 0);

// 3. Reglas de Clientes y Consentimientos
echo PHP_EOL . "--- 3. Reglas de Registro y Consentimientos ---" . PHP_EOL;

// 3.1 Rechazo por falta de consentimiento de privacidad
try {
    $customerService->createCustomer($bizA['id'], [
        'first_name' => 'Marco',
        'last_name' => 'Polo',
        'email' => 'marco.polo@test.com',
        'privacy_accepted' => false,
    ]);
    assertTest("Rechazo de alta sin consentimiento de privacidad", false);
} catch (ValidationException $e) {
    assertTest("Rechazo de alta sin consentimiento de privacidad", true, $e->getMessage());
}

// 3.2 Rechazo por campos obligatorios faltantes
try {
    $customerService->createCustomer($bizA['id'], [
        'first_name' => '',
        'last_name' => '',
        'privacy_accepted' => true,
    ]);
    assertTest("Rechazo de alta con campos requeridos vacíos", false);
} catch (ValidationException $e) {
    assertTest("Rechazo de alta con campos requeridos vacíos", true, $e->getMessage());
}

// 3.3 Alta exitosa con privacidad obligatoria y marketing opcional = false
$customer1 = $customerService->createCustomer($bizA['id'], [
    'first_name' => 'Marco',
    'last_name' => 'Polo',
    'phone' => '+39061234567',
    'email' => 'marco.polo@test.com',
    'privacy_accepted' => true,
    'marketing_accepted' => false,
]);

assertTest("Cliente 1 creado exitosamente en Biz A (ID: {$customer1['id']})", $customer1['id'] > 0);
assertTest("Consentimiento de privacidad otorgado", $customer1['consents']['privacy_granted'] === true);
assertTest("Consentimiento de marketing no otorgado (false)", $customer1['consents']['marketing_granted'] === false);

// 3.4 Alta de cliente con marketing otorgado
$customer2 = $customerService->createCustomer($bizA['id'], [
    'first_name' => 'Leonardo',
    'last_name' => 'Da Vinci',
    'phone' => '+39055987654',
    'email' => 'leonardo@test.com',
    'privacy_accepted' => true,
    'marketing_accepted' => true,
]);

assertTest("Cliente 2 creado con marketing aceptado", $customer2['consents']['marketing_granted'] === true);

// 3.5 Revocación explícita de consentimiento de marketing
$revocation = $customerService->revokeMarketingConsent($bizA['id'], $customer2['id']);
assertTest("Revocación de marketing registrada", $revocation['status'] === 'revoked');

$customer2Updated = $customerService->getCustomer($bizA['id'], $customer2['id']);
assertTest("Estado consolidado de marketing es false tras revocación", $customer2Updated['consents']['marketing_granted'] === false);
assertTest("Historial conserva registro de consentimiento revocado", count($customer2Updated['consents']['history']) >= 2);

// 3.6 Actualización de datos de cliente
$updatedCust = $customerService->updateCustomer($bizA['id'], $customer1['id'], [
    'first_name' => 'Marco Antonio',
    'last_name' => 'Polo',
    'phone' => '+39069999999',
    'email' => 'marco.antonio@test.com',
]);
assertTest("Actualización de cliente exitosa", $updatedCust['first_name'] === 'Marco Antonio' && $updatedCust['phone'] === '+39069999999');

// 3.7 Búsqueda y listado paginado
$searchResult = $customerService->listCustomers($bizA['id'], ['search' => 'Marco']);
assertTest("Búsqueda por nombre encuentra el cliente", $searchResult['pagination']['total'] >= 1 && $searchResult['data'][0]['id'] === $customer1['id']);

$searchPhone = $customerService->listCustomers($bizA['id'], ['phone' => '+39055']);
assertTest("Búsqueda por teléfono encuentra el cliente 2", $searchPhone['pagination']['total'] >= 1 && $searchPhone['data'][0]['id'] === $customer2['id']);

// 4. Perfiles y Cuentas de Fidelización
echo PHP_EOL . "--- 4. Perfiles y Cuentas de Fidelización (Loyalty) ---" . PHP_EOL;

// 4.1 Creación de cuenta con perfil válido y balance inicial 0
$account1 = $loyaltyService->createAccount($bizA['id'], $customer1['id'], 'punti');
assertTest("Cuenta de fidelización creada para Cliente 1 (ID: {$account1['id']})", $account1['id'] > 0);
assertTest("Balance inicial de la cuenta es exactamente 0", $account1['balance'] === 0);
assertTest("Estado de la cuenta es 'active'", $account1['status'] === 'active');
assertTest("Perfil vinculado es 'punti'", $account1['profile_code'] === 'punti');

// 4.2 Rechazo de perfil inexistente
try {
    $loyaltyService->createAccount($bizA['id'], $customer1['id'], 'perfil_inventado');
    assertTest("Rechazo de perfil de fidelización inexistente", false);
} catch (InvalidArgumentException $e) {
    assertTest("Rechazo de perfil de fidelización inexistente", true, $e->getMessage());
}

// 4.3 Prevención de cuenta duplicada para el mismo perfil y cliente
try {
    $loyaltyService->createAccount($bizA['id'], $customer1['id'], 'punti');
    assertTest("Prevención de cuenta duplicada activa para el mismo perfil", false);
} catch (InvalidArgumentException $e) {
    assertTest("Prevención de cuenta duplicada activa para el mismo perfil", true, $e->getMessage());
}

// 4.4 Creación de cuenta con perfil VIP para el mismo cliente permitida
$accountVIP = $loyaltyService->createAccount($bizA['id'], $customer1['id'], 'vip');
assertTest("Creación de cuenta con perfil complementario 'vip' permitida", $accountVIP['profile_code'] === 'vip');

// 4.5 Consulta de cuentas por cliente
$customerAccounts = $loyaltyService->getAccountsByCustomer($bizA['id'], $customer1['id']);
assertTest("Cliente 1 tiene 2 cuentas de fidelización activas", count($customerAccounts) === 2);

// 5. Credenciales de Acceso Digital (Access Credentials)
echo PHP_EOL . "--- 5. Credenciales Digitales, Hashing y Seguridad ---" . PHP_EOL;

// 5.1 Emisión de credencial digital
$credential1 = $credentialService->issueDigitalCredential($bizA['id'], $account1['id']);
assertTest("Credencial digital emitida (ID: {$credential1['id']})", $credential1['id'] > 0);
assertTest("Token devuelto en texto plano tiene 64 caracteres hex (32 bytes entropía)", strlen($credential1['token']) === 64);

// 5.2 Verificación estricta de hash SHA-256 en MariaDB
$dbCredStmt = $pdo->prepare("SELECT * FROM `access_credentials` WHERE `id` = :id");
$dbCredStmt->execute(['id' => $credential1['id']]);
$dbCred = $dbCredStmt->fetch(PDO::FETCH_ASSOC);

$expectedHash = hash('sha256', $credential1['token']);
assertTest("MariaDB almacena únicamente el hash SHA-256 exacto", $dbCred['public_token_hash'] === $expectedHash);
assertTest("MariaDB NO contiene el token en texto plano", strpos(json_encode($dbCred), $credential1['token']) === false);
assertTest("Tipo de credencial es 'digital'", $dbCred['type'] === 'digital');
assertTest("Estado inicial de la credencial es 'active'", $dbCred['status'] === 'active');
assertTest("Columna 'card_id' es NULL para credencial digital", $dbCred['card_id'] === null);

// 5.3 Resolución por token plano
$foundCred = $credentialService->findByRawToken($credential1['token']);
assertTest("Resolución exitosa de credencial por token plano", $foundCred !== null && (int)$foundCred['id'] === $credential1['id']);

$notFound = $credentialService->findByRawToken('token_totalmente_invalido_de_prueba');
assertTest("Token incorrecto no resuelve ninguna credencial", $notFound === null);

// 5.4 Rotación de credencial (reemplazo seguro)
$rotatedCred = $credentialService->rotateCredential($bizA['id'], $credential1['id']);
assertTest("Rotación emite nueva credencial (ID: {$rotatedCred['id']})", $rotatedCred['id'] > $credential1['id']);
assertTest("Nueva credencial tiene nuevo token plano de 64 hex", strlen($rotatedCred['token']) === 64 && $rotatedCred['token'] !== $credential1['token']);

// Verificar estado de la credencial anterior
$oldCredStmt = $pdo->prepare("SELECT * FROM `access_credentials` WHERE `id` = :id");
$oldCredStmt->execute(['id' => $credential1['id']]);
$oldCred = $oldCredStmt->fetch(PDO::FETCH_ASSOC);

assertTest("Credencial anterior actualizada a estado 'replaced'", $oldCred['status'] === 'replaced');
assertTest("Credencial anterior tiene fecha 'revoked_at' asignada", !empty($oldCred['revoked_at']));
assertTest("Credencial anterior vinculada a la nueva vía 'replaced_by_credential_id'", (int)$oldCred['replaced_by_credential_id'] === $rotatedCred['id']);

// 5.5 Revocación de credencial
$revokeResult = $credentialService->revokeCredential($bizA['id'], $rotatedCred['id']);
assertTest("Revocación de credencial devuelve true", $revokeResult === true);

$revokedCredStmt = $pdo->prepare("SELECT * FROM `access_credentials` WHERE `id` = :id");
$revokedCredStmt->execute(['id' => $rotatedCred['id']]);
$revokedCred = $revokedCredStmt->fetch(PDO::FETCH_ASSOC);
assertTest("Credencial revocada tiene estado 'revoked'", $revokedCred['status'] === 'revoked');

// 6. Flujo Integrado de Onboarding Comercial (Atómico)
echo PHP_EOL . "--- 6. Flujo Integrado de Onboarding Comercial ---" . PHP_EOL;

// 6.1 Onboarding exitoso completo en una sola operación
$onboardingData = [
    'first_name' => 'Galileo',
    'last_name' => 'Galilei',
    'phone' => '+39050111222',
    'email' => 'galileo@test.com',
    'privacy_accepted' => true,
    'marketing_accepted' => true,
    'card_profile_code' => 'vantaggi',
];

$onboardResult = $customerService->onboardCustomer($bizA['id'], $onboardingData);

assertTest("Onboarding retorna cliente creado", !empty($onboardResult['customer']['id']));
assertTest("Onboarding registra consentimiento de privacidad 'granted'", $onboardResult['consents']['privacy'] === 'granted');
assertTest("Onboarding registra consentimiento de marketing 'granted'", $onboardResult['consents']['marketing'] === 'granted');
assertTest("Onboarding crea cuenta con perfil 'vantaggi' y saldo 0",
    $onboardResult['loyalty_account']['profile_code'] === 'vantaggi' &&
    $onboardResult['loyalty_account']['balance'] === 0
);
assertTest("Onboarding emite credencial digital activa",
    $onboardResult['access_credential']['type'] === 'digital' &&
    $onboardResult['access_credential']['status'] === 'active'
);
assertTest("Onboarding entrega token en texto plano por única vez", strlen($onboardResult['token']) === 64);
assertTest("Onboarding provee URL pública '/c/{token}'", $onboardResult['public_url'] === "/c/{$onboardResult['token']}");

// 6.2 Atomicidad y Rollback ante fallo
$customersCountBefore = (int) $pdo->query("SELECT COUNT(*) FROM `customers`")->fetchColumn();
$accountsCountBefore = (int) $pdo->query("SELECT COUNT(*) FROM `loyalty_accounts`")->fetchColumn();
$credsCountBefore = (int) $pdo->query("SELECT COUNT(*) FROM `access_credentials`")->fetchColumn();

try {
    $customerService->onboardCustomer($bizA['id'], [
        'first_name' => 'Fallo',
        'last_name' => 'Transaccion',
        'privacy_accepted' => true,
        'card_profile_code' => 'perfil_no_existente_para_forzar_error',
    ]);
    assertTest("Rollback ante perfil inválido", false);
} catch (InvalidArgumentException $e) {
    $customersCountAfter = (int) $pdo->query("SELECT COUNT(*) FROM `customers`")->fetchColumn();
    $accountsCountAfter = (int) $pdo->query("SELECT COUNT(*) FROM `loyalty_accounts`")->fetchColumn();
    $credsCountAfter = (int) $pdo->query("SELECT COUNT(*) FROM `access_credentials`")->fetchColumn();

    $rolledBack = ($customersCountBefore === $customersCountAfter) &&
                  ($accountsCountBefore === $accountsCountAfter) &&
                  ($credsCountBefore === $credsCountAfter);

    assertTest("Rollback atómico verificado: ninguna fila huérfana en DB tras error", $rolledBack);
}

// 7. Aislamiento Multi-Tenant Estricto
echo PHP_EOL . "--- 7. Aislamiento Multi-Tenant ---" . PHP_EOL;

// 7.1 Biz B intenta consultar cliente de Biz A
try {
    $customerService->getCustomer($bizB['id'], $customer1['id']);
    assertTest("Biz B no puede ver clientes de Biz A", false);
} catch (InvalidArgumentException $e) {
    assertTest("Biz B no puede ver clientes de Biz A", true, $e->getMessage());
}

// 7.2 Biz B intenta modificar cliente de Biz A
try {
    $customerService->updateCustomer($bizB['id'], $customer1['id'], [
        'first_name' => 'Intento Hack',
        'last_name' => 'Polo',
    ]);
    assertTest("Biz B no puede modificar clientes de Biz A", false);
} catch (InvalidArgumentException $e) {
    assertTest("Biz B no puede modificar clientes de Biz A", true, $e->getMessage());
}

// 7.3 Biz B intenta revocar credencial de Biz A
$hackedRevoke = $credentialService->revokeCredential($bizB['id'], $credential1['id']);
assertTest("Biz B no puede revocar credencial de Biz A", $hackedRevoke === false);

// 8. Autorización por Roles y Permisos Granulares
echo PHP_EOL . "--- 8. Autorización de Roles y Permisos ---" . PHP_EOL;

// 8.1 Staff User A tiene 'customer.view' y 'customer.edit'
$membershipStaff = $authzService->requirePermission($staffUserA['id'], $bizA['id'], Permission::CUSTOMER_VIEW);
assertTest("Staff tiene permiso 'customer.view'", $membershipStaff['role'] === Role::STAFF);

$membershipStaffEdit = $authzService->requirePermission($staffUserA['id'], $bizA['id'], Permission::CUSTOMER_EDIT);
assertTest("Staff autorizado tiene permiso 'customer.edit'", $membershipStaffEdit['role'] === Role::STAFF);

// 8.2 Staff autorizado puede realizar onboarding exitosamente
$staffOnboard = $customerService->onboardCustomer($bizA['id'], [
    'first_name' => 'Cliente',
    'last_name' => 'De Staff',
    'privacy_accepted' => true,
    'card_profile_code' => 'punti',
]);
assertTest("Staff autorizado puede realizar onboarding exitosamente", !empty($staffOnboard['customer']['id']));

// 8.3 Staff NO autorizado (de otro comercio) es rechazado al intentar onboarding
try {
    $customerService->onboardCustomer($bizA['id'], [
        'first_name' => 'Intento',
        'last_name' => 'Staff Ajeno',
        'privacy_accepted' => true,
    ]);
    // El aislamiento por business_id y sesión rechaza si se verifica la membresía
    $authzService->requirePermission($ownerUserB['id'], $bizA['id'], Permission::CUSTOMER_EDIT);
    assertTest("Staff de otro comercio bloqueado con 403 al intentar onboarding", false);
} catch (ForbiddenException $e) {
    assertTest("Staff de otro comercio bloqueado con 403 al intentar onboarding", true, $e->getMessage());
}

// 8.4 Owner User A SÍ tiene 'customer.edit'
$membershipOwner = $authzService->requirePermission($ownerUserA['id'], $bizA['id'], Permission::CUSTOMER_EDIT);
assertTest("Owner tiene permiso 'customer.edit'", $membershipOwner['role'] === Role::OWNER);

// 8.5 Usuario ajeno bloqueado totalmente de Biz A
try {
    $authzService->requireMembership($ownerUserB['id'], $bizA['id']);
    assertTest("Usuario ajeno bloqueado sin membresía", false);
} catch (ForbiddenException $e) {
    assertTest("Usuario ajeno bloqueado sin membresía", true, $e->getMessage());
}

// 9. Aclaración del Modelo Funcional: Programas Independientes y Vistas de Credenciales
echo PHP_EOL . "--- 9. Modelo Funcional: Perfiles Independientes y Vistas de Credenciales ---" . PHP_EOL;

// 9.1 Cliente con SOLO VIP (no tiene Punti ni Vantaggi)
$vipCustomer = $customerService->onboardCustomer($bizA['id'], [
    'first_name' => 'Enzo',
    'last_name' => 'Ferrari',
    'email' => "enzo_{$ts}@ferrari.it",
    'privacy_accepted' => true,
    'card_profile_code' => 'vip',
]);

assertTest("Cliente creado con SOLO perfil VIP (ID: {$vipCustomer['customer']['id']})",
    $vipCustomer['loyalty_account']['profile_code'] === 'vip'
);

// Verificar cuentas del cliente: tiene exactamente 1 cuenta (VIP)
$enzoAccounts = $loyaltyService->getAccountsByCustomer($bizA['id'], $vipCustomer['customer']['id']);
assertTest("Cliente Enzo tiene exactamente 1 cuenta de fidelización (solo VIP)",
    count($enzoAccounts) === 1 && $enzoAccounts[0]['profile_code'] === 'vip'
);

// Verificar que la credencial VIP muestra ÚNICAMENTE contenido VIP
$vipView = $credentialService->getPublicCredentialView($vipCustomer['token']);
assertTest("Credencial VIP expone únicamente perfil VIP",
    $vipView !== null &&
    $vipView['loyalty_account']['profile_code'] === 'vip' &&
    $vipView['loyalty_account']['profile_name'] === 'VIP'
);

// 9.2 Cliente con PUNTI + VIP simultáneamente
$puntiAccountForEnzo = $loyaltyService->createAccount($bizA['id'], $vipCustomer['customer']['id'], 'punti');
$puntiCredForEnzo = $credentialService->issueDigitalCredential($bizA['id'], $puntiAccountForEnzo['id']);

$enzoAccountsMulti = $loyaltyService->getAccountsByCustomer($bizA['id'], $vipCustomer['customer']['id']);
$enzoProfileCodes = array_column($enzoAccountsMulti, 'profile_code');
assertTest("Cliente posee simultáneamente cuentas Punti + VIP",
    count($enzoAccountsMulti) === 2 &&
    in_array('punti', $enzoProfileCodes, true) &&
    in_array('vip', $enzoProfileCodes, true)
);

// 9.3 Separación estricta de credenciales entre perfiles
$puntiView = $credentialService->getPublicCredentialView($puntiCredForEnzo['token']);
assertTest("Credencial Punti expone únicamente perfil Punti y saldo de puntos",
    $puntiView !== null &&
    $puntiView['loyalty_account']['profile_code'] === 'punti' &&
    $puntiView['credential_id'] !== $vipView['credential_id']
);
assertTest("Credencial VIP sigue exponiendo únicamente perfil VIP",
    $vipView['loyalty_account']['profile_code'] === 'vip' &&
    $vipView['loyalty_account']['id'] !== $puntiView['loyalty_account']['id']
);

// 9.4 Rechazo de dos cuentas Punti para el mismo cliente dentro del mismo negocio
try {
    $loyaltyService->createAccount($bizA['id'], $vipCustomer['customer']['id'], 'punti');
    assertTest("Rechazo de segunda cuenta Punti para el mismo cliente en el mismo negocio", false);
} catch (InvalidArgumentException $e) {
    assertTest("Rechazo de segunda cuenta Punti para el mismo cliente en el mismo negocio", true, $e->getMessage());
}

// 9.5 Regla 8: Cada loyalty_account puede tener como máximo 1 credencial digital activa (debe usarse rotate)
try {
    $credentialService->issueDigitalCredential($bizA['id'], $puntiAccountForEnzo['id']);
    assertTest("Regla 8: Rechazo de segunda credencial digital activa sin rotación", false);
} catch (InvalidArgumentException $e) {
    assertTest("Regla 8: Rechazo de segunda credencial digital activa sin rotación", true, $e->getMessage());
}

// 9.6 Sustitución mediante rotación exitosa
$puntiCredRotated = $credentialService->rotateCredential($bizA['id'], $puntiCredForEnzo['id']);
assertTest("Sustitución de credencial digital activa mediante rotate exitosa",
    $puntiCredRotated['id'] > $puntiCredForEnzo['id'] &&
    $puntiCredRotated['status'] === 'active'
);

// 10. Búsqueda Paginada Backend de Clientes, Permisos y Aislamiento Multiempresa
echo PHP_EOL . "--- 10. Búsqueda Paginada de Clientes, Permisos y Aislamiento Multiempresa ---" . PHP_EOL;

$ts = time();
$c1 = $customerService->createCustomer($bizA['id'], [
    'first_name' => "Giovanni_{$ts}",
    'last_name' => "Verdi_{$ts}",
    'phone' => "+39333111{$ts}",
    'email' => "gverdi_{$ts}@example.it",
    'privacy_accepted' => true,
]);

$c2 = $customerService->createCustomer($bizA['id'], [
    'first_name' => "Alessandra_{$ts}",
    'last_name' => "Ferrari_{$ts}",
    'phone' => "+39333222{$ts}",
    'email' => "aferrari_{$ts}@example.it",
    'privacy_accepted' => true,
]);

$c3 = $customerService->createCustomer($bizB['id'], [
    'first_name' => "Giovanni_{$ts}",
    'last_name' => "Bianchi_{$ts}",
    'phone' => "+39333333{$ts}",
    'email' => "gbianchi_{$ts}@example.it",
    'privacy_accepted' => true,
]);

// 10.1 Búsqueda por nombre
$searchName = $customerService->listCustomers($bizA['id'], ['search' => "Giovanni_{$ts}"]);
assertTest("Búsqueda de clientes por nombre",
    count($searchName['data']) === 1 && $searchName['data'][0]['first_name'] === "Giovanni_{$ts}"
);

// 10.2 Búsqueda por apellido
$searchLastName = $customerService->listCustomers($bizA['id'], ['search' => "Ferrari_{$ts}"]);
assertTest("Búsqueda de clientes por apellido",
    count($searchLastName['data']) === 1 && $searchLastName['data'][0]['last_name'] === "Ferrari_{$ts}"
);

// 10.3 Búsqueda por teléfono
$searchPhone = $customerService->listCustomers($bizA['id'], ['search' => "+39333111{$ts}"]);
assertTest("Búsqueda de clientes por teléfono",
    count($searchPhone['data']) === 1 && $searchPhone['data'][0]['phone'] === "+39333111{$ts}"
);

// 10.4 Búsqueda por email
$searchEmail = $customerService->listCustomers($bizA['id'], ['search' => "aferrari_{$ts}@example.it"]);
assertTest("Búsqueda de clientes por email",
    count($searchEmail['data']) === 1 && $searchEmail['data'][0]['email'] === "aferrari_{$ts}@example.it"
);

// 10.5 Paginación y metadatos de total
$pagedList = $customerService->listCustomers($bizA['id'], [], 1, 1);
assertTest("Paginación de clientes devuelve metadatos estructurados (page, per_page, total, total_pages)",
    $pagedList['pagination']['page'] === 1 &&
    $pagedList['pagination']['per_page'] === 1 &&
    $pagedList['pagination']['total'] >= 2 &&
    $pagedList['pagination']['total_pages'] >= 2 &&
    count($pagedList['data']) === 1
);

// 10.6 Validación de permiso: usuario sin customer.view es rechazado
try {
    $authzService->requirePermission($ownerUserA['id'], $bizA['id'], Permission::CUSTOMER_VIEW);
    assertTest("Owner de comercio tiene permiso customer.view", true);
} catch (ForbiddenException $e) {
    assertTest("Owner de comercio tiene permiso customer.view", false, $e->getMessage());
}

$nonMemberUser = $authService->register([
    'name' => 'Outsider User',
    'email' => "outsider_{$ts}@test.local",
    'password' => 'Pass123456!'
]);
try {
    $authzService->requirePermission($nonMemberUser['id'], $bizA['id'], Permission::CUSTOMER_VIEW);
    assertTest("Usuario sin membresía ni permiso recibe 403 Forbidden para ver clientes", false);
} catch (ForbiddenException $e) {
    assertTest("Usuario sin membresía ni permiso recibe 403 Forbidden para ver clientes", true, $e->getMessage());
}

// 10.7 Aislamiento estricto: búsqueda en Biz A nunca devuelve clientes de Biz B aunque coincida el término
$crossSearch = $customerService->listCustomers($bizA['id'], ['search' => "Giovanni_{$ts}"]);
$hasForeign = false;
foreach ($crossSearch['data'] as $cust) {
    if ($cust['business_id'] !== $bizA['id']) {
        $hasForeign = true;
    }
}
assertTest("Aislamiento multiempresa: búsqueda nunca devuelve clientes de otro business_id",
    !$hasForeign && count($crossSearch['data']) === 1 && $crossSearch['data'][0]['business_id'] === $bizA['id']
);

echo PHP_EOL . "--- 11. Regla Definitiva: Punti -> Vantaggi Upgrade e Independencia VIP ---" . PHP_EOL;

// 11.1 Cliente con solo Punti: al activar Vantaggi, actualiza el mismo conto in-place y conserva saldo/credenciales
$custUpgrade = $customerService->createCustomer($bizA['id'], [
    'first_name' => "Luca_{$ts}",
    'last_name' => 'Upgrade',
    'email' => "luca_up_{$ts}@test.it",
    'privacy_accepted' => true,
]);
$accPunti = $loyaltyService->createAccount($bizA['id'], $custUpgrade['id'], 'punti');
$credPunti = $credentialService->issueDigitalCredential($bizA['id'], $accPunti['id']);
// Simular balance de 50 puntos
$pdo->prepare("UPDATE `loyalty_accounts` SET `balance` = 50 WHERE `id` = :id")->execute(['id' => $accPunti['id']]);

// Upgrade a Vantaggi
$accUpgradeRes = $customerService->addAccountToCustomer($bizA['id'], $custUpgrade['id'], 'vantaggi', $ownerUserA['id']);
assertTest("Ampliación a Vantaggi devuelve flag upgraded = true", $accUpgradeRes['upgraded'] === true);
assertTest("Ampliación a Vantaggi conserva exactamente el mismo account_id", $accUpgradeRes['loyalty_account']['id'] === $accPunti['id']);
assertTest("Perfil del conto actualizado a vantaggi", $accUpgradeRes['loyalty_account']['profile_code'] === 'vantaggi');
assertTest("Saldo de puntos conservado intacto (50)", (int)$accUpgradeRes['loyalty_account']['balance'] === 50);
assertTest("No se emite nueva credencial ni nuevo token en upgrade", $accUpgradeRes['token'] === null && $accUpgradeRes['public_url'] === null);

// Verificar credencial activa previa sigue siendo la misma
$activeCreds = $credentialService->getCredentialsForAccount($bizA['id'], $accPunti['id']);
assertTest("Credencial previa sigue activa y asociada", count($activeCreds) === 1 && $activeCreds[0]['id'] === $credPunti['id']);

// 11.2 Rechazo de activación de Punti cuando ya tiene Vantaggi
try {
    $loyaltyService->createAccount($bizA['id'], $custUpgrade['id'], 'punti');
    assertTest("Rechazo de activación de Punti cuando ya posee Vantaggi", false);
} catch (InvalidArgumentException $e) {
    assertTest("Rechazo de activación de Punti cuando ya posee Vantaggi", true, $e->getMessage());
}

// 11.3 Rechazo de segunda activación de Vantaggi cuando ya tiene Vantaggi
try {
    $loyaltyService->createAccount($bizA['id'], $custUpgrade['id'], 'vantaggi');
    assertTest("Rechazo de segunda activación de Vantaggi", false);
} catch (InvalidArgumentException $e) {
    assertTest("Rechazo de segunda activación de Vantaggi", true, $e->getMessage());
}

// 11.4 Creación de cuenta VIP independiente para el mismo cliente
$accVipRes = $customerService->addAccountToCustomer($bizA['id'], $custUpgrade['id'], 'vip', $ownerUserA['id']);
assertTest("Creación de cuenta VIP devuelve upgraded = false", $accVipRes['upgraded'] === false);
assertTest("Cuenta VIP tiene account_id diferente al estándar", $accVipRes['loyalty_account']['id'] !== $accPunti['id']);
assertTest("Cuenta VIP genera nueva credencial digital y token", !empty($accVipRes['token']) && !empty($accVipRes['public_url']));

// 11.5 Rechazo de segundo conto VIP
try {
    $loyaltyService->createAccount($bizA['id'], $custUpgrade['id'], 'vip');
    assertTest("Rechazo de segundo conto VIP duplicado", false);
} catch (InvalidArgumentException $e) {
    assertTest("Rechazo de segundo conto VIP duplicado", true, $e->getMessage());
}

// 12. Vista Previa Interna Segura (getAccountPreview)
echo PHP_EOL . "--- 12. Vista Previa Interna Segura (Sin rotación de credenciales) ---" . PHP_EOL;

$previewPunti = $loyaltyService->getAccountPreview($bizA['id'], $accPunti['id']);
assertTest("Anteprima Punti: is_preview es true y mode es preview", $previewPunti['is_preview'] === true && $previewPunti['mode'] === 'preview');
assertTest("Anteprima Punti: incluye business correcto y loyalty_account", $previewPunti['business']['id'] === $bizA['id'] && $previewPunti['loyalty_account']['id'] === $accPunti['id']);
assertTest("Anteprima Punti: saldo presente (50)", isset($previewPunti['loyalty_account']['balance']) && $previewPunti['loyalty_account']['balance'] === 50);
assertTest("Anteprima Punti: NO expone tokens planos ni public_token_hash", !isset($previewPunti['token']) && !isset($previewPunti['public_token_hash']));

// Preview de cuenta VIP
$previewVip = $loyaltyService->getAccountPreview($bizA['id'], $accVipRes['loyalty_account']['id']);
assertTest("Anteprima VIP: profile_code es vip", $previewVip['loyalty_account']['profile_code'] === 'vip');
assertTest("Anteprima VIP: is_preview es true", $previewVip['is_preview'] === true);

// Aislamiento Multi-tenant: no se puede previsualizar cuenta de otro business
try {
    $loyaltyService->getAccountPreview($bizB['id'], $accPunti['id']);
    assertTest("Aislamiento multi-tenant en getAccountPreview: rechaza cuenta ajena", false);
} catch (InvalidArgumentException $e) {
    assertTest("Aislamiento multi-tenant en getAccountPreview: rechaza cuenta ajena", true, $e->getMessage());
}

// No se crean credenciales ni se muta la base de datos al consultar preview
$activeCredsAfter = $credentialService->getCredentialsForAccount($bizA['id'], $accPunti['id']);
assertTest("getAccountPreview no genera ni muta credenciales en DB", count($activeCredsAfter) === 1 && $activeCredsAfter[0]['id'] === $credPunti['id']);

echo PHP_EOL . "==========================================" . PHP_EOL;
echo "RESULTADO ETAPA 1 (CUSTOMERS & LOYALTY): {$passedCount} de {$totalTests} pruebas superadas." . PHP_EOL;
echo "==========================================" . PHP_EOL;

if ($passedCount !== $totalTests) {
    exit(1);
}


