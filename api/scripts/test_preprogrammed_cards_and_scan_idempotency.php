<?php

declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

use App\Core\Auth\AuthService;
use App\Core\Database\Connection;
use App\Modules\AccessCredentials\CredentialService;
use App\Modules\Businesses\BusinessService;
use App\Modules\Businesses\Role;
use App\Modules\Cards\CardService;
use App\Modules\Customers\CustomerService;
use App\Modules\Loyalty\LoyaltyService;
use App\Modules\Points\PointsService;

echo PHP_EOL . "=== VERIFICA BACKEND: TARJETAS PREPROGRAMADAS E IDEMPOTENZA SCAN SESSION ===" . PHP_EOL;

$pdo = Connection::get();
$currentDb = $pdo->query("SELECT DATABASE()")->fetchColumn();
echo "Database attivo: {$currentDb}" . PHP_EOL;
if ($currentDb !== 'pardinitec_vantaggi_test') {
    echo "ERRORE CRITICO: I test devono essere eseguiti esclusivamente su pardinitec_vantaggi_test!" . PHP_EOL;
    exit(1);
}

$totalTests = 0;
$passedCount = 0;

function assertBackend(string $description, bool $condition, ?string $details = null): void
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

$authService = new AuthService($pdo);
$businessService = new BusinessService($pdo);
$loyaltyService = new LoyaltyService($pdo);
$credentialService = new CredentialService($pdo);
$customerService = new CustomerService($pdo, $loyaltyService, $credentialService);
$cardService = new CardService($pdo, $credentialService, $loyaltyService);
$pointsService = new PointsService($pdo);

$ts = time();

// -------------------------------------------------------------------------
// PARTE 1: Creazione Lotto in Inventario, Assegnazione e URL Programabile Permanente
// -------------------------------------------------------------------------
echo PHP_EOL . "--- PARTE 1: Ciclo di Vita Tarjetas Preprogramadas con Token Fisso ---" . PHP_EOL;

// 1. Setup Super Admin e Commercio
$superAdmin = $authService->register([
    'email' => "sa_preprog_{$ts}@vantaggi.com",
    'password' => 'Password123!',
    'name' => 'Super Admin Test',
]);
$pdo->exec("UPDATE `users` SET `is_super_admin` = 1 WHERE `id` = {$superAdmin['id']}");

$owner = $authService->register([
    'email' => "owner_preprog_{$ts}@shop.com",
    'password' => 'Password123!',
    'name' => 'Titolare Negozio Test',
]);
$business = $businessService->createBusiness($owner['id'], [
    'name' => "Negozio Preprog {$ts}",
    'packages' => ['punti' => true, 'vantaggi' => true, 'vip' => true],
]);
$bizId = (int) $business['id'];

// 2. Super Admin genera lotto di 3 carte in inventario
$batch = $cardService->createBatchInInventory(3, null, $superAdmin['id']);
assertBackend("Lotto di 3 carte creato in inventario", count($batch) === 3);

$firstCard = $batch[0];
$firstCardId = (int) $firstCard['id'];
$initialToken = (string) $firstCard['token'];
$initialPublicUrl = (string) $firstCard['public_url'];

assertBackend("Token a 32 byte restituito alla creazione del lotto (64 hex)", strlen($initialToken) === 64);
assertBackend("URL pubblica /c/{token} restituita per la programmazione NFC/QR", $initialPublicUrl === "/c/{$initialToken}");

// 3. Verifica stato iniziale in DB (cards + access_credentials)
$cardRow1 = $pdo->query("SELECT * FROM `cards` WHERE `id` = {$firstCardId}")->fetch(PDO::FETCH_ASSOC);
assertBackend("Carta in stato 'inventory'", $cardRow1['status'] === 'inventory');
assertBackend("Carta in inventario ha business_id NULL", $cardRow1['business_id'] === null);
assertBackend("Carta in inventario ha loyalty_account_id NULL", $cardRow1['loyalty_account_id'] === null);

