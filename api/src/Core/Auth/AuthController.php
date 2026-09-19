<?php

declare(strict_types=1);

namespace App\Core\Auth;

use App\Core\Http\Request;
use App\Core\Http\Response;
use App\Core\Security\Csrf;
use App\Core\Security\RateLimiter;
use App\Core\Security\Totp;
use InvalidArgumentException;
use Throwable;

final class AuthController
{
    private AuthService $authService;
    private RateLimiter $rateLimiter;

    public function __construct(?AuthService $authService = null, ?RateLimiter $rateLimiter = null)
    {
        $this->authService = $authService ?? new AuthService();
        $this->rateLimiter = $rateLimiter ?? new RateLimiter();
    }

    public function register(Request $request): void
    {
        try {
            $body = $request->getJsonBody();
            $user = $this->authService->register($body);

            Response::success('Usuario registrado exitosamente.', [
                'data' => [
                    'user' => $user,
                ],
            ], 201);
        } catch (ValidationException $e) {
            Response::error($e->getMessage(), 422, $e->getErrors());
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 400);
        } catch (Throwable $e) {
            Response::error('No fue posible procesar el registro.', 500);
        }
    }

    public function login(Request $request): void
    {
        try {
            $body = $request->getJsonBody();
            $email = (string) ($body['email'] ?? '');
            $password = (string) ($body['password'] ?? '');

            $clientIp = $request->getClientIp() ?? '127.0.0.1';
            $rateKey = $clientIp . ':' . strtolower(trim($email));

            // Comprobar límite previo (5 intentos fallidos por ventana de 60 segundos)
            $check = $this->rateLimiter->check('auth.login', $rateKey, 5);
            if (!$check['allowed']) {
                Response::error(
                    'Demasiados intentos de inicio de sesión. Por favor, intente nuevamente más tarde.',
                    429,
                    [],
                    ['Retry-After' => (string) $check['retry_after']]
                );
            }

            $existingSessionId = $request->getCookie(
                $this->authService->getSessionManager()->getCookieName()
            );

            try {
                $result = $this->authService->login(
                    $email,
                    $password,
                    $request->getClientIp(),
                    $request->getUserAgent(),
                    $existingSessionId
                );

                // En login exitoso se reinicia el contador de intentos fallidos
                $this->rateLimiter->reset('auth.login', $rateKey);

                Response::success('Inicio de sesión exitoso.', [
                    'data' => [
                        'user' => $result['user'],
                        'csrf_token' => $result['csrf_token'],
                    ],
                ], 200);
            } catch (InvalidArgumentException $e) {
                // Registrar intento fallido
                $hit = $this->rateLimiter->hit('auth.login', $rateKey, 5, 60);
                if (!$hit['allowed']) {
                    Response::error(
                        'Demasiados intentos de inicio de sesión. Por favor, intente nuevamente más tarde.',
                        429,
                        [],
                        ['Retry-After' => (string) $hit['retry_after']]
                    );
                }
                Response::error($e->getMessage(), 401);
            }
        } catch (Throwable $e) {
            Response::error('Error al iniciar sesión.', 500);
        }
    }

    public function me(Request $request): void
    {
        try {
            $cookieName = $this->authService->getSessionManager()->getCookieName();
            $sessionId = $request->getCookie($cookieName);

            $session = $this->authService->getCurrentSession($sessionId, true);
            if ($session === null) {
                Response::error('No autenticado o sesión expirada.', 401);
            }

            $user = $session['user'];
            $user['session_state'] = $session['state'];

            Response::success('Sesión activa.', [
                'data' => [
                    'user' => $user,
                    'csrf_token' => $session['csrf_token'],
                ],
            ], 200);
        } catch (Throwable $e) {
            Response::error('Error al verificar la sesión.', 500);
        }
    }

    public function csrf(Request $request): void
    {
        try {
            $cookieName = $this->authService->getSessionManager()->getCookieName();
            $sessionId = $request->getCookie($cookieName);

            $session = $this->authService->getCurrentSession($sessionId, true);
            if ($session === null) {
                Response::error('No autenticado.', 401);
            }

            Response::success('Token CSRF obtenido.', [
                'data' => [
                    'csrf_token' => $session['csrf_token'],
                ],
            ], 200);
        } catch (Throwable $e) {
            Response::error('Error al obtener token CSRF.', 500);
        }
    }

    public function logout(Request $request): void
    {
        try {
            $cookieName = $this->authService->getSessionManager()->getCookieName();
            $sessionId = $request->getCookie($cookieName);

            $session = $this->authService->getCurrentSession($sessionId, true);
            if ($session === null) {
                Response::error('No hay una sesión activa para cerrar.', 401);
            }

            // Verificación CSRF obligatoria para logout
            $submittedCsrf = $request->getHeader('x-csrf-token') ?? ($request->getJsonBody()['_csrf_token'] ?? null);

            if (!Csrf::verify($session['csrf_token'], $submittedCsrf)) {
                Response::error('Token CSRF inválido o ausente.', 403);
            }

            $this->authService->logout($sessionId);

            Response::success('Sesión cerrada correctamente.', [], 200);
        } catch (Throwable $e) {
            Response::error('Error al cerrar la sesión.', 500);
        }
    }

    public function setup2fa(Request $request): void
    {
        $cookieName = $this->authService->getSessionManager()->getCookieName();
        $sessionId = $request->getCookie($cookieName);

        $session = $this->authService->getCurrentSession($sessionId, true);
        if ($session === null) {
            Response::error('No autenticado o sesión expirada.', 401);
        }
        $user = $session['user'];

        $rateKey = $request->getClientIp() . ':2fa:' . ($user['id'] ?? 'none');
        $check = $this->rateLimiter->check('auth.2fa', $rateKey, 10, 60);
        if (!$check['allowed']) {
            Response::error('Demasiados intentos', 429, [], ['Retry-After' => (string) $check['retry_after']]);
        }

        $pdo = \App\Core\Database\Connection::get();

        // Reutilizar secreto pendiente si ya existe uno sin activar
        $stmt = $pdo->prepare("SELECT `secret_encrypted` FROM `totp_secrets` WHERE `user_id` = ? AND `is_active` = 0");
        $stmt->execute([$user['id']]);
        $existing = $stmt->fetch(\PDO::FETCH_ASSOC);

        $secret = null;
        if ($existing && !empty($existing['secret_encrypted'])) {
            try {
                $secret = Totp::decryptSecret((string) $existing['secret_encrypted']);
            } catch (\Throwable $e) {
                $secret = null;
            }
        }

        if (!$secret) {
            $secret = Totp::generateSecret();
            $encrypted = Totp::encryptSecret($secret);

            $stmt = $pdo->prepare("
                INSERT INTO `totp_secrets` (`user_id`, `secret_encrypted`, `is_active`, `created_at`)
                VALUES (?, ?, 0, UTC_TIMESTAMP())
                ON DUPLICATE KEY UPDATE `secret_encrypted` = ?, `is_active` = 0
            ");
            $stmt->execute([$user['id'], $encrypted, $encrypted]);
        }

        $issuer = $_ENV['TOTP_ISSUER'] ?? 'PardinitecVantaggi';
        $uri = Totp::getProvisioningUri($secret, $user['email'], $issuer);

        Response::success('2FA Setup', [
            'data' => [
                'uri' => $uri,
                'secret' => $secret,
            ],
            'uri' => $uri,
            'secret' => $secret,
        ]);
    }

    public function verify2faSetup(Request $request): void
    {
        $cookieName = $this->authService->getSessionManager()->getCookieName();
        $sessionId = $request->getCookie($cookieName);

        $session = $this->authService->getCurrentSession($sessionId, true);
        if ($session === null) {
            Response::error('No autenticado o sesión expirada.', 401);
        }
        $user = $session['user'];

        $rateKey = $request->getClientIp() . ':2fa:' . ($user['id'] ?? 'none');
        $check = $this->rateLimiter->check('auth.2fa', $rateKey, 10, 60);
        if (!$check['allowed']) {
            Response::error('Demasiados intentos', 429, [], ['Retry-After' => (string) $check['retry_after']]);
        }

        $code = trim((string) ($request->getJsonBody()['code'] ?? ''));

        $pdo = \App\Core\Database\Connection::get();
        $stmt = $pdo->prepare("SELECT * FROM `totp_secrets` WHERE `user_id` = ? AND `is_active` = 0");
        $stmt->execute([$user['id']]);
        $totp = $stmt->fetch(\PDO::FETCH_ASSOC);

        if (!$totp) {
            Response::error('No hay configuración 2FA pendiente', 400);
        }

        try {
            $secret = Totp::decryptSecret((string) $totp['secret_encrypted']);
        } catch (\Throwable $e) {
            $secret = (string) $totp['secret_encrypted'];
        }

        if (!Totp::verify((string)$secret, $code)) {
            Response::error('Código TOTP inválido', 400);
        }

        $recoveryCodes = Totp::generateRecoveryCodes();
        $hash = Totp::hashRecoveryCodes($recoveryCodes);

        $upd = $pdo->prepare("UPDATE `totp_secrets` SET `is_active` = 1, `activated_at` = UTC_TIMESTAMP(), `recovery_codes_hash` = ? WHERE `id` = ?");
        $upd->execute([json_encode($hash), $totp['id']]);

        $pdo->prepare("UPDATE `users` SET `totp_enabled` = 1 WHERE `id` = ?")->execute([$user['id']]);

        // Activar la sesión actual
        $pdo->prepare("UPDATE `sessions` SET `state` = 'active' WHERE `id` = ?")->execute([$session['token_hash']]);

        Response::success('2FA Activado con éxito', [
            'data' => [
                'recovery_codes' => $recoveryCodes,
                'user' => [
                    'id' => $user['id'],
                    'email' => $user['email'],
                    'name' => $user['name'],
                    'is_super_admin' => (bool) $user['is_super_admin'],
                    'totp_enabled' => true,
                    'session_state' => 'active',
                ],
            ],
            'recovery_codes' => $recoveryCodes,
            'user' => [
                'id' => $user['id'],
                'email' => $user['email'],
                'name' => $user['name'],
                'is_super_admin' => (bool) $user['is_super_admin'],
                'totp_enabled' => true,
                'session_state' => 'active',
            ],
        ]);
    }

    public function challenge2fa(Request $request): void
    {
        $cookieName = $this->authService->getSessionManager()->getCookieName();
        $sessionId = $request->getCookie($cookieName);

        $rateKey = $request->getClientIp() . ':2fa:' . (string) $sessionId;
        $check = $this->rateLimiter->check('auth.2fa', $rateKey, 10, 60);
        if (!$check['allowed']) {
            Response::error('Demasiados intentos', 429, [], ['Retry-After' => (string) $check['retry_after']]);
        }

        $code = trim((string) ($request->getJsonBody()['code'] ?? ''));

        if (str_contains($code, '-')) {
            $ok = $this->authService->consumeRecoveryCode((string)$sessionId, $code);
        } else {
            $ok = $this->authService->verifyTotpChallenge((string)$sessionId, $code);
        }

        if ($ok) {
            $session = $this->authService->getCurrentSession($sessionId, true);
            Response::success('2FA Verificado', [
                'data' => [
                    'user' => array_merge($session['user'], ['session_state' => 'active', 'totp_enabled' => true]),
                    'csrf_token' => $session['csrf_token']
                ]
            ]);
        }

        Response::error('Código 2FA o de recuperación inválido', 401);
    }
}