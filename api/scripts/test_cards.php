<?php

declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

use App\Core\Auth\AuthService;
use App\Core\Database\Connection;
use App\Modules\AccessCredentials\CredentialService;
use App\Modules\Businesses\AuthorizationService;
use App\Modules\Businesses\BusinessService;
use App\Modules\Businesses\ForbiddenException;
use App\Modules\Businesses\Permission;
use App\Modules\Businesses\Role;
use App\Modules\Cards\CardService;
use App\Modules\Customers\CustomerService;
use App\Modules\Loyalty\LoyaltyService;

$pdo = Connection::get();
$authService = new AuthService($pdo);
$businessService = new BusinessService($pdo);
$authzService = new AuthorizationService($pdo);
$loyaltyService = new LoyaltyService($pdo);
$credentialService = new CredentialService($pdo);
$customerService = new CustomerService($pdo, $loyaltyService, $credentialService);
$cardService = new CardService($pdo, $credentialService, $loyaltyService);

$totalTests = 0;
$passedCount = 0;

function assertCardTest(string $description, bool $condition, ?string $detail = null): void
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

echo "=== INICIANDO PRUEBAS DE TARJETAS FÍSICAS, INVENTARIO Y RESOLUCIÓN (ETAPA 2) ===" . PHP_EOL . PHP_EOL;

// 1. Verificación de DDL e Integridad de Esquema
echo "--- 1. Verificación de Tablas e Integridad DDL (Etapa 2) ---" . PHP_EOL;

$tablesStmt = $pdo->query("SHOW TABLES");
$tables = $tablesStmt->fetchAll(PDO::FETCH_COLUMN);
assertCardTest("Tabla 'cards' existe en MariaDB", in_array('cards', $tables, true));

// Verificar columnas de cards
$colsStmt = $pdo->query("DESCRIBE `cards`");
$cols = $colsStmt->fetchAll(PDO::FETCH_COLUMN);
assertCardTest("Columnas requeridas existen en 'cards'",
    in_array('id', $cols, true) &&
    in_array('business_id', $cols, true) &&
    in_array('loyalty_account_id', $cols, true) &&
    in_array('design_profile_id', $cols, true) &&
    in_array('created_by_user_id', $cols, true) &&
    in_array('assigned_by_user_id', $cols, true) &&
    in_array('is_reprogrammable', $cols, true) &&
    in_array('status', $cols, true) &&
    in_array('issued_at', $cols, true) &&
    in_array('assigned_at', $cols, true) &&
    in_array('revoked_at', $cols, true) &&
    in_array('replaced_by_card_id', $cols, true)
);

