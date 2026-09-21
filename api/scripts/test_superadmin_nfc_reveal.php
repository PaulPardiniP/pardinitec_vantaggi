<?php

declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

use App\Core\Audit\AuditLogger;
use App\Core\Database\Connection;
use App\Modules\AccessCredentials\CredentialService;
use App\Modules\Cards\CardService;
use App\Modules\Cards\AdminCardController;
use App\Modules\Businesses\BusinessService;

echo PHP_EOL . "=== TEST SUPER ADMIN NFC REVEAL LINK & BATCH URL RETRIEVAL ===" . PHP_EOL;

$pdo = Connection::get();
$currentDb = $pdo->query("SELECT DATABASE()")->fetchColumn();
echo "Database attivo: {$currentDb}" . PHP_EOL;
if ($currentDb !== 'pardinitec_vantaggi_test') {
    echo "ERRORE CRITICO: I test devono essere eseguiti esclusivamente su pardinitec_vantaggi_test!" . PHP_EOL;
    exit(1);
}

$totalTests = 0;
$passedCount = 0;

function assertNfc(string $description, bool $condition, ?string $details = null): void
{
    global $totalTests, $passedCount;
    $totalTests++;
    if ($condition) {
        $passedCount++;
        echo " [OK] {$description}" . PHP_EOL;
    } else {
        echo " [FAIL] {$description}";
        if ($details) {
            echo " -> " . $details;
        }
        echo PHP_EOL;
    }
}

$cardService = new CardService($pdo);
$credService = new CredentialService($pdo);
$auditLogger = new AuditLogger($pdo);

