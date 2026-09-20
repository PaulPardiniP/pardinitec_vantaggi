<?php

declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

use App\Core\Auth\AuthService;
use App\Core\Auth\SessionManager;
use App\Core\Database\Connection;
use App\Core\Security\PasswordHasher;
use App\Modules\Businesses\BusinessService;
use App\Modules\Businesses\Permission;
use App\Modules\Businesses\Role;
use App\Modules\Loyalty\CapabilityService;

echo "=== TEST REGOLE PACCHETTI E FLUSSO INVITO COLLABORATORI ===" . PHP_EOL . PHP_EOL;

$pdo = Connection::get();
$currentDb = $pdo->query("SELECT DATABASE()")->fetchColumn();
echo "Database di test attivo: {$currentDb}" . PHP_EOL;
if ($currentDb !== 'pardinitec_vantaggi_test') {
    echo "ERRORE CRITICO: I test devono essere eseguiti esclusivamente su pardinitec_vantaggi_test!" . PHP_EOL;
    exit(1);
}

$testCount = 0;
$passedCount = 0;

function assertCond(bool $condition, string $msg): void {
    global $testCount, $passedCount;
    $testCount++;
    if ($condition) {
        $passedCount++;
        echo " [OK] " . $msg . PHP_EOL;
    } else {
        echo " [FAIL] " . $msg . PHP_EOL;
    }
}

$hasher = new PasswordHasher();
$authService = new \App\Modules\Businesses\AuthorizationService($pdo);
$bizService = new BusinessService($pdo, $authService);
$capService = new CapabilityService($pdo);

