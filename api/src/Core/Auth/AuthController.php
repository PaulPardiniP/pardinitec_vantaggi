<?php

declare(strict_types=1);

namespace App\Core\Auth;

use App\Core\Http\Request;
use App\Core\Http\Response;
use App\Core\Security\Csrf;
use InvalidArgumentException;
use Throwable;

final class AuthController
{
    private AuthService $authService;

    public function __construct(?AuthService $authService = null)
    {
        $this->authService = $authService ?? new AuthService();
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

            $existingSessionId = $request->getCookie(
                $this->authService->getSessionManager()->getCookieName()
            );

            $result = $this->authService->login(
                $email,
                $password,
                $request->getClientIp(),
                $request->getUserAgent(),
                $existingSessionId
            );

            Response::success('Inicio de sesión exitoso.', [
                'data' => $result,
            ], 200);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 401);
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
