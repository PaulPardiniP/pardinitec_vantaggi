<?php

declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

$baseUrl = 'http://127.0.0.1:8088';

echo "=== PRUEBAS HTTP REALES (PHP SERVER {$baseUrl}) ===" . PHP_EOL . PHP_EOL;

// 1. Iniciar servidor auxiliar en puerto 8088 con redirección a NUL para evitar deadlock de pipes
$socket = @fsockopen('127.0.0.1', 8088, $errno, $errstr, 0.3);
$serverProcess = null;
$serverPid = null;

if (!$socket) {
    // Redirigir stdout y stderr a 'nul' para que el buffer de pipe del SO no se llene ni bloquee
    $serverProcess = proc_open(
        "C:\\xampp\\php\\php.exe -S 127.0.0.1:8088 -t " . escapeshellarg(__DIR__ . '/../public'),
        [
            0 => ['pipe', 'r'],
            1 => ['file', 'nul', 'w'],
            2 => ['file', 'nul', 'w'],
        ],
        $pipes
    );

    if (is_resource($serverProcess)) {
        $status = proc_get_status($serverProcess);
        $serverPid = $status['pid'] ?? null;
    }

    // Esperar a que el servidor acepte conexiones (máximo 3 segundos)
    $started = false;
    for ($i = 0; $i < 30; $i++) {
        usleep(100000); // 100ms
        $testSock = @fsockopen('127.0.0.1', 8088, $errno, $errstr, 0.1);
        if ($testSock) {
            fclose($testSock);
            $started = true;
            break;
        }
    }

    if (!$started) {
        echo "Error: No se pudo levantar el servidor PHP auxiliar en 127.0.0.1:8088" . PHP_EOL;
        exit(1);
    }
} else {
    fclose($socket);
}

// Función garantizada de cierre del proceso auxiliar
$cleanupServer = static function () use ($serverProcess, $serverPid): void {
    if ($serverPid !== null) {
        exec("taskkill /F /T /PID {$serverPid} 2>nul");
    }
    if (is_resource($serverProcess)) {
        @proc_terminate($serverProcess);
        @proc_close($serverProcess);
    }
};

register_shutdown_function($cleanupServer);

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

    // Timeouts estrictos para evitar cualquier bloqueo permanente
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 3);
    curl_setopt($ch, CURLOPT_TIMEOUT, 5);

    $formattedHeaders = [];
    if ($body !== null) {
        $jsonPayload = json_encode($body);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $jsonPayload);
        $formattedHeaders[] = 'Content-Type: application/json';
        $formattedHeaders[] = 'Content-Length: ' . strlen($jsonPayload);
    } elseif (in_array(strtoupper($method), ['POST', 'PUT', 'PATCH', 'DELETE'], true)) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, '');
        $formattedHeaders[] = 'Content-Length: 0';
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
    $curlError = curl_error($ch);
    $httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $headerSize = (int) curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    curl_close($ch);

    if ($rawResponse === false) {
        return [
            'status' => 0,
            'headers' => '',
            'cookies' => [],
            'body' => '',
            'json' => null,
            'error' => $curlError,
        ];
    }

    $headerStr = substr($rawResponse, 0, $headerSize);
    $bodyStr = substr($rawResponse, $headerSize);

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