// 1. Setup Super Admin
$saEmail = 'superadmin_pkg_test_' . time() . '@test.com';
$pwdHash = $hasher->hash('AdminPassword123!');
$pdo->prepare("
    INSERT INTO `users` (`name`, `email`, `password_hash`, `status`, `is_super_admin`, `created_at`, `updated_at`)
    VALUES ('Super Admin Pkg', :email, :pwd, 'active', 1, UTC_TIMESTAMP(), UTC_TIMESTAMP())
")->execute(['email' => $saEmail, 'pwd' => $pwdHash]);
$saId = (int) $pdo->lastInsertId();

echo PHP_EOL . "--- TEST 1: REGOLE E DIPENDENZE PACCHETTI IN CREAZIONE ---" . PHP_EOL;

// 1.1 Creazione Solo Punti
$bizPunti = $bizService->createBusiness($saId, [
    'name' => 'Bar Punti Test',
    'slug' => 'bar-punti-' . time(),
    'packages' => ['punti' => true, 'vantaggi' => false, 'vip' => false, 'campaigns' => false],
]);
$pkgs = $capService->getBusinessPackages($bizPunti['id']);
assertCond($pkgs['punti'] === true && $pkgs['vantaggi'] === false && $pkgs['vip'] === false && $pkgs['campaigns'] === false, 'Commercio creato con Solo Punti attivo');

// 1.2 Creazione con Vantaggi (deve attivare forzatamente Punti)
$bizVantaggi = $bizService->createBusiness($saId, [
    'name' => 'Bar Vantaggi Test',
    'slug' => 'bar-vantaggi-' . time(),
    'packages' => ['punti' => false, 'vantaggi' => true, 'vip' => false, 'campaigns' => false],
]);
$pkgsV = $capService->getBusinessPackages($bizVantaggi['id']);
assertCond($pkgsV['punti'] === true && $pkgsV['vantaggi'] === true, 'Creazione con Vantaggi attiva/conserva automaticamente Punti');

// 1.3 Creazione senza Punti né VIP deve essere rifiutata
$rejected = false;
try {
    $bizService->createBusiness($saId, [
        'name' => 'Bar No Profiles',
        'slug' => 'bar-no-profiles-' . time(),
        'packages' => ['punti' => false, 'vantaggi' => false, 'vip' => false, 'campaigns' => false],
    ]);
} catch (\App\Core\Auth\ValidationException $e) {
    $rejected = true;
}
assertCond($rejected, 'Creazione rifiutata se né Punti né VIP sono selezionati');

echo PHP_EOL . "--- TEST 2: DIPENDENZE E MODIFICHE PACCHETTI SU COMMERCIO ESISTENTE ---" . PHP_EOL;

$testBizId = $bizVantaggi['id']; // Ha Punti e Vantaggi attivi

// 2.1 Tentativo di disattivare Punti con Vantaggi attivo -> Deve bloccare con messaggio esatto
$msgBlocked = false;
$exactMsg = '';
try {
    $capService->setBusinessPackage($testBizId, 'punti', false);
} catch (\InvalidArgumentException $e) {
    $msgBlocked = true;
    $exactMsg = $e->getMessage();
}
assertCond($msgBlocked && $exactMsg === 'Per disattivare Punti devi prima disattivare il profilo Vantaggi.', 'Disattivazione Punti con Vantaggi attivo bloccata con messaggio esatto: "' . $exactMsg . '"');

// 2.2 Disattivazione Vantaggi: conserva Punti e Premi, disattiva solo offerte, benefici, sconti
$capService->setBusinessPackage($testBizId, 'vantaggi', false);
$pkgsAfterVantaggiOff = $capService->getBusinessPackages($testBizId);
assertCond($pkgsAfterVantaggiOff['punti'] === true && $pkgsAfterVantaggiOff['vantaggi'] === false, 'Disattivazione Vantaggi conserva intatto il profilo Punti');

// Verificare moduli specifici in business_modules
$modStmt = $pdo->prepare("
    SELECT m.`code`, bm.`is_enabled`
    FROM `modules` m
    JOIN `business_modules` bm ON m.`id` = bm.`module_id`
    WHERE bm.`business_id` = :bid
");
$modStmt->execute(['bid' => $testBizId]);
$mods = $modStmt->fetchAll(PDO::FETCH_KEY_PAIR);
assertCond((int)$mods['points'] === 1 && (int)$mods['rewards'] === 1, 'Punti e Premi rimangono abilitati (is_enabled=1)');
assertCond((int)$mods['offers'] === 0 && (int)$mods['benefits'] === 0 && (int)$mods['discounts'] === 0, 'Offerte, benefici e sconti sono disabilitati (is_enabled=0)');

// 2.3 Ora che Vantaggi è disattivato, se VIP è disattivo non si può spegnere anche Punti (almeno Punti o VIP)
$rejectNoProfile = false;
try {
    $capService->setBusinessPackage($testBizId, 'punti', false);
} catch (\InvalidArgumentException $e) {
    $rejectNoProfile = true;
}
assertCond($rejectNoProfile, 'Impossibile disattivare Punti se VIP non è attivo (obbligo almeno Punti o VIP)');

// 2.4 Attivando VIP, ora si può disattivare Punti (Solo VIP è configurazione valida)
$capService->setBusinessPackage($testBizId, 'vip', true);
$capService->setBusinessPackage($testBizId, 'punti', false);
$pkgsVipSolo = $capService->getBusinessPackages($testBizId);
assertCond($pkgsVipSolo['vip'] === true && $pkgsVipSolo['punti'] === false && $pkgsVipSolo['vantaggi'] === false, 'Configurazione Solo VIP valida e funzionante');

// 2.5 Riattivando Vantaggi mentre VIP è attivo, attiva anche Punti (Punti + Vantaggi + VIP)
$capService->setBusinessPackage($testBizId, 'vantaggi', true);
$pkgsAll = $capService->getBusinessPackages($testBizId);
assertCond($pkgsAll['punti'] === true && $pkgsAll['vantaggi'] === true && $pkgsAll['vip'] === true, 'Attivando Vantaggi si ottiene Punti + Vantaggi + VIP');

echo PHP_EOL . "--- TEST 3: FLUSSO INVITO COLLABORATORI (STAFF E MANAGER) ---" . PHP_EOL;

// 3.1 Creazione invito Staff
$staffEmail = 'staff_inv_' . time() . '@negozio.it';
$invStaff = $bizService->createMemberInvitation($saId, $testBizId, [
    'email' => $staffEmail,
    'first_name' => 'Marco',
    'last_name' => 'Staff',
    'role' => 'staff',
]);
assertCond($invStaff['role'] === 'staff' && !empty($invStaff['token']), 'Invito Staff creato con token monouso');
assertCond(str_starts_with($invStaff['invitation_url'], '/invitations/'), 'URL relativo di invito generato correttamente');

// Verificare evento in outbox
$outStmt = $pdo->prepare("SELECT COUNT(*) FROM `outbox_events` WHERE `business_id` = :bid AND `event_type` = 'member.invitation'");
$outStmt->execute(['bid' => $testBizId]);
assertCond((int)$outStmt->fetchColumn() > 0, 'Evento outbox member.invitation enqueued correttamente');

// 3.2 Tentativo di creare invito con ruolo owner da form collaboratori -> Deve rifiutare
$rejectOwner = false;
try {
    $bizService->createMemberInvitation($saId, $testBizId, [
        'email' => 'hacker_owner@negozio.it',
        'role' => 'owner',
    ]);
} catch (\App\Core\Auth\ValidationException $e) {
    $rejectOwner = true;
}
assertCond($rejectOwner, 'Tentativo di invitare ruolo owner dal modulo collaboratori rifiutato (422)');

// 3.3 Tentativo di duplicare invito pendente per la stessa email -> Deve rifiutare
$rejectDupInv = false;
try {
    $bizService->createMemberInvitation($saId, $testBizId, [
        'email' => $staffEmail,
        'role' => 'staff',
    ]);
} catch (\InvalidArgumentException $e) {
    $rejectDupInv = true;
}
assertCond($rejectDupInv, 'Tentativo di duplicare invito pendente non scaduto rifiutato');

// 3.4 Validazione invito (endpoint pubblico)
$valData = $bizService->validateInvitation($invStaff['token']);
assertCond($valData['email'] === $staffEmail && $valData['role'] === 'staff' && $valData['user_exists'] === false, 'Validazione invito rileva utente nuovo (user_exists = false)');

// 3.5 Accettazione invito per nuovo utente (definisce password)
$acceptRes = $bizService->acceptInvitation($invStaff['token'], 'StaffPassword123!');
assertCond($acceptRes['email'] === $staffEmail && $acceptRes['role'] === 'staff', 'Invito accettato da nuovo utente con password');

// Verificare che la membership attiva esista nel punto vendita
$memStmt = $pdo->prepare("SELECT `role`, `status` FROM `business_memberships` WHERE `business_id` = :bid AND `user_id` = :uid");
$memStmt->execute(['bid' => $testBizId, 'uid' => $acceptRes['user_id']]);
$mem = $memStmt->fetch(PDO::FETCH_ASSOC);
assertCond($mem && $mem['role'] === 'staff' && $mem['status'] === 'active', 'Membership creata con successo come Staff attiva');

// 3.6 Tentativo di invitare un utente che è già membro attivo dello stesso commercio -> Rifiutato
$rejectExistingMem = false;
try {
    $bizService->createMemberInvitation($saId, $testBizId, [
        'email' => $staffEmail,
        'role' => 'staff',
    ]);
} catch (\InvalidArgumentException $e) {
    $rejectExistingMem = true;
}
assertCond($rejectExistingMem, 'Invito rifiutato per utente già membro attivo del punto vendita');

echo PHP_EOL . "--- TEST 4: INVITO UTENTE ESISTENTE E REINVIA/ANNULLA ---" . PHP_EOL;

// 4.1 Invito di utente con email già esistente in un altro commercio
$biz2 = $bizService->createBusiness($saId, [
    'name' => 'Secondo Negozio Test',
    'slug' => 'secondo-negozio-' . time(),
    'packages' => ['punti' => true, 'vantaggi' => false, 'vip' => false, 'campaigns' => false],
]);

$invBiz2 = $bizService->createMemberInvitation($saId, $biz2['id'], [
    'email' => $staffEmail, // Utente già registrato nel sistema da biz1!
    'first_name' => 'Marco',
    'last_name' => 'Staff',
    'role' => 'manager',
]);
assertCond(!empty($invBiz2['token']), 'Invito creato per utente esistente in un altro commercio');

// Validazione rileva user_exists = true
$valExist = $bizService->validateInvitation($invBiz2['token']);
assertCond($valExist['user_exists'] === true, 'Validazione rileva correttamente che l\'utente esiste già');

// 4.2 Reinvia invito
$resendRes = $bizService->resendInvitation($saId, $biz2['id'], $invBiz2['id']);
assertCond(!empty($resendRes['token']) && $resendRes['token'] !== $invBiz2['token'], 'Reinvio genera nuovo token monouso sicuro');

// 4.3 Accettazione con password errata -> Rifiutata
$rejectWrongPwd = false;
try {
    $bizService->acceptInvitation($resendRes['token'], 'PasswordSbagliata!');
} catch (\App\Core\Auth\ValidationException $e) {
    $rejectWrongPwd = true;
}
assertCond($rejectWrongPwd, 'Accettazione con password non corretta rifiutata');

// 4.4 Accettazione con password corretta dell\'utente esistente -> Ha successo
$acceptExist = $bizService->acceptInvitation($resendRes['token'], 'StaffPassword123!');
assertCond($acceptExist['email'] === $staffEmail && $acceptExist['role'] === 'manager', 'Utente esistente accetta invito con propria password e diventa Manager di biz2');

// 4.5 Annulla invito (creiamone uno terzo)
$invCancel = $bizService->createMemberInvitation($saId, $biz2['id'], [
    'email' => 'to_cancel_' . time() . '@negozio.it',
    'role' => 'staff',
]);
$cancelRes = $bizService->cancelInvitation($saId, $biz2['id'], $invCancel['id']);
assertCond($cancelRes['status'] === 'cancelled', 'Invito annullato con successo');

// Tentativo di validare l'invito annullato -> Deve fallire
$rejectCancelled = false;
try {
    $bizService->validateInvitation($invCancel['token']);
} catch (\InvalidArgumentException $e) {
    $rejectCancelled = true;
}
assertCond($rejectCancelled, 'Invito annullato non è più validabile');

// 4.6 Audit log: verificare che gli eventi traccino actor_user_id
$auditStmt = $pdo->prepare("
    SELECT COUNT(*) FROM `audit_logs`
    WHERE `business_id` = :bid
      AND `action` IN ('member.invited', 'invitation.resent', 'invitation.cancelled', 'invitation.accepted')
      AND `actor_user_id` IS NOT NULL
");
$auditStmt->execute(['bid' => $biz2['id']]);
$auditCount = (int)$auditStmt->fetchColumn();
assertCond($auditCount >= 3, "Audit trail traccia correttamente actor_user_id ({$auditCount} eventi registrati)");

echo PHP_EOL . "=== RISULTATO FINALE TEST: {$passedCount}/{$testCount} superati ===" . PHP_EOL;

if ($passedCount === $testCount) {
    echo "TUTTI I TEST SONO PASSATI CON SUCCESSO!" . PHP_EOL;
    exit(0);
} else {
    echo "ALCUNI TEST SONO FALLITI." . PHP_EOL;
    exit(1);
}
