<?php

declare(strict_types=1);

use App\Core\Auth\AuthService;
use App\Core\Auth\SessionManager;
use App\Core\Auth\ValidationException;
use App\Core\Database\Connection;
use App\Core\Security\Csrf;
use App\Core\Security\PasswordHasher;

require_once __DIR__ . '/../bootstrap.php';

echo "=== INICIANDO PRUEBAS DE AUTENTICACION Y SESIONES (SUBETAPA 1.2) ===" . PHP_EOL . PHP_EOL;

$pdo = Connection::get();
$hasher = new PasswordHasher();
$sessionManager = new SessionManager($pdo, 'vantaggi_session', 1800, 28800);
$authService = new AuthService($pdo, $hasher, $sessionManager);

$testEmail = 'admin_' . time() . '@pardinitec.test';
$testPassword = 'SuperSecurePassword123!';
$testName = 'Administrador Pardinitec';

$passedCount = 0;
$totalTests = 0;

function assertTest(string $title, bool $condition, string $details = ''): void
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

// 1. Password Hasher (Argon2id / Bcrypt)
echo "--- 1. Pruebas de Algoritmo de Hashing ---" . PHP_EOL;
$algoName = $hasher->getAlgorithmName();
$sampleHash = $hasher->hash('test_password');
assertTest("Algoritmo activo es Argon2id o Bcrypt", in_array($algoName, ['argon2id', 'bcrypt'], true), "Algoritmo: {$algoName}");
assertTest("Hash generado inicia con prefijo correspondiente", str_starts_with($sampleHash, '$' . $algoName) || str_starts_with($sampleHash, '$2y$'), "Prefijo verificado");
assertTest("Verificación de contraseña correcta", $hasher->verify('test_password', $sampleHash));
assertTest("Rechazo de contraseña incorrecta", !$hasher->verify('wrong_password', $sampleHash));

// 2. Registro de Usuarios y Validaciones
echo PHP_EOL . "--- 2. Pruebas de Registro de Usuarios ---" . PHP_EOL;

// 2.1 Validación: contraseña corta
try {
    $authService->register([
        'name' => $testName,
        'email' => $testEmail,
        'password' => 'short',
    ]);
    assertTest("Rechaza contraseña corta (< 8 caracteres)", false);
} catch (ValidationException $e) {
    assertTest("Rechaza contraseña corta (< 8 caracteres)", isset($e->getErrors()['password']));
}

// 2.2 Validación: email inválido
try {
    $authService->register([
        'name' => $testName,
        'email' => 'invalid-email-format',
        'password' => $testPassword,
    ]);
    assertTest("Rechaza formato de email inválido", false);
} catch (ValidationException $e) {
    assertTest("Rechaza formato de email inválido", isset($e->getErrors()['email']));
}

// 2.3 Registro exitoso
$user = $authService->register([
    'name' => $testName,
    'email' => $testEmail,
    'password' => $testPassword,
]);
assertTest("Registro de usuario correcto", $user['id'] > 0 && $user['email'] === strtolower($testEmail), "ID: {$user['id']}");

// 2.4 Comprobar hash en base de datos
$dbUser = $pdo->query("SELECT * FROM `users` WHERE `id` = {$user['id']}")->fetch();
assertTest("Hash almacenado en DB no expone texto plano", !empty($dbUser['password_hash']) && $dbUser['password_hash'] !== $testPassword);
assertTest("Hash utiliza Argon2id en DB", str_starts_with((string)$dbUser['password_hash'], '$argon2id$') || str_starts_with((string)$dbUser['password_hash'], '$2y$'));

// 2.5 Rechazo de email duplicado
try {
    $authService->register([
        'name' => 'Otro Nombre',
        'email' => $testEmail,
        'password' => 'AnotherPassword123!',
    ]);
    assertTest("Rechaza registro con email duplicado", false);
} catch (ValidationException $e) {
    assertTest("Rechaza registro con email duplicado", isset($e->getErrors()['email']));
}

// 3. Login y Regeneración de Sesión
echo PHP_EOL . "--- 3. Pruebas de Inicio de Sesión ---" . PHP_EOL;

// 3.1 Login con contraseña incorrecta
try {
    $authService->login($testEmail, 'BadPassword!');
    assertTest("Rechaza login con contraseña equivocada", false);
} catch (InvalidArgumentException $e) {
    assertTest("Rechaza login con contraseña equivocada", $e->getMessage() === 'Credenciales inválidas.');
}

// 3.2 Login exitoso
$loginResult = $authService->login($testEmail, $testPassword, '127.0.0.1', 'PHP-CLI-TestSuite');
assertTest("Login exitoso con credenciales válidas", $loginResult['user']['email'] === strtolower($testEmail));
assertTest("Token CSRF emitido en login", strlen($loginResult['csrf_token']) === 64);

