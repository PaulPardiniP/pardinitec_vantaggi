<?php

declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

use App\Core\Auth\AuthController;
use App\Core\Http\Request;
use App\Core\Http\Response;
use App\Modules\AccessCredentials\CredentialController;
use App\Modules\Businesses\BusinessController;
use App\Modules\Cards\AdminCardController;
use App\Modules\Cards\CardController;
use App\Modules\Cards\PublicCardController;
use App\Modules\Customers\CustomerController;
use App\Modules\Loyalty\LoyaltyController;
use App\Modules\Offers\OfferController;
use App\Modules\Points\PointsController;
use App\Modules\Rewards\RewardController;

// ConfiguraciÃ³n de CORS segura: sin comodÃ­n '*', compatible con cookies
$defaultAllowedOrigins = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
];

if (!empty($_ENV['CORS_ALLOWED_ORIGINS'])) {
    $envOrigins = array_filter(array_map('trim', explode(',', (string) $_ENV['CORS_ALLOWED_ORIGINS'])));
    $allowedOrigins = array_values(array_unique(array_merge($defaultAllowedOrigins, $envOrigins)));
} else {
    $allowedOrigins = $defaultAllowedOrigins;
}

$origin = $_SERVER['HTTP_ORIGIN'] ?? null;

if ($origin !== null && in_array($origin, $allowedOrigins, true)) {
    header("Access-Control-Allow-Origin: {$origin}");
    header('Access-Control-Allow-Credentials: true');
    header('Vary: Origin');
}

header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-CSRF-Token');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$request = Request::capture();
$path = $request->getPath();

// Normalizar la ruta si se ejecuta en subcarpeta (ej. Apache / XAMPP)
if (preg_match('#(/api/v1/.*)$#', $path, $matches)) {
    $path = $matches[1];
}

$cleanPath = rtrim($path, '/');
$method = $request->getMethod();

// Endpoint de salud
if ($method === 'GET' && $cleanPath === '/api/v1/health') {
    Response::json([
        'success' => true,
        'message' => 'Pardinitec Vantaggi API',
        'status' => 'ok',
    ]);
}

// Rutas de AutenticaciÃ³n
$authController = new AuthController();

if ($method === 'POST' && $cleanPath === '/api/v1/auth/register') {
    $authController->register($request);
}

if ($method === 'POST' && $cleanPath === '/api/v1/auth/login') {
    $authController->login($request);
}

if ($method === 'POST' && $cleanPath === '/api/v1/auth/logout') {
    $authController->logout($request);
}

if ($method === 'GET' && $cleanPath === '/api/v1/auth/me') {
    $authController->me($request);
}

if ($method === 'GET' && $cleanPath === '/api/v1/auth/csrf') {
    $authController->csrf($request);
}

// Rutas de Super Admin (MÃ³dulo Cards - Inventario y AsignaciÃ³n de Tarjetas)
$adminCardController = new AdminCardController();

if ($method === 'POST' && $cleanPath === '/api/v1/admin/cards/batch') {
    $adminCardController->createBatch($request);
}

if ($method === 'POST' && $cleanPath === '/api/v1/admin/cards/assign') {
    $adminCardController->assign($request);
}

if ($method === 'POST' && $cleanPath === '/api/v1/admin/cards') {
    $adminCardController->create($request);
}

if ($method === 'GET' && $cleanPath === '/api/v1/admin/cards') {
    $adminCardController->list($request);
}

if ($method === 'GET' && preg_match('#^/api/v1/admin/cards/(\d+)$#', $cleanPath, $matches)) {
    $adminCardController->get($request, (int) $matches[1]);
}

// Rutas de Comercios y MembresÃ­as (MÃ³dulo Businesses)
$businessController = new BusinessController();

if ($method === 'POST' && $cleanPath === '/api/v1/businesses') {
    $businessController->create($request);
}

if ($method === 'GET' && $cleanPath === '/api/v1/businesses') {
    $businessController->list($request);
}

if ($method === 'GET' && preg_match('#^/api/v1/businesses/(\d+)$#', $cleanPath, $matches)) {
    $businessController->get($request, (int) $matches[1]);
}

if ($method === 'PUT' && preg_match('#^/api/v1/businesses/(\d+)$#', $cleanPath, $matches)) {
    $businessController->update($request, (int) $matches[1]);
}

