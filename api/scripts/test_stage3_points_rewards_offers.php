<?php

declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

use App\Core\Database\Connection;
use App\Modules\AccessCredentials\CredentialService;
use App\Modules\Businesses\AuthorizationService;
use App\Modules\Businesses\BusinessService;
use App\Modules\Businesses\ForbiddenException;
use App\Modules\Businesses\Permission;
use App\Modules\Businesses\Role;
use App\Modules\Customers\CustomerService;
use App\Modules\Loyalty\CapabilityService;
use App\Modules\Loyalty\LoyaltyService;
use App\Modules\Offers\OfferService;
use App\Modules\Points\LoyaltyProgramService;
use App\Modules\Points\PointsService;
use App\Modules\Rewards\RewardService;

$pdo = Connection::get();

$totalTests = 0;
$passedCount = 0;

function assertStage3Test(string $description, bool $condition, ?string $details = null): void
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

echo PHP_EOL . "=== INICIANDO PRUEBAS DE LA ETAPA 3 (POINTS, REWARDS, OFFERS Y CAPACIDADES) ===" . PHP_EOL;

// 1. Verificación de Migración 0008 e Integridad DDL
echo PHP_EOL . "--- 1. Integridad DDL y Tablas de la Etapa 3 ---" . PHP_EOL;

$requiredTables = [
    'modules',
    'business_modules',
    'card_profile_modules',
    'loyalty_programs',
    'points_transactions',
    'rewards',
    'reward_redemptions',
    'offers',
    'offer_redemptions',
];

foreach ($requiredTables as $tbl) {
    $stmt = $pdo->query("SHOW TABLES LIKE '{$tbl}'");
    assertStage3Test("Tabla '{$tbl}' existe en MariaDB", $stmt->rowCount() === 1);
}

// Comprobar siembra de módulos estándar
$modStmt = $pdo->query("SELECT COUNT(*) FROM `modules` WHERE `code` IN ('points', 'rewards', 'offers', 'benefits', 'vip_offers', 'discounts')");
assertStage3Test("Módulos estándar sembrados correctamente (6 módulos)", (int) $modStmt->fetchColumn() === 6);

