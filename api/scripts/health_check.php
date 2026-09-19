<?php
declare(strict_types=1);

header('Content-Type: application/json');

try {
    require_once __DIR__ . '/../bootstrap.php';
    \App\Core\Database\Connection::get();
    echo json_encode(['status' => 'ok', 'db' => 'connected']);
} catch (\Throwable $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Database connection failed']);
}
