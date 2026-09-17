<?php

declare(strict_types=1);

namespace App\Modules\Businesses;

use App\Core\Auth\AuthService;
use App\Core\Auth\ValidationException;
use App\Core\Http\Request;
use App\Core\Http\Response;
use App\Core\Security\Csrf;
use InvalidArgumentException;
use Throwable;

final class BusinessController
{
    private BusinessService $businessService;
    private AuthService $authService;

    public function __construct(
        ?BusinessService $businessService = null,
        ?AuthService $authService = null
    ) {
        $this->businessService = $businessService ?? new BusinessService();
        $this->authService = $authService ?? new AuthService();
    }

    private function authenticate(Request $request): array
    {
        $cookieName = $this->authService->getSessionManager()->getCookieName();
        $sessionId = $request->getCookie($cookieName);

        $session = $this->authService->getCurrentSession($sessionId);
        if ($session === null) {
            Response::error('No autenticado o sesión expirada.', 401);
        }

        return $session;
    }

    private function verifyCsrf(Request $request, array $session): void
    {
        $submittedCsrf = $request->getHeader('x-csrf-token') ?? ($request->getJsonBody()['_csrf_token'] ?? null);
        if (!Csrf::verify($session['csrf_token'], $submittedCsrf)) {
            Response::error('Token CSRF inválido o ausente.', 403);
        }
    }

    public function create(Request $request): void
    {
        $session = $this->authenticate($request);
        $this->verifyCsrf($request, $session);

        try {
            $body = $request->getJsonBody();
            $business = $this->businessService->createBusiness($session['user_id'], $body);

            Response::success('Comercio creado exitosamente.', [
                'data' => $business,
            ], 201);
        } catch (ValidationException $e) {
            Response::error($e->getMessage(), 422, $e->getErrors());
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 400);
        } catch (ForbiddenException $e) {
            Response::error($e->getMessage(), 403);
        } catch (Throwable $e) {
            Response::error('Error al crear el comercio.', 500);
        }
    }

    public function list(Request $request): void
    {
        $session = $this->authenticate($request);

        try {
            $businesses = $this->businessService->listUserBusinesses($session['user_id']);

            Response::success('Comercios recuperados correctamente.', [
                'data' => $businesses,
            ], 200);
        } catch (Throwable $e) {
            Response::error('Error al listar comercios.', 500);
        }
    }

    public function get(Request $request, int $businessId): void
    {
        $session = $this->authenticate($request);

        try {
            $business = $this->businessService->getBusiness($session['user_id'], $businessId);

            Response::success('Comercio recuperado correctamente.', [
                'data' => $business,
            ], 200);
        } catch (ForbiddenException $e) {
            Response::error($e->getMessage(), 403);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 404);
        } catch (Throwable $e) {
            Response::error('Error al obtener el comercio.', 500);
        }
    }

    public function listMembers(Request $request, int $businessId): void
    {
        $session = $this->authenticate($request);

        try {
            $members = $this->businessService->listMembers($session['user_id'], $businessId);

            Response::success('Miembros obtenidos correctamente.', [
                'data' => $members,
            ], 200);
        } catch (ForbiddenException $e) {
            Response::error($e->getMessage(), 403);
        } catch (Throwable $e) {
            Response::error('Error al listar los miembros.', 500);
        }
    }

    public function addMember(Request $request, int $businessId): void
    {
        $session = $this->authenticate($request);
        $this->verifyCsrf($request, $session);

        try {
            $body = $request->getJsonBody();
            $member = $this->businessService->addMember($session['user_id'], $businessId, $body);

            Response::success('Miembro agregado exitosamente.', [
                'data' => $member,
            ], 201);
        } catch (ValidationException $e) {
            Response::error($e->getMessage(), 422, $e->getErrors());
        } catch (ForbiddenException $e) {
            Response::error($e->getMessage(), 403);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 400);
        } catch (Throwable $e) {
            Response::error('Error al agregar miembro.', 500);
        }
    }

    public function removeMember(Request $request, int $businessId, int $targetUserId): void
    {
        $session = $this->authenticate($request);
        $this->verifyCsrf($request, $session);

        try {
            $this->businessService->removeMember($session['user_id'], $businessId, $targetUserId);

            Response::success('Miembro removido exitosamente.', [], 200);
        } catch (ForbiddenException $e) {
            Response::error($e->getMessage(), 403);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 400);
        } catch (Throwable $e) {
            Response::error('Error al remover miembro.', 500);
        }
    }
}
