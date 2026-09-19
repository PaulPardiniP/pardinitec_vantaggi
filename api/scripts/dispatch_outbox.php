<?php

declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

use App\Core\Database\Connection;
use App\Modules\Automations\OutboxDispatcher;

try {
    $pdo = Connection::get();
    $dispatcher = new OutboxDispatcher($pdo);
    $dispatched = $dispatcher->dispatchBatch(50);
    echo "Dispatched $dispatched events.\n";
} catch (\Throwable $e) {
    echo "Error: " . $e->getMessage() . "\n";
    exit(1);
}
