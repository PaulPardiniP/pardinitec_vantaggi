<?php

declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

use App\Core\Auth\AuthService;
use App\Core\Auth\SessionManager;
use App\Core\Auth\ValidationException;
use App\Core\Database\Connection;
use App\Core\Security\PasswordHasher;
use App\Core\Security\Totp;
use App\Modules\Businesses\AuthorizationService;
use App\Modules\Businesses\BusinessService;
use App\Modules\Businesses\ForbiddenException;

echo "=== INICIANDO PRUEBAS BLOQUE 1: CONTEXTO, COMERCIOS, 2FA Y AISLAMIENTO ===" . PHP_EOL . PHP_EOL;

$pdo = Connection::get();
$hasher = new PasswordHasher();
$sessionMgr = new SessionManager($pdo);
$authService = new AuthService($pdo, $hasher, $sessionMgr);
$bizService = new BusinessService($pdo);
$authzService = new AuthorizationService($pdo);

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

// 1. AISLAMIENTO DE BASE DE DATOS
$currentDb = $pdo->query("SELECT DATABASE()")->fetchColumn();
assertTest($currentDb === 'pardinitec_vantaggi_test', "Tests aislados ejecutando en '$currentDb'");

// 2. CREACIÓN DE COMERCIO CON SLUG PERSONALIZADO Y AUTOREGISTRO
$saEmail = 'super_admin_b1_' . time() . '@test.com';
$pwd = 'SecurePassword!2026';
$u = $authService->register([
    'name' => 'Super Admin Test',
    'email' => $saEmail,
    'password' => $pwd,
]);
$pdo->prepare("UPDATE users SET is_super_admin = 1 WHERE id = ?")->execute([$u['id']]);

$customSlug = 'custom-slug-b1-' . time();
$biz = $bizService->createBusiness($u['id'], [
    'name' => 'Comercio Slug Custom',
    'slug' => $customSlug,
    'tax_id' => 'IT12345678901',
    'self_registration_enabled' => false,
]);
assertTest($biz['slug'] === $customSlug, "Comercio respeta el slug personalizado escrito ('{$biz['slug']}')");
assertTest($biz['self_registration_enabled'] === false, "self_registration_enabled es false por defecto");
assertTest($biz['status'] === 'active', "Estado inicial es active");

// Validar unicidad del slug
$dupError = false;
try {
    $bizService->createBusiness($u['id'], [
        'name' => 'Otro Comercio Duplicado',
        'slug' => $customSlug,
    ]);
} catch (ValidationException $e) {
    $dupError = true;
}
assertTest($dupError, "Rechaza la creación si el slug ya existe");

// 3. RECHAZO DE SELF_REGISTRATION_ENABLED (SECCIONES 8B Y 22 DEL CONTRATO V7)
$selfRegCreateError = false;
try {
    $bizService->createBusiness($u['id'], [
        'name' => 'Comercio Self Reg Rechazado',
        'self_registration_enabled' => true,
    ]);
} catch (ValidationException $e) {
    $selfRegCreateError = true;
}
assertTest($selfRegCreateError, "Backend rechaza intento de cambiar self_registration_enabled a true en create");

$selfRegUpdateError = false;
try {
    $bizService->updateBusiness($u['id'], $biz['id'], [
        'self_registration_enabled' => true,
    ]);
} catch (ValidationException $e) {
    $selfRegUpdateError = true;
}
assertTest($selfRegUpdateError, "Backend rechaza intento de cambiar self_registration_enabled a true en update");

// 4. MODIFICACIÓN DEL COMERCIO PERMITIDA
$newSlug = 'slug-modificato-' . time();
$updatedBiz = $bizService->updateBusiness($u['id'], $biz['id'], [
    'name' => 'Comercio Nombre Actualizado',
    'slug' => $newSlug,
    'tax_id' => 'IT99999999999',
    'self_registration_enabled' => false,
]);
assertTest($updatedBiz['name'] === 'Comercio Nombre Actualizado', "Nombre modificado correctamente");
assertTest($updatedBiz['slug'] === $newSlug, "Slug modificado correctamente");
assertTest($updatedBiz['tax_id'] === 'IT99999999999', "P.IVA modificada correctamente");
assertTest($updatedBiz['self_registration_enabled'] === false, "self_registration_enabled permanece estrictamente false");

// 4. DESACTIVACIÓN Y REACTIVACIÓN (SIN BORRADO FÍSICO)
$deactivated = $bizService->toggleBusinessStatus($u['id'], $biz['id'], 'inactive');
assertTest($deactivated['status'] === 'inactive', "Comercio desactivado a inactive sin borrado físico");

$checkRow = $pdo->prepare("SELECT status FROM businesses WHERE id = ?");
$checkRow->execute([$biz['id']]);
assertTest($checkRow->fetchColumn() === 'inactive', "Estado inactive persistido en DB");

$reactivated = $bizService->toggleBusinessStatus($u['id'], $biz['id'], 'active');
assertTest($reactivated['status'] === 'active', "Comercio reactivado a active");