if ($method === 'POST' && preg_match('#^/api/v1/businesses/(\d+)/toggle-status$#', $cleanPath, $matches)) {
    $businessController->toggleStatus($request, (int) $matches[1]);
}

if ($method === 'GET' && preg_match('#^/api/v1/businesses/(\d+)/members$#', $cleanPath, $matches)) {
    $businessController->listMembers($request, (int) $matches[1]);
}

if ($method === 'POST' && preg_match('#^/api/v1/businesses/(\d+)/members$#', $cleanPath, $matches)) {
    $businessController->addMember($request, (int) $matches[1]);
}

if ($method === 'DELETE' && preg_match('#^/api/v1/businesses/(\d+)/members/(\d+)$#', $cleanPath, $matches)) {
    $businessController->removeMember($request, (int) $matches[1], (int) $matches[2]);
}

if ($method === 'GET' && preg_match('#^/api/v1/businesses/(\d+)/modules$#', $cleanPath, $matches)) {
    $businessController->listModules($request, (int) $matches[1]);
}

if ($method === 'PUT' && preg_match('#^/api/v1/businesses/(\d+)/modules$#', $cleanPath, $matches)) {
    $businessController->updateModules($request, (int) $matches[1]);
}

// Ruta Super Admin: búsqueda paginada de comercios
if ($method === 'GET' && $cleanPath === '/api/v1/admin/businesses') {
    $businessController->listPaginated($request);
}

// Rutas de Tarjetas Físicas del Negocio (Módulo Cards)
$cardController = new CardController();

if ($method === 'GET' && preg_match('#^/api/v1/businesses/(\d+)/cards$#', $cleanPath, $matches)) {
    $cardController->list($request, (int) $matches[1]);
}

if ($method === 'GET' && preg_match('#^/api/v1/businesses/(\d+)/cards/(\d+)$#', $cleanPath, $matches)) {
    $cardController->get($request, (int) $matches[1], (int) $matches[2]);
}

if ($method === 'POST' && preg_match('#^/api/v1/businesses/(\d+)/cards/(\d+)/activate$#', $cleanPath, $matches)) {
    $cardController->activate($request, (int) $matches[1], (int) $matches[2]);
}

if ($method === 'POST' && preg_match('#^/api/v1/businesses/(\d+)/cards/(\d+)/suspend$#', $cleanPath, $matches)) {
    $cardController->suspend($request, (int) $matches[1], (int) $matches[2]);
}

if ($method === 'POST' && preg_match('#^/api/v1/businesses/(\d+)/cards/(\d+)/reactivate$#', $cleanPath, $matches)) {
    $cardController->reactivate($request, (int) $matches[1], (int) $matches[2]);
}

if ($method === 'POST' && preg_match('#^/api/v1/businesses/(\d+)/cards/(\d+)/revoke$#', $cleanPath, $matches)) {
    $cardController->revoke($request, (int) $matches[1], (int) $matches[2]);
}

if ($method === 'POST' && preg_match('#^/api/v1/businesses/(\d+)/cards/(\d+)/replace$#', $cleanPath, $matches)) {
    $cardController->replace($request, (int) $matches[1], (int) $matches[2]);
}

if ($method === 'POST' && preg_match('#^/api/v1/businesses/(\d+)/cards/(\d+)/reassign$#', $cleanPath, $matches)) {
    $cardController->reassign($request, (int) $matches[1], (int) $matches[2]);
}

// Rutas de Perfiles de FidelizaciÃ³n (MÃ³dulo Loyalty)
$loyaltyController = new LoyaltyController();

if ($method === 'GET' && $cleanPath === '/api/v1/card-profiles') {
    $loyaltyController->listProfiles($request);
}

// Rutas de Clientes y Consentimientos (MÃ³dulo Customers)
$customerController = new CustomerController();

if ($method === 'POST' && preg_match('#^/api/v1/businesses/(\d+)/customers/onboard$#', $cleanPath, $matches)) {
    $customerController->onboard($request, (int) $matches[1]);
}

if ($method === 'POST' && preg_match('#^/api/v1/businesses/(\d+)/customers$#', $cleanPath, $matches)) {
    $customerController->onboard($request, (int) $matches[1]);
}

