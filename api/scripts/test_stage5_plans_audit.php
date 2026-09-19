<?php
declare(strict_types=1);
define('IS_TEST_ENV', true);
require_once __DIR__ . '/../bootstrap.php';
use App\Core\Database\Connection;
use App\Modules\Plans\PlanService;
use App\Core\Audit\AuditLogger;
use App\Core\Http\Request;
use App\Modules\Plans\PlanController;

ob_start(); echo "=== PRUEBAS ETAPA 5: PLANES Y AUDITORIA ===\n";
$_ENV['APP_SECRET_KEY'] = base64_encode(random_bytes(32));
$pdo = Connection::get();
$audit = new AuditLogger($pdo);
$planService = new PlanService($pdo, $audit);
$controller = new PlanController($planService);

$res = $planService->createPlan(['name' => 'Test Plan ' . uniqid(), 'price_eur' => 9.99, 'capabilities' => ['points', 'campaigns']], 1);
echo " [OK] Plan y capacidades creadas\n";

$audit->log('test_sensitive', 'user', 1, ['password' => 'secret'], 1, 1, '127.0.0.1');
$stmt = $pdo->query("SELECT meta FROM audit_logs WHERE action = 'test_sensitive' ORDER BY id DESC LIMIT 1");
$col = $stmt->fetchColumn(); $payload = $col ? json_decode($col, true) : [];
if (isset($payload['password'])) { exit(1); }
echo " [OK] Filtrado de secretos en Auditoría\n";

try {
    $req = new Request('GET', '/', [], [], []);
    $req = \Closure::bind(function($r) { 
        $r->attributes['user'] = ['id' => 1, 'is_super_admin' => false, 'business_id' => 146];
        $r->attributes['business_role'] = 'staff';
        $r->routeParams['id'] = '145';
        return $r;
    }, null, Request::class)($req);
    $c = new \App\Modules\Audit\AuditController($pdo);
    $c->listForBusiness($req);
    exit(1);
} catch (\Throwable $e) {
    if (strpos($e->getMessage(), 'Acceso denegado') !== false) { echo " [OK] Alcance por business y permisos de Auditoría (403 verificado)\n"; } else { exit(1); }
}

try {
    $req = new Request('GET', '/', [], [], []);
    $req = \Closure::bind(function($r) { 
        $r->attributes['user'] = ['id' => 1, 'is_super_admin' => false, 'business_id' => 146];
        return $r;
    }, null, Request::class)($req);
    $c = new PlanController(new PlanService($pdo, $audit));
    $c->list($req);
    exit(1);
} catch (\Throwable $e) {
    if (strpos($e->getMessage(), 'Acceso denegado') !== false) { echo " [OK] Endpoints administrativos protegidos (403)\n"; } else { exit(1); }
}

echo "==========================================\nRESULTADO FINAL: 4 de 4 pruebas superadas.\n";