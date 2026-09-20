<?php

declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

use App\Core\Audit\AuditLogger;
use App\Core\Database\Connection;
use App\Core\Security\TokenEncryptionService;
use App\Modules\AccessCredentials\CredentialService;
use App\Modules\Businesses\AuthorizationService;
use App\Modules\Businesses\BusinessService;
use App\Modules\Businesses\Role;
use App\Modules\Customers\CustomerService;
use App\Modules\Loyalty\LoyaltyService;

echo PHP_EOL . "=== TEST CRITTOGRAFIA TOKEN CREDENZIALI DIGITALI E RECUPERO OPERATIVO LINK ===" . PHP_EOL;

$pdo = Connection::get();
$currentDb = $pdo->query("SELECT DATABASE()")->fetchColumn();
echo "Database attivo: {$currentDb}" . PHP_EOL;
if ($currentDb !== 'pardinitec_vantaggi_test') {
    echo "ERRORE CRITICO: I test devono essere eseguiti esclusivamente su pardinitec_vantaggi_test!" . PHP_EOL;
    exit(1);
}

$totalTests = 0;
$passedCount = 0;

function assertEnc(string $description, bool $condition, ?string $details = null): void
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

// -------------------------------------------------------------------------
// TEST 1: Verifica DDL Migrazione 0016
// -------------------------------------------------------------------------
echo PHP_EOL . "--- TEST 1: DDL Migrazione 0016 in access_credentials ---" . PHP_EOL;

$colsStmt = $pdo->query("DESCRIBE `access_credentials`");
$columns = $colsStmt->fetchAll(PDO::FETCH_ASSOC);
$colMap = [];
foreach ($columns as $c) {
    $fieldName = strtolower((string) ($c['Field'] ?? $c['field'] ?? ''));
    $colMap[$fieldName] = array_change_key_case($c, CASE_LOWER);
}

assertEnc('Colonna encrypted_token esiste', isset($colMap['encrypted_token']));


assertEnc('Colonna encryption_iv esiste', isset($colMap['encryption_iv']));
assertEnc('Colonna encryption_tag esiste', isset($colMap['encryption_tag']));
assertEnc('encrypted_token è nullable per retrocompatibilità legacy', ($colMap['encrypted_token']['null'] ?? '') === 'YES');

// -------------------------------------------------------------------------
// TEST 2: Fallimento sicuro TokenEncryptionService con chiavi non valide o mancanti
// -------------------------------------------------------------------------
echo PHP_EOL . "--- TEST 2: Fallimento sicuro con chiavi assenti o non valide ---" . PHP_EOL;

$emptyKeyService = new TokenEncryptionService('');
$failedEmpty = false;
try {
    $emptyKeyService->encrypt('token_test_123');
} catch (RuntimeException $e) {
    $failedEmpty = str_contains($e->getMessage(), 'non configurata');
}
assertEnc('Fallisce in modo sicuro se TOKEN_ENCRYPTION_KEY è vuota', $failedEmpty);

$shortKeyService = new TokenEncryptionService('chiave_corta_16b');
$failedShort = false;
try {
    $shortKeyService->encrypt('token_test_123');
} catch (RuntimeException $e) {
    $failedShort = str_contains($e->getMessage(), 'esatta di 32 byte');
}
assertEnc('Fallisce in modo sicuro se TOKEN_ENCRYPTION_KEY < 32 byte', $failedShort);

$longKeyService = new TokenEncryptionService(str_repeat('X', 40));
$failedLong = false;
try {
    $longKeyService->encrypt('token_test_123');
} catch (RuntimeException $e) {
    $failedLong = str_contains($e->getMessage(), 'esatta di 32 byte');
}
assertEnc('Fallisce in modo sicuro se TOKEN_ENCRYPTION_KEY > 32 byte', $failedLong);

// -------------------------------------------------------------------------
// TEST 3: Cifratura e Decifratura AES-256-GCM con diversi formati di chiave
// -------------------------------------------------------------------------
echo PHP_EOL . "--- TEST 3: Roundtrip AES-256-GCM (raw, hex, base64) ---" . PHP_EOL;

