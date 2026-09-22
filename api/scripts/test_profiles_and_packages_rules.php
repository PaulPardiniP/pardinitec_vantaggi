<?php

declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

use App\Core\Database\Connection;
use App\Modules\Customers\CustomerService;
use App\Modules\Loyalty\LoyaltyService;
use App\Modules\Offers\OfferService;
use App\Modules\Businesses\BusinessService;
use App\Modules\AccessCredentials\CredentialService;

echo PHP_EOL . "=== TEST REGLAS CANONICAS DE PERFILES, PAQUETES Y OFERTAS VIP ===" . PHP_EOL;

$pdo = Connection::get();
$currentDb = $pdo->query("SELECT DATABASE()")->fetchColumn();
echo "Database attivo: {$currentDb}" . PHP_EOL;
if ($currentDb !== 'pardinitec_vantaggi_test') {
    echo "ERRORE CRITICO: I test devono essere eseguiti esclusivamente su pardinitec_vantaggi_test!" . PHP_EOL;
    exit(1);
}

$totalTests = 0;
$passedCount = 0;

function assertRule(string $description, bool $condition, ?string $details = null): void
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

$loyaltyService = new LoyaltyService($pdo);
$customerService = new CustomerService($pdo);
$offerService = new OfferService($pdo);
$businessService = new BusinessService($pdo);
$credService = new CredentialService($pdo);
$capService = new \App\Modules\Loyalty\CapabilityService($pdo);

