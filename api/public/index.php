<?php

declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

use App\Core\Auth\AuthController;
use App\Core\Http\Request;
use App\Core\Http\Response;

// Configuración de CORS y Headers de Seguridad
$origin = $_SERVER['HTTP_ORIGIN'] ?? '*';
header("Access-Control-Allow-Origin: {$origin}");
header('Access-Control-Allow-Credentials: true');
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

$method = $request->getMethod();

// Endpoint de salud
if ($method === 'GET' && rtrim($path, '/') === '/api/v1/health') {
    Response::json([
        'success' => true,
        'message' => 'Pardinitec Vantaggi API',
        'status' => 'ok',
    ]);
}

// Rutas de Autenticación
$authController = new AuthController();

if ($method === 'POST' && rtrim($path, '/') === '/api/v1/auth/register') {
    $authController->register($request);
}

if ($method === 'POST' && rtrim($path, '/') === '/api/v1/auth/login') {
    $authController->login($request);
}

if ($method === 'POST' && rtrim($path, '/') === '/api/v1/auth/logout') {
    $authController->logout($request);
}

if ($method === 'GET' && rtrim($path, '/') === '/api/v1/auth/me') {
    $authController->me($request);
}

if ($method === 'GET' && rtrim($path, '/') === '/api/v1/auth/csrf') {
    $authController->csrf($request);
}

// Ruta no encontrada
Response::error('Endpoint no encontrado', 404);