// Comprobar siembra de card_profile_modules
$cpStmt = $pdo->query("
    SELECT cp.`code`, COUNT(cpm.`id`) AS `cap_count`
    FROM `card_profiles` cp
    LEFT JOIN `card_profile_modules` cpm ON cp.`id` = cpm.`card_profile_id`
    GROUP BY cp.`code`
");
$capsByProfile = $cpStmt->fetchAll(PDO::FETCH_KEY_PAIR);
assertStage3Test("Perfil 'punti' posee exactamente 1 capacidad ('points')", ($capsByProfile['punti'] ?? 0) === 1);
assertStage3Test("Perfil 'vantaggi' posee 4 capacidades ('points', 'rewards', 'offers', 'benefits')", ($capsByProfile['vantaggi'] ?? 0) === 4);
assertStage3Test("Perfil 'vip' posee 3 capacidades ('benefits', 'vip_offers', 'discounts')", ($capsByProfile['vip'] ?? 0) === 3);

// 2. Configuración de Entorno de Pruebas Multiempresa
echo PHP_EOL . "--- 2. Configuración de Entorno Multiempresa y Usuarios ---" . PHP_EOL;

$timeSuffix = time() . '_' . random_int(1000, 9999);

// Crear Usuarios: Owner A, Staff A, Owner B
$authStmt = $pdo->prepare("
    INSERT INTO `users` (`name`, `email`, `password_hash`, `status`, `is_super_admin`, `created_at`, `updated_at`)
    VALUES (:name, :email, :hash, 'active', 0, UTC_TIMESTAMP(), UTC_TIMESTAMP())
");
$pwdHash = password_hash('SecretPass123!', PASSWORD_BCRYPT);

$authStmt->execute(['name' => 'Owner A', 'email' => "owner_a_{$timeSuffix}@test.com", 'hash' => $pwdHash]);
$ownerAId = (int) $pdo->lastInsertId();

$authStmt->execute(['name' => 'Staff A', 'email' => "staff_a_{$timeSuffix}@test.com", 'hash' => $pwdHash]);
$staffAId = (int) $pdo->lastInsertId();

$authStmt->execute(['name' => 'Owner B', 'email' => "owner_b_{$timeSuffix}@test.com", 'hash' => $pwdHash]);
$ownerBId = (int) $pdo->lastInsertId();

// Crear Comercios A y B
$bizService = new BusinessService($pdo);
$bizA = $bizService->createBusiness($ownerAId, [
    'name' => 'Bar Roma ' . $timeSuffix,
    'slug' => 'bar-roma-' . $timeSuffix,
]);
$bizB = $bizService->createBusiness($ownerBId, [
    'name' => 'Caffè Milano ' . $timeSuffix,
    'slug' => 'caffe-milano-' . $timeSuffix,
]);

// Agregar Staff a Comercio A
$bizService->addMember($ownerAId, $bizA['id'], [
    'email' => "staff_a_{$timeSuffix}@test.com",
    'role' => Role::STAFF,
]);

assertStage3Test("Comercios A ({$bizA['id']}) y B ({$bizB['id']}) y miembros configurados", $bizA['id'] > 0 && $bizB['id'] > 0);

// Crear Servicios
$capService = new CapabilityService($pdo);
$programService = new LoyaltyProgramService($pdo);
$pointsService = new PointsService($pdo, $capService);
$rewardService = new RewardService($pdo, $capService);
$offerService = new OfferService($pdo, $capService);
$customerService = new CustomerService($pdo);
$loyaltyService = new LoyaltyService($pdo);
$credService = new CredentialService($pdo);

// 3. Modalidades y Configuración de Programas de Puntos
echo PHP_EOL . "--- 3. Modalidades de Puntos y Reglas Comerciales ---" . PHP_EOL;

// 3.1 Inicialización por defecto (fixed_per_purchase, 10 pts)
$progA = $programService->getProgram($bizA['id']);
assertStage3Test("Programa de puntos se inicializa por defecto en fixed_per_purchase con 10 pts",
    $progA['program_type'] === 'fixed_per_purchase' && $progA['fixed_points'] === 10
);

// 3.2 Cálculo en puntos fijos
$calcFixed = $programService->calculatePoints($bizA['id'], 85.50);
assertStage3Test("Cálculo en modalidad fixed_per_purchase retorna puntos fijos independientes del importe (10 pts)", $calcFixed === 10);

// 3.3 Actualización a puntos por importe (1 EUR = 2 puntos)
$programService->updateProgram($bizA['id'], [
    'program_type' => 'points_per_amount',
    'points_per_currency_unit' => 2.00,
]);
$calcAmount = $programService->calculatePoints($bizA['id'], 35.75);
assertStage3Test("Cálculo en modalidad points_per_amount calcula floor(importe * ratio) = 71 pts", $calcAmount === 71);

// 3.4 Actualización a modalidad manual
$programService->updateProgram($bizA['id'], [
    'program_type' => 'manual',
]);
$calcManual = $programService->calculatePoints($bizA['id'], 100.00);
assertStage3Test("Cálculo en modalidad manual retorna 0 (decisión del operador)", $calcManual === 0);

// 4. Clientes, Cuentas y Aislamiento de Perfiles (Punti, Vantaggi, VIP)
echo PHP_EOL . "--- 4. Creación de Cuentas Independientes (Punti, Vantaggi, VIP) ---" . PHP_EOL;

// Crear Cliente 1 en Comercio A con cuenta Punti
$onboard1 = $customerService->onboardCustomer($bizA['id'], [
    'first_name' => 'Mario',
    'last_name' => 'Rossi',
    'phone' => '+39011111111',
    'email' => "mario_{$timeSuffix}@test.com",
    'card_profile' => 'punti',
    'privacy_accepted' => true,
]);
$cust1Id = $onboard1['customer']['id'];
$accPuntiId = $onboard1['loyalty_account']['id'];
$credPuntiToken = $onboard1['token'];

// Crear cuenta VIP para el MISMO Cliente 1 en Comercio A (Multi-cuenta de perfiles independientes)
$vipProfileId = (int) $pdo->query("SELECT `id` FROM `card_profiles` WHERE `code` = 'vip'")->fetchColumn();
$accVip = $loyaltyService->createAccount($bizA['id'], $cust1Id, $vipProfileId);
$accVipId = $accVip['id'];
$credVip = $credService->issueDigitalCredential($bizA['id'], $accVipId);
$credVipToken = $credVip['token'];

assertStage3Test("Cliente 1 creado con cuenta Punti (ID: {$accPuntiId})", $accPuntiId > 0);
assertStage3Test("Mismo Cliente 1 tiene simultáneamente cuenta VIP (ID: {$accVipId}) en el mismo comercio", $accVipId > 0 && $accVipId !== $accPuntiId);

// Crear Cliente 2 con perfil Vantaggi
$onboard2 = $customerService->onboardCustomer($bizA['id'], [
    'first_name' => 'Luigi',
    'last_name' => 'Verdi',
    'phone' => '+39022222222',
    'email' => "luigi_{$timeSuffix}@test.com",
    'card_profile' => 'vantaggi',
    'privacy_accepted' => true,
]);
$accVantaggiId = $onboard2['loyalty_account']['id'];
$credVantaggiToken = $onboard2['token'];
assertStage3Test("Cliente 2 creado con cuenta Vantaggi (ID: {$accVantaggiId})", $accVantaggiId > 0);

// 5. Verificación de Capacidades en Backend (Security by Design)
echo PHP_EOL . "--- 5. Verificación de Capacidades en Backend por Perfil y Negocio ---" . PHP_EOL;

// 5.1 Cuenta Punti tiene 'points' pero NO 'rewards' ni 'offers'
try {
    $capService->assertAccountCapability($bizA['id'], $accPuntiId, 'points');
    assertStage3Test("Cuenta Punti tiene capacidad 'points' permitida", true);
} catch (ForbiddenException $e) {
    assertStage3Test("Cuenta Punti tiene capacidad 'points' permitida", false, $e->getMessage());
}

try {
    $capService->assertAccountCapability($bizA['id'], $accPuntiId, 'rewards');
    assertStage3Test("Cuenta Punti rechaza capacidad 'rewards' por perfil", false);
} catch (ForbiddenException $e) {
    assertStage3Test("Cuenta Punti rechaza capacidad 'rewards' por perfil (403)", true, $e->getMessage());
}

// 5.2 Cuenta VIP tiene 'vip_offers' y 'benefits', pero NO 'points' ni 'rewards'
try {
    $capService->assertAccountCapability($bizA['id'], $accVipId, 'vip_offers');
    assertStage3Test("Cuenta VIP tiene capacidad 'vip_offers' permitida", true);
} catch (ForbiddenException $e) {
    assertStage3Test("Cuenta VIP tiene capacidad 'vip_offers' permitida", false, $e->getMessage());
}

try {
    $capService->assertAccountCapability($bizA['id'], $accVipId, 'points');
    assertStage3Test("Cuenta VIP rechaza capacidad 'points' por perfil", false);
} catch (ForbiddenException $e) {
    assertStage3Test("Cuenta VIP rechaza capacidad 'points' por perfil (403)", true, $e->getMessage());
}

// 5.3 Cuenta Vantaggi tiene 'points', 'rewards', 'offers' pero NO 'vip_offers'
try {
    $capService->assertAccountCapability($bizA['id'], $accVantaggiId, 'vip_offers');
    assertStage3Test("Cuenta Vantaggi rechaza capacidad 'vip_offers' por perfil", false);
} catch (ForbiddenException $e) {
    assertStage3Test("Cuenta Vantaggi rechaza capacidad 'vip_offers' por perfil (403)", true, $e->getMessage());
}

// 6. Ledger Inmutable de Puntos, Saldo y Transacciones
echo PHP_EOL . "--- 6. Ledger Inmutable de Puntos e Idempotencia ---" . PHP_EOL;

$opId1 = 'op_buy_' . time() . '_1';
$resPts1 = $pointsService->adjustPoints($bizA['id'], $accPuntiId, 50, 'purchase_amount', 'Acquisto spesa', $opId1, $staffAId, 25.00);
assertStage3Test("Ajuste de puntos exitoso (+50 pts) con saldo = 50",
    !$resPts1['idempotent'] && $resPts1['balance'] === 50
);

// 6.1 Idempotencia estricta: Reenvío con el mismo operation_id
$resPtsRepeat = $pointsService->adjustPoints($bizA['id'], $accPuntiId, 50, 'purchase_amount', 'Acquisto spesa', $opId1, $staffAId, 25.00);
assertStage3Test("Reintento con mismo operation_id detectado como idempotente (saldo permanece en 50, sin duplicar)",
    $resPtsRepeat['idempotent'] && $resPtsRepeat['balance'] === 50
);

// 6.2 Suma de transacciones adicionales
$opId2 = 'op_bonus_' . time() . '_2';
$resPts2 = $pointsService->adjustPoints($bizA['id'], $accPuntiId, 30, 'bonus', 'Bonus fedeltà', $opId2, $staffAId);
assertStage3Test("Abono de bonus (+30 pts) actualiza saldo a 80", $resPts2['balance'] === 80);

// 6.3 Verificación de concordancia entre Ledger y Saldo en DB
$sumLedger = (int) $pdo->query("SELECT SUM(`points`) FROM `points_transactions` WHERE `loyalty_account_id` = {$accPuntiId}")->fetchColumn();
$currentAccBalance = (int) $pdo->query("SELECT `balance` FROM `loyalty_accounts` WHERE `id` = {$accPuntiId}")->fetchColumn();
assertStage3Test("Suma de transacciones del ledger coincide exactamente con balance en loyalty_accounts (80 pts)",
    $sumLedger === 80 && $currentAccBalance === 80
);

// 6.4 Corrección compensatoria sin eliminar filas históricas
$opIdErr = 'op_err_' . time() . '_err';
$pointsService->adjustPoints($bizA['id'], $accPuntiId, 100, 'manual_adjustment', 'Ajuste erróneo', $opIdErr, $staffAId);

$opIdCorr = 'op_corr_' . time() . '_corr';
$pointsService->adjustPoints($bizA['id'], $accPuntiId, -100, 'correction', 'Corrección compensatoria por error', $opIdCorr, $staffAId);

$currentAccBalance2 = (int) $pdo->query("SELECT `balance` FROM `loyalty_accounts` WHERE `id` = {$accPuntiId}")->fetchColumn();
$txCount = (int) $pdo->query("SELECT COUNT(*) FROM `points_transactions` WHERE `loyalty_account_id` = {$accPuntiId}")->fetchColumn();
assertStage3Test("Corrección compensatoria restaura el saldo a 80 conservando el histórico inmutable (4 transacciones registradas)",
    $currentAccBalance2 === 80 && $txCount === 4
);

// 6.5 Rechazo estricto de saldo negativo
try {
    $pointsService->adjustPoints($bizA['id'], $accPuntiId, -150, 'manual_adjustment', 'Gasto excesivo', 'op_neg_' . time(), $staffAId);
    assertStage3Test("Rechazo de operación que resultaría en saldo negativo", false);
} catch (InvalidArgumentException $e) {
    assertStage3Test("Rechazo de operación que resultaría en saldo negativo (-70 pts rechazado)", true, $e->getMessage());
}
$balanceAfterReject = (int) $pdo->query("SELECT `balance` FROM `loyalty_accounts` WHERE `id` = {$accPuntiId}")->fetchColumn();
assertStage3Test("Saldo permanece íntegro e intacto tras el rechazo (80 pts)", $balanceAfterReject === 80);

// 6.6 Independencia de cuentas del mismo cliente: la cuenta VIP del Cliente 1 permanece en 0 y sin alterar
$vipBalance = (int) $pdo->query("SELECT `balance` FROM `loyalty_accounts` WHERE `id` = {$accVipId}")->fetchColumn();
assertStage3Test("Cuenta VIP del Cliente 1 no fue alterada por los puntos de su cuenta Punti (saldo VIP = 0)", $vipBalance === 0);

// 7. Catálogo y Canje de Premios (Rewards)
echo PHP_EOL . "--- 7. Catálogo de Premios y Canje Atómico ---" . PHP_EOL;

// 7.1 Crear Premios en Comercio A
$reward1 = $rewardService->createReward($bizA['id'], [
    'name' => 'Caffè Omaggio',
    'description' => 'Un caffè espresso a scelta',
    'points_cost' => 50,
]);
$reward2 = $rewardService->createReward($bizA['id'], [
    'name' => 'Sconto 10% Spesa',
    'description' => 'Buono sconto del 10%',
    'points_cost' => 200,
]);
assertStage3Test("Premios creados en catálogo: '{$reward1['name']}' (50 pts) y '{$reward2['name']}' (200 pts)",
    $reward1['id'] > 0 && $reward2['id'] > 0
);

// 7.2 Progreso hacia el próximo premio
// Cuenta Vantaggi inicia en 0, agregarle 40 puntos
$pointsService->adjustPoints($bizA['id'], $accVantaggiId, 40, 'bonus', 'Benvenuto', 'op_wel_' . time(), $staffAId);
$nextRew = $rewardService->getNextAvailableReward($bizA['id'], 40);
assertStage3Test("Cálculo de progreso hacia próximo premio: faltan 10 pts para 'Caffè Omaggio' (80% completado)",
    $nextRew !== null &&
    $nextRew['name'] === 'Caffè Omaggio' &&
    $nextRew['points_needed'] === 10 &&
    $nextRew['progress_percentage'] === 80
);

// 7.3 Rechazo de canje con saldo insuficiente
$opRedeemFail = 'op_red_fail_' . time();
try {
    $rewardService->redeemReward($bizA['id'], $accVantaggiId, $reward1['id'], $opRedeemFail, $staffAId);
    assertStage3Test("Rechazo de canje por puntos insuficientes", false);
} catch (InvalidArgumentException $e) {
    assertStage3Test("Rechazo de canje por puntos insuficientes (tiene 40, requiere 50)", true, $e->getMessage());
}

// 7.4 Canje exitoso tras acumular puntos suficientes (+20 pts -> saldo = 60)
$pointsService->adjustPoints($bizA['id'], $accVantaggiId, 20, 'purchase_fixed', 'Acquisto', 'op_buy2_' . time(), $staffAId);

$opRedeemSuccess = 'op_red_succ_' . time();
$resRedeem = $rewardService->redeemReward($bizA['id'], $accVantaggiId, $reward1['id'], $opRedeemSuccess, $staffAId);

assertStage3Test("Canje de premio exitoso: saldo descontado de 60 a 10 pts",
    !$resRedeem['idempotent'] && $resRedeem['balance'] === 10
);

// 7.5 Idempotencia del canje: reintento con mismo operation_id no descuenta dos veces
$resRedeemRepeat = $rewardService->redeemReward($bizA['id'], $accVantaggiId, $reward1['id'], $opRedeemSuccess, $staffAId);
assertStage3Test("Reintento de canje con mismo operation_id es detectado como idempotente (saldo se mantiene en 10)",
    $resRedeemRepeat['idempotent'] && $resRedeemRepeat['balance'] === 10
);

// 7.6 Movimiento en ledger generado por el canje
$redeemTx = $pdo->query("SELECT * FROM `points_transactions` WHERE `operation_id` = 'pts_{$opRedeemSuccess}'")->fetch(PDO::FETCH_ASSOC);
assertStage3Test("Canje registró movimiento inmutable 'reward_redeem' con -50 puntos en ledger",
    $redeemTx && (int) $redeemTx['points'] === -50 && (int) $redeemTx['balance_after'] === 10
);

// 8. Ofertas Estándar y Ofertas VIP (Monouso y Reutilizables)
echo PHP_EOL . "--- 8. Ofertas Estándar, Ofertas VIP y Canjes Monouso ---" . PHP_EOL;

// 8.1 Crear Oferta Estándar (monouso) para Vantaggi
$offerStd = $offerService->createOffer($bizA['id'], [
    'title' => 'Buono Benvenuto 5 EUR',
    'description' => 'Sconto di 5 EUR sul primo acquisto',
    'offer_type' => 'discount',
    'required_capability' => 'offers',
    'is_single_use' => true,
]);

// 8.2 Crear Oferta VIP Exclusiva para VIP
$offerVip = $offerService->createOffer($bizA['id'], [
    'title' => 'Aperitivo VIP Riservato',
    'description' => 'Calice di prosecco di benvenuto',
    'offer_type' => 'vip_exclusive',
    'required_capability' => 'vip_offers',
    'is_single_use' => true,
]);

assertStage3Test("Oferta Estándar '{$offerStd['title']}' creada", $offerStd['id'] > 0);
assertStage3Test("Oferta VIP '{$offerVip['title']}' creada", $offerVip['id'] > 0);

// 8.3 Canje de Oferta Estándar en cuenta Vantaggi
$opOff1 = 'op_off_' . time() . '_1';
$resOff1 = $offerService->redeemOffer($bizA['id'], $accVantaggiId, $offerStd['id'], $opOff1, $staffAId);
assertStage3Test("Oferta estándar canjeada con éxito en cuenta Vantaggi", !$resOff1['idempotent']);

// 8.4 Idempotencia de canje de oferta
$resOffRepeat = $offerService->redeemOffer($bizA['id'], $accVantaggiId, $offerStd['id'], $opOff1, $staffAId);
assertStage3Test("Reintento de canje de oferta con mismo operation_id es idempotente", $resOffRepeat['idempotent']);

// 8.5 Rechazo de segundo canje de oferta monouso (con nuevo operation_id)
$opOff2 = 'op_off_' . time() . '_2';
try {
    $offerService->redeemOffer($bizA['id'], $accVantaggiId, $offerStd['id'], $opOff2, $staffAId);
    assertStage3Test("Rechazo de reutilización de oferta monouso", false);
} catch (InvalidArgumentException $e) {
    assertStage3Test("Rechazo de reutilización de oferta monouso (Esta oferta ya fue utilizada)", true, $e->getMessage());
}

// 8.6 Rechazo al intentar canjear oferta VIP desde cuenta Vantaggi
try {
    $offerService->redeemOffer($bizA['id'], $accVantaggiId, $offerVip['id'], 'op_vip_err_' . time(), $staffAId);
    assertStage3Test("Cuenta Vantaggi rechaza oferta VIP (vip_offers)", false);
} catch (ForbiddenException $e) {
    assertStage3Test("Cuenta Vantaggi rechaza oferta VIP (403 Forbidden)", true, $e->getMessage());
}

// 8.7 Canje de Oferta VIP exitoso en cuenta VIP
$opVipSucc = 'op_vip_' . time() . '_succ';
$resVipRedeem = $offerService->redeemOffer($bizA['id'], $accVipId, $offerVip['id'], $opVipSucc, $staffAId);
assertStage3Test("Canje de oferta VIP exitoso en cuenta VIP", !$resVipRedeem['idempotent']);

// 9. Aislamiento Multiempresa Estricto (Tenant Cross-Protection)
echo PHP_EOL . "--- 9. Aislamiento Multiempresa Estricto ---" . PHP_EOL;

// 9.1 Comercio B intenta ajustar puntos en cuenta de Comercio A
try {
    $pointsService->adjustPoints($bizB['id'], $accPuntiId, 10, 'manual_adjustment', 'Intrusión B', 'op_cross_' . time(), $ownerBId);
    assertStage3Test("Aislamiento: Comercio B bloqueado al intentar ajustar puntos de Comercio A", false);
} catch (InvalidArgumentException|ForbiddenException $e) {
    assertStage3Test("Aislamiento: Comercio B bloqueado al intentar ajustar puntos de Comercio A", true, $e->getMessage());
}

// 9.2 Comercio B intenta canjear premio de Comercio A
try {
    $rewardService->redeemReward($bizB['id'], $accVantaggiId, $reward1['id'], 'op_cross_rew_' . time(), $ownerBId);
    assertStage3Test("Aislamiento: Comercio B bloqueado al intentar canjear premio de Comercio A", false);
} catch (InvalidArgumentException|ForbiddenException $e) {
    assertStage3Test("Aislamiento: Comercio B bloqueado al intentar canjear premio de Comercio A", true, $e->getMessage());
}

// 9.3 Desactivación dinámica de módulo a nivel de negocio
$capService->setBusinessModule($bizA['id'], 'rewards', false);
try {
    $rewardService->redeemReward($bizA['id'], $accVantaggiId, $reward1['id'], 'op_mod_disabled_' . time(), $staffAId);
    assertStage3Test("Rechazo de canje si el módulo 'rewards' fue desactivado para el comercio", false);
} catch (ForbiddenException $e) {
    assertStage3Test("Rechazo de canje si el módulo 'rewards' fue desactivado para el comercio (403)", true, $e->getMessage());
}
// Reactivar módulo
$capService->setBusinessModule($bizA['id'], 'rewards', true);

// 10. Resolución Pública Enriquecida (/c/{token}) y Cero PII
echo PHP_EOL . "--- 10. Resolución Pública Enriquecida (/c/<token>) ---" . PHP_EOL;

// 10.1 Vista Anónima Punti: muestra balance, pero NO catálogo ni PII
$viewPuntiAnon = $credService->getPublicCredentialView($credPuntiToken);
assertStage3Test("Vista anónima Punti: mode = public, estado active",
    $viewPuntiAnon['mode'] === 'public' && $viewPuntiAnon['state'] === 'active'
);
assertStage3Test("Vista anónima Punti: expone balance (80) y cero PII (sin customer, email ni teléfono)",
    isset($viewPuntiAnon['loyalty_account']['balance']) &&
    !isset($viewPuntiAnon['customer']) &&
    !isset($viewPuntiAnon['rewards'])
);

// 10.2 Vista Anónima Vantaggi: expone catálogo de premios, progreso y ofertas permitidas sin PII
$viewVantaggiAnon = $credService->getPublicCredentialView($credVantaggiToken);
assertStage3Test("Vista anónima Vantaggi: contiene catálogo de premios y ofertas",
    !empty($viewVantaggiAnon['rewards']) && !empty($viewVantaggiAnon['offers'])
);
assertStage3Test("Vista anónima Vantaggi: contiene próximo premio disponible",
    isset($viewVantaggiAnon['next_reward']) && !empty($viewVantaggiAnon['next_reward']['name'])
);
assertStage3Test("Vista anónima Vantaggi: Cero PII (sin customer, email ni teléfono)",
    !isset($viewVantaggiAnon['customer'])
);

// 10.3 Vista Anónima VIP: expone ofertas VIP, NO muestra puntos ni premios estándar
$viewVipAnon = $credService->getPublicCredentialView($credVipToken);
assertStage3Test("Vista anónima VIP: no muestra balance ni catálogo de puntos Punti",
    !isset($viewVipAnon['loyalty_account']['balance']) && !isset($viewVipAnon['rewards'])
);
assertStage3Test("Vista anónima VIP: expone ofertas VIP exclusivas",
    !empty($viewVipAnon['offers']) && $viewVipAnon['offers'][0]['offer_type'] === 'vip_exclusive'
);

// 10.4 Vista Staff del mismo comercio: Ficha operativa con acciones permitidas
$staffViewer = [
    'user_id' => $staffAId,
    'business_id' => $bizA['id'],
    'role' => Role::STAFF,
    'is_super_admin' => false,
];
$viewStaff = $credService->getPublicCredentialView($credVantaggiToken, $staffViewer);
assertStage3Test("Vista Staff: mode = staff, incluye customer con PII permitida para el personal",
    $viewStaff['mode'] === 'staff' && isset($viewStaff['customer']['first_name'])
);
assertStage3Test("Vista Staff: incluye acciones autorizadas según rol y capacidades (can_adjust_points, can_redeem_rewards, can_redeem_offers)",
    isset($viewStaff['actions']['can_adjust_points']) &&
    $viewStaff['actions']['can_adjust_points'] === true &&
    $viewStaff['actions']['can_redeem_rewards'] === true &&
    $viewStaff['actions']['can_redeem_offers'] === true
);
assertStage3Test("Vista Staff: Ficha operativa minimiza datos (no expone consents, timestamps ni business_id interno)",
    !isset($viewStaff['customer']['consents']) &&
    !isset($viewStaff['customer']['created_at']) &&
    !isset($viewStaff['customer']['business_id'])
);
assertStage3Test("Permisos de Ofertas: Staff tiene 'offer.redeem' pero NO 'offer.manage'",
    \App\Modules\Businesses\Permission::can(Role::STAFF, \App\Modules\Businesses\Permission::OFFER_REDEEM) &&
    !\App\Modules\Businesses\Permission::can(Role::STAFF, \App\Modules\Businesses\Permission::OFFER_MANAGE)
);
assertStage3Test("Vista Staff: incluye histórico reciente de transacciones y programa de puntos",
    isset($viewStaff['recent_transactions']) && isset($viewStaff['program'])
);

// 10.5 Usuario de otro comercio recibe 403 Forbidden
$crossViewer = [
    'user_id' => $ownerBId,
    'business_id' => $bizB['id'],
    'role' => Role::OWNER,
    'is_super_admin' => false,
];
$viewCross = $credService->getPublicCredentialView($credVantaggiToken, $crossViewer);
assertStage3Test("Usuario de otro comercio recibe state = forbidden (403)",
    $viewCross['state'] === 'forbidden' && $viewCross['mode'] === 'cross_tenant'
);

// 10.6 Paginación del Historial de Puntos
echo PHP_EOL . "--- 11. Paginación del Historial de Puntos ---" . PHP_EOL;

$pageRes = $pointsService->getAccountTransactions($bizA['id'], $accPuntiId, 1, 2);
assertStage3Test("Paginación del ledger: retorna estructura de datos y paginación con total de movimientos",
    count($pageRes['data']) === 2 &&
    $pageRes['pagination']['total'] >= 4 &&
    $pageRes['pagination']['total_pages'] >= 2 &&
    $pageRes['pagination']['page'] === 1
);

echo PHP_EOL . "==========================================" . PHP_EOL;
echo "RESULTADO ETAPA 3: {$passedCount} de {$totalTests} pruebas superadas." . PHP_EOL;
echo "==========================================" . PHP_EOL;

if ($passedCount !== $totalTests) {
    exit(1);
}