if ($method === 'GET' && preg_match('#^/api/v1/businesses/(\d+)/customers$#', $cleanPath, $matches)) {
    $customerController->list($request, (int) $matches[1]);
}

if ($method === 'GET' && preg_match('#^/api/v1/businesses/(\d+)/customers/(\d+)$#', $cleanPath, $matches)) {
    $customerController->get($request, (int) $matches[1], (int) $matches[2]);
}

if ($method === 'PUT' && preg_match('#^/api/v1/businesses/(\d+)/customers/(\d+)$#', $cleanPath, $matches)) {
    $customerController->update($request, (int) $matches[1], (int) $matches[2]);
}

if ($method === 'GET' && preg_match('#^/api/v1/businesses/(\d+)/customers/(\d+)/consents$#', $cleanPath, $matches)) {
    $customerController->getConsents($request, (int) $matches[1], (int) $matches[2]);
}

if ($method === 'POST' && preg_match('#^/api/v1/businesses/(\d+)/customers/(\d+)/consents/grant-marketing$#', $cleanPath, $matches)) {
    $customerController->grantMarketing($request, (int) $matches[1], (int) $matches[2]);
}

if ($method === 'POST' && preg_match('#^/api/v1/businesses/(\d+)/customers/(\d+)/consents/revoke-marketing$#', $cleanPath, $matches)) {
    $customerController->revokeMarketing($request, (int) $matches[1], (int) $matches[2]);
}

if ($method === 'POST' && preg_match('#^/api/v1/businesses/(\d+)/customers/(\d+)/consents$#', $cleanPath, $matches)) {
    $customerController->recordConsent($request, (int) $matches[1], (int) $matches[2]);
}

// Rutas de Cuentas de Fidelización
if ($method === 'GET' && preg_match('#^/api/v1/businesses/(\d+)/customers/(\d+)/loyalty-accounts$#', $cleanPath, $matches)) {
    $loyaltyController->listCustomerAccounts($request, (int) $matches[1], (int) $matches[2]);
}

if ($method === 'POST' && preg_match('#^/api/v1/businesses/(\d+)/customers/(\d+)/loyalty-accounts$#', $cleanPath, $matches)) {
    $loyaltyController->createAccount($request, (int) $matches[1], (int) $matches[2]);
}

if ($method === 'GET' && preg_match('#^/api/v1/businesses/(\d+)/loyalty-accounts/(\d+)/preview$#', $cleanPath, $matches)) {
    $loyaltyController->preview($request, (int) $matches[1], (int) $matches[2]);
}

// Rutas de Credenciales de Acceso (MÃ³dulo AccessCredentials)
$credentialController = new CredentialController();

if ($method === 'POST' && preg_match('#^/api/v1/businesses/(\d+)/loyalty-accounts/(\d+)/credentials$#', $cleanPath, $matches)) {
    $credentialController->issue($request, (int) $matches[1], (int) $matches[2]);
}

if ($method === 'GET' && preg_match('#^/api/v1/businesses/(\d+)/loyalty-accounts/(\d+)/credentials$#', $cleanPath, $matches)) {
    $credentialController->listForAccount($request, (int) $matches[1], (int) $matches[2]);
}

if ($method === 'POST' && preg_match('#^/api/v1/businesses/(\d+)/credentials/(\d+)/revoke$#', $cleanPath, $matches)) {
    $credentialController->revoke($request, (int) $matches[1], (int) $matches[2]);
}

if ($method === 'POST' && preg_match('#^/api/v1/businesses/(\d+)/credentials/(\d+)/rotate$#', $cleanPath, $matches)) {
    $credentialController->rotate($request, (int) $matches[1], (int) $matches[2]);
}

// Rutas de Puntos y Programas de FidelizaciÃ³n (MÃ³dulo Points)
$pointsController = new PointsController();

if ($method === 'GET' && preg_match('#^/api/v1/businesses/(\d+)/loyalty-program$#', $cleanPath, $matches)) {
    $pointsController->getProgram($request, (int) $matches[1]);
}

if ($method === 'PUT' && preg_match('#^/api/v1/businesses/(\d+)/loyalty-program$#', $cleanPath, $matches)) {
    $pointsController->updateProgram($request, (int) $matches[1]);
}