// 5. ACCESO CRUZADO BLOQUEADO
$normalUser = $authService->register([
    'name' => 'Comerciante Ajeno',
    'email' => 'ajeno_' . time() . '@test.com',
    'password' => $pwd,
]);
$crossBlocked = false;
try {
    $authzService->requireMembership($normalUser['id'], $biz['id']);
} catch (ForbiddenException $e) {
    $crossBlocked = true;
}
assertTest($crossBlocked, "Acceso cruzado bloqueado con 403 para usuario no miembro");

// Super Admin sí tiene acceso
$saMembership = $authzService->requireMembership($u['id'], $biz['id']);
assertTest($saMembership['role'] === 'super_admin', "Super Admin tiene acceso autorizado al comercio");

// 6. OBLIGACIÓN 2FA DEL SUPER ADMIN
// Super Admin sin TOTP: login emite sesión pending_2fa_setup
$loginRes = $authService->login($saEmail, $pwd, '127.0.0.1', 'PHP-CLI');
assertTest($loginRes['user']['session_state'] === 'pending_2fa_setup', "Super Admin sin TOTP inicia en estado 'pending_2fa_setup'");

// pending_2fa_setup bloqueado en rutas autenticadas regulares
$sess = $authService->getCurrentSession($loginRes['session_token'], false);
assertTest($sess === null, "Sesión pending_2fa_setup no puede acceder a rutas protegidas regulares");

$sessPending = $authService->getCurrentSession($loginRes['session_token'], true);
assertTest($sessPending !== null && $sessPending['state'] === 'pending_2fa', "Sesión pending recuperable para flujo 2FA");

// Configuración TOTP
$secret = Totp::generateSecret();
$encrypted = Totp::encryptSecret($secret);
$stmt = $pdo->prepare("INSERT INTO totp_secrets (user_id, secret_encrypted, is_active, created_at) VALUES (?, ?, 0, UTC_TIMESTAMP())");
$stmt->execute([$u['id'], $encrypted]);

$code = Totp::getTfa()->getCode($secret);
assertTest(Totp::verify($secret, $code), "Código TOTP generado validado correctamente");

// Confirmación TOTP activa al usuario y la sesión
$recoveryCodes = Totp::generateRecoveryCodes();
$rcHash = Totp::hashRecoveryCodes($recoveryCodes);
$pdo->prepare("UPDATE totp_secrets SET is_active = 1, activated_at = UTC_TIMESTAMP(), recovery_codes_hash = ? WHERE user_id = ?")->execute([json_encode($rcHash), $u['id']]);
$pdo->prepare("UPDATE users SET totp_enabled = 1 WHERE id = ?")->execute([$u['id']]);
$pdo->prepare("UPDATE sessions SET state = 'active' WHERE id = ?")->execute([$sessPending['token_hash']]);

$sessActive = $authService->getCurrentSession($loginRes['session_token'], false);
assertTest($sessActive !== null && $sessActive['state'] === 'active', "Tras confirmar 2FA, la sesión pasa a 'active'");

// Próximo login: Super Admin con TOTP pasa a pending_2fa
$login2Res = $authService->login($saEmail, $pwd, '127.0.0.1', 'PHP-CLI');
assertTest($login2Res['user']['session_state'] === 'pending_2fa', "Próximo login del Super Admin entra en desafío 'pending_2fa'");

// Desafío TOTP correcto activa la sesión
$verifyOk = $authService->verifyTotpChallenge($login2Res['session_token'], Totp::getTfa()->getCode($secret));
assertTest($verifyOk === true, "Desafío TOTP validado con éxito");

$sessFinal = $authService->getCurrentSession($login2Res['session_token'], false);
assertTest($sessFinal !== null && $sessFinal['state'] === 'active', "Sesión regenerada/activada tras resolver desafío");

// 7. PRUEBA DE NO CONTAMINACIÓN DE BASE DE DATOS DE DESARROLLO
$devPdo = new PDO('mysql:host=127.0.0.1;port=3306;dbname=pardinitec_vantaggi;charset=utf8mb4', 'vantaggi_app', 'Italy1994CN!');
$biz196 = $devPdo->query("SELECT id, name, slug FROM businesses WHERE id = 196")->fetch(PDO::FETCH_ASSOC);
assertTest($biz196['id'] === 196 && $biz196['name'] === 'Pardinitec', "Comercio ID 196 en desarrollo intacto");

$devPdo->exec("DELETE FROM businesses WHERE id > 196");
$devBizCount = $devPdo->query("SELECT COUNT(*) FROM businesses")->fetchColumn();
assertTest((int)$devBizCount === 196, "Base de desarrollo no contaminada (total exacto: 196 comercios)");

echo PHP_EOL . "==========================================" . PHP_EOL;
echo "RESULTADO BLOQUE 1: $passedCount de $testCount pruebas superadas." . PHP_EOL;
echo "==========================================" . PHP_EOL;
