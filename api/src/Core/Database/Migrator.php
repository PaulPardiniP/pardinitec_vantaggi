<?php

declare(strict_types=1);

namespace App\Core\Database;

use PDO;
use RuntimeException;

final class Migrator
{
    private PDO $pdo;
    private string $migrationsPath;

    public function __construct(?string $migrationsPath = null)
    {
        $this->pdo = Connection::get();
        $this->migrationsPath = $migrationsPath ?? (realpath(__DIR__ . '/../../../../database/migrations') ?: (__DIR__ . '/../../../../database/migrations'));
    }

    public function init(): void
    {
        $sql = "CREATE TABLE IF NOT EXISTS `migrations` (
            `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            `migration` VARCHAR(255) NOT NULL UNIQUE,
            `batch` INT UNSIGNED NOT NULL,
            `executed_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";

        $this->pdo->exec($sql);
    }

    /**
     * @return string[]
     */
    public function getExecutedMigrations(): array
    {
        $stmt = $this->pdo->query("SELECT `migration` FROM `migrations` ORDER BY `id` ASC");
        return $stmt->fetchAll(PDO::FETCH_COLUMN) ?: [];
    }

    public function getNextBatch(): int
    {
        $stmt = $this->pdo->query("SELECT COALESCE(MAX(`batch`), 0) + 1 FROM `migrations`");
        return (int) $stmt->fetchColumn();
    }

    /**
     * @return string[]
     */
    public function getMigrationFiles(): array
    {
        if (!is_dir($this->migrationsPath)) {
            throw new RuntimeException("Directorio de migraciones no encontrado: {$this->migrationsPath}");
        }

        $files = glob($this->migrationsPath . '/*.sql');
        if ($files === false) {
            return [];
        }

        $filenames = array_map('basename', $files);
        sort($filenames);

        return $filenames;
    }

    /**
     * @return string[]
     */
    public function migrate(): array
    {
        $this->init();

        $executed = $this->getExecutedMigrations();
        $files = $this->getMigrationFiles();
        $batch = $this->getNextBatch();

        $applied = [];

        foreach ($files as $file) {
            if (in_array($file, $executed, true)) {
                continue;
            }

            $filePath = $this->migrationsPath . '/' . $file;
            $sql = file_get_contents($filePath);
            if ($sql === false) {
                throw new RuntimeException("No se pudo leer el archivo de migración: {$filePath}");
            }

            $cleanSql = trim($sql);
            if ($cleanSql === '') {
                continue;
            }

            // Separar sentencias SQL asegurando ejecución ordenada
            $statements = array_filter(
                array_map('trim', explode(';', $cleanSql)),
                static fn(string $statement) => $statement !== ''
            );

            foreach ($statements as $statement) {
                $this->pdo->exec($statement);
            }

            $stmt = $this->pdo->prepare("INSERT INTO `migrations` (`migration`, `batch`, `executed_at`) VALUES (:migration, :batch, UTC_TIMESTAMP())");
            $stmt->execute([
                'migration' => $file,
                'batch' => $batch,
            ]);

            $applied[] = $file;
        }

        return $applied;
    }

    /**
     * @return array<int, array{migration: string, status: string, batch: ?int, executed_at: ?string}>
     */
    public function status(): array
    {
        $this->init();

        $stmt = $this->pdo->query("SELECT `migration`, `batch`, `executed_at` FROM `migrations` ORDER BY `id` ASC");
        $executedRows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $executedMap = [];
        foreach ($executedRows as $row) {
            $executedMap[$row['migration']] = $row;
        }

        $files = $this->getMigrationFiles();
        $status = [];

        foreach ($files as $file) {
            if (isset($executedMap[$file])) {
                $status[] = [
                    'migration' => $file,
                    'status' => 'applied',
                    'batch' => (int) $executedMap[$file]['batch'],
                    'executed_at' => (string) $executedMap[$file]['executed_at'],
                ];
            } else {
                $status[] = [
                    'migration' => $file,
                    'status' => 'pending',
                    'batch' => null,
                    'executed_at' => null,
                ];
            }
        }

        return $status;
    }
}
