<?php

declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

use App\Core\Database\Connection;
use App\Modules\AccessCredentials\CredentialService;
use App\Modules\Businesses\AuthorizationService;
use App\Modules\Businesses\BusinessService;
use App\Modules\Businesses\ForbiddenException;
use App\Modules\Businesses\Role;
use App\Modules\Customers\CustomerService;
use App\Modules\Loyalty\CapabilityService;
use App\Modules\Loyalty\LoyaltyService;
use App\Modules\Offers\OfferService;
use App\Modules\Points\PointsService;
use App\Modules\Rewards\RewardService;

echo PHP_EOL . "=== TEST SEGMENTAZIONE PREMI, OFFERTE E SCHEDA PUBBLICA / ANTEPRIMA ===" . PHP_EOL;

$pdo = Connection::get();
$currentDb = $pdo->query("SELECT DATABASE()")->fetchColumn();
echo "Database di test attivo: {$currentDb}" . PHP_EOL;
if ($currentDb !== 'pardinitec_vantaggi_test') {
    echo "ERRORE CRITICO: I test devono essere eseguiti esclusivamente su pardinitec_vantaggi_test!" . PHP_EOL;
    exit(1);
}

$totalTests = 0;
$passedCount = 0;

function assertSeg(string $description, bool $condition, ?string $details = null): void
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

// 1. Setup Servicios
$authService = new AuthorizationService($pdo);
$bizService = new BusinessService($pdo, $authService);
$capService = new CapabilityService($pdo);
$rewardService = new RewardService($pdo, $capService);
$offerService = new OfferService($pdo, $capService);
$pointsService = new PointsService($pdo, $capService);
$customerService = new CustomerService($pdo);
$loyaltyService = new LoyaltyService($pdo);
$credService = new CredentialService($pdo);

// 2. Obtener IDs de perfiles
$cpStmt = $pdo->query("SELECT id, code FROM card_profiles");
$profilesByCode = $cpStmt->fetchAll(PDO::FETCH_KEY_PAIR); // code => id
$puntiProfileId = (int) ($pdo->query("SELECT id FROM card_profiles WHERE code = 'punti'")->fetchColumn() ?: 1);
$vantaggiProfileId = (int) ($pdo->query("SELECT id FROM card_profiles WHERE code = 'vantaggi'")->fetchColumn() ?: 2);
$vipProfileId = (int) ($pdo->query("SELECT id FROM card_profiles WHERE code = 'vip'")->fetchColumn() ?: 3);

// 3. Crear Comercios A (con todos los paquetes) y B (otro negocio para aislamiento multiempresa)
$tSuffix = time() . '_' . random_int(1000, 9999);
$ownerPass = password_hash('PassSeg123!', PASSWORD_BCRYPT);

