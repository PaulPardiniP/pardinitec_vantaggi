<?php

declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

use App\Core\Auth\AuthService;
use App\Core\Auth\SessionManager;
use App\Core\Database\Connection;
use App\Core\Security\PasswordHasher;
use App\Modules\Businesses\BusinessService;
use App\Modules\Loyalty\CapabilityService;
use App\Modules\Cards\CardService;

echo "=== INIZIO TEST COMPLETO FLUSSO SUPER ADMIN (PARDINITEC VANTAGGI) ===" . PHP_EOL . PHP_EOL;

$pdo = Connection::get();
$currentDb = $pdo->query("SELECT DATABASE()")->fetchColumn();
echo "Database di test attivo: {$currentDb}" . PHP_EOL;
if ($currentDb !== 'pardinitec_vantaggi_test') {
    echo "ERRORE CRITICO: I test devono essere eseguiti esclusivamente su pardinitec_vantaggi_test!" . PHP_EOL;
    exit(1);
}

$testCount = 0;
$passedCount = 0;

function assertCondition(bool $condition, string $msg): void {
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
$sessionMgr = new SessionManager($pdo);
$authService = new AuthService($pdo, $hasher, $sessionMgr);
$bizService = new BusinessService($pdo);
$capService = new CapabilityService($pdo);
$cardService = new CardService($pdo);

// Creare o recuperare un Super Admin di test
$saEmail = 'super_admin_sa_flow_' . time() . '@test.com';
$saUser = $authService->register([
    'name' => 'Super Admin Flow',
    'email' => $saEmail,
    'password' => 'PasswordSuper123!',
]);
$saId = (int) $saUser['id'];
$pdo->prepare("UPDATE `users` SET `is_super_admin` = 1 WHERE `id` = :id")->execute(['id' => $saId]);
assertCondition(true, "Super Admin di test creato (ID: {$saId})");

// ==========================================
// 1. GESTIONE CARTE INVENTORY E ASSEGNAZIONE A LOTTO
// ==========================================
echo PHP_EOL . "--- 1. CARTE FISICHE, BATCH_ID E ASSEGNAZIONE ---" . PHP_EOL;

// Creare un commercio target per le carte
$bizSlug = 'biz-cards-flow-' . time();
$bizRes = $bizService->createBusiness($saId, [
    'name' => 'Commercio Per Carte',
    'slug' => $bizSlug,
    'tax_id' => 'IT11122233344',
]);
$bizId = (int) $bizRes['id'];
assertCondition($bizId > 0, "Commercio target per carte creato (#{$bizId})");

// Generare un lotto di 5 carte in INVENTORY
$batch = $cardService->createBatchInInventory(5, null, $saId);
assertCondition(count($batch) === 5, "Lotto di 5 carte generato in INVENTORY");
$batchId = $batch[0]['batch_id'] ?? '';
assertCondition(!empty($batchId), "UUID batch_id generato ({$batchId})");

$cardIds = array_map(fn($c) => (int) $c['id'], $batch);
$checkStmt = $pdo->prepare("SELECT COUNT(*) FROM `cards` WHERE `batch_id` = :bid AND `status` = 'inventory'");
$checkStmt->execute(['bid' => $batchId]);
assertCondition((int) $checkStmt->fetchColumn() === 5, "Tutte le 5 carte hanno il batch_id corretto nel DB");

// Tentativo di assegnare con un ID non valido o inesistente: transazione deve fallire senza scritture parziali
try {
    $cardService->assignCardsToBusiness(array_merge($cardIds, [99999999]), $bizId, $saId);
    assertCondition(false, "Assegnazione con carta non-inventory doveva fallire");
} catch (\Throwable $e) {
    assertCondition(true, "Assegnazione transazionale respinta per ID non valido: " . $e->getMessage());
}

// Verificare che nessuna carta sia stata parzialmente assegnata
$checkStatusStmt = $pdo->prepare("SELECT COUNT(*) FROM `cards` WHERE `id` IN (" . implode(',', $cardIds) . ") AND `status` = 'inventory'");
$checkStatusStmt->execute();
assertCondition((int) $checkStatusStmt->fetchColumn() === 5, "Nessuna scrittura parziale: tutte le carte rimangono in inventory");

// Assegnazione valida del lotto al commercio
$assigned = $cardService->assignCardsToBusiness($cardIds, $bizId, $saId);
assertCondition(count($assigned) === 5, "Tutte le 5 carte assegnate con successo al commercio");

$checkAssignedStmt = $pdo->prepare("SELECT COUNT(*) FROM `cards` WHERE `id` IN (" . implode(',', $cardIds) . ") AND `status` = 'issued' AND `business_id` = :biz_id");
$checkAssignedStmt->execute(['biz_id' => $bizId]);
assertCondition((int) $checkAssignedStmt->fetchColumn() === 5, "Stato DB confermato 'issued' per il commercio #{$bizId}");

// ==========================================
// 2. PACCHETTI FUNZIONALI (CAPABILITIES)
// ==========================================
echo PHP_EOL . "--- 2. PACCHETTI FUNZIONALI (PUNTI, VANTAGGI, VIP, CAMPAGNE) ---" . PHP_EOL;

// 2.1 Creazione commercio rifiutata se privo di perfiles
$rejectedNoProfile = false;
try {
    $bizService->createBusiness($saId, [
        'name' => 'Commercio Senza Profili',
        'packages' => ['punti' => false, 'vantaggi' => false, 'vip' => false],
    ]);
} catch (\App\Core\Auth\ValidationException $e) {
    $rejectedNoProfile = true;
}
assertCondition($rejectedNoProfile, "Creazione commercio rifiutata se privo di almeno un profilo contrattuale (422)");

// 2.2 Creazione commercio con SOLO Profilo Punti
$bizPuntiSlug = 'biz-only-punti-' . time();
$bizPuntiRes = $bizService->createBusiness($saId, [
    'name' => 'Commercio Solo Punti',
    'slug' => $bizPuntiSlug,
    'packages' => [
        'punti' => true,
        'vantaggi' => false,
        'vip' => false,
        'campaigns' => false,
    ],
]);
$bizPuntiId = (int) $bizPuntiRes['id'];
$pkgsPunti = $capService->getBusinessPackages($bizPuntiId);
assertCondition($pkgsPunti['punti'] === true && $pkgsPunti['vantaggi'] === false && $pkgsPunti['vip'] === false && $pkgsPunti['campaigns'] === false, "Commercio nuovo creato unicamente con Punti");
assertCondition($capService->isCapabilityEnabledForBusiness($bizPuntiId, 'points') && $capService->isCapabilityEnabledForBusiness($bizPuntiId, 'rewards'), "Points e Rewards attivi nel DB per commercio Punti");
assertCondition(!$capService->isCapabilityEnabledForBusiness($bizPuntiId, 'offers') && !$capService->isCapabilityEnabledForBusiness($bizPuntiId, 'benefits') && !$capService->isCapabilityEnabledForBusiness($bizPuntiId, 'discounts') && !$capService->isCapabilityEnabledForBusiness($bizPuntiId, 'vip_offers'), "Pacchetti non selezionati realmente disattivati nel DB (offers, benefits, discounts, vip_offers = 0)");
assertCondition(!$capService->isCapabilityEnabledForBusiness($bizPuntiId, 'campaigns'), "Add-on Campagne opzionale e disattivato di default");

// 2.3 Creazione commercio con Profilo Vantaggi (inclusione ampliata di Punti)
$bizVantaggiSlug = 'biz-vantaggi-' . time();
$bizVantaggiRes = $bizService->createBusiness($saId, [
    'name' => 'Commercio Vantaggi',
    'slug' => $bizVantaggiSlug,
    'packages' => [
        'punti' => false,
        'vantaggi' => true,
        'vip' => false,
        'campaigns' => false,
    ],
]);
$bizVantaggiId = (int) $bizVantaggiRes['id'];
$pkgsVantaggi = $capService->getBusinessPackages($bizVantaggiId);
assertCondition($pkgsVantaggi['vantaggi'] === true && $pkgsVantaggi['punti'] === true, "Commercio nuovo con Vantaggi include e attiva anche Punti");
assertCondition(
    $capService->isCapabilityEnabledForBusiness($bizVantaggiId, 'points') &&
    $capService->isCapabilityEnabledForBusiness($bizVantaggiId, 'rewards') &&
    $capService->isCapabilityEnabledForBusiness($bizVantaggiId, 'offers') &&
    $capService->isCapabilityEnabledForBusiness($bizVantaggiId, 'benefits') &&
    $capService->isCapabilityEnabledForBusiness($bizVantaggiId, 'discounts'),
    "Vantaggi abilita points, rewards, offers, benefits e discounts"
);
assertCondition(!$capService->isCapabilityEnabledForBusiness($bizVantaggiId, 'vip_offers'), "VIP disattivato per commercio con solo Vantaggi");

// 2.4 Creazione commercio con SOLO Profilo VIP
$bizVipSlug = 'biz-only-vip-' . time();
$bizVipRes = $bizService->createBusiness($saId, [
    'name' => 'Commercio Solo VIP',
    'slug' => $bizVipSlug,
    'packages' => [
        'punti' => false,
        'vantaggi' => false,
        'vip' => true,
        'campaigns' => true,
    ],
]);
$bizVipId = (int) $bizVipRes['id'];
$pkgsVip = $capService->getBusinessPackages($bizVipId);
assertCondition($pkgsVip['vip'] === true && $pkgsVip['punti'] === false && $pkgsVip['vantaggi'] === false && $pkgsVip['campaigns'] === true, "Commercio nuovo unicamente con VIP e Add-on Campagne");
assertCondition($capService->isCapabilityEnabledForBusiness($bizVipId, 'vip_offers'), "Capability 'vip_offers' attiva per commercio VIP");
assertCondition(!$capService->isCapabilityEnabledForBusiness($bizVipId, 'points') && !$capService->isCapabilityEnabledForBusiness($bizVipId, 'rewards'), "Points e Rewards disattivati nel DB per commercio con solo VIP");
assertCondition($capService->isCapabilityEnabledForBusiness($bizVipId, 'campaigns'), "Add-on Campagne attivo tramite piano");

// 2.5 Aislamiento tra commerci: modificare pacchetti in bizPunti non altera bizVip
$capService->setBusinessPackage($bizPuntiId, 'vip', true);
assertCondition($capService->isCapabilityEnabledForBusiness($bizPuntiId, 'vip_offers'), "VIP attivato su commercio Punti");
assertCondition(!$capService->isCapabilityEnabledForBusiness($bizVipId, 'points'), "Aislamiento confermato: bizVip conserva points disattivato");

// 2.6 Regola di integrità: impossibile disattivare l'ultimo profilo attivo
$rejectedDisableLast = false;
try {
    $capService->setBusinessPackage($bizVipId, 'vip', false);
} catch (\InvalidArgumentException $e) {
    $rejectedDisableLast = true;
}
assertCondition($rejectedDisableLast, "Rifiutata disattivazione dell'ultimo profilo rimasto (almeno uno obbligatorio)");

// 2.7 Disattivazione Vantaggi conserva Punti
$capService->setBusinessPackage($bizVantaggiId, 'vantaggi', false);
$pkgsVantaggiOff = $capService->getBusinessPackages($bizVantaggiId);
assertCondition(!$pkgsVantaggiOff['vantaggi'] && $pkgsVantaggiOff['punti'], "Disattivazione Vantaggi mantiene Punti attivo (non azzera accumulo né premi)");
assertCondition($capService->isCapabilityEnabledForBusiness($bizVantaggiId, 'points') && $capService->isCapabilityEnabledForBusiness($bizVantaggiId, 'rewards'), "Points e Rewards rimangono preservati dopo disattivazione Vantaggi");

// 2.8 Verificare unica fonte canonica per modules vs plans
$modCount = (int) $pdo->query("SELECT COUNT(*) FROM `modules`")->fetchColumn();
assertCondition($modCount === 6, "Tabella 'modules' contiene esattamente 6 capabilities fedeltà canoniche");

$checkBadModules = (int) $pdo->query("SELECT COUNT(*) FROM `modules` WHERE `code` IN ('campaigns', 'digital_credentials')")->fetchColumn();
assertCondition($checkBadModules === 0, "Zero record per 'campaigns' o 'digital_credentials' nella tabella modules (gestiti contrattualmente in plans)");

// ==========================================
// 3. ONBOARDING TITOLARE E GESTIONE INVITI
// ==========================================
echo PHP_EOL . "--- 3. ONBOARDING TITOLARE E INVITI ---" . PHP_EOL;

$ownerEmail = 'owner_invite_' . time() . '@azienda-test.it';
$bizOwnerSlug = 'biz-owner-' . time();
$bizWithOwner = $bizService->createBusiness($saId, [
    'name' => 'Azienda Con Titolare',
    'slug' => $bizOwnerSlug,
    'owner_email' => $ownerEmail,
    'owner_first_name' => 'Mario',
    'owner_last_name' => 'Rossi',
]);

$bizOwnerId = (int) $bizWithOwner['id'];
assertCondition(!empty($bizWithOwner['invitation']), "Invito generato nella risposta di creazione");
$plainToken = $bizWithOwner['invitation']['token'] ?? '';
assertCondition(!empty($plainToken), "Token di invito in chiaro restituito una sola volta");

// Verificare che nel DB sia memorizzato solo l'HASH SHA-256 del token, MAI in chiaro
$tokenHash = hash('sha256', $plainToken);
$invStmt = $pdo->prepare("SELECT * FROM `business_invitations` WHERE `business_id` = :biz_id AND `token_hash` = :th LIMIT 1");
$invStmt->execute(['biz_id' => $bizOwnerId, 'th' => $tokenHash]);
$dbInv = $invStmt->fetch();
assertCondition(!empty($dbInv), "Invito trovato nel DB per token_hash SHA-256");
assertCondition($dbInv['status'] === 'pending', "Stato iniziale invito: 'pending'");
assertCondition($dbInv['email'] === $ownerEmail, "Email associata corretta: {$ownerEmail}");

// Verificare evento outbox
$outboxStmt = $pdo->prepare("SELECT * FROM `outbox_events` WHERE `event_type` = 'owner.invitation' ORDER BY `id` DESC LIMIT 1");
$outboxStmt->execute();
$outEvent = $outboxStmt->fetch();
assertCondition(!empty($outEvent), "Evento outbox 'owner.invitation' accodato correttamente");
$outPayload = json_decode($outEvent['payload'], true);
assertCondition(($outPayload['email'] ?? '') === $ownerEmail, "Payload outbox contiene email destinatario");

// Dispatching reale con OutboxDispatcher e Mailer
\App\Core\Mail\Mailer::clearSentMessages();
$dispatcher = new \App\Modules\Automations\OutboxDispatcher($pdo);
$dispatched = $dispatcher->dispatchEvent((int) $outEvent['id']);
assertCondition($dispatched === true, "OutboxDispatcher ha processato l'evento 'owner.invitation' specifico");

$sentEmails = \App\Core\Mail\Mailer::getSentMessages();
assertCondition(count($sentEmails) >= 1, "Mailer in-memory ha catturato l'email di invito");
$lastEmail = end($sentEmails);
assertCondition($lastEmail['to'] === $ownerEmail, "Destinatario email corrisponde al titolare: {$ownerEmail}");
assertCondition(str_contains($lastEmail['subject'], 'Invito ad amministrare'), "Oggetto email in italiano professionale corretto");
assertCondition(str_contains($lastEmail['html'], 'Pardinitec Vantaggi') && str_contains($lastEmail['html'], '7 giorni'), "Corpo email include branding e avviso di scadenza a 7 giorni");

// Verificare che lo stato dell'evento outbox sia diventato 'sent'
$outStatusStmt = $pdo->prepare("SELECT `status`, `sent_at` FROM `outbox_events` WHERE `id` = :id");
$outStatusStmt->execute(['id' => (int) $outEvent['id']]);
$outUpdated = $outStatusStmt->fetch();
assertCondition($outUpdated['status'] === 'sent' && !empty($outUpdated['sent_at']), "Evento outbox aggiornato a status 'sent' con sent_at registrato");

// Super Admin elenca gli inviti
$invList = $bizService->listInvitations($saId, $bizOwnerId);
assertCondition(count($invList) >= 1, "listInvitations restituisce l'invito del commercio");

// Validazione pubblica dell'invito
$validated = $bizService->validateInvitation($plainToken);
assertCondition($validated['email'] === $ownerEmail && $validated['business_id'] === $bizOwnerId, "validateInvitation valida con successo il token");

// Token errato deve essere respinto
try {
    $bizService->validateInvitation('token_completamente_errato_123');
    assertCondition(false, "Token errato doveva lanciare eccezione");
} catch (\Throwable $e) {
    assertCondition(true, "Token errato respinto: " . $e->getMessage());
}

// Rinnovo invito (resend)
$invId = (int) $dbInv['id'];
$resent = $bizService->resendInvitation($saId, $bizOwnerId, $invId);
assertCondition(!empty($resent['token']), "Nuovo token generato al rinnovo dell'invito");
$newPlainToken = $resent['token'];

// Il vecchio token non è più valido
try {
    $bizService->validateInvitation($plainToken);
    assertCondition(false, "Vecchio token doveva essere invalidato");
} catch (\Throwable $e) {
    assertCondition(true, "Vecchio token invalidato con successo");
}

// Annullamento invito (cancel)
$bizService->cancelInvitation($saId, $bizOwnerId, $invId);
$cancelledCheck = $pdo->prepare("SELECT `status` FROM `business_invitations` WHERE `id` = :id");
$cancelledCheck->execute(['id' => $invId]);
assertCondition($cancelledCheck->fetchColumn() === 'cancelled', "Invito annullato con stato 'cancelled'");

try {
    $bizService->validateInvitation($newPlainToken);
    assertCondition(false, "Invito annullato non deve essere validato");
} catch (\Throwable $e) {
    assertCondition(true, "Invito annullato respinto alla validazione");
}

// Rinnoviamo nuovamente per eseguire l'accettazione
$freshResent = $bizService->resendInvitation($saId, $bizOwnerId, $invId);
$validToken = $freshResent['token'];

// Accettazione invito: password troppo corta
try {
    $bizService->acceptInvitation($validToken, 'short');
    assertCondition(false, "Password corta doveva fallire");
} catch (\Throwable $e) {
    assertCondition(true, "Password corta (<8 caratteri) respinta");
}

// Accettazione invito valida
$acceptedResult = $bizService->acceptInvitation($validToken, 'PasswordSicura2026!');
assertCondition($acceptedResult['email'] === $ownerEmail, "Invito accettato con successo per {$ownerEmail}");

// Verificare utente creato e membership come 'owner'
$userStmt = $pdo->prepare("SELECT u.`id`, bm.`role` FROM `users` u INNER JOIN `business_memberships` bm ON u.`id` = bm.`user_id` WHERE u.`email` = :email AND bm.`business_id` = :biz_id");
$userStmt->execute(['email' => $ownerEmail, 'biz_id' => $bizOwnerId]);
$createdOwner = $userStmt->fetch();
assertCondition(!empty($createdOwner) && $createdOwner['role'] === 'owner', "Utente creato con ruolo 'owner' nel commercio");

// Tentativo di riutilizzare l'invito già accettato
try {
    $bizService->acceptInvitation($validToken, 'AltraPassword123!');
    assertCondition(false, "Invito già accettato non può essere riutilizzato");
} catch (\Throwable $e) {
    assertCondition(true, "Invito monouso: riutilizzo bloccato");
}

// Onboarding con utente GIÀ esistente
$existingUserEmail = 'existing_owner_' . time() . '@test.com';
$authService->register([
    'name' => 'Titolare Esistente',
    'email' => $existingUserEmail,
    'password' => 'PasswordEsistente1!',
]);
$bizExistingRes = $bizService->createBusiness($saId, [
    'name' => 'Azienda Titolare Esistente',
    'slug' => 'biz-existing-' . time(),
    'owner_email' => $existingUserEmail,
]);
$bizExistingId = (int) $bizExistingRes['id'];
$existingMemStmt = $pdo->prepare("SELECT bm.`role` FROM `users` u INNER JOIN `business_memberships` bm ON u.`id` = bm.`user_id` WHERE u.`email` = :email AND bm.`business_id` = :biz_id");
$existingMemStmt->execute(['email' => $existingUserEmail, 'biz_id' => $bizExistingId]);
assertCondition($existingMemStmt->fetchColumn() === 'owner', "Utente già esistente associato direttamente con ruolo 'owner' senza token");

// ==========================================
// 4. CICLO DI VITA E GDPR (ARCHIVIAZIONE, TERMINAZIONE, ELIMINAZIONE)
// ==========================================
echo PHP_EOL . "--- 4. CICLO DI VITA E GDPR ---" . PHP_EOL;

// 4.1 Archiviazione
$archRes = $bizService->archiveBusiness($saId, $bizOwnerId, true);
assertCondition($archRes['is_archived'] === true, "Commercio archiviato con successo");

$archList = $bizService->listBusinessesPaginated($saId, '', 'archived');
$foundInArchived = array_filter($archList['data'], fn($b) => $b['id'] === $bizOwnerId);
assertCondition(count($foundInArchived) === 1, "Filtro status 'archived' include il commercio archiviato");

$activeList = $bizService->listBusinessesPaginated($saId, '', 'active');
$foundInActive = array_filter($activeList['data'], fn($b) => $b['id'] === $bizOwnerId);
assertCondition(count($foundInActive) === 0, "Filtro status 'active' esclude il commercio archiviato");

// Ripristino dall'archivio
$bizService->archiveBusiness($saId, $bizOwnerId, false);
$unarchCheck = $pdo->prepare("SELECT `is_archived` FROM `businesses` WHERE `id` = :id");
$unarchCheck->execute(['id' => $bizOwnerId]);
assertCondition((int) $unarchCheck->fetchColumn() === 0, "Commercio ripristinato dall'archivio");

// 4.2 Terminazione Contratto GDPR (30 giorni retention)
// Creiamo una sessione attiva per il proprietario per testare la revoca
$createdOwnerId = (int) $createdOwner['id'];
$pdo->prepare("INSERT INTO `sessions` (`id`, `user_id`, `created_at`, `expires_at`) VALUES ('test_sess_token_123', :uid, UTC_TIMESTAMP(), DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 DAY))")
    ->execute(['uid' => $createdOwnerId]);

$termRes = $bizService->terminateBusiness($saId, $bizOwnerId, 30);
assertCondition($termRes['status'] === 'suspended', "Stato commercio impostato a 'suspended'");
assertCondition(!empty($termRes['terminated_at']), "terminated_at registrato");
assertCondition(!empty($termRes['scheduled_deletion_at']), "scheduled_deletion_at calcolato a 30 giorni");

// Verificare revoca sessione
$sessCheck = $pdo->prepare("SELECT COUNT(*) FROM `sessions` WHERE `id` = 'test_sess_token_123'");
$sessCheck->execute();
assertCondition((int) $sessCheck->fetchColumn() === 0, "Sessioni degli operatori del commercio revocate istantaneamente");

// Annullamento terminazione
$cancelTermRes = $bizService->cancelTermination($saId, $bizOwnerId);
assertCondition($cancelTermRes['terminated_at'] === null && $cancelTermRes['scheduled_deletion_at'] === null, "Terminazione GDPR annullata prima della scadenza");

// 4.3 Blocco Dashboard e Risoluzione Pubblica su Commerci Inattivi o Terminati
$credService = new \App\Modules\AccessCredentials\CredentialService($pdo);
$authzService = new \App\Modules\Businesses\AuthorizationService($pdo);
$custService = new \App\Modules\Customers\CustomerService($pdo);

// Creare cliente di test con consensi
$onboardCust = $custService->onboardCustomer($bizOwnerId, [
    'first_name' => 'Mario',
    'last_name' => 'Verdi',
    'phone' => '+393401234567',
    'email' => 'mario.verdi@test.it',
    'privacy_accepted' => true,
    'marketing_accepted' => true,
]);
$cardToken = $onboardCust['token'];

// Con commercio attivo: la credenziale è accessibile
$cardViewActive = $credService->getPublicCredentialView($cardToken);
assertCondition($cardViewActive !== null && ($cardViewActive['state'] ?? '') !== 'not_available', "Con commercio attivo la credenziale pubblica è consultabile");

// Disattivare commercio: credenziale bloccata istantaneamente e getMembership nullo per operatori
$bizService->toggleBusinessStatus($saId, $bizOwnerId, 'inactive');
$cardViewInactive = $credService->getPublicCredentialView($cardToken);
assertCondition($cardViewInactive['state'] === 'not_available', "Con commercio 'inactive', la credenziale pubblica viene bloccata istantaneamente");
assertCondition(str_contains($cardViewInactive['message'], 'non è al momento disponibile'), "Messaggio corretto di servizio non disponibile per commercio inattivo");

$memInactive = $authzService->getMembership($createdOwnerId, $bizOwnerId);
assertCondition($memInactive === null, "Accesso dashboard bloccato: getMembership restituisce null per operatori di commercio inattivo");

// Riattivare commercio
$bizService->toggleBusinessStatus($saId, $bizOwnerId, 'active');
$cardViewReactivated = $credService->getPublicCredentialView($cardToken);
assertCondition($cardViewReactivated['state'] !== 'not_available', "Riattivando il commercio, la credenziale torna consultabile");

// 4.4 Esportazione Dati GDPR (JSON scaricabile prima dell'eliminazione)
$exportedData = $bizService->exportBusinessData($saId, $bizOwnerId);
assertCondition(
    isset($exportedData['business'], $exportedData['customers'], $exportedData['loyalty_accounts'], $exportedData['cards'], $exportedData['points_transactions']),
    "exportBusinessData restituisce JSON strutturato con tutte le entità e lo storico"
);
assertCondition(count($exportedData['customers']) >= 1, "Export GDPR include i clienti censiti");

// 4.5 Terminazione GDPR: Blocco durante la retention ed esecuzione del cron a scadenza
$termBizAgain = $bizService->terminateBusiness($saId, $bizOwnerId, 30);
$cardViewTerm = $credService->getPublicCredentialView($cardToken);
assertCondition($cardViewTerm['state'] === 'not_available', "Durante la retention GDPR di 30 giorni, la credenziale pubblica è bloccata istantaneamente");

$memTerm = $authzService->getMembership($createdOwnerId, $bizOwnerId);
assertCondition($memTerm === null, "Durante la retention GDPR, l'accesso operativo al dashboard rimane bloccato");

// Inserire record operativi di fidelizzazione con timestamp noti
$accIdForGdpr = (int) $onboardCust['loyalty_account']['id'];
$txTime = '2026-09-01 12:00:00';
$delivTime = '2026-09-02 14:30:00';

$pdo->prepare("
    INSERT INTO `points_transactions` (`business_id`, `loyalty_account_id`, `actor_user_id`, `type`, `points`, `spent_amount`, `reason`, `operation_id`, `created_at`)
    VALUES (:b, :a, :u, 'purchase_amount', 100, 50.00, 'Acquisto scontrino', 'op_gdpr_check_tx', :t)
")->execute(['b' => $bizOwnerId, 'a' => $accIdForGdpr, 'u' => $saId, 't' => $txTime]);

$pdo->prepare("
    INSERT INTO `rewards` (`business_id`, `name`, `points_cost`, `status`, `created_at`, `updated_at`)
    VALUES (:b, 'Premio Fedelta', 50, 'active', :t1, :t2)
")->execute(['b' => $bizOwnerId, 't1' => $txTime, 't2' => $txTime]);
$rewIdForGdpr = (int) $pdo->lastInsertId();

$pdo->prepare("
    INSERT INTO `reward_redemptions` (`business_id`, `loyalty_account_id`, `reward_id`, `actor_user_id`, `points_spent`, `notes`, `delivered_at`, `operation_id`, `created_at`)
    VALUES (:b, :a, :r, :u, 50, 'Nota riservata con preferenze PII cliente', :deliv, 'op_gdpr_check_red', :created)
")->execute(['b' => $bizOwnerId, 'a' => $accIdForGdpr, 'r' => $rewIdForGdpr, 'u' => $saId, 'deliv' => $delivTime, 'created' => $txTime]);

// Inserire outbox event pendente con PII nel payload
$pdo->prepare("
    INSERT INTO `outbox_events` (`business_id`, `event_type`, `payload`, `status`, `created_at`)
    VALUES (:b, 'campaign.message', :payload, 'pending', UTC_TIMESTAMP())
")->execute(['b' => $bizOwnerId, 'payload' => json_encode(['email' => 'cliente.segreto@pii.it', 'nome' => 'Mario'])]);

// Simulare scadenza effettiva del periodo di retention (scheduled_deletion_at nel passato)
$pdo->prepare("UPDATE `businesses` SET `scheduled_deletion_at` = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 HOUR) WHERE `id` = :id")
    ->execute(['id' => $bizOwnerId]);

$processedGdpr = $bizService->processExpiredGdprDeletions();
assertCondition($processedGdpr >= 1, "processExpiredGdprDeletions ha elaborato ed eliminato/anonimizzato i dati del commercio scaduto");

// Verificare che created_at e delivered_at dei registri operativi di fidelizzazione NON siano mutati
$txRow = $pdo->query("SELECT `created_at` FROM `points_transactions` WHERE `operation_id` = 'op_gdpr_check_tx'")->fetch(PDO::FETCH_ASSOC);
assertCondition($txRow['created_at'] === $txTime, "Registri operativi di fidelizzazione: points_transactions.created_at conservato identico al secondo");

$redRow = $pdo->query("SELECT `created_at`, `delivered_at`, `notes` FROM `reward_redemptions` WHERE `operation_id` = 'op_gdpr_check_red'")->fetch(PDO::FETCH_ASSOC);
assertCondition($redRow['created_at'] === $txTime, "Registri operativi di fidelizzazione: reward_redemptions.created_at conservato identico al secondo");
assertCondition($redRow['delivered_at'] === $delivTime, "Registri operativi di fidelizzazione: reward_redemptions.delivered_at conservato identico al secondo");
assertCondition($redRow['notes'] === null, "Registri operativi di fidelizzazione: reward_redemptions.notes PII ripulite (NULL)");

// Verificare eliminazione/anonimizzazione di inviti e outbox pendenti
$invCount = (int) $pdo->query("SELECT COUNT(*) FROM `business_invitations` WHERE `business_id` = {$bizOwnerId}")->fetchColumn();
assertCondition($invCount === 0, "PII residuali rimosse: business_invitations eliminate completamente (0 record)");

$outboxPending = (int) $pdo->query("SELECT COUNT(*) FROM `outbox_events` WHERE `business_id` = {$bizOwnerId} AND `status` = 'pending'")->fetchColumn();
assertCondition($outboxPending === 0, "PII residuali rimosse: eventi outbox pendenti eliminati (0 record)");

$outboxResidualPii = (int) $pdo->query("SELECT COUNT(*) FROM `outbox_events` WHERE `business_id` = {$bizOwnerId} AND `payload` LIKE '%cliente.segreto%'")->fetchColumn();
assertCondition($outboxResidualPii === 0, "PII residuali rimosse: nessun payload outbox contiene dati personali");

// Verificare effettiva cancellazione / anonimizzazione di PII
$custAnonymized = $pdo->query("SELECT `first_name`, `last_name`, `phone`, `email` FROM `customers` WHERE `business_id` = {$bizOwnerId}")->fetch(PDO::FETCH_ASSOC);
assertCondition(
    $custAnonymized['first_name'] === 'ANONIMO' &&
    $custAnonymized['last_name'] === 'GDPR' &&
    $custAnonymized['phone'] === null &&
    $custAnonymized['email'] === null,
    "PII dei clienti cancellati e anonimizzati con successo ('ANONIMO GDPR', telefono ed email NULL)"
);

$credsCount = (int) $pdo->query("SELECT COUNT(*) FROM `access_credentials` WHERE `business_id` = {$bizOwnerId}")->fetchColumn();
assertCondition($credsCount === 0, "Tutte le credenziali di accesso rimosse definitivamente dal DB");

$consentsCount = (int) $pdo->query("SELECT COUNT(*) FROM `consents` WHERE `business_id` = {$bizOwnerId}")->fetchColumn();
assertCondition($consentsCount === 0, "Tutti i consensi personali rimossi definitivamente");

$bizAnonymized = $pdo->query("SELECT `name`, `status`, `tax_id` FROM `businesses` WHERE `id` = {$bizOwnerId}")->fetch(PDO::FETCH_ASSOC);
assertCondition(
    str_starts_with($bizAnonymized['name'], 'Ex-Commercio Anonimizzato') &&
    $bizAnonymized['status'] === 'suspended' &&
    $bizAnonymized['tax_id'] === null,
    "Commercio contrassegnato come 'suspended', ragione sociale anonimizzata e P.IVA rimossa"
);

// 4.6 Eliminazione definitiva di commercio vuoto vs non vuoto
// Tentativo di eliminare $bizOwnerId (ha un utente/membro e un invito associato, o $bizId con 5 carte):
try {
    $bizService->deleteEmptyBusiness($saId, $bizId, $bizSlug);
    assertCondition(false, "Eliminazione di commercio con carte doveva fallire");
} catch (\Throwable $e) {
    assertCondition(true, "Eliminazione bloccata: commercio non vuoto (carte associate): " . $e->getMessage());
}

// Creare un commercio completamente vuoto
$emptySlug = 'biz-empty-' . time();
$emptyBiz = $bizService->createBusiness($saId, [
    'name' => 'Commercio Temporaneo Vuoto',
    'slug' => $emptySlug,
]);
$emptyId = (int) $emptyBiz['id'];

// Slug errato deve essere respinto
try {
    $bizService->deleteEmptyBusiness($saId, $emptyId, 'slug-sbagliato');
    assertCondition(false, "Slug errato doveva essere respinto");
} catch (\Throwable $e) {
    assertCondition(true, "Eliminazione respinta per mancata corrispondenza dello slug esatto");
}

// Eliminazione definitiva con slug corretto
$delRes = $bizService->deleteEmptyBusiness($saId, $emptyId, $emptySlug);
assertCondition($delRes['deleted'] === true, "Commercio vuoto eliminato definitivamente");

$checkDel = $pdo->prepare("SELECT COUNT(*) FROM `businesses` WHERE `id` = :id");
$checkDel->execute(['id' => $emptyId]);
assertCondition((int) $checkDel->fetchColumn() === 0, "Record del commercio eliminato fisicamente dal DB");

// ==========================================
// RIEPILOGO FINALE
// ==========================================
echo PHP_EOL . "==========================================" . PHP_EOL;
echo "ESITO FINALE: {$passedCount} di {$testCount} verifiche superate con successo!" . PHP_EOL;
if ($passedCount === $testCount) {
    echo "TUTTI I TEST DEL FLUSSO SUPER ADMIN SONO STATI SUPERATI AL 100%." . PHP_EOL;
    exit(0);
} else {
    echo "ATTENZIONE: Alcune verifiche sono fallite." . PHP_EOL;
    exit(1);
}
