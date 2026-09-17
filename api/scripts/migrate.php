<?php

declare(strict_types=1);

use App\Core\Database\Migrator;

require_once __DIR__ . '/../bootstrap.php';

$action = $argv[1] ?? 'migrate';

try {
    $migrator = new Migrator();

    if ($action === 'status') {
        $status = $migrator->status();
        echo "Estado de migraciones:" . PHP_EOL;
        if (empty($status)) {
            echo " (No se encontraron archivos de migracion)" . PHP_EOL;
        } else {
            foreach ($status as $row) {
                $batchInfo = $row['batch'] !== null ? " (Batch: {$row['batch']}, Ejecutado: {$row['executed_at']})" : '';
                echo sprintf(" - [%s] %s%s\n", strtoupper($row['status']), $row['migration'], $batchInfo);
            }
        }
        exit(0);
    }

    $applied = $migrator->migrate();

    if (empty($applied)) {
        echo "No hay migraciones pendientes." . PHP_EOL;
    } else {
        echo "Migraciones ejecutadas con exito:" . PHP_EOL;
        foreach ($applied as $migration) {
            echo " - {$migration}" . PHP_EOL;
        }
    }
} catch (Throwable $exception) {
    echo "Error en migraciones: " . $exception->getMessage() . PHP_EOL;
    exit(1);
}