if ($method === 'POST' && preg_match('#^/api/v1/businesses/(\d+)/loyalty-program/calculate$#', $cleanPath, $matches)) {
    $pointsController->calculate($request, (int) $matches[1]);
}

if ($method === 'POST' && preg_match('#^/api/v1/businesses/(\d+)/loyalty-accounts/(\d+)/points/adjust$#', $cleanPath, $matches)) {
    $pointsController->adjust($request, (int) $matches[1], (int) $matches[2]);
}

if ($method === 'GET' && preg_match('#^/api/v1/businesses/(\d+)/loyalty-accounts/(\d+)/points/transactions$#', $cleanPath, $matches)) {
    $pointsController->listTransactions($request, (int) $matches[1], (int) $matches[2]);
}

// Rutas de Premios (MÃ³dulo Rewards)
$rewardController = new RewardController();

if ($method === 'GET' && preg_match('#^/api/v1/businesses/(\d+)/rewards$#', $cleanPath, $matches)) {
    $rewardController->list($request, (int) $matches[1]);
}

if ($method === 'POST' && preg_match('#^/api/v1/businesses/(\d+)/rewards$#', $cleanPath, $matches)) {
    $rewardController->create($request, (int) $matches[1]);
}

if ($method === 'GET' && preg_match('#^/api/v1/businesses/(\d+)/rewards/(\d+)$#', $cleanPath, $matches)) {
    $rewardController->get($request, (int) $matches[1], (int) $matches[2]);
}

if ($method === 'PUT' && preg_match('#^/api/v1/businesses/(\d+)/rewards/(\d+)$#', $cleanPath, $matches)) {
    $rewardController->update($request, (int) $matches[1], (int) $matches[2]);
}

if ($method === 'DELETE' && preg_match('#^/api/v1/businesses/(\d+)/rewards/(\d+)$#', $cleanPath, $matches)) {
    $rewardController->delete($request, (int) $matches[1], (int) $matches[2]);
}

if ($method === 'POST' && preg_match('#^/api/v1/businesses/(\d+)/loyalty-accounts/(\d+)/rewards/(\d+)/redeem$#', $cleanPath, $matches)) {
    $rewardController->redeem($request, (int) $matches[1], (int) $matches[2], (int) $matches[3]);
}

// Rutas de Ofertas (MÃ³dulo Offers)
$offerController = new OfferController();

if ($method === 'GET' && preg_match('#^/api/v1/businesses/(\d+)/offers$#', $cleanPath, $matches)) {
    $offerController->list($request, (int) $matches[1]);
}

if ($method === 'POST' && preg_match('#^/api/v1/businesses/(\d+)/offers$#', $cleanPath, $matches)) {
    $offerController->create($request, (int) $matches[1]);
}

if ($method === 'GET' && preg_match('#^/api/v1/businesses/(\d+)/offers/(\d+)$#', $cleanPath, $matches)) {
    $offerController->get($request, (int) $matches[1], (int) $matches[2]);
}

if ($method === 'PUT' && preg_match('#^/api/v1/businesses/(\d+)/offers/(\d+)$#', $cleanPath, $matches)) {
    $offerController->update($request, (int) $matches[1], (int) $matches[2]);
}

if ($method === 'DELETE' && preg_match('#^/api/v1/businesses/(\d+)/offers/(\d+)$#', $cleanPath, $matches)) {
    $offerController->delete($request, (int) $matches[1], (int) $matches[2]);
}

if ($method === 'POST' && preg_match('#^/api/v1/businesses/(\d+)/loyalty-accounts/(\d+)/offers/(\d+)/redeem$#', $cleanPath, $matches)) {
    $offerController->redeem($request, (int) $matches[1], (int) $matches[2], (int) $matches[3]);
}

// Rutas de ResoluciÃ³n PÃºblica Segura (/c/<token> y /api/v1/public/cards/<token>)
$publicCardController = new PublicCardController();

if ($method === 'GET' && (
    preg_match('#^/c/([a-zA-Z0-9_-]+)$#', $cleanPath, $matches) ||
    preg_match('#^/api/v1/public/cards/([a-zA-Z0-9_-]+)$#', $cleanPath, $matches) ||
    preg_match('#^/api/v1/c/([a-zA-Z0-9_-]+)$#', $cleanPath, $matches)
)) {
    $publicCardController->resolve($request, $matches[1]);
}