// 3A: Raw 32-byte key
$rawKey = random_bytes(32);
$rawService = new TokenEncryptionService($rawKey);
$tokenPlain = 'c_' . bin2hex(random_bytes(16));
$encrypted = $rawService->encrypt($tokenPlain);

assertEnc('Cifratura produce ciphertext', !empty($encrypted['ciphertext']));
assertEnc('Cifratura produce IV di 12 byte (base64)', strlen(base64_decode($encrypted['iv'])) === 12);
assertEnc('Cifratura produce tag di autenticazione di 16 byte (base64)', strlen(base64_decode($encrypted['tag'])) === 16);

$decrypted = $rawService->decrypt($encrypted['ciphertext'], $encrypted['iv'], $encrypted['tag']);
assertEnc('Decifratura con chiave raw recupera esattamente il token in chiaro', $decrypted === $tokenPlain);

// 3B: Hex 64-char key
$hexKey = bin2hex(random_bytes(32));
$hexService = new TokenEncryptionService($hexKey);
$encHex = $hexService->encrypt($tokenPlain);
$decHex = $hexService->decrypt($encHex['ciphertext'], $encHex['iv'], $encHex['tag']);
assertEnc('Decifratura con chiave esadecimale (64 char) funziona perfettamente', $decHex === $tokenPlain);

// 3C: Base64 44-char key
$b64Key = base64_encode(random_bytes(32));
$b64Service = new TokenEncryptionService($b64Key);
$encB64 = $b64Service->encrypt($tokenPlain);
$decB64 = $b64Service->decrypt($encB64['ciphertext'], $encB64['iv'], $encB64['tag']);
assertEnc('Decifratura con chiave base64 (44 char) funziona perfettamente', $decB64 === $tokenPlain);

// 3D: Rilevamento manomissione (AEAD integrity)
$tamperedCiphertext = base64_encode('tampered_data_' . base64_decode($encrypted['ciphertext']));
$tamperDetected = false;
try {
    $rawService->decrypt($tamperedCiphertext, $encrypted['iv'], $encrypted['tag']);
} catch (RuntimeException $e) {
    $tamperDetected = true;
}
assertEnc('Rileva manomissione del ciphertext (fallimento autenticazione GCM)', $tamperDetected);

$tamperedTag = base64_encode(random_bytes(16));
$tamperTagDetected = false;
try {
    $rawService->decrypt($encrypted['ciphertext'], $encrypted['iv'], $tamperedTag);
} catch (RuntimeException $e) {
    $tamperTagDetected = true;
}
assertEnc('Rileva manomissione del tag di autenticazione', $tamperTagDetected);

// -------------------------------------------------------------------------
// TEST 4: Emissione nuova credenziale con cifratura e hashing SHA-256
// -------------------------------------------------------------------------
echo PHP_EOL . "--- TEST 4: Emissione nuova credenziale e persistenza sicura ---" . PHP_EOL;

$authzService = new AuthorizationService($pdo);
$bizService = new BusinessService($pdo, $authzService);
$custService = new CustomerService($pdo);
$loyaltyService = new LoyaltyService($pdo);
$auditLogger = new AuditLogger($pdo);
$encryptionService = new TokenEncryptionService(); // usa TOKEN_ENCRYPTION_KEY dell'ambiente
$credService = new CredentialService($pdo, $encryptionService, $auditLogger);

// Trovare o creare un commercio attivo
$biz = $pdo->query("SELECT id FROM businesses WHERE status = 'active' LIMIT 1")->fetch(PDO::FETCH_ASSOC);
$bizId = (int) $biz['id'];

// Creare cliente di test
$uniqueSuffix = bin2hex(random_bytes(4));
$testPhone = '+39' . random_int(3000000000, 3999999999);
$testEmail = "enc_test_{$uniqueSuffix}@example.com";

$customerRes = $custService->onboardCustomer($bizId, [
    'first_name' => 'Mario',
    'last_name' => 'TestEncryption',
    'phone' => $testPhone,
    'email' => $testEmail,
    'privacy_accepted' => true,
    'marketing_accepted' => false,
    'card_profile_code' => 'punti',
]);


