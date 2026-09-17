<?php

declare(strict_types=1);

use App\Core\Database\Connection;

require_once __DIR__ . '/../bootstrap.php';

try {
    $pdo = Connection::get();

    $result = $pdo
        ->query('SELECT DATABASE() AS database_name, CURRENT_USER() AS database_user')
        ->fetch();

    echo "Conexion correcta" . PHP_EOL;
    echo "Base: " . $result['database_name'] . PHP_EOL;
    echo "Usuario: " . $result['database_user'] . PHP_EOL;
} catch (Throwable $exception) {
    echo "Error: " . $exception->getMessage() . PHP_EOL;
    exit(1);
}