// Etapa 5 Routes
$auditLogger = new \App\Core\Audit\AuditLogger(\App\Core\Database\Connection::get());
$planService = new \App\Modules\Plans\PlanService(\App\Core\Database\Connection::get(), $auditLogger);
$planController = new \App\Modules\Plans\PlanController($planService);
$auditController = new \App\Modules\Audit\AuditController(\App\Core\Database\Connection::get());
$campaignService = new \App\Modules\Campaigns\CampaignService(\App\Core\Database\Connection::get(), $auditLogger);
$campaignController = new \App\Modules\Campaigns\CampaignController($campaignService);

if ($method === 'GET' && $cleanPath === '/api/v1/admin/plans') {
    $planController->list($request);
}
if ($method === 'POST' && $cleanPath === '/api/v1/admin/plans') {
    $planController->create($request);
}
if ($method === 'PUT' && preg_match('#^/api/v1/admin/plans/(\d+)$#', $cleanPath, $matches)) {
    $request->setRouteParam('id', $matches[1]);
    $planController->update($request);
}
if ($method === 'POST' && preg_match('#^/api/v1/businesses/(\d+)/plan$#', $cleanPath, $matches)) {
    $request->setRouteParam('id', $matches[1]);
    $planController->assignToBusiness($request);
}

if ($method === 'GET' && $cleanPath === '/api/v1/admin/audit-logs') {
    $auditController->listGlobal($request);
}
if ($method === 'GET' && preg_match('#^/api/v1/businesses/(\d+)/audit-logs$#', $cleanPath, $matches)) {
    $request->setRouteParam('id', $matches[1]);
    $auditController->listForBusiness($request);
}

if ($method === 'GET' && preg_match('#^/api/v1/businesses/(\d+)/campaigns$#', $cleanPath, $matches)) {
    $request->setRouteParam('id', $matches[1]);
    $campaignController->list($request);
}
if ($method === 'POST' && preg_match('#^/api/v1/businesses/(\d+)/campaigns$#', $cleanPath, $matches)) {
    $request->setRouteParam('id', $matches[1]);
    $campaignController->create($request);
}
if ($method === 'PUT' && preg_match('#^/api/v1/businesses/(\d+)/campaigns/(\d+)$#', $cleanPath, $matches)) {
    $request->setRouteParam('id', $matches[1]);
    $request->setRouteParam('campaignId', $matches[2]);
    $campaignController->update($request);
}
if ($method === 'POST' && preg_match('#^/api/v1/businesses/(\d+)/campaigns/(\d+)/confirm$#', $cleanPath, $matches)) {
    $request->setRouteParam('id', $matches[1]);
    $request->setRouteParam('campaignId', $matches[2]);
    $campaignController->confirm($request);
}
if ($method === 'POST' && preg_match('#^/api/v1/businesses/(\d+)/campaigns/(\d+)/cancel$#', $cleanPath, $matches)) {
    $request->setRouteParam('id', $matches[1]);
    $request->setRouteParam('campaignId', $matches[2]);
    $campaignController->cancel($request);
}

if ($method === 'POST' && $cleanPath === '/api/v1/auth/2fa/setup') {
    $authController->setup2fa($request);
}
if ($method === 'POST' && $cleanPath === '/api/v1/auth/2fa/verify-setup') {
    $authController->verify2faSetup($request);
}
if ($method === 'POST' && $cleanPath === '/api/v1/auth/2fa/challenge') {
    $authController->challenge2fa($request);
}

if ($method === 'GET' && preg_match('#^/api/v1/businesses/(\d+)/customers/(\d+)/privacy/export$#', $cleanPath, $matches)) {
    $request->setRouteParam('id', $matches[1]);
    $request->setRouteParam('customerId', $matches[2]);
    $customerController->export($request);
}
if ($method === 'POST' && preg_match('#^/api/v1/businesses/(\d+)/customers/(\d+)/privacy/anonymize$#', $cleanPath, $matches)) {
    $request->setRouteParam('id', $matches[1]);
    $request->setRouteParam('customerId', $matches[2]);
    $customerController->anonymize($request);
}

// Ruta no encontrada
Response::error('Endpoint no encontrado', 404);

