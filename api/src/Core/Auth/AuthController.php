<?php

declare(strict_types=1);

namespace App\Core\Auth;

use App\Core\Http\Request;
use App\Core\Http\Response;
use App\Core\Security\Csrf;
use App\Core\Security\RateLimiter;
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

            $session = $this->authService->getCurrentSession($sessionId);
            if ($session === null) {
                Response::error('No autenticado o sesión expirada.', 401);
            }

            Response::success('Sesión activa.', [
                'data' => [
                    'user' => $session['user'],
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

            $session = $this->authService->getCurrentSession($sessionId);
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

            $session = $this->authService->getCurrentSession($sessionId);
            if ($session === null) {
                Response::error('No hay una sesión activa para cerrar.', 401);
            }

            // Verificación CSRF obligatoria para logout (operación con efecto de estado)
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
}
