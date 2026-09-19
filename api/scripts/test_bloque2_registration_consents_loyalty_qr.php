<?php

declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

use App\Core\Auth\AuthService;
use App\Core\Auth\SessionManager;
use App\Core\Auth\ValidationException;
use App\Core\Database\Connection;
use App\Core\Audit\AuditLogger;
use App\Core\Security\PasswordHasher;
use App\Modules\AccessCredentials\CredentialService;
use App\Modules\Businesses\AuthorizationService;
use App\Modules\Businesses\BusinessService;
use App\Modules\Businesses\ForbiddenException;
use App\Modules\Cards\PublicCardController;
use App\Modules\Customers\CustomerService;
use App\Modules\Loyalty\LoyaltyService;

echo "=== INICIANDO PRUEBAS BLOQUE 2: REGISTRO PRESENCIAL, CONSENTIMIENTOS, PERFILES Y CREDENCIAL DIGITAL ===" . PHP_EOL . PHP_EOL;

$pdo = Connection::get();
$hasher = new PasswordHasher();
$sessionMgr = new SessionManager($pdo);
$authService = new AuthService($pdo, $hasher, $sessionMgr);
$bizService = new BusinessService($pdo);
$authzService = new AuthorizationService($pdo);
$auditLogger = new AuditLogger($pdo);
$loyaltyService = new LoyaltyService($pdo);
$credService = new CredentialService($pdo);
$customerService = new CustomerService($pdo, $loyaltyService, $credService, $auditLogger);

$testCount = 0;
$passedCount = 0;

function assertTest(bool $condition, string $msg): void {
    global $testCount, $passedCount;
    $testCount++;
    if ($condition) {
        $passedCount++;
        echo " [OK] " . $msg . PHP_EOL;
    } else {
        echo " [FAIL] " . $msg . PHP_EOL;
    }
}

// 0. AISLAMIENTO DE BASE DE DATOS
$currentDb = $pdo->query("SELECT DATABASE()")->fetchColumn();
assertTest($currentDb === 'pardinitec_vantaggi_test', "Tests aislados ejecutando exclusivamente en '$currentDb'");

// Setup: Crear dos comercios aislados (Biz A y Biz B)
$ownerEmail = 'owner_b2_' . time() . '@test.com';
$owner = $authService->register([
    'name' => 'Owner Bloque 2',
    'email' => $ownerEmail,
    'password' => 'SecurePass!2026',
]);
$pdo->prepare("UPDATE users SET is_super_admin = 1 WHERE id = ?")->execute([$owner['id']]);

$bizA = $bizService->createBusiness($owner['id'], [
    'name' => 'Negocio Alfa B2',
    'slug' => 'negocio-alfa-b2-' . time(),
    'tax_id' => 'IT11111111111',
    'self_registration_enabled' => false,
]);
$bizB = $bizService->createBusiness($owner['id'], [
    'name' => 'Negocio Beta B2',
    'slug' => 'negocio-beta-b2-' . time(),
    'tax_id' => 'IT22222222222',
    'self_registration_enabled' => false,
]);

$bizAId = (int) $bizA['id'];
$bizBId = (int) $bizB['id'];

// Obtener IDs de perfiles sembrados
$profiles = $loyaltyService->listProfiles();
$profilesMap = [];
foreach ($profiles as $p) {
    $profilesMap[$p['code']] = (int) $p['id'];
}
assertTest(isset($profilesMap['punti'], $profilesMap['vantaggi'], $profilesMap['vip']), "Perfiles punti, vantaggi y vip disponibles en la base");

echo PHP_EOL . "--- PRUEBA 1: REGISTRO PRESENCIAL CON DATOS MÍNIMOS (NOMBRE Y APELLIDO) ---" . PHP_EOL;
$res1 = $customerService->onboardCustomer($bizAId, [
    'first_name' => 'Mario',
    'last_name' => 'Rossi',
    'privacy_accepted' => true,
    'card_profile_id' => $profilesMap['punti'],
], $owner['id']);