try {
    // 1. Health check
    $resHealth = httpRequest('GET', '/api/v1/health');
    assertHttp("GET /api/v1/health responde 200 OK con status 'ok'", $resHealth['status'] === 200 && ($resHealth['json']['status'] ?? null) === 'ok');

    // 2. CORS: Comprobar origen permitido sin comodín '*'
    $resCorsAllowed = httpRequest('GET', '/api/v1/health', null, ['Origin' => 'http://localhost:5173']);
    assertHttp(
        "CORS: Origen permitido (http://localhost:5173) recibe header específico y Allow-Credentials",
        str_contains($resCorsAllowed['headers'], 'Access-Control-Allow-Origin: http://localhost:5173') &&
        str_contains($resCorsAllowed['headers'], 'Access-Control-Allow-Credentials: true') &&
        str_contains($resCorsAllowed['headers'], 'Vary: Origin')
    );

    // 3. CORS: Comprobar que origen no permitido NO recibe comodín '*'
    $resCorsForbidden = httpRequest('GET', '/api/v1/health', null, ['Origin' => 'http://sitio-malicioso.com']);
    assertHttp(
        "CORS: Origen no permitido no recibe comodín '*' ni header de origen",
        !str_contains($resCorsForbidden['headers'], 'Access-Control-Allow-Origin: *') &&
        !str_contains($resCorsForbidden['headers'], 'Access-Control-Allow-Origin: http://sitio-malicioso.com')
    );

    // 4. Registro: validación de contraseña corta
    $resRegShort = httpRequest('POST', '/api/v1/auth/register', [
        'name' => 'Usuario Test',
        'email' => 'valid_' . time() . '@test.com',
        'password' => 'short',
    ]);
    assertHttp("POST /api/v1/auth/register rechaza contraseña corta con 422", $resRegShort['status'] === 422 && isset($resRegShort['json']['errors']['password']));

    // 5. Registro: validación de email inválido
    $resRegBadEmail = httpRequest('POST', '/api/v1/auth/register', [
        'name' => 'Usuario Test',
        'email' => 'correo-invalido',
        'password' => 'ValidPass123!',
    ]);
    assertHttp("POST /api/v1/auth/register rechaza email inválido con 422", $resRegBadEmail['status'] === 422 && isset($resRegBadEmail['json']['errors']['email']));

    // 6. Registro exitoso y confirmación de que no asigna roles ni negocios
    $email = 'user_http_' . time() . '@test.com';
    $password = 'SecurePassword2026!';
    $resReg = httpRequest('POST', '/api/v1/auth/register', [
        'name' => 'Usuario HTTP Real',
        'email' => $email,
        'password' => $password,
    ]);
    assertHttp("POST /api/v1/auth/register registra exitosamente con 201", $resReg['status'] === 201 && $resReg['json']['success'] === true, "Email: {$email}");
    assertHttp(
        "POST /api/v1/auth/register no concede roles, negocios ni permisos",
        !isset($resReg['json']['data']['user']['role']) && !isset($resReg['json']['data']['user']['business_id'])
    );

    // 7. Login con contraseña errónea
    $resLoginWrong = httpRequest('POST', '/api/v1/auth/login', [
        'email' => $email,
        'password' => 'WrongPassword!',
    ]);
    assertHttp("POST /api/v1/auth/login rechaza credenciales erróneas con 401", $resLoginWrong['status'] === 401 && $resLoginWrong['json']['success'] === false);

    // 8. Login exitoso
    $resLogin = httpRequest('POST', '/api/v1/auth/login', [
        'email' => $email,
        'password' => $password,
    ]);
    assertHttp("POST /api/v1/auth/login exitoso con 200", $resLogin['status'] === 200 && $resLogin['json']['success'] === true);

    // Comprobar cookie de sesión
    $sessionCookie = null;
    $cookieValue = null;
    foreach ($resLogin['cookies'] as $c) {
        if (str_starts_with($c, 'vantaggi_session=')) {
            $sessionCookie = $c;
            $cookieValue = substr($c, strlen('vantaggi_session='));
            break;
        }
    }
    assertHttp("Login emite cookie vantaggi_session", $sessionCookie !== null);
    assertHttp("Cookie incluye directivas de seguridad HttpOnly y SameSite=Lax", str_contains($resLogin['headers'], 'HttpOnly') && str_contains($resLogin['headers'], 'SameSite=Lax'));

    // 9. Comprobar que en MariaDB solo se guarda el hash SHA-256 del token
    $pdo = App\Core\Database\Connection::get();
    $userId = $resLogin['json']['data']['user']['id'];
    $dbTokenHash = $pdo->query("SELECT id FROM sessions WHERE user_id = {$userId} ORDER BY created_at DESC LIMIT 1")->fetchColumn();
    $expectedHash = hash('sha256', (string) $cookieValue);
    assertHttp(
        "MariaDB almacena únicamente el hash SHA-256 de la cookie de sesión",
        $dbTokenHash === $expectedHash && $dbTokenHash !== $cookieValue,
        "Hash: " . substr((string) $dbTokenHash, 0, 16) . "..."
    );

    $csrfToken = $resLogin['json']['data']['csrf_token'] ?? null;
    assertHttp("Login retorna token CSRF de 64 caracteres", is_string($csrfToken) && strlen($csrfToken) === 64);

    // 10. GET /api/v1/auth/me sin cookie -> 401
    $resMeNoCookie = httpRequest('GET', '/api/v1/auth/me');
    assertHttp("GET /api/v1/auth/me sin cookie rechaza con 401", $resMeNoCookie['status'] === 401);

    // 11. GET /api/v1/auth/me con cookie de sesión
    $resMe = httpRequest('GET', '/api/v1/auth/me', null, [], $sessionCookie);
    assertHttp("GET /api/v1/auth/me autenticado con cookie responde 200", $resMe['status'] === 200 && $resMe['json']['data']['user']['email'] === $email);

    // 12. GET /api/v1/auth/csrf con cookie de sesión
    $resCsrf = httpRequest('GET', '/api/v1/auth/csrf', null, [], $sessionCookie);
    assertHttp("GET /api/v1/auth/csrf retorna token CSRF asociado", $resCsrf['status'] === 200 && $resCsrf['json']['data']['csrf_token'] === $csrfToken);

    // === PRUEBAS HTTP DE SUBETAPA 1.3 (BUSINESSES & MEMBERSHIPS) ===
    echo PHP_EOL . "--- Pruebas HTTP de Businesses y Memberships ---" . PHP_EOL;

    // 13. POST /api/v1/businesses con CSRF
    $resCreateBiz = httpRequest('POST', '/api/v1/businesses', [
        'name' => 'Trattoria Bella Napoli',
        'tax_id' => 'IT99887766554',
    ], ['X-CSRF-Token' => $csrfToken], $sessionCookie);
    assertHttp("POST /api/v1/businesses crea comercio con 201", $resCreateBiz['status'] === 201 && $resCreateBiz['json']['success'] === true);
    assertHttp("Comercio creado tiene self_registration_enabled = false por defecto", isset($resCreateBiz['json']['data']['self_registration_enabled']) && $resCreateBiz['json']['data']['self_registration_enabled'] === false);
    $createdBizId = $resCreateBiz['json']['data']['id'];

    // 14. GET /api/v1/businesses lista comercios del usuario
    $resListBiz = httpRequest('GET', '/api/v1/businesses', null, [], $sessionCookie);
    assertHttp("GET /api/v1/businesses responde 200 y contiene el nuevo comercio", $resListBiz['status'] === 200 && count($resListBiz['json']['data']) >= 1);

    // 15. GET /api/v1/businesses/{id}
    $resGetBiz = httpRequest("GET", "/api/v1/businesses/{$createdBizId}", null, [], $sessionCookie);
    assertHttp("GET /api/v1/businesses/{id} responde 200 con rol owner", $resGetBiz['status'] === 200 && $resGetBiz['json']['data']['role'] === 'owner');

    // 16. Crear segundo usuario y verificar aislamiento multi-tenant por HTTP
    $user2Email = 'other_user_' . time() . '@test.com';
    httpRequest('POST', '/api/v1/auth/register', ['name' => 'Segundo Usuario', 'email' => $user2Email, 'password' => 'Password123!']);
    $resLogin2 = httpRequest('POST', '/api/v1/auth/login', ['email' => $user2Email, 'password' => 'Password123!']);
    $cookie2 = null;
    foreach ($resLogin2['cookies'] as $c) {
        if (str_starts_with($c, 'vantaggi_session=')) {
            $cookie2 = $c;
            break;
        }
    }
    $user2Id = $resLogin2['json']['data']['user']['id'];
    $resForbiddenCross = httpRequest("GET", "/api/v1/businesses/{$createdBizId}", null, [], $cookie2);
    assertHttp("Aislamiento HTTP: Usuario ajeno recibe 403 al consultar comercio", $resForbiddenCross['status'] === 403);

    // 17. POST /api/v1/businesses/{id}/members (User 1 agrega a User 2 como staff)
    $resAddMember = httpRequest("POST", "/api/v1/businesses/{$createdBizId}/members", [
        'email' => $user2Email,
        'role' => 'staff',
    ], ['X-CSRF-Token' => $csrfToken], $sessionCookie);
    assertHttp("POST /api/v1/businesses/{id}/members agrega miembro con rol staff y código 201", $resAddMember['status'] === 201 && $resAddMember['json']['data']['role'] === 'staff');

    // 18. POST /api/v1/businesses/{id}/members con rol antiguo 'cashier' debe ser rechazado con 422
    $user3Email = 'third_user_' . time() . '@test.com';
    httpRequest('POST', '/api/v1/auth/register', ['name' => 'Tercer Usuario', 'email' => $user3Email, 'password' => 'Password123!']);
    $resAddCashier = httpRequest("POST", "/api/v1/businesses/{$createdBizId}/members", [
        'email' => $user3Email,
        'role' => 'cashier',
    ], ['X-CSRF-Token' => $csrfToken], $sessionCookie);
    assertHttp("POST /api/v1/businesses/{id}/members rechaza rol 'cashier' con 422", $resAddCashier['status'] === 422);

    // 19. GET /api/v1/businesses/{id}/members
    $resListMembers = httpRequest("GET", "/api/v1/businesses/{$createdBizId}/members", null, [], $sessionCookie);
    assertHttp("GET /api/v1/businesses/{id}/members responde 200 con 2 miembros", $resListMembers['status'] === 200 && count($resListMembers['json']['data']) === 2);

    // 20. DELETE /api/v1/businesses/{id}/members/{userId}
    $resDelMember = httpRequest("DELETE", "/api/v1/businesses/{$createdBizId}/members/{$user2Id}", null, ['X-CSRF-Token' => $csrfToken], $sessionCookie);
    assertHttp("DELETE /api/v1/businesses/{id}/members/{userId} remueve miembro con 200", $resDelMember['status'] === 200 && $resDelMember['json']['success'] === true);

    echo PHP_EOL . "--- Pruebas de Logout y Destrucción de Sesión ---" . PHP_EOL;

    // 20. Logout sin CSRF -> 403 Forbidden
    $resLogoutNoCsrf = httpRequest('POST', '/api/v1/auth/logout', null, [], $sessionCookie);
    assertHttp("POST /api/v1/auth/logout sin token CSRF es rechazado con 403", $resLogoutNoCsrf['status'] === 403 && str_contains($resLogoutNoCsrf['json']['message'], 'CSRF'));

    // 21. Logout con CSRF inválido -> 403 Forbidden
    $resLogoutBadCsrf = httpRequest('POST', '/api/v1/auth/logout', null, ['X-CSRF-Token' => 'token_totalmente_falso'], $sessionCookie);
    assertHttp("POST /api/v1/auth/logout con token CSRF inválido es rechazado con 403", $resLogoutBadCsrf['status'] === 403 && str_contains($resLogoutBadCsrf['json']['message'], 'CSRF'));

    // 22. Logout con CSRF válido -> 200 OK
    $resLogout = httpRequest('POST', '/api/v1/auth/logout', null, ['X-CSRF-Token' => $csrfToken], $sessionCookie);
    assertHttp("POST /api/v1/auth/logout con CSRF válido responde 200 OK", $resLogout['status'] === 200 && $resLogout['json']['success'] === true);

    // 23. Verificación post-logout: la cookie ya no es válida en /api/v1/auth/me
    $resMeAfterLogout = httpRequest('GET', '/api/v1/auth/me', null, [], $sessionCookie);
    assertHttp("Sesión destruida: GET /api/v1/auth/me responde 401 tras logout", $resMeAfterLogout['status'] === 401);

    echo PHP_EOL . "==========================================" . PHP_EOL;
    echo "RESULTADOS HTTP: {$passed} de {$total} pruebas pasaron correctamente." . PHP_EOL;
    echo "==========================================" . PHP_EOL;
} finally {
    $cleanupServer();
}

if ($passed !== $total) {
    exit(1);
}
