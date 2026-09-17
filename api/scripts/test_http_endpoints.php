<?php

declare(strict_types=1);

$baseUrl = 'http://127.0.0.1:8088';

echo "=== PRUEBAS HTTP REALES DE SUBETAPA 1.2 (PHP SERVER {$baseUrl}) ===" . PHP_EOL . PHP_EOL;

function httpRequest(
    string $method,
    string $path,
    ?array $body = null,
    array $headers = [],
    ?string $cookie = null
): array {
    global $baseUrl;

    $ch = curl_init("{$baseUrl}{$path}");
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HEADER, true);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);

    $formattedHeaders = [];
    if ($body !== null) {
        $jsonPayload = json_encode($body);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $jsonPayload);
        $formattedHeaders[] = 'Content-Type: application/json';
        $formattedHeaders[] = 'Content-Length: ' . strlen($jsonPayload);
    }

    foreach ($headers as $k => $v) {
        $formattedHeaders[] = "{$k}: {$v}";
    }

    if (!empty($formattedHeaders)) {
        curl_setopt($ch, CURLOPT_HTTPHEADER, $formattedHeaders);
    }

    if ($cookie !== null) {
        curl_setopt($ch, CURLOPT_COOKIE, $cookie);
    }

    $rawResponse = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    curl_close($ch);

    $headerStr = substr($rawResponse, 0, $headerSize);
    $bodyStr = substr($rawResponse, $headerSize);

    // Extraer cookies de Set-Cookie
    preg_match_all('/^Set-Cookie:\s*([^;]+)/mi', $headerStr, $cookieMatches);
    $cookies = $cookieMatches[1] ?? [];

    $json = json_decode($bodyStr, true);

    return [
        'status' => $httpCode,
        'headers' => $headerStr,
        'cookies' => $cookies,
        'body' => $bodyStr,
        'json' => $json,
    ];
}

$passed = 0;
$total = 0;

function assertHttp(string $testName, bool $condition, string $extra = ''): void
{
    global $passed, $total;
    $total++;
    if ($condition) {
        $passed++;
        echo " [OK] {$testName}" . ($extra ? " ({$extra})" : "") . PHP_EOL;
    } else {
        echo " [FAIL] {$testName}" . ($extra ? " ({$extra})" : "") . PHP_EOL;
    }
}

// 1. Health check
$resHealth = httpRequest('GET', '/api/v1/health');
assertHttp("GET /api/v1/health responde 200 OK con status 'ok'", $resHealth['status'] === 200 && ($resHealth['json']['status'] ?? null) === 'ok');

// 2. Registro: validación de contraseña corta
$resRegShort = httpRequest('POST', '/api/v1/auth/register', [
    'name' => 'Usuario Test',
    'email' => 'valid_' . time() . '@test.com',
    'password' => 'short',
]);
assertHttp("POST /api/v1/auth/register rechaza contraseña corta con 422", $resRegShort['status'] === 422 && isset($resRegShort['json']['errors']['password']));

// 3. Registro: validación de email inválido
$resRegBadEmail = httpRequest('POST', '/api/v1/auth/register', [
    'name' => 'Usuario Test',
    'email' => 'correo-invalido',
    'password' => 'ValidPass123!',
]);
assertHttp("POST /api/v1/auth/register rechaza email inválido con 422", $resRegBadEmail['status'] === 422 && isset($resRegBadEmail['json']['errors']['email']));

// 4. Registro exitoso
$email = 'user_http_' . time() . '@test.com';
$password = 'SecurePassword2026!';
$resReg = httpRequest('POST', '/api/v1/auth/register', [
    'name' => 'Usuario HTTP Real',
    'email' => $email,
    'password' => $password,
]);
assertHttp("POST /api/v1/auth/register registra exitosamente con 201", $resReg['status'] === 201 && $resReg['json']['success'] === true, "Email: {$email}");

// 5. Login con contraseña errónea
$resLoginWrong = httpRequest('POST', '/api/v1/auth/login', [
    'email' => $email,
    'password' => 'WrongPassword!',
]);
assertHttp("POST /api/v1/auth/login rechaza credenciales erróneas con 401", $resLoginWrong['status'] === 401 && $resLoginWrong['json']['success'] === false);