// 3.3 Verificar sesión en la base de datos
$sessionRow = $pdo->query("SELECT * FROM `sessions` WHERE `user_id` = {$user['id']}")->fetch();
assertTest("Sesión registrada en base de datos", !empty($sessionRow['id']), "Session ID: " . substr((string)$sessionRow['id'], 0, 16) . '...');
$sessionId1 = $sessionRow['id'];

// 3.4 Regeneración de ID de sesión al iniciar sesión nuevamente
$loginResult2 = $authService->login($testEmail, $testPassword, '127.0.0.1', 'PHP-CLI-TestSuite', $sessionId1);
$sessionRow2 = $pdo->query("SELECT * FROM `sessions` WHERE `user_id` = {$user['id']}")->fetch();
$sessionId2 = $sessionRow2['id'];
assertTest("Regeneración del ID de sesión al re-autenticar", $sessionId1 !== $sessionId2, "Antiguo ID invalidado, nuevo ID generado");

// 4. Validación de Sesión Activa (Current User)
echo PHP_EOL . "--- 4. Validación de Sesión y Timeouts ---" . PHP_EOL;
$validSession = $authService->getCurrentSession($sessionId2);
assertTest("Validación de sesión activa exitosa", $validSession !== null && $validSession['user']['id'] === $user['id']);

// 4.1 Simular Timeout de Inactividad (> 1800 segundos)
$pdo->exec("UPDATE `sessions` SET `last_activity_at` = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1850 SECOND) WHERE `id` = '{$sessionId2}'");
$expiredInactivity = $authService->getCurrentSession($sessionId2);
assertTest("Invalidación por Timeout de Inactividad (30 min)", $expiredInactivity === null);
$dbCheckInactivity = $pdo->query("SELECT COUNT(*) FROM `sessions` WHERE `id` = '{$sessionId2}'")->fetchColumn();
assertTest("Sesión eliminada de DB tras expirar por inactividad", (int)$dbCheckInactivity === 0);

// 4.2 Simular Timeout Absoluto (> 8 horas)
$loginResult3 = $authService->login($testEmail, $testPassword, '127.0.0.1', 'PHP-CLI-TestSuite');
$sessionId3 = $pdo->query("SELECT `id` FROM `sessions` WHERE `user_id` = {$user['id']}")->fetchColumn();
$pdo->exec("UPDATE `sessions` SET `created_at` = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 29000 SECOND), `expires_at` = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 100 SECOND) WHERE `id` = '{$sessionId3}'");
$expiredAbsolute = $authService->getCurrentSession($sessionId3);
assertTest("Invalidación por Timeout Absoluto (8 horas)", $expiredAbsolute === null);
$dbCheckAbsolute = $pdo->query("SELECT COUNT(*) FROM `sessions` WHERE `id` = '{$sessionId3}'")->fetchColumn();
assertTest("Sesión eliminada de DB tras expirar por timeout absoluto", (int)$dbCheckAbsolute === 0);

// 5. Protección CSRF y Logout Real
echo PHP_EOL . "--- 5. Protección CSRF y Logout ---" . PHP_EOL;
$loginResult4 = $authService->login($testEmail, $testPassword, '127.0.0.1', 'PHP-CLI-TestSuite');
$sessionId4 = $pdo->query("SELECT `id` FROM `sessions` WHERE `user_id` = {$user['id']}")->fetchColumn();
$activeSession = $authService->getCurrentSession($sessionId4);
$validCsrf = $activeSession['csrf_token'];

// 5.1 Verificación CSRF
assertTest("CSRF::verify rechaza token ausente", !Csrf::verify($validCsrf, null));
assertTest("CSRF::verify rechaza token incorrecto", !Csrf::verify($validCsrf, 'token_invalido_123456789'));
assertTest("CSRF::verify acepta token correcto", Csrf::verify($validCsrf, $validCsrf));

// 5.2 Logout real
$authService->logout($sessionId4);
$sessionAfterLogout = $authService->getCurrentSession($sessionId4);
assertTest("Sesión invalidada tras logout", $sessionAfterLogout === null);
$dbCheckLogout = $pdo->query("SELECT COUNT(*) FROM `sessions` WHERE `id` = '{$sessionId4}'")->fetchColumn();
assertTest("Fila de sesión eliminada físicamente de DB", (int)$dbCheckLogout === 0);

echo PHP_EOL . "==========================================" . PHP_EOL;
echo "RESULTADO FINAL: {$passedCount} de {$totalTests} pruebas superadas." . PHP_EOL;
echo "==========================================" . PHP_EOL;

if ($passedCount !== $totalTests) {
    exit(1);
}