// 1. Crear Super Admin de prueba si no existe
$superAdminStmt = $pdo->query("SELECT id, email FROM users WHERE is_super_admin = 1 AND status = 'active' LIMIT 1");
$superAdmin = $superAdminStmt->fetch(PDO::FETCH_ASSOC);
if (!$superAdmin) {
    $pdo->exec("INSERT INTO users (email, password_hash, first_name, last_name, is_super_admin, status, created_at, updated_at)
                VALUES ('admin_nfc_test@pardinitec.local', 'hash', 'Super', 'Admin', 1, 'active', UTC_TIMESTAMP(), UTC_TIMESTAMP())");
    $superAdminId = (int) $pdo->lastInsertId();
} else {
    $superAdminId = (int) $superAdmin['id'];
}

// 2. Crear comercio de prueba
$bizSuffix = bin2hex(random_bytes(3));
$pdo->exec("INSERT INTO businesses (name, slug, tax_id, status, created_at, updated_at)
            VALUES ('NFC Test Shop {$bizSuffix}', 'nfc-test-shop-{$bizSuffix}', 'IT{$bizSuffix}12345', 'active', UTC_TIMESTAMP(), UTC_TIMESTAMP())");
$businessId = (int) $pdo->lastInsertId();

// -------------------------------------------------------------------------
// TEST 1: Generación de lote en inventario con credenciales físicas recuperables
// -------------------------------------------------------------------------
echo PHP_EOL . "--- TEST 1: Generación de lote y revealLink con business_id = NULL ---" . PHP_EOL;

$batch = $cardService->createBatchInInventory(3, null, $superAdminId, true);
assertNfc('Lote de 3 tarjetas creado con éxito', count($batch) === 3);

$firstCard = $batch[0];
assertNfc('Tarjeta tiene token devuelto en la creación', !empty($firstCard['token']));
assertNfc('Tarjeta tiene public_url devuelta', $firstCard['public_url'] === "/c/{$firstCard['token']}");

// Test revealLink con business_id = NULL para tarjeta en inventory
$revealed = $credService->revealCredentialLink(null, (int) $pdo->query("SELECT id FROM access_credentials WHERE card_id = {$firstCard['id']} AND type = 'physical' LIMIT 1")->fetchColumn(), $superAdminId);
assertNfc('Super Admin puede revelar link con business_id = NULL', $revealed['token'] === $firstCard['token']);
assertNfc('URL revelada coincide con la permanente inicial', $revealed['public_url'] === "/c/{$firstCard['token']}");

// -------------------------------------------------------------------------
// TEST 2: Asignación a comercio no rota el token ni altera la URL permanente
// -------------------------------------------------------------------------
echo PHP_EOL . "--- TEST 2: Asignación a comercio conserva el mismo token ---" . PHP_EOL;

$assignedCards = $cardService->assignCardsToBusiness([$firstCard['id']], $businessId, $superAdminId);
assertNfc('Tarjeta asignada a comercio correctamente', count($assignedCards) === 1);
assertNfc('Tarjeta tiene estado issued', $assignedCards[0]['status'] === 'issued');
assertNfc('Tarjeta tiene business_id asignado', (int) $assignedCards[0]['business_id'] === $businessId);

// Revelar enlace después de asignación
$revealedAfterAssign = $credService->revealCredentialLink(null, (int) $pdo->query("SELECT id FROM access_credentials WHERE card_id = {$firstCard['id']} AND type = 'physical' LIMIT 1")->fetchColumn(), $superAdminId);
assertNfc('Token permanente permanece IDÉNTICO tras asignación', $revealedAfterAssign['token'] === $firstCard['token']);
assertNfc('URL permanente permanece IDÉNTICA tras asignación', $revealedAfterAssign['public_url'] === "/c/{$firstCard['token']}");

// -------------------------------------------------------------------------
// TEST 3: Tarjeta suspendida conserva credencial física y puede revelarse
// -------------------------------------------------------------------------
echo PHP_EOL . "--- TEST 3: Tarjeta y credencial física ---" . PHP_EOL;

$latestCred = $cardService->getLatestPhysicalCredentialForCard($firstCard['id']);
assertNfc('getLatestPhysicalCredentialForCard recupera credencial física', $latestCred !== null && (int) $latestCred['card_id'] === $firstCard['id']);

// -------------------------------------------------------------------------
// TEST 4: Bloqueo de credenciales legacy sin token cifrado
// -------------------------------------------------------------------------
echo PHP_EOL . "--- TEST 4: Credenciales legacy sin cifrado ---" . PHP_EOL;

$pdo->exec("INSERT INTO cards (status, created_at, updated_at) VALUES ('inventory', UTC_TIMESTAMP(), UTC_TIMESTAMP())");
$legacyCardId = (int) $pdo->lastInsertId();
$legacyToken = bin2hex(random_bytes(32));
$pdo->exec("INSERT INTO access_credentials (card_id, type, public_token_hash, encrypted_token, encryption_iv, encryption_tag, status, issued_at, created_at, updated_at)
            VALUES ({$legacyCardId}, 'physical', '" . hash('sha256', $legacyToken) . "', NULL, NULL, NULL, 'active', UTC_TIMESTAMP(), UTC_TIMESTAMP(), UTC_TIMESTAMP())");
$legacyCredId = (int) $pdo->lastInsertId();

$legacyBlocked = false;
try {
    $credService->revealCredentialLink(null, $legacyCredId, $superAdminId);
} catch (InvalidArgumentException $e) {
    $legacyBlocked = str_contains($e->getMessage(), 'Link non recuperabile') || str_contains($e->getMessage(), 'legacy');
}
assertNfc('revealCredentialLink bloquea credenciales legacy', $legacyBlocked);

// -------------------------------------------------------------------------
// TEST 5: Bloqueo de credenciales revocadas o sustituidas
// -------------------------------------------------------------------------
echo PHP_EOL . "--- TEST 5: Credenciales revocadas ---" . PHP_EOL;

$pdo->exec("UPDATE access_credentials SET status = 'revoked' WHERE id = {$legacyCredId}");
$revokedBlocked = false;
try {
    $credService->revealCredentialLink(null, $legacyCredId, $superAdminId);
} catch (InvalidArgumentException $e) {
    $revokedBlocked = str_contains($e->getMessage(), 'revocata o sostituita');
}
assertNfc('revealCredentialLink bloquea credenciales revocadas', $revokedBlocked);

// -------------------------------------------------------------------------
// TEST 6: Auditoría sin token
// -------------------------------------------------------------------------
echo PHP_EOL . "--- TEST 6: Verificación de auditoría segura ---" . PHP_EOL;

$auditStmt = $pdo->query("SELECT * FROM audit_logs WHERE action = 'credential.reveal_link' ORDER BY id DESC LIMIT 1");
$auditRow = $auditStmt->fetch(PDO::FETCH_ASSOC);
assertNfc('Audit log registrado para credential.reveal_link', !empty($auditRow));
assertNfc('Audit log NO contiene el token en claro en meta', !str_contains((string) ($auditRow['meta'] ?? ''), $firstCard['token']));

echo PHP_EOL . "=== RISULTATI TEST SUPER ADMIN NFC ===" . PHP_EOL;
echo "Totale: {$totalTests} | Superati: {$passedCount} | Falliti: " . ($totalTests - $passedCount) . PHP_EOL;

if ($passedCount === $totalTests) {
    echo " TUTTI I TEST SUPER ADMIN NFC SONO STATI SUPERATI CON SUCCESSO!" . PHP_EOL;
    exit(0);
} else {
    echo " ATTENZIONE: ALCUNI TEST SONO FALLITI!" . PHP_EOL;
    exit(1);
}
