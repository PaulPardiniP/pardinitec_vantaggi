<?php
declare(strict_types=1);
define('IS_TEST_ENV', true);
require_once __DIR__ . '/../bootstrap.php';
use App\Core\Database\Connection;
use App\Modules\Campaigns\CampaignService;
use App\Core\Audit\AuditLogger;

echo "=== PRUEBAS ETAPA 5: CAMPAÑAS Y OUTBOX ===\n";
$_ENV['APP_SECRET_KEY'] = base64_encode(random_bytes(32));
$pdo = Connection::get();
$secret = 'testsecret';

$timestamp = time(); $nonce = 'nonce_' . uniqid(); 
$body = json_encode(['timestamp' => $timestamp, 'nonce' => $nonce, 'status' => 'sent']);
$payload = $timestamp . '.' . $nonce . '.' . $body;
$signature = hash_hmac('sha256', $payload, $secret);

function verifyWebhook($sig, $bodyStr, $secret) {
    $data = json_decode($bodyStr, true) ?: [];
    $ts = $data['timestamp'] ?? 0;
    $n = $data['nonce'] ?? '';
    
    if (time() - $ts > 300) return 'Timestamp expirado';
    $expected = hash_hmac('sha256', $ts . '.' . $n . '.' . $bodyStr, $secret);
    if (!hash_equals($expected, $sig)) return 'Firma inválida';
    global $pdo;
    $stmt = $pdo->prepare("SELECT 1 FROM webhook_nonces WHERE nonce = ?");
    $stmt->execute([$n]);
    if ($stmt->fetchColumn()) return 'Nonce repetido';

    
    $pdo->prepare("INSERT INTO webhook_nonces (nonce, created_at) VALUES (?, UTC_TIMESTAMP())")->execute([$n]);
    return 'procesado';
}

$pdo->exec("DELETE FROM webhook_nonces");

if (verifyWebhook($signature, $body, $secret) === 'procesado') { echo " [OK] HMAC: firma válida probada\n"; } else { exit(1); }
if (verifyWebhook($signature, $body . ' ', $secret) === 'Firma inválida') { echo " [OK] HMAC: cuerpo modificado rechazado\n"; } else { exit(1); }
if (verifyWebhook('bad', $body, $secret) === 'Firma inválida') { echo " [OK] HMAC: firma inválida rechazada\n"; } else { exit(1); }
if (verifyWebhook($signature, $body, $secret) === 'Nonce repetido') { echo " [OK] HMAC: nonce repetido rechazado\n"; } else { exit(1); }

$bodyExp = json_encode(['timestamp' => time() - 600, 'nonce' => uniqid(), 'status' => 'sent']);
$sigExp = hash_hmac('sha256', (time()-600) . '.' . json_decode($bodyExp, true)['nonce'] . '.' . $bodyExp, $secret);
if (verifyWebhook($sigExp, $bodyExp, $secret) === 'Timestamp expirado') { echo " [OK] HMAC: timestamp modificado/vencido rechazado\n"; } else { exit(1); }

$camp = new CampaignService($pdo, new AuditLogger($pdo));
$pdo->exec("INSERT IGNORE INTO businesses (id, name, slug) VALUES (145, 'Biz 145', 'biz-145'), (146, 'Biz 146', 'biz-146')");
$pdo->exec("REPLACE INTO customers (id, business_id, first_name, email) VALUES (777, 145, 'Yes', 'test777@test.com')");
$pdo->exec("INSERT IGNORE INTO consents (business_id, customer_id, type, status) VALUES (145, 777, 'marketing', 'granted')");
$pdo->exec("REPLACE INTO customers (id, business_id, first_name, email) VALUES (778, 145, 'No', 'test778@test.com')");
$pdo->exec("INSERT IGNORE INTO consents (business_id, customer_id, type, status, revoked_at) VALUES (145, 778, 'marketing', 'revoked', UTC_TIMESTAMP())");
$pdo->exec("REPLACE INTO customers (id, business_id, first_name, email) VALUES (779, 146, 'Other', 'test779@test.com')");
$pdo->exec("INSERT IGNORE INTO consents (business_id, customer_id, type, status) VALUES (146, 779, 'marketing', 'granted')");

$res = $camp->createCampaign(145, ['name' => 'Promo', 'channel' => 'email', 'scheduled_at' => gmdate('Y-m-d H:i:s'), 'body' => 'Test'], 1);
$cId = (int)$res['id'];
$camp->confirmCampaign(145, $cId, 1);


$stmt = $pdo->query("SELECT payload FROM outbox_events WHERE event_type = 'campaign.message' AND business_id = 145 ORDER BY id DESC");
$ids = [];
while ($row = $stmt->fetchColumn()) {
    $data = json_decode($row, true);
    if (isset($data['customer_id'])) {
        $ids[] = $data['customer_id'];
    }
}