$credRow1 = $pdo->query("SELECT * FROM `access_credentials` WHERE `card_id` = {$firstCardId} AND `type` = 'physical'")->fetch(PDO::FETCH_ASSOC);
$initialHash = (string) $credRow1['public_token_hash'];
assertBackend("Credenziale fisica creata immediatamente in inventario", !empty($credRow1));
assertBackend("Credenziale fisica ha loyalty_account_id NULL prima di scegliere il cliente", $credRow1['loyalty_account_id'] === null);
assertBackend("Credenziale fisica ha business_id NULL", $credRow1['business_id'] === null);
assertBackend("Hash SHA-256 memorizzato in MariaDB", $initialHash === hash('sha256', $initialToken));
assertBackend("Token memorizzato in forma cifrata AES-256-GCM (encrypted_token valorizzato)", !empty($credRow1['encrypted_token']));

// 4. Assegnazione del lotto al commercio (inventory -> issued)
$cardIds = array_map(fn($c) => (int) $c['id'], $batch);
$assignedCards = $cardService->assignCardsToBusiness($cardIds, $bizId, $superAdmin['id']);
assertBackend("Lotto assegnato al commercio", count($assignedCards) === 3);

$cardRow2 = $pdo->query("SELECT * FROM `cards` WHERE `id` = {$firstCardId}")->fetch(PDO::FETCH_ASSOC);
assertBackend("Stato carta passa a 'issued'", $cardRow2['status'] === 'issued');
assertBackend("Carta collegata a business_id = {$bizId}", (int) $cardRow2['business_id'] === $bizId);
assertBackend("Carta conserva loyalty_account_id = NULL", $cardRow2['loyalty_account_id'] === null);

$credRow2 = $pdo->query("SELECT * FROM `access_credentials` WHERE `card_id` = {$firstCardId} AND `type` = 'physical'")->fetch(PDO::FETCH_ASSOC);
assertBackend("Credenziale fisica aggiornata con business_id = {$bizId}", (int) $credRow2['business_id'] === $bizId);
assertBackend("Credenziale fisica conserva loyalty_account_id = NULL", $credRow2['loyalty_account_id'] === null);
assertBackend("Hash SHA-256 della credenziale rimane IDENTICO (token non rotato)", $credRow2['public_token_hash'] === $initialHash);

// 5. Recupero sicuro del link / URL da parte del Super Admin o Commerciante via revealCredentialLink
$revealed = $credentialService->revealCredentialLink($bizId, (int) $credRow2['id'], $superAdmin['id']);
assertBackend("Super Admin può visualizzare/copiare l'URL permanente tramite revealLink", $revealed['token'] === $initialToken);
assertBackend("URL decifrata coincide esattamente con /c/{token} originale", $revealed['public_url'] === "/c/{$initialToken}");

// 6. Risoluzione pubblica su /c/{token} di tessera vergine assegnata
$viewIssued = $credentialService->getPublicCredentialView($initialToken, null);
assertBackend("Tessera vergine per utente anonimo mostra state: 'issued' (non ancora attivata)", $viewIssued['state'] === 'issued');

// 7. Il commerciante associa la carta a un cliente (activateCard) SENZA rotazione di token
$customerOnboard = $customerService->onboardCustomer($bizId, [
    'first_name' => 'Alessandro',
    'last_name' => 'Manzoni',
    'email' => "manzoni_{$ts}@lettere.it",
    'privacy_accepted' => true,
    'card_profile_code' => 'punti',
]);
$loyaltyAccId = (int) $customerOnboard['loyalty_account']['id'];

$activatedCard = $cardService->activateCard($bizId, $firstCardId, $loyaltyAccId, $owner['id']);
assertBackend("Carta attivata con successo in stato 'active'", $activatedCard['status'] === 'active');
assertBackend("Carta collegata a loyalty_account_id = {$loyaltyAccId}", (int) $activatedCard['loyalty_account_id'] === $loyaltyAccId);

$credRow3 = $pdo->query("SELECT * FROM `access_credentials` WHERE `card_id` = {$firstCardId} AND `type` = 'physical'")->fetch(PDO::FETCH_ASSOC);
assertBackend("Credenziale fisica collegata a loyalty_account_id = {$loyaltyAccId}", (int) $credRow3['loyalty_account_id'] === $loyaltyAccId);
assertBackend("Hash SHA-256 della credenziale rimane ESATTAMENTE lo stesso (token fisso permanente mai riscritto)", $credRow3['public_token_hash'] === $initialHash);