assertTest(!empty($res1['customer']['id']), "Cliente creado con datos mínimos (ID: {$res1['customer']['id']})");
assertTest($res1['customer']['first_name'] === 'Mario' && $res1['customer']['last_name'] === 'Rossi', "Nombre y apellido guardados correctamente");
assertTest($res1['customer']['phone'] === null, "Teléfono es null cuando no se provee");
assertTest($res1['customer']['email'] === null, "Email es null cuando no se provee");

echo PHP_EOL . "--- PRUEBA 2: REGISTRO PRESENCIAL CON TELÉFONO VÁLIDO ---" . PHP_EOL;
$res2 = $customerService->onboardCustomer($bizAId, [
    'first_name' => 'Giuseppe',
    'last_name' => 'Verdi',
    'phone' => '+39 340 1234567',
    'privacy_accepted' => true,
    'card_profile_id' => $profilesMap['vantaggi'],
], $owner['id']);
assertTest($res2['customer']['phone'] === '+39 340 1234567', "Teléfono registrado correctamente");

echo PHP_EOL . "--- PRUEBA 3: REGISTRO PRESENCIAL CON EMAIL VÁLIDO ---" . PHP_EOL;
$res3 = $customerService->onboardCustomer($bizAId, [
    'first_name' => 'Laura',
    'last_name' => 'Bianchi',
    'email' => 'laura.bianchi@test.it',
    'privacy_accepted' => true,
    'card_profile_id' => $profilesMap['vip'],
], $owner['id']);
assertTest($res3['customer']['email'] === 'laura.bianchi@test.it', "Email registrado correctamente");

echo PHP_EOL . "--- PRUEBA 4: RECHAZO CUANDO FALTA NOMBRE O APELLIDO ---" . PHP_EOL;
$validationErr = false;
try {
    $customerService->onboardCustomer($bizAId, [
        'first_name' => '',
        'last_name' => 'Solari',
        'privacy_accepted' => true,
    ], $owner['id']);
} catch (ValidationException $e) {
    $validationErr = true;
}
assertTest($validationErr, "Rechaza registro presencial con nombre vacío");

$validationErr2 = false;
try {
    $customerService->onboardCustomer($bizAId, [
        'first_name' => 'Enrico',
        'last_name' => '',
        'privacy_accepted' => true,
    ], $owner['id']);
} catch (ValidationException $e) {
    $validationErr2 = true;
}
assertTest($validationErr2, "Rechaza registro presencial con apellido vacío");

echo PHP_EOL . "--- PRUEBA 5: RECHAZO CUANDO NO SE ACEPTA EL CONSENTIMIENTO DE PRIVACIDAD ---" . PHP_EOL;
$privacyErr = false;
try {
    $customerService->onboardCustomer($bizAId, [
        'first_name' => 'Francesca',
        'last_name' => 'Romano',
        'privacy_accepted' => false,
    ], $owner['id']);
} catch (ValidationException $e) {
    $privacyErr = true;
}
assertTest($privacyErr, "Rechaza alta presencial si privacy_accepted es false o ausente");

