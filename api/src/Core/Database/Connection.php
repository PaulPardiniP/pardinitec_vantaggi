<?php

declare(strict_types=1);

namespace App\Core\Database;

use PDO;
use PDOException;
use RuntimeException;

final class Connection
{
    private static ?PDO $instance = null;

    private function __construct()
    {
    }

    public static function reset(): void
    {
        self::$instance = null;
    }

    public static function get(): PDO
    {
        if (self::$instance instanceof PDO) {
            return self::$instance;
        }

        $dbName = $_ENV['DB_NAME'];
        $appEnv = $_ENV['APP_ENV'] ?? (getenv('APP_ENV') ?: '');
        $vantaggiTesting = $_ENV['VANTAGGI_TESTING'] ?? (getenv('VANTAGGI_TESTING') ?: '');
        if ($appEnv === 'testing' || $vantaggiTesting === '1' || $vantaggiTesting === 'true' || defined('VANTAGGI_TESTING')) {
            $dbName = $_ENV['DB_TEST_NAME'] ?? (str_ends_with($dbName, '_test') ? $dbName : ($dbName . '_test'));
        }

        $dsn = sprintf(
            'mysql:host=%s;port=%s;dbname=%s;charset=%s',
            $_ENV['DB_HOST'],
            $_ENV['DB_PORT'],
            $dbName,
            $_ENV['DB_CHARSET']
        );

        try {
            self::$instance = new PDO(
                $dsn,
                $_ENV['DB_USER'],
                $_ENV['DB_PASSWORD'],
                [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES => false,
                ]
            );

            self::$instance->exec("SET time_zone = '+00:00'");

            return self::$instance;
        } catch (PDOException $exception) {
            throw new RuntimeException(
                'No se pudo conectar con la base de datos.',
                0,
                $exception
            );
        }
    }
}
