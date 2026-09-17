<?php

declare(strict_types=1);

namespace App\Modules\AccessCredentials;

use App\Core\Auth\AuthService;
use App\Core\Http\Request;
use App\Core\Http\Response;
use App\Core\Security\Csrf;
use App\Modules\Businesses\AuthorizationService;
use App\Modules\Businesses\ForbiddenException;
use App\Modules\Businesses\Permission;
use InvalidArgumentException;
use Throwable;

final class CredentialController
{
    private CredentialService $credentialService;
    private AuthService $authService;
    private AuthorizationService $authzService;

    public function __construct(
        ?CredentialService $credentialService = null,
        ?AuthService $authService = null,
        ?AuthorizationService $authzService = null
    ) {
        $this->credentialService = $credentialService ?? new CredentialService();
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

    public function issue(Request $request, int $businessId, int $loyaltyAccountId): void
    {
        $session = $this->authenticate($request);
        $this->verifyCsrf($request, $session);

        try {
            $this->authzService->requirePermission($session['user_id'], $businessId, Permission::CUSTOMER_EDIT);

            $credential = $this->credentialService->issueDigitalCredential($businessId, $loyaltyAccountId);

            Response::success('Credencial digital emitida correctamente.', [
                'data' => $credential,
            ], 201);
        } catch (ForbiddenException $e) {
            Response::error($e->getMessage(), 403);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 400);
        } catch (Throwable $e) {
            Response::error('Error al emitir credencial digital.', 500);
        }
    }

    public function listForAccount(Request $request, int $businessId, int $loyaltyAccountId): void
    {
        $session = $this->authenticate($request);

        try {
            $this->authzService->requirePermission($session['user_id'], $businessId, Permission::CUSTOMER_VIEW);

            $credentials = $this->credentialService->getCredentialsForAccount($businessId, $loyaltyAccountId);

            Response::success('Credenziali recuperate con successo.', [
                'data' => $credentials,
            ], 200);
        } catch (ForbiddenException $e) {
            Response::error($e->getMessage(), 403);
        } catch (Throwable $e) {
            Response::error('Error al recuperar credenciales de la cuenta.', 500);
        }
    }

    public function revoke(Request $request, int $businessId, int $credentialId): void
    {
        $session = $this->authenticate($request);
        $this->verifyCsrf($request, $session);

        try {
            $this->authzService->requirePermission($session['user_id'], $businessId, Permission::CUSTOMER_EDIT);

            $revoked = $this->credentialService->revokeCredential($businessId, $credentialId);
            if (!$revoked) {
                Response::error('Credencial no encontrada o ya revocada.', 404);
            }

            Response::success('Credencial revocada exitosamente.', [], 200);
        } catch (ForbiddenException $e) {
            Response::error($e->getMessage(), 403);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 400);
        } catch (Throwable $e) {
            Response::error('Error al revocar credencial.', 500);
        }
    }

    public function rotate(Request $request, int $businessId, int $credentialId): void
    {
        $session = $this->authenticate($request);
        $this->verifyCsrf($request, $session);

        try {
            $this->authzService->requirePermission($session['user_id'], $businessId, Permission::CUSTOMER_EDIT);

            $newCredential = $this->credentialService->rotateCredential($businessId, $credentialId);

            Response::success('Credencial rotada exitosamente.', [
                'data' => $newCredential,
            ], 200);
        } catch (ForbiddenException $e) {
            Response::error($e->getMessage(), 403);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 400);
        } catch (Throwable $e) {
            Response::error('Error al rotar credencial.', 500);
        }
    }
}