echo PHP_EOL . "--- PRUEBA 6: ACEPTACIÓN DE PRIVACIDAD EN TABLA CANÓNICA 'consents' ---" . PHP_EOL;
$stmtConsent = $pdo->prepare("
    SELECT type, status, granted_at, revoked_at 
    FROM consents 
    WHERE customer_id = ? AND business_id = ? AND type = 'privacy'
");
$stmtConsent->execute([$res1['customer']['id'], $bizAId]);
$consentRow = $stmtConsent->fetch(PDO::FETCH_ASSOC);
assertTest($consentRow !== false, "Registro de consentimiento de privacidad existe en tabla canónica consents");
assertTest($consentRow['status'] === 'granted', "Estado de privacidad es 'granted'");
assertTest(!empty($consentRow['granted_at']), "granted_at tiene timestamp válido");
assertTest($consentRow['revoked_at'] === null, "revoked_at es null para privacidad activa");

echo PHP_EOL . "--- PRUEBA 7: CONSENTIMIENTO MARKETING OPCIONAL NO MARCADO POR DEFECTO ---" . PHP_EOL;
$stmtMkt = $pdo->prepare("
    SELECT id, status FROM consents 
    WHERE customer_id = ? AND business_id = ? AND type = 'marketing'
");
$stmtMkt->execute([$res1['customer']['id'], $bizAId]);
$mktRow = $stmtMkt->fetch(PDO::FETCH_ASSOC);
assertTest($mktRow === false, "Cliente sin marketing voluntario NO tiene registro de marketing concedido");
assertTest($res1['consents']['marketing'] === 'not_granted', "Respuesta de onboarding indica marketing 'not_granted'");

echo PHP_EOL . "--- PRUEBA 8: CONSENTIMIENTO DE MARKETING OTORGADO VOLUNTARIAMENTE ---" . PHP_EOL;
$resMkt = $customerService->onboardCustomer($bizAId, [
    'first_name' => 'Luca',
    'last_name' => 'Conti',
    'privacy_accepted' => true,
    'marketing_accepted' => true,
    'card_profile_id' => $profilesMap['punti'],
], $owner['id']);
$stmtMktGrant = $pdo->prepare("
    SELECT type, status, granted_at, revoked_at 
    FROM consents 
    WHERE customer_id = ? AND business_id = ? AND type = 'marketing'
");
$stmtMktGrant->execute([$resMkt['customer']['id'], $bizAId]);
$mktGrantRow = $stmtMktGrant->fetch(PDO::FETCH_ASSOC);
assertTest($mktGrantRow !== false && $mktGrantRow['status'] === 'granted', "Marketing registrado como 'granted' en consents");
assertTest(!empty($mktGrantRow['granted_at']), "Marketing granted_at registrado con éxito");

echo PHP_EOL . "--- PRUEBA 9: REVOCACIÓN DE CONSENTIMIENTO MARKETING ---" . PHP_EOL;
$customerService->revokeMarketingConsent($bizAId, $resMkt['customer']['id']);
$stmtMktRevoked = $pdo->prepare("
    SELECT type, status, revoked_at 
    FROM consents 
    WHERE customer_id = ? AND business_id = ? AND type = 'marketing'
    ORDER BY id DESC LIMIT 1
");
$stmtMktRevoked->execute([$resMkt['customer']['id'], $bizAId]);
$mktRevRow = $stmtMktRevoked->fetch(PDO::FETCH_ASSOC);
assertTest($mktRevRow['status'] === 'revoked' && !empty($mktRevRow['revoked_at']), "Consentimiento de marketing revocado exitosamente con revoked_at");

// Verificar que la privacidad sigue intacta
$stmtPrivStill = $pdo->prepare("SELECT status FROM consents WHERE customer_id = ? AND type = 'privacy'");
$stmtPrivStill->execute([$resMkt['customer']['id']]);
assertTest($stmtPrivStill->fetchColumn() === 'granted', "Privacidad permanece granted tras revocar marketing");

// Verificar que el cliente no fue borrado
$stmtCustStill = $pdo->prepare("SELECT id FROM customers WHERE id = ?");
$stmtCustStill->execute([$resMkt['customer']['id']]);
assertTest((int) $stmtCustStill->fetchColumn() === $resMkt['customer']['id'], "Cliente no fue borrado tras revocar marketing");

echo PHP_EOL . "--- PRUEBA 10: ALTA CON PERFIL PUNTI CREANDO LOYALTY_ACCOUNT CON BALANCE 0 ---" . PHP_EOL;
$resPunti = $customerService->onboardCustomer($bizAId, [
    'first_name' => 'Paolo',
    'last_name' => 'Galli',
    'privacy_accepted' => true,
    'card_profile_id' => $profilesMap['punti'],
], $owner['id']);
assertTest($resPunti['loyalty_account']['profile_code'] === 'punti', "Perfil de cuenta es 'punti'");
assertTest((int) $resPunti['loyalty_account']['balance'] === 0, "Balance inicial es exactamente 0");
assertTest($resPunti['loyalty_account']['status'] === 'active', "Estado de cuenta es 'active'");

echo PHP_EOL . "--- PRUEBA 11: ALTA CON PERFIL VANTAGGI CREANDO LOYALTY_ACCOUNT INDEPENDIENTE ---" . PHP_EOL;
$resVantaggi = $customerService->onboardCustomer($bizAId, [
    'first_name' => 'Sara',
    'last_name' => 'Costa',
    'privacy_accepted' => true,
    'card_profile_id' => $profilesMap['vantaggi'],
], $owner['id']);
assertTest($resVantaggi['loyalty_account']['profile_code'] === 'vantaggi', "Perfil creado es independiente 'vantaggi'");

echo PHP_EOL . "--- PRUEBA 12: ALTA CON PERFIL VIP CREANDO LOYALTY_ACCOUNT INDEPENDIENTE ---" . PHP_EOL;
$resVip = $customerService->onboardCustomer($bizAId, [
    'first_name' => 'Claudio',
    'last_name' => 'Martini',
    'privacy_accepted' => true,
    'card_profile_id' => $profilesMap['vip'],
], $owner['id']);
assertTest($resVip['loyalty_account']['profile_code'] === 'vip', "Perfil creado es independiente 'vip'");

echo PHP_EOL . "--- PRUEBA 13: CLIENTE PUNTI AL QUE SE LE AÑADE PERFIL VIP SIN DUPLICAR CUSTOMER ---" . PHP_EOL;
$custPuntiId = $resPunti['customer']['id'];
$newAccRes = $customerService->addAccountToCustomer($bizAId, $custPuntiId, 'vip', $owner['id']);
assertTest($newAccRes['loyalty_account']['profile_code'] === 'vip', "Nuevo perfil VIP añadido al cliente existente");
assertTest(!empty($newAccRes['token']), "Nueva credencial digital emitida para la cuenta VIP");

// Verificar en DB que el cliente no fue duplicado
$stmtCountCust = $pdo->prepare("SELECT COUNT(*) FROM customers WHERE id = ?");
$stmtCountCust->execute([$custPuntiId]);
assertTest((int) $stmtCountCust->fetchColumn() === 1, "Cliente único en customers");

// Verificar que el cliente tiene exactamente 2 cuentas en DB
$stmtAccounts = $pdo->prepare("SELECT cp.code, la.balance FROM loyalty_accounts la JOIN card_profiles cp ON la.card_profile_id = cp.id WHERE la.customer_id = ?");
$stmtAccounts->execute([$custPuntiId]);
$customerAccounts = $stmtAccounts->fetchAll(PDO::FETCH_KEY_PAIR);
assertTest(isset($customerAccounts['punti']) && isset($customerAccounts['vip']), "Cliente posee simultáneamente cuentas punti y vip");
assertTest(count($customerAccounts) === 2, "Cliente posee exactamente 2 cuentas independientes");

echo PHP_EOL . "--- PRUEBA 14: INTENTO DE AÑADIR UN SEGUNDO PERFIL IDÉNTICO RECHAZADO ---" . PHP_EOL;
$dupProfileErr = false;
try {
    $customerService->addAccountToCustomer($bizAId, $custPuntiId, 'punti', $owner['id']);
} catch (InvalidArgumentException $e) {
    $dupProfileErr = true;
}
assertTest($dupProfileErr, "Rechaza creación de un segundo perfil idéntico (punti) para el mismo cliente");

echo PHP_EOL . "--- PRUEBA 15: EMISIÓN DE CREDENCIAL DIGITAL - TOKEN PLANO ENTREGADO POR ÚNICA VEZ ---" . PHP_EOL;
$token = $resPunti['token'];
assertTest(is_string($token) && strlen($token) === 64 && ctype_xdigit($token), "Token plano es un hash hex de 64 caracteres (32 bytes entropía)");
assertTest(strpos($resPunti['public_url'], "/c/{$token}") !== false, "URL pública generada contiene el token: {$resPunti['public_url']}");

echo PHP_EOL . "--- PRUEBA 16: ALMACENAMIENTO SEGURO - SHA-256 EN DB, TOKEN PLANO NUNCA PERSISTIDO ---" . PHP_EOL;
$expectedHash = hash('sha256', $token);
$stmtCredDb = $pdo->prepare("SELECT id, public_token_hash FROM access_credentials WHERE id = ?");
$stmtCredDb->execute([$resPunti['access_credential']['id']]);
$credDbRow = $stmtCredDb->fetch(PDO::FETCH_ASSOC);
assertTest($credDbRow['public_token_hash'] === $expectedHash, "MariaDB almacena únicamente el hash SHA-256");

// Buscar si el token plano existe en cualquier columna de access_credentials
$stmtSearchRaw = $pdo->prepare("SELECT COUNT(*) FROM access_credentials WHERE public_token_hash = ?");
$stmtSearchRaw->execute([$token]);
assertTest((int) $stmtSearchRaw->fetchColumn() === 0, "MariaDB NO contiene el token en texto plano");

echo PHP_EOL . "--- PRUEBA 17: RESOLUCIÓN PÚBLICA DE CREDENCIAL (/c/{token}) CON CERO PII ---" . PHP_EOL;
$publicView = $credService->getPublicCredentialView($token, null);
assertTest($publicView !== null, "Resolución pública de /c/{token} exitosa");
assertTest($publicView['state'] === 'active' && $publicView['mode'] === 'public', "Modo público activo");
assertTest(isset($publicView['business']['name']), "Incluye nombre del comercio ('{$publicView['business']['name']}')");
assertTest(isset($publicView['loyalty_account']['profile_code']), "Incluye código de perfil ('{$publicView['loyalty_account']['profile_code']}')");
assertTest(isset($publicView['loyalty_account']['balance']), "Incluye saldo de puntos");

// Verificación estricta de CERO PII
assertTest(!isset($publicView['customer']), "Cero PII: clave 'customer' ausente en vista pública");
assertTest(!isset($publicView['customer_id']), "Cero PII: customer_id ausente en vista pública");
assertTest(!isset($publicView['first_name']) && !isset($publicView['last_name']), "Cero PII: nombre y apellido ausentes en vista pública");
assertTest(!isset($publicView['phone']) && !isset($publicView['email']), "Cero PII: teléfono y email ausentes en vista pública");

echo PHP_EOL . "--- PRUEBA 18: MÁXIMO UNA CREDENCIAL DIGITAL ACTIVA POR LOYALTY_ACCOUNT ---" . PHP_EOL;
$accIdPunti = (int) $resPunti['loyalty_account']['id'];
$rule8Err = false;
try {
    // Intento de emitir otra digital directamente sin rotar
    $credService->issueDigitalCredential($bizAId, $accIdPunti);
} catch (InvalidArgumentException $e) {
    $rule8Err = true;
}
assertTest($rule8Err, "Regla 8: Rechaza emisión de segunda credencial digital directa si ya existe una activa");

// Rotación de credencial sustituye la anterior
$rotated = $credService->rotateCredential($bizAId, (int) $resPunti['access_credential']['id']);
assertTest(!empty($rotated['token']) && $rotated['token'] !== $token, "Rotación emite un nuevo token plano de 64 hex");

$stmtOldCred = $pdo->prepare("SELECT status, revoked_at, replaced_by_credential_id FROM access_credentials WHERE id = ?");
$stmtOldCred->execute([$resPunti['access_credential']['id']]);
$oldCredRow = $stmtOldCred->fetch(PDO::FETCH_ASSOC);
assertTest($oldCredRow['status'] === 'replaced', "Credencial digital anterior marcada como 'replaced'");
assertTest(!empty($oldCredRow['revoked_at']), "Credencial anterior tiene revoked_at asignado");
assertTest((int) $oldCredRow['replaced_by_credential_id'] === (int) $rotated['id'], "Credencial anterior vinculada a la nueva vía replaced_by_credential_id");

// Verificar que la credencial vieja ya no da acceso público
$oldPublicView = $credService->getPublicCredentialView($token, null);
assertTest($oldPublicView['state'] === 'not_available', "Token anterior devuleve estado 'not_available' tras rotación");

echo PHP_EOL . "--- PRUEBA 19: AISLAMIENTO MULTI-TENANT ENTRE NEGOCIOS (403 / ERROR) ---" . PHP_EOL;
$custAlfaId = $res1['customer']['id'];
$crossBizError = false;
try {
    // Negocio B intenta ver al cliente de Negocio A
    $customerService->getCustomer($bizBId, $custAlfaId);
} catch (InvalidArgumentException $e) {
    $crossBizError = true;
}
assertTest($crossBizError, "Negocio B no puede consultar cliente de Negocio A (Aislamiento de lectura)");

$crossBizUpdateError = false;
try {
    // Negocio B intenta modificar al cliente de Negocio A
    $customerService->updateCustomer($bizBId, $custAlfaId, ['first_name' => 'Intruso']);
} catch (InvalidArgumentException $e) {
    $crossBizUpdateError = true;
}
assertTest($crossBizUpdateError, "Negocio B no puede modificar cliente de Negocio A (Aislamiento de escritura)");

$crossBizAccountError = false;
try {
    // Negocio B intenta añadir una cuenta al cliente de Negocio A
    $customerService->addAccountToCustomer($bizBId, $custAlfaId, 'vantaggi', $owner['id']);
} catch (InvalidArgumentException $e) {
    $crossBizAccountError = true;
}
assertTest($crossBizAccountError, "Negocio B no puede añadir cuenta a cliente de Negocio A");

// Observador autenticado de Biz B accediendo a credencial de Biz A
$crossPublicView = $credService->getPublicCredentialView($rotated['token'], [
    'user_id' => $owner['id'],
    'business_id' => $bizBId,
    'role' => 'staff',
    'is_super_admin' => false,
]);
assertTest($crossPublicView['state'] === 'forbidden' && $crossPublicView['mode'] === 'cross_tenant', "Staff de Negocio B recibe 403 (forbidden cross_tenant) al consultar tarjeta de Negocio A");

echo PHP_EOL . "--- PRUEBA 20: ATOMICIDAD EN BASE DE DATOS Y ROLLBACK COMPLETO EN CASO DE ERROR ---" . PHP_EOL;
$countCustBefore = (int) $pdo->query("SELECT COUNT(*) FROM customers")->fetchColumn();
$countConsentsBefore = (int) $pdo->query("SELECT COUNT(*) FROM consents")->fetchColumn();
$countAccountsBefore = (int) $pdo->query("SELECT COUNT(*) FROM loyalty_accounts")->fetchColumn();
$countCredsBefore = (int) $pdo->query("SELECT COUNT(*) FROM access_credentials")->fetchColumn();

$txFailed = false;
try {
    // Intentar alta con perfil inexistente para forzar fallo a mitad de transacción (después de insertar customer y consents)
    $customerService->onboardCustomer($bizAId, [
        'first_name' => 'Atómico',
        'last_name' => 'Rollback',
        'privacy_accepted' => true,
        'marketing_accepted' => true,
        'card_profile_id' => 9999999, // Perfil inexistente
    ], $owner['id']);
} catch (InvalidArgumentException $e) {
    $txFailed = true;
}
assertTest($txFailed, "Fallo forzado por perfil inválido durante transacción de onboarding");

$countCustAfter = (int) $pdo->query("SELECT COUNT(*) FROM customers")->fetchColumn();
$countConsentsAfter = (int) $pdo->query("SELECT COUNT(*) FROM consents")->fetchColumn();
$countAccountsAfter = (int) $pdo->query("SELECT COUNT(*) FROM loyalty_accounts")->fetchColumn();
$countCredsAfter = (int) $pdo->query("SELECT COUNT(*) FROM access_credentials")->fetchColumn();

assertTest($countCustBefore === $countCustAfter, "Rollback verificado: 0 clientes residuales en customers");
assertTest($countConsentsBefore === $countConsentsAfter, "Rollback verificado: 0 consentimientos residuales en consents");
assertTest($countAccountsBefore === $countAccountsAfter, "Rollback verificado: 0 cuentas residuales en loyalty_accounts");
assertTest($countCredsBefore === $countCredsAfter, "Rollback verificado: 0 credenciales residuales en access_credentials");

echo PHP_EOL . "==========================================" . PHP_EOL;
echo "RESULTADO BLOQUE 2: {$passedCount} de {$testCount} pruebas superadas." . PHP_EOL;
echo "==========================================" . PHP_EOL;

if ($passedCount !== $testCount) {
    exit(1);
}