$accId = (int) $customerRes['loyalty_account']['id'];
$issuedCred = $customerRes['access_credential'];
$issuedToken = $customerRes['token'];

// Verificare nel DB
$credRowStmt = $pdo->prepare("
    SELECT id, public_token_hash, encrypted_token, encryption_iv, encryption_tag
    FROM access_credentials
    WHERE id = :id
");
$credRowStmt->execute(['id' => $issuedCred['id']]);
$credRow = $credRowStmt->fetch(PDO::FETCH_ASSOC);

assertEnc('Credenziale creata nel DB', !empty($credRow));
assertEnc('public_token_hash corrisponde allo SHA-256 del token', $credRow['public_token_hash'] === hash('sha256', $issuedToken));
assertEnc('encrypted_token è valorizzato nel DB', !empty($credRow['encrypted_token']));
assertEnc('encryption_iv è valorizzato nel DB', !empty($credRow['encryption_iv']));
assertEnc('encryption_tag è valorizzato nel DB', !empty($credRow['encryption_tag']));
assertEnc('Il token in chiaro NON è memorizzato in nessuna colonna di access_credentials', 
    $credRow['encrypted_token'] !== $issuedToken && $credRow['public_token_hash'] !== $issuedToken
);

// Verificare che il token cifrato si decifri esattamente al token restituito
$decryptedDbToken = $encryptionService->decrypt(
    $credRow['encrypted_token'],
    $credRow['encryption_iv'],
    $credRow['encryption_tag']
);
assertEnc('Il token decifrato dal DB corrisponde perfettamente al token originale', $decryptedDbToken === $issuedToken);

// -------------------------------------------------------------------------
// TEST 5: Flag has_recoverable_token nella lista credenziali
// -------------------------------------------------------------------------
echo PHP_EOL . "--- TEST 5: getCredentialsForAccount e has_recoverable_token ---" . PHP_EOL;

$credsList = $credService->getCredentialsForAccount($bizId, $accId);
assertEnc('getCredentialsForAccount restituisce le credenziali', !empty($credsList));
assertEnc('Nuova credenziale ha has_recoverable_token === true', $credsList[0]['has_recoverable_token'] === true);

// -------------------------------------------------------------------------
// TEST 6: Credenziali legacy (senza cifratura) e messaggio informativo
// -------------------------------------------------------------------------
echo PHP_EOL . "--- TEST 6: Credenziale Legacy non cifrata ---" . PHP_EOL;

// Simula credenziale legacy impostando encrypted_token, iv, tag a NULL
$legacyToken = 'legacy_tok_' . bin2hex(random_bytes(10));
$legacyHash = hash('sha256', $legacyToken);
$insertLegacy = $pdo->prepare("
    INSERT INTO access_credentials (
        business_id, loyalty_account_id, type, status,
        public_token_hash, encrypted_token, encryption_iv, encryption_tag,
        issued_at, created_at, updated_at
    ) VALUES (
        :bid, :aid, 'digital', 'active',
        :hash, NULL, NULL, NULL,
        UTC_TIMESTAMP(), UTC_TIMESTAMP(), UTC_TIMESTAMP()
    )
");
$insertLegacy->execute([
    'bid' => $bizId,
    'aid' => $accId,
    'hash' => $legacyHash,
]);
$legacyCredId = (int) $pdo->lastInsertId();

// Controlla lista
$credsAfterLegacy = $credService->getCredentialsForAccount($bizId, $accId);
$legacyInList = null;
foreach ($credsAfterLegacy as $c) {
    if ($c['id'] === $legacyCredId) {
        $legacyInList = $c;
        break;
    }
}
assertEnc('Credenziale legacy ha has_recoverable_token === false', $legacyInList !== null && $legacyInList['has_recoverable_token'] === false);

// Tentativo di recupero del link della credenziale legacy deve fallire con messaggio esatto
$legacyRevealFailed = false;
$legacyMessage = '';
try {
    $credService->revealCredentialLink($bizId, $legacyCredId, 1);
} catch (InvalidArgumentException $e) {
    $legacyRevealFailed = true;
    $legacyMessage = $e->getMessage();
}
assertEnc('revealCredentialLink blocca credenziali legacy', $legacyRevealFailed);
assertEnc('Messaggio informativo per legacy: "Link non recuperabile: rigenera la credenziale una sola volta."', 
    str_contains($legacyMessage, 'Link non recuperabile: rigenera la credenziale una sola volta.')
);

// -------------------------------------------------------------------------
// TEST 7: Rigenerazione credenziale (rotazione) da legacy a moderna cifrata
// -------------------------------------------------------------------------
echo PHP_EOL . "--- TEST 7: Rotazione / Rigenerazione credenziale ---" . PHP_EOL;

// Prima disattiviamo l'altra credenziale attiva per mantenere l'invariante di max 1 attiva
$pdo->prepare("UPDATE access_credentials SET status = 'revoked' WHERE loyalty_account_id = :aid AND id != :lid")
    ->execute(['aid' => $accId, 'lid' => $legacyCredId]);

$rotated = $credService->rotateCredential($bizId, $legacyCredId);
assertEnc('Rotazione avvenuta con successo', !empty($rotated['id']));
assertEnc('Nuova credenziale ha ID diverso dalla precedente', $rotated['id'] !== $legacyCredId);

// Verifica che la vecchia sia replaced
$checkOld = $pdo->prepare("SELECT status, replaced_by_credential_id, revoked_at FROM access_credentials WHERE id = :id");
$checkOld->execute(['id' => $legacyCredId]);
$oldData = $checkOld->fetch(PDO::FETCH_ASSOC);
assertEnc('Vecchia credenziale marcata come replaced', $oldData['status'] === 'replaced');
assertEnc('Vecchia credenziale collegata alla nuova (replaced_by_credential_id)', (int) $oldData['replaced_by_credential_id'] === $rotated['id']);
assertEnc('Vecchia credenziale ha data di revoca', !empty($oldData['revoked_at']));

// Verifica che la nuova abbia token cifrato
$checkNew = $pdo->prepare("SELECT encrypted_token, encryption_iv, encryption_tag FROM access_credentials WHERE id = :id");
$checkNew->execute(['id' => $rotated['id']]);
$newData = $checkNew->fetch(PDO::FETCH_ASSOC);
assertEnc('Nuova credenziale post-rigenerazione ha encrypted_token popolato', !empty($newData['encrypted_token']));

// Ora il link della nuova credenziale è recuperabile
$revealedAfterRotate = $credService->revealCredentialLink($bizId, $rotated['id'], 1);
assertEnc('Nuova credenziale post-rigenerazione può rivelare il link', $revealedAfterRotate['token'] === $rotated['token']);
assertEnc('public_url corrisponde a /c/{token}', $revealedAfterRotate['public_url'] === "/c/{$rotated['token']}");

// -------------------------------------------------------------------------
// TEST 8: Autorizzazioni e controllo accessi (SuperAdmin, Owner, Manager, Staff, Cross-tenant)
// -------------------------------------------------------------------------
echo PHP_EOL . "--- TEST 8: Autorizzazione e isolamento multi-tenant ---" . PHP_EOL;

// 1. Trova o crea utenti con ruoli diversi
// Super admin: user con flag is_super_admin o ruolo
$superAdminUser = $pdo->query("SELECT id FROM users WHERE is_super_admin = 1 LIMIT 1")->fetch(PDO::FETCH_ASSOC);
if (!$superAdminUser) {
    // Creane uno temporaneo
    $pdo->prepare("INSERT INTO users (email, password_hash, name, is_super_admin, status, created_at, updated_at) VALUES ('sa_test@test.it', 'hash', 'Super Admin', 1, 'active', UTC_TIMESTAMP(), UTC_TIMESTAMP())")->execute();
    $superAdminId = (int) $pdo->lastInsertId();
} else {
    $superAdminId = (int) $superAdminUser['id'];
}

// Trova membership Owner e Manager per $bizId
$ownerMembership = $pdo->prepare("SELECT user_id FROM business_memberships WHERE business_id = :bid AND role = 'owner' AND status = 'active' LIMIT 1");
$ownerMembership->execute(['bid' => $bizId]);
$ownerUser = $ownerMembership->fetch(PDO::FETCH_ASSOC);

// Se non esiste un owner per questo biz, creiamolo
if (!$ownerUser) {
    $pdo->prepare("INSERT INTO users (email, password_hash, name, status, created_at, updated_at) VALUES ('owner_t@test.it', 'hash', 'Owner Test', 'active', UTC_TIMESTAMP(), UTC_TIMESTAMP())")->execute();
    $ownerUserId = (int) $pdo->lastInsertId();
    $pdo->prepare("INSERT INTO business_memberships (business_id, user_id, role, status, created_at, updated_at) VALUES (:bid, :uid, 'owner', 'active', UTC_TIMESTAMP(), UTC_TIMESTAMP())")->execute(['bid' => $bizId, 'uid' => $ownerUserId]);
} else {
    $ownerUserId = (int) $ownerUser['user_id'];
}

// Crea Manager per $bizId
$pdo->prepare("INSERT INTO users (email, password_hash, name, status, created_at, updated_at) VALUES ('mgr_t_" . rand(1000, 9999) . "@test.it', 'hash', 'Mgr Test', 'active', UTC_TIMESTAMP(), UTC_TIMESTAMP())")->execute();
$managerUserId = (int) $pdo->lastInsertId();
$pdo->prepare("INSERT INTO business_memberships (business_id, user_id, role, status, created_at, updated_at) VALUES (:bid, :uid, 'manager', 'active', UTC_TIMESTAMP(), UTC_TIMESTAMP())")->execute(['bid' => $bizId, 'uid' => $managerUserId]);

// Crea Staff per $bizId
$pdo->prepare("INSERT INTO users (email, password_hash, name, status, created_at, updated_at) VALUES ('stf_t_" . rand(1000, 9999) . "@test.it', 'hash', 'Stf Test', 'active', UTC_TIMESTAMP(), UTC_TIMESTAMP())")->execute();
$staffUserId = (int) $pdo->lastInsertId();
$pdo->prepare("INSERT INTO business_memberships (business_id, user_id, role, status, created_at, updated_at) VALUES (:bid, :uid, 'staff', 'active', UTC_TIMESTAMP(), UTC_TIMESTAMP())")->execute(['bid' => $bizId, 'uid' => $staffUserId]);


// Verifica permessi con AuthorizationService:
$saMem = $authzService->getMembership($superAdminId, $bizId);
assertEnc('Super Admin è riconosciuto per il business', $saMem !== null && $saMem['role'] === Role::SUPER_ADMIN);

$ownMem = $authzService->getMembership($ownerUserId, $bizId);
assertEnc('Owner è riconosciuto per il business', $ownMem !== null && $ownMem['role'] === Role::OWNER);

$mgrMem = $authzService->getMembership($managerUserId, $bizId);
assertEnc('Manager è riconosciuto per il business', $mgrMem !== null && $mgrMem['role'] === Role::MANAGER);

$stfMem = $authzService->getMembership($staffUserId, $bizId);
assertEnc('Staff è riconosciuto per il business', $stfMem !== null && $stfMem['role'] === Role::STAFF);

// Regola ruoli autorizzati: Owner, Manager, Super Admin OK; Staff KO
$allowedRoles = [Role::SUPER_ADMIN, Role::OWNER, Role::MANAGER];
assertEnc('Super Admin è nei ruoli consentiti', in_array($saMem['role'], $allowedRoles, true));
assertEnc('Owner è nei ruoli consentiti', in_array($ownMem['role'], $allowedRoles, true));
assertEnc('Manager è nei ruoli consentiti', in_array($mgrMem['role'], $allowedRoles, true));
assertEnc('Staff NON è nei ruoli consentiti (bloccato)', !in_array($stfMem['role'], $allowedRoles, true));

// Test cross-tenant: tentativo di accesso a credenziale con business_id errato
$otherBiz = $pdo->prepare("SELECT id FROM businesses WHERE id != :bid AND status = 'active' LIMIT 1");
$otherBiz->execute(['bid' => $bizId]);
$otherBizRow = $otherBiz->fetch(PDO::FETCH_ASSOC);
if ($otherBizRow) {
    $otherBizId = (int) $otherBizRow['id'];
    $crossTenantFailed = false;
    try {
        $credService->revealCredentialLink($otherBizId, $rotated['id'], $superAdminId);
    } catch (InvalidArgumentException $e) {
        $crossTenantFailed = true;
    }
    assertEnc('Isolamento cross-tenant: impossibile recuperare credenziale di un altro business', $crossTenantFailed);
}

// -------------------------------------------------------------------------
// TEST 9: Verifica Registro di Audit (audit_logs)
// -------------------------------------------------------------------------
echo PHP_EOL . "--- TEST 9: Registro di Audit per visualizzazione link ---" . PHP_EOL;

// Chiamata revealLink con $ownerUserId
$revealRes = $credService->revealCredentialLink($bizId, $rotated['id'], $ownerUserId);

// Controlla l'ultimo log in audit_logs per questa credenziale
$auditStmt = $pdo->prepare("
    SELECT id, action, resource, resource_id, actor_user_id, business_id, meta, created_at
    FROM audit_logs
    WHERE action = 'credential.reveal_link'
      AND resource_id = :cid
    ORDER BY id DESC
    LIMIT 1
");
$auditStmt->execute(['cid' => $rotated['id']]);
$auditRow = $auditStmt->fetch(PDO::FETCH_ASSOC);

assertEnc('Audit log registrato per credential.reveal_link', !empty($auditRow));
assertEnc('Audit log registra correttamente actor_user_id', (int) $auditRow['actor_user_id'] === $ownerUserId);
assertEnc('Audit log registra correttamente business_id', (int) $auditRow['business_id'] === $bizId);
assertEnc('Audit log NON contiene il token in chiaro nei meta', !str_contains((string) ($auditRow['meta'] ?? ''), $revealRes['token']));
assertEnc('Audit log NON contiene parole chiave di cifratura/segreti', !str_contains((string) ($auditRow['meta'] ?? ''), 'secret') && !str_contains((string) ($auditRow['meta'] ?? ''), 'TOKEN_ENCRYPTION_KEY'));


// -------------------------------------------------------------------------
// TEST 10: Risoluzione della carta tramite link rivelato (/c/<token>)
// -------------------------------------------------------------------------
echo PHP_EOL . "--- TEST 10: Risoluzione pubblica /c/<token> con token rivelato ---" . PHP_EOL;

$publicView = $credService->getPublicCredentialView($revealRes['token']);
assertEnc('La scheda pubblica si risolve con successo usando il token rivelato', $publicView !== null);
assertEnc('Stato scheda attiva', ($publicView['state'] ?? '') === 'active');
assertEnc('ID credenziale corrisponde', ($publicView['credential_id'] ?? 0) === $rotated['id']);
assertEnc('Business corrisponde', ($publicView['business']['id'] ?? 0) === $bizId);

// -------------------------------------------------------------------------
// TEST 11: Header Cache-Control: no-store simulato da CredentialController
// -------------------------------------------------------------------------
echo PHP_EOL . "--- TEST 11: Header Cache-Control no-store in CredentialController ---" . PHP_EOL;

$controllerSource = file_get_contents(__DIR__ . '/../src/Modules/AccessCredentials/CredentialController.php');
assertEnc('CredentialController invia Cache-Control: no-store', str_contains($controllerSource, "header('Cache-Control: no-store"));
assertEnc('CredentialController invia Pragma: no-cache', str_contains($controllerSource, "header('Pragma: no-cache')"));

// -------------------------------------------------------------------------
// RIEPILOGO FINALE
// -------------------------------------------------------------------------
echo PHP_EOL . "==========================================" . PHP_EOL;
echo "RIEPILOGO TEST: {$passedCount} / {$totalTests} superati." . PHP_EOL;
echo "==========================================" . PHP_EOL;

if ($passedCount === $totalTests) {
    echo "TUTTI I TEST SUPERATI CON SUCCESSO!" . PHP_EOL;
    exit(0);
} else {
    echo "ATTENZIONE: Alcuni test sono falliti!" . PHP_EOL;
    exit(1);
}