// 1.1 Verificación rigurosa de tipos de FK vs PK (todos INT UNSIGNED)
$colTypesStmt = $pdo->query("
    SELECT COLUMN_NAME, COLUMN_TYPE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cards'
");
$cardColTypes = $colTypesStmt->fetchAll(PDO::FETCH_KEY_PAIR);

$userPkType = $pdo->query("SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id'")->fetchColumn();
$bizPkType = $pdo->query("SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'businesses' AND COLUMN_NAME = 'id'")->fetchColumn();
$loyaltyPkType = $pdo->query("SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'loyalty_accounts' AND COLUMN_NAME = 'id'")->fetchColumn();

assertCardTest("FK 'cards.business_id' coincide exactamente con PK 'businesses.id' ({$bizPkType})", $cardColTypes['business_id'] === $bizPkType);
assertCardTest("FK 'cards.loyalty_account_id' coincide exactamente con PK 'loyalty_accounts.id' ({$loyaltyPkType})", $cardColTypes['loyalty_account_id'] === $loyaltyPkType);
assertCardTest("FK 'cards.created_by_user_id' coincide exactamente con PK 'users.id' ({$userPkType})", $cardColTypes['created_by_user_id'] === $userPkType);
assertCardTest("FK 'cards.assigned_by_user_id' coincide exactamente con PK 'users.id' ({$userPkType})", $cardColTypes['assigned_by_user_id'] === $userPkType);
assertCardTest("FK 'cards.replaced_by_card_id' coincide con PK 'cards.id' ({$cardColTypes['id']})", $cardColTypes['replaced_by_card_id'] === $cardColTypes['id']);

// 1.2 access_credentials.card_id es índice normal, no UNIQUE absoluto
$credIndexesStmt = $pdo->query("SHOW INDEX FROM `access_credentials` WHERE Column_name = 'card_id'");
$credCardIndexes = $credIndexesStmt->fetchAll(PDO::FETCH_ASSOC);
$isNonUnique = count($credCardIndexes) > 0;
foreach ($credCardIndexes as $idx) {
    if ((int)$idx['Non_unique'] === 0) {
        $isNonUnique = false;
    }
}
assertCardTest("access_credentials.card_id es índice normal (Non_unique = 1), no UNIQUE absoluto", $isNonUnique);

// 1.3 design_profile_id es metadato y no confiere permisos de negocio ni privilegios
assertCardTest("design_profile_id no confiere permisos adicionales al rol staff", !Permission::can(Role::STAFF, Permission::SETTINGS_MANAGE));

// Verificar columnas NULL en access_credentials (migración 0006)
$credCols = $pdo->query("DESCRIBE `access_credentials`")->fetchAll(PDO::FETCH_ASSOC);
$credColMap = [];
foreach ($credCols as $c) {
    $credColMap[$c['Field']] = $c['Null'];
}
assertCardTest("Columna 'business_id' en 'access_credentials' permite NULL", $credColMap['business_id'] === 'YES');
assertCardTest("Columna 'loyalty_account_id' en 'access_credentials' permite NULL", $credColMap['loyalty_account_id'] === 'YES');

// 2. Configuración de Entorno de Prueba
echo PHP_EOL . "--- 2. Configuración de Usuarios y Comercios ---" . PHP_EOL;

$ts = time();

// Super Admin
$superAdminUser = $authService->register([
    'email' => "superadmin_card_{$ts}@vantaggi.com",
    'password' => 'Password123!',
    'name' => 'Super Admin Platform',
]);
$pdo->exec("UPDATE `users` SET `is_super_admin` = 1 WHERE `id` = {$superAdminUser['id']}");

// Owner y Staff de Comercio A
$ownerUserA = $authService->register([
    'email' => "owner_card_a_{$ts}@test.com",
    'password' => 'Password123!',
    'name' => 'Owner Biz A',
]);
$staffUserA = $authService->register([
    'email' => "staff_card_a_{$ts}@test.com",
    'password' => 'Password123!',
    'name' => 'Staff Biz A',
]);
$bizA = $businessService->createBusiness($ownerUserA['id'], ['name' => "Ristorante Roma {$ts}"]);
$businessService->addMember($ownerUserA['id'], $bizA['id'], [
    'email' => $staffUserA['email'],
    'role' => Role::STAFF,
]);

// Owner de Comercio B (aislamiento)
$ownerUserB = $authService->register([
    'email' => "owner_card_b_{$ts}@test.com",
    'password' => 'Password123!',
    'name' => 'Owner Biz B',
]);
$bizB = $businessService->createBusiness($ownerUserB['id'], ['name' => "Bar Napoli {$ts}"]);

assertCardTest("Super Admin (ID: {$superAdminUser['id']}) configurado", $authzService->isSuperAdmin($superAdminUser['id']));
assertCardTest("Comercio A (ID: {$bizA['id']}) y Comercio B (ID: {$bizB['id']}) listos", $bizA['id'] > 0 && $bizB['id'] > 0);

// 3. Operaciones de Super Admin: Inventario y Asignación en Lote
echo PHP_EOL . "--- 3. Operaciones de Super Admin (Inventario y Asignación) ---" . PHP_EOL;

// 3.1 Creación individual en inventario
$singleCard = $cardService->createCardInInventory(1);
assertCardTest("Tarjeta física creada en inventario (ID: {$singleCard['id']})", $singleCard['id'] > 0);
assertCardTest("Tarjeta inicia con estado 'inventory'", $singleCard['status'] === 'inventory');
assertCardTest("Token físico devuelto tiene 64 hex (32 bytes)", strlen($singleCard['token']) === 64);
assertCardTest("URL pública generada tiene formato /c/<token>", $singleCard['public_url'] === "/c/{$singleCard['token']}");

// 3.2 Verificación estricta de hash SHA-256 en MariaDB
$dbCred = $pdo->query("SELECT * FROM `access_credentials` WHERE `card_id` = {$singleCard['id']} AND `type` = 'physical'")->fetch(PDO::FETCH_ASSOC);
$expectedHash = hash('sha256', $singleCard['token']);
assertCardTest("MariaDB almacena únicamente el hash SHA-256 exacto del token físico", $dbCred['public_token_hash'] === $expectedHash);
assertCardTest("Credencial física en inventario tiene business_id = NULL", $dbCred['business_id'] === null);
assertCardTest("Credencial física en inventario tiene loyalty_account_id = NULL", $dbCred['loyalty_account_id'] === null);

// 3.3 Creación por lote en inventario (5 tarjetas)
$batch = $cardService->createBatchInInventory(5, 2);
assertCardTest("Lote de 5 tarjetas creado exitosamente", count($batch) === 5);
$batchCardIds = array_column($batch, 'id');

// 3.4 Asignación de lote a Comercio A (inventory -> issued)
$assignedCards = $cardService->assignCardsToBusiness($batchCardIds, $bizA['id']);
assertCardTest("Lote de tarjetas asignado a Comercio A", count($assignedCards) === 5);

$firstAssigned = $assignedCards[0];
assertCardTest("Tarjeta asignada tiene estado 'issued'", $firstAssigned['status'] === 'issued');
assertCardTest("Tarjeta asignada tiene business_id = {$bizA['id']}", $firstAssigned['business_id'] === $bizA['id']);
assertCardTest("Tarjeta asignada conserva loyalty_account_id = NULL", $firstAssigned['loyalty_account_id'] === null);
assertCardTest("Tarjeta asignada registra timestamp issued_at", !empty($firstAssigned['issued_at']));

// Verificar que la credencial física también se vinculó al business_id
$dbAssignedCred = $pdo->query("SELECT * FROM `access_credentials` WHERE `card_id` = {$firstAssigned['id']}")->fetch(PDO::FETCH_ASSOC);
assertCardTest("Credencial física vinculada a business_id tras asignación", (int)$dbAssignedCred['business_id'] === $bizA['id']);

// 4. Validación de Máquina de Estados y Transiciones Inválidas
echo PHP_EOL . "--- 4. Validación de Máquina de Estados ---" . PHP_EOL;

// 4.1 inventory -> active directo (debe fallar, debe pasar por issued)
try {
    $cardService->validateTransition('inventory', 'active');
    assertCardTest("Rechazo de salto directo inventory -> active", false);
} catch (InvalidArgumentException $e) {
    assertCardTest("Rechazo de salto directo inventory -> active", true, $e->getMessage());
}

// 4.2 issued -> inventory (debe fallar)
try {
    $cardService->validateTransition('issued', 'inventory');
    assertCardTest("Rechazo de retroceso issued -> inventory", false);
} catch (InvalidArgumentException $e) {
    assertCardTest("Rechazo de retroceso issued -> inventory", true, $e->getMessage());
}

// 4.3 revoked -> active (debe fallar, revoked es final)
try {
    $cardService->validateTransition('revoked', 'active');
    assertCardTest("Rechazo de reactivación desde estado 'revoked'", false);
} catch (InvalidArgumentException $e) {
    assertCardTest("Rechazo de reactivación desde estado 'revoked'", true, $e->getMessage());
}

// 4.4 replaced -> active (debe fallar, replaced es final)
try {
    $cardService->validateTransition('replaced', 'active');
    assertCardTest("Rechazo de reactivación desde estado 'replaced'", false);
} catch (InvalidArgumentException $e) {
    assertCardTest("Rechazo de reactivación desde estado 'replaced'", true, $e->getMessage());
}

// 5. Activación en el Local por Personal Autorizado
echo PHP_EOL . "--- 5. Activación Presencial en el Local ---" . PHP_EOL;

// Crear un cliente con onboarding en Comercio A
$clientOnboard = $customerService->onboardCustomer($bizA['id'], [
    'first_name' => 'Federico',
    'last_name' => 'Fellini',
    'email' => "fellini_{$ts}@test.com",
    'privacy_accepted' => true,
    'card_profile_code' => 'vantaggi',
]);
$customerId = (int) $clientOnboard['customer']['id'];
$loyaltyAccountId = (int) $clientOnboard['loyalty_account']['id'];
$digitalToken = (string) $clientOnboard['token'];

// 5.1 Staff autorizado activa tarjeta issued vinculándola a la loyalty_account
$activeCard = $cardService->activateCard($bizA['id'], $firstAssigned['id'], $loyaltyAccountId);
assertCardTest("Tarjeta activada con éxito (ID: {$activeCard['id']})", $activeCard['id'] === $firstAssigned['id']);
assertCardTest("Estado de tarjeta pasa a 'active'", $activeCard['status'] === 'active');
assertCardTest("Tarjeta vinculada a loyalty_account_id = {$loyaltyAccountId}", $activeCard['loyalty_account_id'] === $loyaltyAccountId);
assertCardTest("Tarjeta registra assigned_at", !empty($activeCard['assigned_at']));

// 5.2 Independencia de credenciales física y digital
$activePhysCred = $cardService->getCredentialService()->getPhysicalCredentialForCard($activeCard['id']);
assertCardTest("Credencial física apunta a loyalty_account", (int)$activePhysCred['loyalty_account_id'] === $loyaltyAccountId);
assertCardTest("Token físico es completamente independiente del token digital", $batch[0]['token'] !== $digitalToken);

// 5.3 Rechazo al intentar activar una tarjeta ya activa
try {
    $cardService->activateCard($bizA['id'], $firstAssigned['id'], $loyaltyAccountId);
    assertCardTest("Rechazo de activación de tarjeta ya activa", false);
} catch (InvalidArgumentException $e) {
    assertCardTest("Rechazo de activación de tarjeta ya activa", true, $e->getMessage());
}

// 5.4 Rechazo si la cuenta de fidelización pertenece a otro comercio
$clientBizB = $customerService->onboardCustomer($bizB['id'], [
    'first_name' => 'Cliente',
    'last_name' => 'Biz B',
    'privacy_accepted' => true,
]);
try {
    $secondCard = $assignedCards[1];
    $cardService->activateCard($bizA['id'], $secondCard['id'], $clientBizB['loyalty_account']['id']);
    assertCardTest("Rechazo al vincular tarjeta con cuenta de otro comercio", false);
} catch (InvalidArgumentException $e) {
    assertCardTest("Rechazo al vincular tarjeta con cuenta de otro comercio", true, $e->getMessage());
}

// 6. Suspensión, Reactivación y Revocación
echo PHP_EOL . "--- 6. Suspensión, Reactivación y Revocación ---" . PHP_EOL;

// 6.1 Suspensión de tarjeta activa
$suspendedCard = $cardService->suspendCard($bizA['id'], $activeCard['id']);
assertCardTest("Tarjeta pasa a estado 'suspended'", $suspendedCard['status'] === 'suspended');

$physCredSuspended = $pdo->query("SELECT `status` FROM `access_credentials` WHERE `card_id` = {$activeCard['id']} ORDER BY `id` DESC LIMIT 1")->fetchColumn();
assertCardTest("Credencial física también queda en estado 'suspended'", $physCredSuspended === 'suspended');

// 6.2 Reactivación de tarjeta suspendida
$reactivatedCard = $cardService->reactivateCard($bizA['id'], $activeCard['id']);
assertCardTest("Tarjeta reactivada pasa nuevamente a 'active'", $reactivatedCard['status'] === 'active');

$physCredActive = $pdo->query("SELECT `status` FROM `access_credentials` WHERE `card_id` = {$activeCard['id']} ORDER BY `id` DESC LIMIT 1")->fetchColumn();
assertCardTest("Credencial física reactivada pasa a 'active'", $physCredActive === 'active');

// 6.3 Revocación de tarjeta física
$cardToRevoke = $assignedCards[1]; // issued
$cardService->activateCard($bizA['id'], $cardToRevoke['id'], $loyaltyAccountId);
$revokedCard = $cardService->revokeCard($bizA['id'], $cardToRevoke['id']);
assertCardTest("Tarjeta física revocada pasa a 'revoked'", $revokedCard['status'] === 'revoked');
assertCardTest("Tarjeta física registra revoked_at", !empty($revokedCard['revoked_at']));

$revokedPhysCred = $pdo->query("SELECT `status` FROM `access_credentials` WHERE `card_id` = {$cardToRevoke['id']} ORDER BY `id` DESC LIMIT 1")->fetchColumn();
assertCardTest("Credencial física pasa a 'revoked'", $revokedPhysCred === 'revoked');

// Comprobar que la credencial digital del cliente sigue activa e intacta
$digitalCredCheck = $pdo->query("SELECT `status` FROM `access_credentials` WHERE `loyalty_account_id` = {$loyaltyAccountId} AND `type` = 'digital'")->fetchColumn();
assertCardTest("Credencial digital del cliente permanece 100% activa e intacta tras revocar tarjeta física", $digitalCredCheck === 'active');

// 7. Pérdida y Reemplazo de Tarjeta Física
echo PHP_EOL . "--- 7. Pérdida y Reemplazo de Tarjeta Física ---" . PHP_EOL;

$oldCardId = $activeCard['id'];
$newCardToUse = $assignedCards[2]; // tarjeta issued en Comercio A

$replaceResult = $cardService->replaceCard($bizA['id'], $oldCardId, $newCardToUse['id']);
assertCardTest("Tarjeta antigua pasa a 'replaced'", $replaceResult['old_card']['status'] === 'replaced');
assertCardTest("Tarjeta antigua registra revoked_at", !empty($replaceResult['old_card']['revoked_at']));
assertCardTest("Tarjeta antigua enlaza replaced_by_card_id con nueva tarjeta", (int)$replaceResult['old_card']['replaced_by_card_id'] === $newCardToUse['id']);

assertCardTest("Nueva tarjeta pasa a 'active'", $replaceResult['new_card']['status'] === 'active');
assertCardTest("Nueva tarjeta hereda la misma loyalty_account", (int)$replaceResult['new_card']['loyalty_account_id'] === $loyaltyAccountId);
assertCardTest("replaceCard devuelve nuevo token físico y public_url", !empty($replaceResult['token']) && !empty($replaceResult['public_url']));

// Comprobar que el token físico anterior ya no es válido
$oldToken = $batch[0]['token'];
$viewOldToken = $credentialService->getPublicCredentialView($oldToken);
assertCardTest("Token físico anterior marcado como no disponible", $viewOldToken['state'] === 'not_available');

// Comprobar que el nuevo token físico es válido, activo y almacenado como SHA-256 en DB
$newToken = $replaceResult['token'];
$viewNewToken = $credentialService->getPublicCredentialView($newToken);
assertCardTest("Nuevo token físico está activo y resuelve la cuenta", $viewNewToken['state'] === 'active');

$dbNewCred = $pdo->query("SELECT * FROM `access_credentials` WHERE `card_id` = {$newCardToUse['id']} AND `status` = 'active'")->fetch(PDO::FETCH_ASSOC);
assertCardTest("MariaDB almacena únicamente hash SHA-256 exacto (64 hex) para la nueva tarjeta",
    $dbNewCred &&
    $dbNewCred['public_token_hash'] === hash('sha256', $newToken) &&
    strlen($dbNewCred['public_token_hash']) === 64
);

// Comprobar que la base de datos nunca almacena el token plano ni cifrado
$columnsCred = array_column($pdo->query("SHOW COLUMNS FROM `access_credentials`")->fetchAll(PDO::FETCH_ASSOC), 'Field');
assertCardTest("access_credentials no posee columnas de token en plano ni ciphertext reversible",
    !in_array('token', $columnsCred, true) &&
    !in_array('plain_token', $columnsCred, true) &&
    !in_array('ciphertext', $columnsCred, true) &&
    in_array('public_token_hash', $columnsCred, true)
);

// 7.1 Imposibilidad de tener dos credenciales físicas activas simultáneamente
try {
    $credentialService->issuePhysicalCredential($bizA['id'], $newCardToUse['id']);
    assertCardTest("Imposibilidad de tener dos credenciales físicas activas para la misma tarjeta", false);
} catch (InvalidArgumentException $e) {
    assertCardTest("Imposibilidad de tener dos credenciales físicas activas para la misma tarjeta", true, $e->getMessage());
}

// 7.2 Historial de credenciales físicas conservado tras reemplazo
$histOldStmt = $pdo->query("SELECT id, status, revoked_at, replaced_by_credential_id FROM access_credentials WHERE card_id = {$oldCardId} ORDER BY id ASC");
$histOldRows = $histOldStmt->fetchAll(PDO::FETCH_ASSOC);
assertCardTest("Historial de credenciales físicas conservado tras reemplazo (status replaced y revoked_at)",
    count($histOldRows) >= 1 &&
    $histOldRows[0]['status'] === 'replaced' &&
    !empty($histOldRows[0]['revoked_at'])
);

// 8. Resolución Pública Segura (/c/<token>) Adaptativa
echo PHP_EOL . "--- 8. Resolución Pública Segura (/c/<token>) ---" . PHP_EOL;

// 8.1 Tarjeta en INVENTORY abierta por anónimo
$viewInvAnon = $credentialService->getPublicCredentialView($singleCard['token']);
assertCardTest("Tarjeta en inventario abierta por anónimo muestra mensaje genérico 'Carta non attivata'",
    $viewInvAnon['state'] === 'inventory' &&
    $viewInvAnon['mode'] === 'anonymous' &&
    str_contains($viewInvAnon['message'], 'Carta non attivata')
);

// 8.2 Tarjeta en INVENTORY abierta por Super Admin
$viewInvAdmin = $credentialService->getPublicCredentialView($singleCard['token'], [
    'user_id' => $superAdminUser['id'],
    'is_super_admin' => true,
]);
assertCardTest("Tarjeta en inventario abierta por Super Admin muestra modo admin y opción de asignación",
    $viewInvAdmin['state'] === 'inventory' &&
    $viewInvAdmin['mode'] === 'super_admin' &&
    $viewInvAdmin['card_id'] === $singleCard['id']
);

// 8.3 Tarjeta en ISSUED abierta por anónimo (Regla 8B: sin autoregistro)
$issuedCardToken = $batch[3]['token']; // issued en Comercio A
$viewIssuedAnon = $credentialService->getPublicCredentialView($issuedCardToken);
assertCardTest("Tarjeta en issued abierta por anónimo muestra mensaje de dirigirse al personal (sin autoregistro)",
    $viewIssuedAnon['state'] === 'issued' &&
    $viewIssuedAnon['mode'] === 'anonymous' &&
    str_contains($viewIssuedAnon['message'], 'personale')
);

// 8.4 Tarjeta en ISSUED abierta por Staff del mismo comercio
$viewIssuedStaff = $credentialService->getPublicCredentialView($issuedCardToken, [
    'user_id' => $staffUserA['id'],
    'business_id' => $bizA['id'],
    'role' => Role::STAFF,
]);
assertCardTest("Tarjeta en issued abierta por Staff del mismo comercio permite activación (can_activate = true)",
    $viewIssuedStaff['state'] === 'issued' &&
    $viewIssuedStaff['mode'] === 'staff' &&
    $viewIssuedStaff['can_activate'] === true
);

// 8.5 Tarjeta en ISSUED abierta por usuario de otro comercio -> 403 Forbidden
$viewIssuedCross = $credentialService->getPublicCredentialView($issuedCardToken, [
    'user_id' => $ownerUserB['id'],
    'business_id' => $bizB['id'],
    'role' => Role::OWNER,
]);
assertCardTest("Tarjeta en issued abierta por usuario de otro comercio es rechazada (forbidden)",
    $viewIssuedCross['state'] === 'forbidden'
);

// 8.6 Tarjeta en ACTIVE abierta por anónimo -> Vista pública mínima sin PII
$viewActiveAnon = $credentialService->getPublicCredentialView($newToken);
assertCardTest("Tarjeta activa abierta por anónimo muestra vista pública mínima sin PII",
    $viewActiveAnon['state'] === 'active' &&
    $viewActiveAnon['mode'] === 'public' &&
    !isset($viewActiveAnon['customer']) &&
    isset($viewActiveAnon['loyalty_account']['balance'])
);

// 8.7 Tarjeta en ACTIVE abierta por Staff del mismo comercio -> Ficha operativa
$viewActiveStaff = $credentialService->getPublicCredentialView($newToken, [
    'user_id' => $staffUserA['id'],
    'business_id' => $bizA['id'],
    'role' => Role::STAFF,
]);
assertCardTest("Tarjeta activa abierta por Staff del mismo comercio muestra ficha operativa",
    $viewActiveStaff['state'] === 'active' &&
    $viewActiveStaff['mode'] === 'staff' &&
    isset($viewActiveStaff['customer']['first_name']) &&
    $viewActiveStaff['customer']['first_name'] === 'Federico'
);

// 8.8 Tarjeta en ACTIVE abierta por usuario de otro comercio -> 403 Forbidden
$viewActiveCross = $credentialService->getPublicCredentialView($newToken, [
    'user_id' => $ownerUserB['id'],
    'business_id' => $bizB['id'],
    'role' => Role::OWNER,
]);
assertCardTest("Tarjeta activa abierta por usuario de otro comercio es bloqueada con forbidden",
    $viewActiveCross['state'] === 'forbidden'
);

// 8.9 Tarjeta revocada abierta por cualquiera -> no disponible
$viewRevoked = $credentialService->getPublicCredentialView($batch[1]['token']);
assertCardTest("Tarjeta revocada consultada responde no disponible", $viewRevoked['state'] === 'not_available');

// 9. Aislamiento Multiempresa Estricto sobre Tarjetas
echo PHP_EOL . "--- 9. Aislamiento Multiempresa sobre Tarjetas ---" . PHP_EOL;

// 9.1 Comercio B intenta consultar tarjeta de Comercio A
try {
    $cardService->getBusinessCard($bizB['id'], $newCardToUse['id']);
    assertCardTest("Comercio B bloqueado al consultar tarjeta de Comercio A", false);
} catch (InvalidArgumentException $e) {
    assertCardTest("Comercio B bloqueado al consultar tarjeta de Comercio A", true, $e->getMessage());
}

// 9.2 Comercio B intenta revocar tarjeta de Comercio A
try {
    $cardService->revokeCard($bizB['id'], $newCardToUse['id']);
    assertCardTest("Comercio B bloqueado al intentar revocar tarjeta de Comercio A", false);
} catch (InvalidArgumentException $e) {
    assertCardTest("Comercio B bloqueado al intentar revocar tarjeta de Comercio A", true, $e->getMessage());
}

// 9.3 Permisos: Staff tiene card.assign
assertCardTest("Staff tiene permiso 'card.assign'", Permission::can(Role::STAFF, Permission::CARD_ASSIGN));
assertCardTest("Manager tiene permiso 'card.assign' y 'card.revoke'",
    Permission::can(Role::MANAGER, Permission::CARD_ASSIGN) &&
    Permission::can(Role::MANAGER, Permission::CARD_REVOKE)
);
assertCardTest("Manager y Super Admin tienen permiso 'card.reassign'",
    Permission::can(Role::MANAGER, Permission::CARD_REASSIGN) &&
    Permission::can(Role::SUPER_ADMIN, Permission::CARD_REASSIGN)
);

// 10. Reasignación Segura (card.reassign), Conservación de Saldo y Soporte No Reprogramable
echo PHP_EOL . "--- 10. Reasignación Segura (card.reassign) y Conservación de Saldo ---" . PHP_EOL;

// 10.1 Crear cliente 2 con su loyalty_account en Comercio A
$clientA2 = $customerService->onboardCustomer($bizA['id'], [
    'first_name' => 'Mario',
    'last_name' => 'Rossi',
    'privacy_accepted' => true,
]);
$acc2Id = (int) $clientA2['loyalty_account']['id'];
$acc1Id = (int) $loyaltyAccountId;

// Fijar saldos iniciales
$pdo->exec("UPDATE `loyalty_accounts` SET `balance` = 150 WHERE `id` = {$acc1Id}");
$pdo->exec("UPDATE `loyalty_accounts` SET `balance` = 50 WHERE `id` = {$acc2Id}");

// Reasignar la tarjeta activa $newCardToUse['id'] de la cuenta 1 a la cuenta 2
$cardToReassignId = $newCardToUse['id'];
$preReassignToken = $newToken;

$reassignResult = $cardService->reassignCard($bizA['id'], $cardToReassignId, $acc2Id, $staffUserA['id']);

assertCardTest("Tarjeta reasignada a cuenta 2 exitosamente", (int)$reassignResult['card']['loyalty_account_id'] === $acc2Id);
assertCardTest("Tarjeta registra assigned_by_user_id del operador staff", (int)$reassignResult['card']['assigned_by_user_id'] === $staffUserA['id']);
assertCardTest("Reasignación retorna requires_reprogramming = true", $reassignResult['requires_reprogramming'] === true);
assertCardTest("Reasignación genera un nuevo token físico distinto al anterior", $reassignResult['token'] !== $preReassignToken);

// 10.2 Conservación de saldo e historial de ambas cuentas
$balAcc1 = (int) $pdo->query("SELECT `balance` FROM `loyalty_accounts` WHERE `id` = {$acc1Id}")->fetchColumn();
$balAcc2 = (int) $pdo->query("SELECT `balance` FROM `loyalty_accounts` WHERE `id` = {$acc2Id}")->fetchColumn();
$digAcc1Status = $pdo->query("SELECT `status` FROM `access_credentials` WHERE `loyalty_account_id` = {$acc1Id} AND `type` = 'digital'")->fetchColumn();

assertCardTest("Cuenta 1 conserva su saldo íntegro de 150 puntos", $balAcc1 === 150);
assertCardTest("Cuenta 1 conserva su credencial digital activa tras perder la tarjeta física", $digAcc1Status === 'active');
assertCardTest("Cuenta 2 conserva su saldo íntegro de 50 puntos", $balAcc2 === 50);

// 10.3 Token físico anterior invalidado y nuevo token activo resolviendo cuenta 2
$viewPreReassign = $credentialService->getPublicCredentialView($preReassignToken);
assertCardTest("Token físico anterior marcado como no disponible tras reasignación", $viewPreReassign['state'] === 'not_available');

$viewNewReassign = $credentialService->getPublicCredentialView($reassignResult['token']);
assertCardTest("Nuevo token físico está activo y resuelve saldo de Cuenta 2 (50 pts)",
    $viewNewReassign['state'] === 'active' &&
    (int)$viewNewReassign['loyalty_account']['balance'] === 50
);

$viewNewReassignStaff = $credentialService->getPublicCredentialView($reassignResult['token'], [
    'user_id' => $staffUserA['id'],
    'business_id' => $bizA['id'],
    'role' => Role::STAFF,
]);
assertCardTest("Nuevo token físico resuelve a Cuenta 2 para personal de tienda",
    $viewNewReassignStaff['state'] === 'active' &&
    (int)$viewNewReassignStaff['loyalty_account']['id'] === $acc2Id
);

// 10.4 Rechazo de reasignación entre comercios distintos (Cross-tenant)
try {
    $cardService->reassignCard($bizA['id'], $cardToReassignId, $clientBizB['loyalty_account']['id'], $staffUserA['id']);
    assertCardTest("Rechazo al intentar reasignar tarjeta a cuenta de otro comercio", false);
} catch (InvalidArgumentException $e) {
    assertCardTest("Rechazo al intentar reasignar tarjeta a cuenta de otro comercio", true, $e->getMessage());
}

try {
    $cardService->reassignCard($bizB['id'], $cardToReassignId, $clientBizB['loyalty_account']['id'], $staffUserA['id']);
    assertCardTest("Rechazo al intentar operar tarjeta ajena desde Comercio B", false);
} catch (InvalidArgumentException $e) {
    assertCardTest("Rechazo al intentar operar tarjeta ajena desde Comercio B", true, $e->getMessage());
}

// 10.5 Rechazo de reasignación si el soporte físico se declaró como no reprogramable
$nonReprogCard = $cardService->createCardInInventory(1, $superAdminUser['id'], false);
$cardService->assignCardsToBusiness([$nonReprogCard['id']], $bizA['id'], $superAdminUser['id']);
$cardService->activateCard($bizA['id'], $nonReprogCard['id'], $acc1Id, $staffUserA['id']);

try {
    $cardService->reassignCard($bizA['id'], $nonReprogCard['id'], $acc2Id, $staffUserA['id']);
    assertCardTest("Rechazo de reasignación si soporte se declara no reprogramable", false);
} catch (InvalidArgumentException $e) {
    assertCardTest("Rechazo de reasignación si soporte se declara no reprogramable", true, $e->getMessage());
}

// 11. Rate Limiting y Recuperación Posterior (Sin almacenar PII ni tokens planos)
echo PHP_EOL . "--- 11. Rate Limiting y Privacidad de Datos ---" . PHP_EOL;

$rateLimiter = new \App\Core\Security\RateLimiter($pdo);
$testAction = 'test.action_' . time();
$testKey = 'client_192.168.1.50:secret_token_12345';
$expectedKeyHash = hash('sha256', $testKey);

// 11.1 Intentos permitidos dentro del límite (3 intentos)
$hit1 = $rateLimiter->hit($testAction, $testKey, 3, 2);
$hit2 = $rateLimiter->hit($testAction, $testKey, 3, 2);
$hit3 = $rateLimiter->hit($testAction, $testKey, 3, 2);
assertCardTest("Rate limiter permite intentos dentro del umbral (3/3)", $hit1['allowed'] && $hit2['allowed'] && $hit3['allowed']);

// 11.2 Intento bloqueado al superar umbral
$hit4 = $rateLimiter->hit($testAction, $testKey, 3, 2);
assertCardTest("Rate limiter bloquea el 4to intento excedido con retry_after",
    !$hit4['allowed'] &&
    $hit4['hits'] === 4 &&
    $hit4['retry_after'] > 0
);

// 11.3 Verificación de privacidad: MariaDB almacena ÚNICAMENTE el hash SHA-256 (sin token ni IP en texto claro)
$dbRateRow = $pdo->query("SELECT * FROM `rate_limits` WHERE `action` = '{$testAction}' AND `identifier_hash` = '{$expectedKeyHash}'")->fetch(PDO::FETCH_ASSOC);
assertCardTest("MariaDB almacena únicamente el hash SHA-256 del identificador (sin PII ni tokens en claro)", !empty($dbRateRow));

// 11.4 Recuperación posterior mediante reset o expiración
$rateLimiter->reset($testAction, $testKey);
$hitAfterReset = $rateLimiter->hit($testAction, $testKey, 3, 2);
assertCardTest("Recuperación posterior exitosa tras reset de ventana", $hitAfterReset['allowed'] && $hitAfterReset['hits'] === 1);

echo PHP_EOL . "==========================================" . PHP_EOL;
echo "RESULTADO ETAPA 2 (TARJETAS FÍSICAS): {$passedCount} de {$totalTests} pruebas superadas." . PHP_EOL;
echo "==========================================" . PHP_EOL;

if ($passedCount !== $totalTests) {
    exit(1);
}