// Risoluzione pubblica ora mostra la carta attiva del cliente con lo stesso identico token
$viewActive = $credentialService->getPublicCredentialView($initialToken, null);
assertBackend("Lo stesso token /c/{token} ora risolve la carta attiva del cliente", $viewActive['state'] === 'active' && (int) $viewActive['loyalty_account']['id'] === $loyaltyAccId);

// -------------------------------------------------------------------------
// PARTE 2: Idempotenza Scan Session su Backend (Due richieste simultanee)
// -------------------------------------------------------------------------
echo PHP_EOL . "--- PARTE 2: Idempotenza Backend su Richieste Simultanee nella Stessa Sessione ---" . PHP_EOL;

// Genera uno scan_session_id per questa apertura di pagina
$scanSessionId = "scan_session_" . bin2hex(random_bytes(16));
$sharedOperationId = "scan_{$scanSessionId}";

// Saldo iniziale
$initialBalance = (int) $pdo->query("SELECT `balance` FROM `loyalty_accounts` WHERE `id` = {$loyaltyAccId}")->fetchColumn();
assertBackend("Saldo iniziale del conto fedeltà è 0 pt", $initialBalance === 0);

// Richiesta 1: Accredito rapido +1 pt con $sharedOperationId
$result1 = $pointsService->adjustPoints(
    $bizId,
    $loyaltyAccId,
    1,
    'purchase_fixed',
    'Accredito rapido in cassa +1',
    $sharedOperationId,
    $owner['id']
);
assertBackend("Richiesta 1 (+1 pt) eseguita con successo", !$result1['idempotent']);
assertBackend("Nuovo saldo dopo Richiesta 1 è 1 pt", $result1['balance'] === 1);

// Richiesta 2: Seconda richiesta simultanea o concorrente (+5 pt) con la STESSA chiave $sharedOperationId
$result2 = $pointsService->adjustPoints(
    $bizId,
    $loyaltyAccId,
    5,
    'purchase_fixed',
    'Accredito rapido in cassa +5',
    $sharedOperationId,
    $owner['id']
);
assertBackend("Richiesta 2 intercettata dal controllo di idempotenza backend (idempotent = true)", $result2['idempotent'] === true);
assertBackend("Saldo restituito alla Richiesta 2 rimane 1 pt (nessun accredito doppio)", $result2['balance'] === 1);

// Verifica del ledger points_transactions nel database
$txStmt = $pdo->prepare("SELECT COUNT(*) FROM `points_transactions` WHERE `business_id` = :biz_id AND `operation_id` = :op_id");
$txStmt->execute(['biz_id' => $bizId, 'op_id' => $sharedOperationId]);
$txCount = (int) $txStmt->fetchColumn();
assertBackend("Esiste ESATTAMENTE 1 transazione registrata nel ledger per questa scan session", $txCount === 1);

$finalBalance = (int) $pdo->query("SELECT `balance` FROM `loyalty_accounts` WHERE `id` = {$loyaltyAccId}")->fetchColumn();
assertBackend("Saldo finale nel DB MariaDB è esattamente 1 pt (non 6 pt)", $finalBalance === 1);

// -------------------------------------------------------------------------
// RIEPILOGO FINALE
// -------------------------------------------------------------------------
echo PHP_EOL . "=== RIEPILOGO TEST BACKEND ===" . PHP_EOL;
echo "Totale test eseguiti: {$totalTests}" . PHP_EOL;
echo "Test superati: {$passedCount} / {$totalTests}" . PHP_EOL;

if ($passedCount === $totalTests) {
    echo "ESITO: TUTTI I TEST BACKEND SUPERATI CON SUCCESSO (100% OK)" . PHP_EOL;
    exit(0);
} else {
    echo "ESITO: FALLIMENTO DI UNO O PIÙ TEST" . PHP_EOL;
    exit(1);
}
