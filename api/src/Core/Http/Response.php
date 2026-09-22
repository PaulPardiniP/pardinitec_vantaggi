<?php

declare(strict_types=1);

namespace App\Core\Http;

final class Response
{
    public static function json(
        mixed $data,
        int $statusCode = 200,
        array $headers = []
    ): void {
        http_response_code($statusCode);

        header('Content-Type: application/json; charset=UTF-8');
        header('X-Content-Type-Options: nosniff');
        header('X-Frame-Options: DENY');
        header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'");
        header("Referrer-Policy: strict-origin-when-cross-origin");
        header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
        header('Pragma: no-cache');
        
        if (($_ENV['APP_ENV'] ?? '') === 'production') {
            header('Strict-Transport-Security: max-age=31536000; includeSubDomains');
        }

        foreach ($headers as $name => $value) {
            header("{$name}: {$value}");
        }

        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        exit;
    }

    public static function success(
        string $message,
        array $data = [],
        int $statusCode = 200
    ): void {
        self::json(
            array_merge([
                'success' => true,
                'message' => $message,
            ], $data),
            $statusCode
        );
    }

    public static function error(string $message, int $statusCode = 400, array $errors = [], array $headers = []): void {
        if (defined('IS_TEST_ENV')) { throw new \RuntimeException($message); }
        $payload = [
            'success' => false,
            'message' => $message,
        ];

        if (!empty($errors)) {
            $payload['errors'] = $errors;
        }

        self::json($payload, $statusCode, $headers);
    }
}
