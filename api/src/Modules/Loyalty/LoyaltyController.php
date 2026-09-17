<?php

declare(strict_types=1);

namespace App\Modules\Loyalty;

use App\Core\Auth\AuthService;
use App\Core\Http\Request;
use App\Core\Http\Response;
use App\Core\Security\Csrf;
use App\Modules\Businesses\AuthorizationService;
use App\Modules\Businesses\ForbiddenException;
use App\Modules\Businesses\Permission;
use InvalidArgumentException;
use Throwable;

final class LoyaltyController
{
    private LoyaltyService $loyaltyService;
    private AuthService $authService;
    private AuthorizationService $authzService;

    public function __construct(
        ?LoyaltyService $loyaltyService = null,
        ?AuthService $authService = null,
        ?AuthorizationService $authzService = null
    ) {
        $this->loyaltyService = $loyaltyService ?? new LoyaltyService();
        $this->authService = $authService ?? new AuthService();
        $this->authzService = $authzService ?? new AuthorizationService();
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

    public function listProfiles(Request $request): void
    {
        $this->authenticate($request);

        try {
            $profiles = $this->loyaltyService->listProfiles();
            Response::success('Perfiles de fidelización recuperados correctamente.', [
                'data' => $profiles,
            ], 200);
        } catch (Throwable $e) {
            Response::error('Error al recuperar perfiles de fidelización.', 500);
        }
    }

    public function listCustomerAccounts(Request $request, int $businessId, int $customerId): void
    {
        $session = $this->authenticate($request);

        try {
            $this->authzService->requirePermission($session['user_id'], $businessId, Permission::CUSTOMER_VIEW);

            $accounts = $this->loyaltyService->getAccountsByCustomer($businessId, $customerId);

            Response::success('Cuentas de fidelización recuperadas correctamente.', [
                'data' => $accounts,
            ], 200);
        } catch (ForbiddenException $e) {
            Response::error($e->getMessage(), 403);
        } catch (Throwable $e) {
            Response::error('Error al obtener cuentas de fidelización.', 500);
        }
    }

    public function createAccount(Request $request, int $businessId, int $customerId): void
    {
        $session = $this->authenticate($request);
        $this->verifyCsrf($request, $session);

        try {
            $this->authzService->requirePermission($session['user_id'], $businessId, Permission::CUSTOMER_EDIT);

            $body = $request->getJsonBody();
            $profileCode = $body['profile_code'] ?? ($body['card_profile_id'] ?? 'punti');

            $account = $this->loyaltyService->createAccount($businessId, $customerId, $profileCode);

            Response::success('Cuenta de fidelización creada exitosamente.', [
                'data' => $account,
            ], 201);
        } catch (ForbiddenException $e) {
            Response::error($e->getMessage(), 403);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 400);
        } catch (Throwable $e) {
            Response::error('Error al crear cuenta de fidelización.', 500);
        }
    }
}
