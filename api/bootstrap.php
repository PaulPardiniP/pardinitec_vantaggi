<?php

declare(strict_types=1);

use Dotenv\Dotenv;

require_once __DIR__ . '/vendor/autoload.php';

// 1. Capturar variables de entorno explícitas previas a dotenv
$initialAppEnv = getenv('APP_ENV') ?: ($_ENV['APP_ENV'] ?? '');
$initialTesting = getenv('VANTAGGI_TESTING') ?: ($_ENV['VANTAGGI_TESTING'] ?? '');

$dotenv = Dotenv::createImmutable(__DIR__);
$dotenv->load();

// 2. Reconocer variables tanto desde $_ENV como desde getenv()
$appEnv = ($initialAppEnv !== '') ? $initialAppEnv : ($_ENV['APP_ENV'] ?? (getenv('APP_ENV') ?: ''));
$vantaggiTesting = ($initialTesting !== '') ? $initialTesting : ($_ENV['VANTAGGI_TESTING'] ?? (getenv('VANTAGGI_TESTING') ?: ''));

$dotenv->required([
    'DB_HOST',
    'DB_PORT',
    'DB_NAME',
    'DB_USER',
    'DB_PASSWORD',
    'DB_CHARSET',
])->notEmpty();

if (!defined('VANTAGGI_TESTING')) {
    $script = $_SERVER['SCRIPT_FILENAME'] ?? '';
    if (
        $appEnv === 'testing' ||
        $vantaggiTesting === '1' ||
        $vantaggiTesting === 'true' ||
        str_contains($script, 'test_') ||
        str_contains($script, 'tests')
    ) {
        define('VANTAGGI_TESTING', true);
        $_ENV['APP_ENV'] = 'testing';
        putenv('APP_ENV=testing');
        $_ENV['VANTAGGI_TESTING'] = '1';
        putenv('VANTAGGI_TESTING=1');
    }
}