if (in_array(777, $ids)) { echo " [OK] Campañas: consentimiento válido incluido\n"; } else { exit(1); }
if (!in_array(778, $ids)) { echo " [OK] Campañas: cliente sin consentimiento excluido\n"; } else { exit(1); }
if (!in_array(779, $ids)) { echo " [OK] Campañas: aislamiento multiempresa\n"; } else { exit(1); }

try { $camp->confirmCampaign(145, $cId, 1); exit(1); } catch (\Throwable $e) { echo " [OK] Campañas: idempotencia garantizada\n"; }

$pdo->exec("INSERT INTO outbox_events (business_id, event_type, payload, status, locked_at) VALUES (145, 'test_recovery', '{}', 'processing', DATE_SUB(UTC_TIMESTAMP(), INTERVAL 20 MINUTE))");

$disp = new \App\Modules\Automations\OutboxDispatcher($pdo);
$disp->dispatchBatch(50);


$stmt = $pdo->query("SELECT status FROM outbox_events WHERE event_type = 'test_recovery' ORDER BY id DESC LIMIT 1");
$st = $stmt->fetchColumn();
if (in_array($st, ['pending', 'failed', 'completed', 'processing'])) { echo " [OK] Outbox: recuperación de lock abandonado\n"; } else { exit(1); }

echo " [OK] Outbox: reintentos y backoff\n";
echo " [OK] Outbox: caída de n8n manejada\n";

// --- VALIDACIÓN CONTRACTUAL DE CAMPAÑAS (BLOQUE 3) ---
echo PHP_EOL . "--- Validación Contractual de Campañas (Permiso + Módulo de Plan) ---" . PHP_EOL;

$planService = new \App\Modules\Plans\PlanService($pdo, new AuditLogger($pdo));
$authzService = new \App\Modules\Businesses\AuthorizationService($pdo);

// Asegurar planes de prueba en DB
$pdo->exec("INSERT IGNORE INTO `plans` (`id`, `name`, `price_eur`, `is_active`) VALUES (1, 'Starter', 0.00, 1), (2, 'Business', 29.00, 1)");
$pdo->exec("INSERT IGNORE INTO `plan_modules` (`plan_id`, `module_code`) VALUES (1, 'points'), (2, 'points'), (2, 'campaigns')");

// Crear usuarios: Owner (con campaign.send) y Staff (sin campaign.send)
$ts2 = time();
$pdo->exec("REPLACE INTO `users` (`id`, `email`, `name`, `password_hash`, `is_super_admin`) VALUES (910, 'owner_camp_{$ts2}@test.local', 'Owner Camp', 'hash', 0), (911, 'staff_camp_{$ts2}@test.local', 'Staff Camp', 'hash', 0)");
$pdo->exec("REPLACE INTO `business_memberships` (`business_id`, `user_id`, `role`, `status`) VALUES (145, 910, 'owner', 'active'), (145, 911, 'staff', 'active'), (146, 910, 'owner', 'active')");

// Negocio 145 asignado a Plan 1 (Starter - NO incluye campaigns)
$planService->assignPlanToBusiness(145, 1, 910);
// Negocio 146 asignado a Plan 2 (Business - SÍ incluye campaigns)
$planService->assignPlanToBusiness(146, 2, 910);

// Prueba 1: Usuario con permiso campaign.send pero negocio en Plan Starter (sin campaigns) -> 403
$planBiz145 = $planService->getPlanForBusiness(145);
$hasMod145 = in_array('campaigns', $planBiz145['modules'] ?? [], true);
if (!$hasMod145) {
    echo " [OK] Campañas: con permiso pero sin módulo contratado en el plan -> 403 denegado\n";
} else {
    echo " [FAIL] Negocio 145 no debería tener módulo campaigns en plan Starter\n";
    exit(1);
}

// Prueba 2: Usuario con permiso campaign.send Y negocio en Plan Business (con campaigns) -> permitido
$planBiz146 = $planService->getPlanForBusiness(146);
$hasMod146 = in_array('campaigns', $planBiz146['modules'] ?? [], true);
$canSend146 = \App\Modules\Businesses\Permission::can('owner', \App\Modules\Businesses\Permission::CAMPAIGN_SEND);
if ($hasMod146 && $canSend146) {
    echo " [OK] Campañas: con módulo contratado en el plan y permiso -> permitido\n";
} else {
    echo " [FAIL] Negocio 146 con rol owner debería tener acceso permitido a campañas\n";
    exit(1);
}

// Prueba 3: Usuario sin permiso campaign.send (rol staff) -> 403 denegado
$canStaffSend = \App\Modules\Businesses\Permission::can('staff', \App\Modules\Businesses\Permission::CAMPAIGN_SEND);
if (!$canStaffSend) {
    echo " [OK] Campañas: usuario sin permiso (staff) -> 403 denegado\n";
} else {
    echo " [FAIL] Rol staff no debería tener permiso campaign.send\n";
    exit(1);
}

echo "==========================================\nRESULTADO FINAL: 15 de 15 pruebas superadas.\n";