<?php

declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

use App\Core\Auth\AuthController;
use App\Core\Http\Request;
use App\Core\Http\Response;
use App\Modules\Businesses\BusinessController;

// Configuración de CORS segura: sin comodín '*', compatible con cookies
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

// Rutas de Autenticación
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

// Rutas de Comercios y Membresías (Módulo Businesses)
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

if ($method === 'GET' && preg_match('#^/api/v1/businesses/(\d+)/members$#', $cleanPath, $matches)) {
    $businessController->listMembers($request, (int) $matches[1]);
}

if ($method === 'POST' && preg_match('#^/api/v1/businesses/(\d+)/members$#', $cleanPath, $matches)) {
    $businessController->addMember($request, (int) $matches[1]);
}

if ($method === 'DELETE' && preg_match('#^/api/v1/businesses/(\d+)/members/(\d+)$#', $cleanPath, $matches)) {
    $businessController->removeMember($request, (int) $matches[1], (int) $matches[2]);
}

// Ruta no encontrada
Response::error('Endpoint no encontrado', 404);