// 1. Setup Business A (solo Punti)
$suffix = bin2hex(random_bytes(3));
$pdo->exec("INSERT INTO businesses (name, slug, tax_id, status, created_at, updated_at)
            VALUES ('Biz Punti {$suffix}', 'biz-punti-{$suffix}', 'IT{$suffix}', 'active', UTC_TIMESTAMP(), UTC_TIMESTAMP())");
$bizPuntiId = (int) $pdo->lastInsertId();

// Assign only punti package (packages: punti=1, vantaggi=0, vip=0)
$capService->applyInitialPackages($bizPuntiId, ['punti' => true, 'vantaggi' => false, 'vip' => false, 'campaigns' => false]);

// 2. Setup Business B (Punti + Vantaggi + VIP)
$pdo->exec("INSERT INTO businesses (name, slug, tax_id, status, created_at, updated_at)
            VALUES ('Biz Full {$suffix}', 'biz-full-{$suffix}', 'ITF{$suffix}', 'active', UTC_TIMESTAMP(), UTC_TIMESTAMP())");
$bizFullId = (int) $pdo->lastInsertId();
$capService->applyInitialPackages($bizFullId, ['punti' => true, 'vantaggi' => true, 'vip' => true, 'campaigns' => false]);

// Test 1: Comercio solo Punti permite crear cuenta Punti
$cust1 = $customerService->createCustomer($bizPuntiId, [
    'first_name' => 'Mario',
    'last_name' => 'PuntiOnly',
    'email' => "mario_{$suffix}@test.local",
    'privacy_accepted' => true,
]);
$cust1Id = (int) $cust1['id'];

$acc1 = $loyaltyService->createAccount($bizPuntiId, $cust1Id, 'punti', true);
assertRule('Comercio solo Punti permite crear cuenta Punti', $acc1['profile_code'] === 'punti');

// Test 2: Comercio solo Punti rechaza crear cuenta Vantaggi con InvalidArgumentException
$vantaggiBlocked = false;
try {
    $loyaltyService->createAccount($bizPuntiId, $cust1Id, 'vantaggi', true);
} catch (InvalidArgumentException $e) {
    $vantaggiBlocked = true;
}
assertRule('Comercio solo Punti rechaza cuenta Vantaggi', $vantaggiBlocked);

// Test 3: Comercio solo Punti rechaza crear cuenta VIP con InvalidArgumentException
$vipBlocked = false;
try {
    $loyaltyService->createAccount($bizPuntiId, $cust1Id, 'vip', true);
} catch (InvalidArgumentException $e) {
    $vipBlocked = true;
}
assertRule('Comercio solo Punti rechaza cuenta VIP', $vipBlocked);

// Test 4: En comercio Full, crear cuenta Punti para un cliente y luego intentar duplicar Punti
$cust2 = $customerService->createCustomer($bizFullId, [
    'first_name' => 'Luigi',
    'last_name' => 'Full',
    'email' => "luigi_{$suffix}@test.local",
    'privacy_accepted' => true,
]);
$cust2Id = (int) $cust2['id'];

$accPunti = $loyaltyService->createAccount($bizFullId, $cust2Id, 'punti', true);
$dupPuntiBlocked = false;
try {
    $loyaltyService->createAccount($bizFullId, $cust2Id, 'punti', true);
} catch (InvalidArgumentException $e) {
    $dupPuntiBlocked = true;
}
assertRule('Rechaza cuenta Punti duplicada para el mismo cliente', $dupPuntiBlocked);

// Test 5: Modificar perfil in-place Punti -> Vantaggi sin alterar account_id, saldo, credenciales ni tokens
$accPuntiId = (int) $accPunti['id'];
$pdo->exec("UPDATE loyalty_accounts SET balance = 250 WHERE id = {$accPuntiId}");

$credsBefore = $credService->getCredentialsForAccount($bizFullId, $accPuntiId);
$tokenHashBefore = $credsBefore[0]['token_hash'] ?? null;
$credIdBefore = $credsBefore[0]['id'] ?? null;

$accUpgraded = $loyaltyService->changeAccountProfile($bizFullId, $accPuntiId, 'vantaggi');
assertRule('Modifica profilo Punti -> Vantaggi exitoso', $accUpgraded['profile_code'] === 'vantaggi');
assertRule('Mantiene account_id intacto tras cambio de perfil', (int) $accUpgraded['id'] === $accPuntiId);
assertRule('Mantiene saldo intacto tras cambio de perfil', (int) $accUpgraded['balance'] === 250);

$credsAfter = $credService->getCredentialsForAccount($bizFullId, $accPuntiId);
$tokenHashAfter = $credsAfter[0]['token_hash'] ?? null;
$credIdAfter = $credsAfter[0]['id'] ?? null;
assertRule('Mantiene exactamente credencial y token_hash tras cambio de perfil', $credIdBefore === $credIdAfter && $tokenHashBefore === $tokenHashAfter);

// Test 6: Modificar perfil in-place Vantaggi -> Punti
$accDowngraded = $loyaltyService->changeAccountProfile($bizFullId, $accPuntiId, 'punti');
assertRule('Modifica profilo Vantaggi -> Punti exitoso', $accDowngraded['profile_code'] === 'punti');
assertRule('Mantiene account_id intacto tras reversión a Punti', (int) $accDowngraded['id'] === $accPuntiId);

// Test 7: En comercio solo Punti, changeAccountProfile a Vantaggi es rechazado
$puntiOnlyChangeBlocked = false;
try {
    $loyaltyService->changeAccountProfile($bizPuntiId, (int) $acc1['id'], 'vantaggi');
} catch (InvalidArgumentException $e) {
    $puntiOnlyChangeBlocked = true;
}
assertRule('Comercio solo Punti rechaza cambiar perfil a Vantaggi', $puntiOnlyChangeBlocked);

// Test 8: No permitir convertir cuenta estándar a VIP ni viceversa
$changeToVipBlocked = false;
try {
    $loyaltyService->changeAccountProfile($bizFullId, $accPuntiId, 'vip');
} catch (InvalidArgumentException $e) {
    $changeToVipBlocked = true;
}
assertRule('Rechaza convertir cuenta estándar a VIP vía changeAccountProfile', $changeToVipBlocked);

// Test 9: Crear cuenta VIP separada e independiente para el mismo cliente
$accVip = $loyaltyService->createAccount($bizFullId, $cust2Id, 'vip', true);
assertRule('Permite crear cuenta VIP separada con credencial autónoma', $accVip['profile_code'] === 'vip' && (int)$accVip['id'] !== $accPuntiId);

$changeVipBlocked = false;
try {
    $loyaltyService->changeAccountProfile($bizFullId, (int) $accVip['id'], 'vantaggi');
} catch (InvalidArgumentException $e) {
    $changeVipBlocked = true;
}
assertRule('Rechaza convertir cuenta VIP a cuenta estándar', $changeVipBlocked);

// Test 10: Oferta VIP rechazada si el comercio NO tiene el módulo VIP habilitado
// En Biz Punti (VIP deshabilitado):
$vipOfferBlocked = false;
try {
    $offerService->createOffer($bizPuntiId, [
        'title' => 'Aperitivo VIP',
        'target_audience' => 'vip',
        'discount_type' => 'fixed',
        'discount_value' => 20,
    ]);
} catch (InvalidArgumentException $e) {
    $vipOfferBlocked = true;
    assertRule('Mensaje de error exacto para VIP no habilitado', str_contains($e->getMessage(), 'modulo VIP non è attivo'));
}
assertRule('Oferta VIP rechazada si el comercio no tiene el módulo VIP habilitado', $vipOfferBlocked);

// Test 11: En comercio con VIP habilitado, la oferta VIP se permite incluso con 0 clientes VIP
$bizVipZeroCustId = (int) $pdo->query("INSERT INTO businesses (name, slug, tax_id, status, created_at, updated_at) VALUES ('Biz VIP Zero {$suffix}', 'biz-vip-zero-{$suffix}', 'IT0{$suffix}', 'active', UTC_TIMESTAMP(), UTC_TIMESTAMP())")->fetchColumn();
$bizVipZeroCustId = (int) $pdo->lastInsertId();
$capService->applyInitialPackages($bizVipZeroCustId, ['punti' => true, 'vantaggi' => true, 'vip' => true, 'campaigns' => false]);

$vipOfferZeroCreated = $offerService->createOffer($bizVipZeroCustId, [
    'title' => 'Omaggio VIP con 0 Clienti',
    'target_audience' => 'vip',
    'discount_type' => 'percentage',
    'discount_value' => 25,
]);
assertRule('Oferta VIP creada exitosamente cuando VIP está habilitado incluso con 0 clientes VIP', !empty($vipOfferZeroCreated['id']) && $vipOfferZeroCreated['target_audience'] === 'vip');

// Test 12: listCustomers devuelve array de perfiles activos
$custList = $customerService->listCustomers($bizFullId);
$foundCust2 = null;
foreach ($custList['data'] as $c) {
    if ($c['id'] === $cust2Id) {
        $foundCust2 = $c;
        break;
    }
}
assertRule('listCustomers incluye profiles (punti, vip)', $foundCust2 !== null && in_array('punti', $foundCust2['profiles'], true) && in_array('vip', $foundCust2['profiles'], true));

// Test 13: Aislamiento multi-tenant de cuentas por business_id
$crossAcc = $loyaltyService->getAccount($bizPuntiId, (int) $accVip['id']);
assertRule('Aislamiento multi-tenant de cuentas por business_id', $crossAcc === null);

// Test 14: Cuenta Punti + 1 activo + 1 archivado + 1 inactivo en Biz Punti
$rewardService = new \App\Modules\Rewards\RewardService($pdo);
$rewardActive = $rewardService->createReward($bizPuntiId, [
    'name' => 'Caffè Punti Attivo',
    'points_cost' => 100,
    'status' => 'active',
]);
$rewardArchived = $rewardService->createReward($bizPuntiId, [
    'name' => 'Premio Punti Archiviato',
    'points_cost' => 200,
    'status' => 'active',
]);
$pdo->exec("UPDATE `rewards` SET `status` = 'archived' WHERE `id` = {$rewardArchived['id']}");

$rewardInactive = $rewardService->createReward($bizPuntiId, [
    'name' => 'Premio Punti Inattivo',
    'points_cost' => 300,
    'status' => 'inactive',
]);

// Crear un premio en Biz Full (otro comercio)
$rewardOtherBiz = $rewardService->createReward($bizFullId, [
    'name' => 'Premio de Otro Comercio',
    'points_cost' => 50,
    'status' => 'active',
]);

// Emitir credencial digital para la cuenta Punti de Biz Punti
$credPuntiBiz = $credService->issueDigitalCredential($bizPuntiId, (int) $acc1['id']);
$rawTokenPunti = $credPuntiBiz['token'];

$viewPunti = $credService->getPublicCredentialView($rawTokenPunti);
$rewardsInViewPunti = $viewPunti['rewards'] ?? [];
$rewardNamesPunti = array_column($rewardsInViewPunti, 'name');

assertRule('Cuenta Punti: muestra solamente premio activo (1 premio)', count($rewardsInViewPunti) === 1 && in_array('Caffè Punti Attivo', $rewardNamesPunti, true));
assertRule('Premio archivado nunca aparece en la vista pública', !in_array('Premio Punti Archiviato', $rewardNamesPunti, true));
assertRule('Premio inactivo nunca aparece en la vista pública', !in_array('Premio Punti Inattivo', $rewardNamesPunti, true));
assertRule('Premio de otro business_id nunca aparece (aislamiento multi-tenant)', !in_array('Premio de Otro Comercio', $rewardNamesPunti, true));
assertRule('Next reward nunca es un premio archivado ni inactivo', ($viewPunti['next_reward']['name'] ?? '') === 'Caffè Punti Attivo');

// Test 15: Cuenta Vantaggi en Biz Full + 1 premio activo
$rewardVantaggi = $rewardService->createReward($bizFullId, [
    'name' => 'Sciarpa Vantaggi Attiva',
    'points_cost' => 150,
    'status' => 'active',
]);

// Emitir credencial para accPuntiId antes de cambiar perfil
$credFull = $credService->issueDigitalCredential($bizFullId, $accPuntiId);
$fullTokenRow = $pdo->query("SELECT public_token_hash FROM access_credentials WHERE id = {$credFull['id']}")->fetch(PDO::FETCH_ASSOC);

// Cambiar a Vantaggi
$loyaltyService->changeAccountProfile($bizFullId, $accPuntiId, 'vantaggi');

// Consultar con el mismo token existente (o emitido)
$viewVantaggi = $credService->getPublicCredentialView($credFull['token']);
$rewardsInViewVantaggi = $viewVantaggi['rewards'] ?? [];
$rewardNamesVantaggi = array_column($rewardsInViewVantaggi, 'name');

assertRule('Cuenta Vantaggi: muestra premios activos compatibles', in_array('Sciarpa Vantaggi Attiva', $rewardNamesVantaggi, true));
assertRule('Encabezado de perfil en vista pública es VANTAGGI', $viewVantaggi['loyalty_account']['profile_code'] === 'vantaggi');

// Test 16: Cambio Vantaggi -> Punti persiste tras recargar y conserva token, saldo y movimientos
$loyaltyService->changeAccountProfile($bizFullId, $accPuntiId, 'punti');
$viewAfterDowngrade = $credService->getPublicCredentialView($credFull['token']);

assertRule('Cambio Vantaggi -> Punti: encabezado público muestra PUNTI', $viewAfterDowngrade['loyalty_account']['profile_code'] === 'punti');
assertRule('Cambio Vantaggi -> Punti: conserva saldo intacto', (int) $viewAfterDowngrade['loyalty_account']['balance'] === 250);
assertRule('Cambio Vantaggi -> Punti: token y credencial siguen siendo válidos', $viewAfterDowngrade['state'] === 'active');

// Test 17: Nombre en tarjeta: vista pública muestra Nombre + Inicial Apellido; vista staff muestra Nombre Completo
$viewPuntiPublic = $credService->getPublicCredentialView($rawTokenPunti);
assertRule('Vista pública: muestra Nombre + Inicial Apellido (Mario P.)', ($viewPuntiPublic['customer']['display_name'] ?? '') === 'Mario P.');

$viewerStaff = ['user_id' => 1, 'business_id' => $bizPuntiId, 'role' => 'staff'];
$viewPuntiStaff = $credService->getPublicCredentialView($rawTokenPunti, $viewerStaff);
assertRule('Vista staff: muestra Nombre y Apellido completos (Mario PuntiOnly)', ($viewPuntiStaff['customer']['display_name'] ?? '') === 'Mario PuntiOnly');

// Test 18: Validación VIP: cliente con cuenta VIP activa sin credencial emitida cuenta en vip-stats y permite crear beneficio VIP
$custVipTest = $customerService->createCustomer($bizFullId, [
    'first_name' => 'Roberto',
    'last_name' => 'VipReal',
    'email' => "roberto_vip_{$suffix}@test.local",
    'privacy_accepted' => true,
]);
$accVipNoCred = $loyaltyService->createAccount($bizFullId, (int) $custVipTest['id'], 'vip');
// No emitimos credencial para $accVipNoCred

// Comprobar conteo VIP por query canónica
$vipCountStmt = $pdo->prepare("
    SELECT COUNT(*) 
    FROM `loyalty_accounts` la
    INNER JOIN `card_profiles` cp ON la.`card_profile_id` = cp.`id`
    WHERE la.`business_id` = :business_id 
      AND cp.`code` = 'vip' 
      AND la.`status` = 'active'
");
$vipCountStmt->execute(['business_id' => $bizFullId]);
$vipCountResult = (int) $vipCountStmt->fetchColumn();
assertRule('vip-stats: cuenta loyalty_accounts VIP activas sin requerir credencial emitida', $vipCountResult >= 1);

$vipOfferCreated = $offerService->createOffer($bizFullId, [
    'title' => 'Accesso Lounge VIP Esclusivo',
    'discount_type' => 'percentage',
    'discount_value' => 20,
    'target_audience' => 'vip',
    'is_single_use' => false,
]);
assertRule('Permite crear beneficio/oferta VIP cuando existe cliente con cuenta VIP activa', !empty($vipOfferCreated['id']));

// Test 19: Riscatto premio: protección de saldo insuficiente
$rewardExp = $rewardService->createReward($bizFullId, [
    'name' => 'Viaggio Lusso 10000 pt',
    'points_cost' => 10000,
    'status' => 'active',
]);
$redeemFailed = false;
try {
    $rewardService->redeemReward($bizFullId, $accPuntiId, (int) $rewardExp['id'], "test_op_fail_{$suffix}");
} catch (\InvalidArgumentException $e) {
    $redeemFailed = true;
}
// Test 20: Cuenta VIP con credencial digital y tarjeta física: ambas resuelven exactamente los mismos beneficios VIP activos
$cardService = new \App\Modules\Cards\CardService($pdo, $credService, $loyaltyService);
$credVipDig = $credService->issueDigitalCredential($bizFullId, (int) $accVip['id']);

$cardVipPhys = $cardService->createCardInInventory(1, 1);
$cardService->assignCardsToBusiness([(int)$cardVipPhys['id']], $bizFullId, 1);
$cardService->activateCard($bizFullId, (int)$cardVipPhys['id'], (int) $accVip['id'], 1);
$rawTokenPhys = $cardVipPhys['token'];

$viewVipDigital = $credService->getPublicCredentialView($credVipDig['token']);
$viewVipPhysical = $credService->getPublicCredentialView($rawTokenPhys);

assertRule('Ambas credenciales (digital y física) pertenecen a la misma cuenta VIP', 
    (int)$viewVipDigital['loyalty_account']['id'] === (int)$accVip['id'] &&
    (int)$viewVipPhysical['loyalty_account']['id'] === (int)$accVip['id'] &&
    $viewVipDigital['loyalty_account']['profile_code'] === 'vip' &&
    $viewVipPhysical['loyalty_account']['profile_code'] === 'vip'
);

$offersDigital = $viewVipDigital['offers'] ?? [];
$offersPhysical = $viewVipPhysical['offers'] ?? [];

assertRule('Tarjeta física VIP resuelve exactamente los mismos beneficios VIP que la digital', 
    count($offersPhysical) >= 1 &&
    count($offersPhysical) === count($offersDigital) &&
    array_column($offersPhysical, 'id') === array_column($offersDigital, 'id') &&
    array_column($offersPhysical, 'title') === array_column($offersDigital, 'title')
);

assertRule('Ninguna de las dos credenciales VIP expone saldo ni catálogo de puntos', 
    !isset($viewVipDigital['loyalty_account']['balance']) &&
    !isset($viewVipPhysical['loyalty_account']['balance']) &&
    empty($viewVipDigital['rewards']) &&
    empty($viewVipPhysical['rewards'])
);

assertRule('Diferenciación exclusiva en metadatos propios de la credencial (digital vs physical)', 
    $viewVipDigital['credential_type'] === 'digital' &&
    $viewVipPhysical['credential_type'] === 'physical' &&
    $viewVipDigital['credential_id'] !== $viewVipPhysical['credential_id']
);

echo PHP_EOL . "RISULTATO: {$passedCount} / {$totalTests} test superati con successo!" . PHP_EOL;
if ($passedCount !== $totalTests) {
    exit(1);
}