$pdo->prepare("
    INSERT INTO `users` (`name`, `email`, `password_hash`, `status`, `is_super_admin`, `created_at`, `updated_at`)
    VALUES ('Owner Seg A', :email, :pwd, 'active', 0, UTC_TIMESTAMP(), UTC_TIMESTAMP())
")->execute(['email' => "owner_seg_a_{$tSuffix}@test.com", 'pwd' => $ownerPass]);
$ownerAId = (int) $pdo->lastInsertId();

$pdo->prepare("
    INSERT INTO `users` (`name`, `email`, `password_hash`, `status`, `is_super_admin`, `created_at`, `updated_at`)
    VALUES ('Owner Seg B', :email, :pwd, 'active', 0, UTC_TIMESTAMP(), UTC_TIMESTAMP())
")->execute(['email' => "owner_seg_b_{$tSuffix}@test.com", 'pwd' => $ownerPass]);
$ownerBId = (int) $pdo->lastInsertId();

$bizA = $bizService->createBusiness($ownerAId, [
    'name' => 'Commercio Seg A ' . $tSuffix,
    'slug' => 'biz-seg-a-' . $tSuffix,
    'packages' => ['punti' => true, 'vantaggi' => true, 'vip' => true, 'campaigns' => false],
]);
$bizB = $bizService->createBusiness($ownerBId, [
    'name' => 'Commercio Seg B ' . $tSuffix,
    'slug' => 'biz-seg-b-' . $tSuffix,
    'packages' => ['punti' => true, 'vantaggi' => true, 'vip' => true, 'campaigns' => false],
]);

$bizAId = (int) $bizA['id'];
$bizBId = (int) $bizB['id'];

// 4. Crear Clientes y Cuentas de Fidelización en Comercio A
// 4.1 Cliente 1: Solo Punti
$cust1Onboard = $customerService->onboardCustomer($bizAId, [
    'first_name' => 'Mario',
    'last_name' => 'Rossi',
    'privacy_accepted' => true,
    'card_profile' => 'punti',
], $ownerAId);
$accPuntiId = (int) $cust1Onboard['loyalty_account']['id'];
$tokenPunti = (string) $cust1Onboard['token'];

// 4.2 Cliente 2: Vantaggi
$cust2Onboard = $customerService->onboardCustomer($bizAId, [
    'first_name' => 'Luigi',
    'last_name' => 'Verdi',
    'privacy_accepted' => true,
    'card_profile' => 'vantaggi',
], $ownerAId);
$accVantaggiId = (int) $cust2Onboard['loyalty_account']['id'];
$tokenVantaggi = (string) $cust2Onboard['token'];

// 4.3 Cliente 3: Solo VIP
$cust3Onboard = $customerService->onboardCustomer($bizAId, [
    'first_name' => 'Elena',
    'last_name' => 'Bianchi',
    'privacy_accepted' => true,
    'card_profile' => 'vip',
], $ownerAId);
$accVipId = (int) $cust3Onboard['loyalty_account']['id'];
$tokenVip = (string) $cust3Onboard['token'];

echo PHP_EOL . "--- 1. CREAZIONE E SEGMENTAZIONE CATALOGO PREMI ---" . PHP_EOL;

// Premio 1: Punti estándar (min_profile_id = NULL / punti)
$rewPunti = $rewardService->createReward($bizAId, [
    'name' => 'Caffè Punti ' . $tSuffix,
    'points_cost' => 50,
    'card_profile_id' => $puntiProfileId,
]);
// Premio 2: Vantaggi exclusivo
$rewVantaggi = $rewardService->createReward($bizAId, [
    'name' => 'Sconto Vantaggi ' . $tSuffix,
    'points_cost' => 100,
    'card_profile_id' => $vantaggiProfileId,
]);
// Premio 3: VIP exclusivo
$rewVip = $rewardService->createReward($bizAId, [
    'name' => 'Trattamento Esclusivo VIP ' . $tSuffix,
    'points_cost' => 100,
    'card_profile_id' => $vipProfileId,
]);

// Verificar almacenamiento del card_profile_id en min_profile_id
assertSeg("Premio VIP ha min_profile_id = {$vipProfileId} nel DB", (int) $rewVip['min_profile_id'] === $vipProfileId);
assertSeg("Premio Vantaggi ha min_profile_id = {$vantaggiProfileId} nel DB", (int) $rewVantaggi['min_profile_id'] === $vantaggiProfileId);
assertSeg("Premio Punti ha min_profile_id = {$puntiProfileId} nel DB", (int) $rewPunti['min_profile_id'] === $puntiProfileId);

// Test 1: listRewards per conto PUNTI
$listPunti = $rewardService->listRewards($bizAId, true, $puntiProfileId);
$idsPunti = array_column($listPunti, 'id');
assertSeg("Conto Punti vede premio Punti", in_array($rewPunti['id'], $idsPunti, true));
assertSeg("Conto Punti NON vede premio Vantaggi", !in_array($rewVantaggi['id'], $idsPunti, true));
assertSeg("Conto Punti NON riceve né vede premio VIP", !in_array($rewVip['id'], $idsPunti, true));

// Test 2: listRewards per conto VANTAGGI
$listVantaggi = $rewardService->listRewards($bizAId, true, $vantaggiProfileId);
$idsVantaggi = array_column($listVantaggi, 'id');
assertSeg("Conto Vantaggi vede premio Vantaggi", in_array($rewVantaggi['id'], $idsVantaggi, true));
assertSeg("Conto Vantaggi eredita premio Punti", in_array($rewPunti['id'], $idsVantaggi, true));
assertSeg("Conto Vantaggi NON vede premio VIP", !in_array($rewVip['id'], $idsVantaggi, true));

// Test 3: listRewards per conto VIP
$listVip = $rewardService->listRewards($bizAId, true, $vipProfileId);
$idsVip = array_column($listVip, 'id');
assertSeg("Conto VIP vede premio VIP", in_array($rewVip['id'], $idsVip, true));
assertSeg("Conto VIP NON vede premio Punti", !in_array($rewPunti['id'], $idsVip, true));
assertSeg("Conto VIP NON vede premio Vantaggi", !in_array($rewVantaggi['id'], $idsVip, true));

echo PHP_EOL . "--- 2. CREAZIONE E SEGMENTAZIONE OFFERTE ---" . PHP_EOL;

// Offerta 1: Standard (Vantaggi)
$offVantaggi = $offerService->createOffer($bizAId, [
    'title' => 'Sconto 15% Vantaggi ' . $tSuffix,
    'discount_type' => 'percentage',
    'discount_value' => 15.0,
    'target_audience' => 'vantaggi',
    'offer_type' => 'discount',
    'required_capability' => 'offers',
    'card_profile_id' => $vantaggiProfileId,
]);

// Offerta 2: VIP Esclusiva
$offVip = $offerService->createOffer($bizAId, [
    'title' => 'Calice Champagne VIP ' . $tSuffix,
    'discount_type' => 'percentage',
    'discount_value' => 100.0,
    'target_audience' => 'vip',
    'offer_type' => 'vip_exclusive',
    'required_capability' => 'vip_offers',
    'card_profile_id' => $vipProfileId,
]);

// Offerta 3: Vantaggi + VIP (target_audience = 'vantaggi_vip', card_profile_id = NULL)
$offBoth = $offerService->createOffer($bizAId, [
    'title' => 'Promo Insieme Vantaggi e VIP ' . $tSuffix,
    'discount_type' => 'percentage',
    'discount_value' => 10.0,
    'target_audience' => 'vantaggi_vip',
    'offer_type' => 'standard',
    'required_capability' => 'offers',
]);

// Test 4: listOffers per conto PUNTI -> Nessuna offerta permessa
$offersPunti = $offerService->listOffers($bizAId, true, $puntiProfileId);
assertSeg("Conto Punti: listOffers ritorna array vuoto (nessuna offerta)", empty($offersPunti));

// Test 5: listOffers per conto VANTAGGI
$offersVantaggi = $offerService->listOffers($bizAId, true, $vantaggiProfileId);
$idsOffVantaggi = array_column($offersVantaggi, 'id');
assertSeg("Conto Vantaggi vede offerta Vantaggi", in_array($offVantaggi['id'], $idsOffVantaggi, true));
assertSeg("Conto Vantaggi vede offerta Vantaggi+VIP", in_array($offBoth['id'], $idsOffVantaggi, true));
assertSeg("Conto Vantaggi NON vede offerta VIP", !in_array($offVip['id'], $idsOffVantaggi, true));

// Test 6: listOffers per conto VIP
$offersVip = $offerService->listOffers($bizAId, true, $vipProfileId);
$idsOffVip = array_column($offersVip, 'id');
assertSeg("Conto VIP vede offerta VIP", in_array($offVip['id'], $idsOffVip, true));
assertSeg("Conto VIP vede offerta Vantaggi+VIP", in_array($offBoth['id'], $idsOffVip, true));
assertSeg("Conto VIP NON vede offerta Solo Vantaggi", !in_array($offVantaggi['id'], $idsOffVip, true));

echo PHP_EOL . "--- 3. VERIFICA SCHEDA PUBBLICA (/c/{token}) ED ANTEPRIMA COMMERCIANTE ---" . PHP_EOL;

// 3.1 Conto PUNTI: Scheda pubblica
$pubPunti = $credService->getPublicCredentialView($tokenPunti);
$prevPunti = $loyaltyService->getAccountPreview($bizAId, $accPuntiId);

assertSeg("Scheda pubblica Punti: espone saldo punti (0)", isset($pubPunti['loyalty_account']['balance']));
assertSeg("Scheda pubblica Punti: CERO offerte (chiave assente)", !isset($pubPunti['offers']));
assertSeg("Scheda pubblica Punti: CERO premi VIP (chiave rewards assente)", !isset($pubPunti['rewards']));
assertSeg("Scheda pubblica Punti: Cero PII (senza customer)", !isset($pubPunti['customer']));

// Confronto tra Anteprima e Scheda Pubblica per Punti
assertSeg("Anteprima Punti ha is_preview = true e mode = preview", $prevPunti['is_preview'] === true && $prevPunti['mode'] === 'preview');
assertSeg("Anteprima Punti espone lo stesso saldo della scheda pubblica", $prevPunti['loyalty_account']['balance'] === $pubPunti['loyalty_account']['balance']);
assertSeg("Anteprima Punti: CERO offerte (chiave assente come nel pubblico)", !isset($prevPunti['offers']));
assertSeg("Anteprima Punti: CERO premi (chiave assente come nel pubblico)", !isset($prevPunti['rewards']));

// 3.2 Conto VANTAGGI: Scheda pubblica ed Anteprima
$pubVantaggi = $credService->getPublicCredentialView($tokenVantaggi);
$prevVantaggi = $loyaltyService->getAccountPreview($bizAId, $accVantaggiId);

assertSeg("Scheda pubblica Vantaggi: espone saldo punti", isset($pubVantaggi['loyalty_account']['balance']));
assertSeg("Scheda pubblica Vantaggi: espone premi (solo Punti e Vantaggi, CERO VIP)", !empty($pubVantaggi['rewards']) && !in_array($rewVip['id'], array_column($pubVantaggi['rewards'], 'id'), true));
assertSeg("Scheda pubblica Vantaggi: espone offerte Vantaggi (CERO VIP)", !empty($pubVantaggi['offers']) && !in_array($offVip['id'], array_column($pubVantaggi['offers'], 'id'), true));
assertSeg("Anteprima Vantaggi coincide con Scheda Pubblica (stesso conteggio premi)", count($prevVantaggi['rewards']) === count($pubVantaggi['rewards']));
assertSeg("Anteprima Vantaggi coincide con Scheda Pubblica (stesso conteggio offerte)", count($prevVantaggi['offers']) === count($pubVantaggi['offers']));

// 3.3 Conto VIP: Scheda pubblica ed Anteprima
$pubVip = $credService->getPublicCredentialView($tokenVip);
$prevVip = $loyaltyService->getAccountPreview($bizAId, $accVipId);

assertSeg("Scheda pubblica VIP: CERO saldo di punti", !isset($pubVip['loyalty_account']['balance']));
assertSeg("Scheda pubblica VIP: CERO catalogo punti Punti/Vantaggi", !isset($pubVip['rewards']));
assertSeg("Scheda pubblica VIP: espone offerte VIP", !empty($pubVip['offers']) && in_array($offVip['id'], array_column($pubVip['offers'], 'id'), true));
assertSeg("Scheda pubblica VIP: CERO offerte Solo Vantaggi", !in_array($offVantaggi['id'], array_column($pubVip['offers'], 'id'), true));
assertSeg("Anteprima VIP coincide con Scheda Pubblica (nessun saldo punti)", !isset($prevVip['loyalty_account']['balance']));
assertSeg("Anteprima VIP coincide con Scheda Pubblica (stesse offerte VIP)", count($prevVip['offers']) === count($pubVip['offers']));

echo PHP_EOL . "--- 4. VALIDAZIONE E REIEZIONE CANJE INCOMPATIBILE (BACKEND SECURITY) ---" . PHP_EOL;

// 4.1 Punti non può riscattare premi (perché la capacità rewards spetta a Vantaggi)
try {
    $rewardService->redeemReward($bizAId, $accPuntiId, $rewPunti['id'], 'op_punti_fail_' . $tSuffix, $ownerAId);
    assertSeg("Reiezione canje premio per conto Punti (403)", false);
} catch (ForbiddenException $e) {
    assertSeg("Reiezione canje premio per conto Punti (403)", true, $e->getMessage());
}

// 4.2 Punti non può riscattare offerte
try {
    $offerService->redeemOffer($bizAId, $accPuntiId, $offVantaggi['id'], 'op_punti_off_fail_' . $tSuffix, $ownerAId);
    assertSeg("Reiezione canje offerta per conto Punti (403)", false);
} catch (ForbiddenException $e) {
    assertSeg("Reiezione canje offerta per conto Punti (403)", true, $e->getMessage());
}

// 4.3 Vantaggi tenta di riscattare premio VIP -> Rifiuto per incompatibilità profilo
try {
    $rewardService->redeemReward($bizAId, $accVantaggiId, $rewVip['id'], 'op_vant_vip_rew_fail_' . $tSuffix, $ownerAId);
    assertSeg("Conto Vantaggi non può riscattare premio VIP (InvalidArgumentException)", false);
} catch (InvalidArgumentException $e) {
    assertSeg("Conto Vantaggi non può riscattare premio VIP (InvalidArgumentException)", true, $e->getMessage());
}

// 4.4 Vantaggi tenta di riscattare offerta VIP -> Rifiuto
try {
    $offerService->redeemOffer($bizAId, $accVantaggiId, $offVip['id'], 'op_vant_vip_off_fail_' . $tSuffix, $ownerAId);
    assertSeg("Conto Vantaggi non può riscattare offerta VIP (403/Forbidden)", false);
} catch (ForbiddenException|InvalidArgumentException $e) {
    assertSeg("Conto Vantaggi non può riscattare offerta VIP (403/Forbidden)", true, $e->getMessage());
}

// 4.5 VIP tenta di riscattare offerta standard Vantaggi -> Rifiuto
try {
    $offerService->redeemOffer($bizAId, $accVipId, $offVantaggi['id'], 'op_vip_vant_off_fail_' . $tSuffix, $ownerAId);
    assertSeg("Conto VIP non può riscattare offerta Vantaggi (403/Forbidden)", false);
} catch (ForbiddenException|InvalidArgumentException $e) {
    assertSeg("Conto VIP non può riscattare offerta Vantaggi (403/Forbidden)", true, $e->getMessage());
}

// 4.6 VIP tenta di riscattare premio con punti -> Rifiuto (capacità points/rewards assente)
try {
    $rewardService->redeemReward($bizAId, $accVipId, $rewPunti['id'], 'op_vip_pts_rew_fail_' . $tSuffix, $ownerAId);
    assertSeg("Conto VIP non può riscattare premi con punti (403/Forbidden)", false);
} catch (ForbiddenException|InvalidArgumentException $e) {
    assertSeg("Conto VIP non può riscattare premi con punti (403/Forbidden)", true, $e->getMessage());
}

echo PHP_EOL . "--- 5. AISLAMIENTO MULTIEMPRESA (TENANT CROSS-PROTECTION) ---" . PHP_EOL;

// 5.1 Commercio B tenta di accedere al conto di Commercio A tramite getAccountPreview
try {
    $loyaltyService->getAccountPreview($bizBId, $accPuntiId);
    assertSeg("Aislamiento: Commercio B bloccato in anteprima su conto di Commercio A", false);
} catch (InvalidArgumentException $e) {
    assertSeg("Aislamiento: Commercio B bloccato in anteprima su conto di Commercio A", true, $e->getMessage());
}

// 5.2 Commercio B tenta di riscattare premio su conto di Commercio A
try {
    $rewardService->redeemReward($bizBId, $accVantaggiId, $rewVantaggi['id'], 'op_cross_rew_' . $tSuffix, $ownerBId);
    assertSeg("Aislamiento: Commercio B bloccato al canje su Commercio A", false);
} catch (InvalidArgumentException|ForbiddenException $e) {
    assertSeg("Aislamiento: Commercio B bloccato al canje su Commercio A", true, $e->getMessage());
}

// 5.3 Commercio B tenta di riscattare offerta su conto di Commercio A
try {
    $offerService->redeemOffer($bizBId, $accVantaggiId, $offVantaggi['id'], 'op_cross_off_' . $tSuffix, $ownerBId);
    assertSeg("Aislamiento: Commercio B bloccato al canje offerta su Commercio A", false);
} catch (InvalidArgumentException|ForbiddenException $e) {
    assertSeg("Aislamiento: Commercio B bloccato al canje offerta su Commercio A", true, $e->getMessage());
}

echo PHP_EOL . "==========================================" . PHP_EOL;
echo "ESITO FINALE: {$passedCount} di {$totalTests} verifiche superate con successo!" . PHP_EOL;
echo "==========================================" . PHP_EOL;

if ($passedCount !== $totalTests) {
    exit(1);
}
