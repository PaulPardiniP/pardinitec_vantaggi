<?php

declare(strict_types=1);

namespace App\Core\Http;

final class Request {
    public $body = '';
    private array $routeParams = [];
    public function setRouteParam(string $key, $value): void { $this->routeParams[$key] = $value; }
    public function getRouteParam(string $key) { return $this->routeParams[$key] ?? null; }
    public function getJson(): array { return $this->getJsonBody(); }
    public function getAttribute(string $key) { return $this->attributes[$key] ?? null; }
    public function setAttribute(string $key, $value): void { $this->attributes[$key] = $value; }

    private string $method;
    private string $path;
    private array $headers;
    private array $cookies;
    private array $query;
    private ?array $jsonBody = null;

    public function __construct(
        ?string $method = null,
        ?string $uri = null,
        ?array $headers = null,
        ?array $cookies = null,
        ?array $query = null
    ) {
        $this->method = strtoupper($method ?? ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
        
        $requestUri = $uri ?? ($_SERVER['REQUEST_URI'] ?? '/');
        $parsedPath = parse_url($requestUri, PHP_URL_PATH) ?? '/';
        $this->path = rtrim($parsedPath, '/') === '' ? '/' : rtrim($parsedPath, '/');

        $this->headers = $headers ?? $this->captureHeaders();
        $this->cookies = $cookies ?? $_COOKIE;
        $this->query = $query ?? $_GET;
    }

    public function getQuery(?string $name = null, mixed $default = null): mixed
    {
        if ($name === null) {
            return $this->query;
        }
        return $this->query[$name] ?? $default;
    }

    public static function capture(): self
    {
        return new self();
    }

    public function getMethod(): string
    {
        return $this->method;
    }

    public function getPath(): string
    {
        return $this->path;
    }

    public function getHeader(string $name): ?string
    {
        $normalizedName = strtolower($name);
        foreach ($this->headers as $key => $value) {
            if (strtolower($key) === $normalizedName) {
                return (string) $value;
            }
        }
        return null;
    }

    public function getCookie(string $name): ?string
    {
        return isset($this->cookies[$name]) ? (string) $this->cookies[$name] : null;
    }

    public function getJsonBody(): array
    {
        if ($this->jsonBody !== null) {
            return $this->jsonBody;
        }

        $rawInput = file_get_contents('php://input');
        if ($rawInput === false || trim($rawInput) === '') {
            $this->jsonBody = [];
            return $this->jsonBody;
        }

        $decoded = json_decode($rawInput, true);
        $this->jsonBody = is_array($decoded) ? $decoded : [];
        return $this->jsonBody;
    }

    public function setJsonBody(array $body): void
    {
        $this->jsonBody = $body;
    }

    public function getClientIp(): ?string
    {
        return $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? null;
    }

    public function getUserAgent(): ?string
    {
        $ua = $_SERVER['HTTP_USER_AGENT'] ?? null;
        return $ua !== null ? substr((string) $ua, 0, 255) : null;
    }

    private function captureHeaders(): array
    {
        $headers = [];
        foreach ($_SERVER as $key => $value) {
            if (str_starts_with($key, 'HTTP_')) {
                $headerName = str_replace('_', '-', strtolower(substr($key, 5)));
                $headers[$headerName] = $value;
            } elseif (in_array($key, ['CONTENT_TYPE', 'CONTENT_LENGTH'], true)) {
                $headerName = str_replace('_', '-', strtolower($key));
                $headers[$headerName] = $value;
            }
        }
        return $headers;
    }
}