// 6. Login exitoso
$resLogin = httpRequest('POST', '/api/v1/auth/login', [
    'email' => $email,
    'password' => $password,
]);
assertHttp("POST /api/v1/auth/login exitoso con 200", $resLogin['status'] === 200 && $resLogin['json']['success'] === true);

// Comprobar cookie de sesión
$sessionCookie = null;
foreach ($resLogin['cookies'] as $c) {
    if (str_starts_with($c, 'vantaggi_session=')) {
        $sessionCookie = $c;
        break;
    }
}
assertHttp("Login emite cookie vantaggi_session", $sessionCookie !== null);
assertHttp("Cookie incluye directivas de seguridad HttpOnly y SameSite=Lax", str_contains($resLogin['headers'], 'HttpOnly') && str_contains($resLogin['headers'], 'SameSite=Lax'));

$csrfToken = $resLogin['json']['data']['csrf_token'] ?? null;
assertHttp("Login retorna token CSRF de 64 caracteres", is_string($csrfToken) && strlen($csrfToken) === 64);

// 7. GET /api/v1/auth/me sin cookie -> 401
$resMeNoCookie = httpRequest('GET', '/api/v1/auth/me');
assertHttp("GET /api/v1/auth/me sin cookie rechaza con 401", $resMeNoCookie['status'] === 401);

// 8. GET /api/v1/auth/me con cookie de sesión
$resMe = httpRequest('GET', '/api/v1/auth/me', null, [], $sessionCookie);
assertHttp("GET /api/v1/auth/me autenticado con cookie responde 200", $resMe['status'] === 200 && $resMe['json']['data']['user']['email'] === $email);

// 9. GET /api/v1/auth/csrf con cookie de sesión
$resCsrf = httpRequest('GET', '/api/v1/auth/csrf', null, [], $sessionCookie);
assertHttp("GET /api/v1/auth/csrf retorna token CSRF asociado", $resCsrf['status'] === 200 && $resCsrf['json']['data']['csrf_token'] === $csrfToken);

// 10. Logout sin CSRF -> 403 Forbidden
$resLogoutNoCsrf = httpRequest('POST', '/api/v1/auth/logout', null, [], $sessionCookie);
assertHttp("POST /api/v1/auth/logout sin token CSRF es rechazado con 403", $resLogoutNoCsrf['status'] === 403 && str_contains($resLogoutNoCsrf['json']['message'], 'CSRF'));

// 11. Logout con CSRF inválido -> 403 Forbidden
$resLogoutBadCsrf = httpRequest('POST', '/api/v1/auth/logout', null, ['X-CSRF-Token' => 'token_totalmente_falso'], $sessionCookie);
assertHttp("POST /api/v1/auth/logout con token CSRF inválido es rechazado con 403", $resLogoutBadCsrf['status'] === 403 && str_contains($resLogoutBadCsrf['json']['message'], 'CSRF'));

// 12. Logout con CSRF válido -> 200 OK
$resLogout = httpRequest('POST', '/api/v1/auth/logout', null, ['X-CSRF-Token' => $csrfToken], $sessionCookie);
assertHttp("POST /api/v1/auth/logout con CSRF válido responde 200 OK", $resLogout['status'] === 200 && $resLogout['json']['success'] === true);

// 13. Verificación post-logout: la cookie ya no es válida en /api/v1/auth/me
$resMeAfterLogout = httpRequest('GET', '/api/v1/auth/me', null, [], $sessionCookie);
assertHttp("Sesión destruida: GET /api/v1/auth/me responde 401 tras logout", $resMeAfterLogout['status'] === 401);

echo PHP_EOL . "==========================================" . PHP_EOL;
echo "RESULTADOS HTTP: {$passed} de {$total} pruebas pasaron correctamente." . PHP_EOL;
echo "==========================================" . PHP_EOL;

if ($passed !== $total) {
    exit(1);
}
