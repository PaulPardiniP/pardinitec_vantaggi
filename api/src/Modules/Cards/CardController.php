<?php

declare(strict_types=1);

namespace App\Modules\Cards;

use App\Core\Auth\AuthService;
use App\Core\Http\Request;
use App\Core\Http\Response;
use App\Core\Security\Csrf;
use App\Modules\Businesses\AuthorizationService;
use App\Modules\Businesses\ForbiddenException;
use App\Modules\Businesses\Permission;
use InvalidArgumentException;
use Throwable;

final class CardController
{
    private CardService $cardService;
    private AuthService $authService;
    private AuthorizationService $authzService;

    public function __construct(
        ?CardService $cardService = null,
        ?AuthService $authService = null,
        ?AuthorizationService $authzService = null
    ) {
        $this->cardService = $cardService ?? new CardService();
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

    public function list(Request $request, int $businessId): void
    {
        $session = $this->authenticate($request);

        try {
            $this->authzService->requirePermission($session['user_id'], $businessId, Permission::BUSINESS_VIEW);

            $filters = [
                'status' => $request->getQuery('status'),
            ];
            $page = (int) ($request->getQuery('page') ?? 1);
            $perPage = (int) ($request->getQuery('per_page') ?? 50);

            $result = $this->cardService->listBusinessCards($businessId, $filters, $page, $perPage);

            Response::success('Tarjetas del comercio recuperadas correctamente.', $result, 200);
        } catch (ForbiddenException $e) {
            Response::error($e->getMessage(), 403);
        } catch (Throwable $e) {
            Response::error('Error al listar tarjetas del comercio.', 500);
        }
    }

    public function get(Request $request, int $businessId, int $cardId): void
    {
        $session = $this->authenticate($request);

        try {
            $this->authzService->requirePermission($session['user_id'], $businessId, Permission::BUSINESS_VIEW);

            $card = $this->cardService->getBusinessCard($businessId, $cardId);

            Response::success('Tarjeta recuperada correctamente.', [
                'data' => $card,
            ], 200);
        } catch (ForbiddenException $e) {
            Response::error($e->getMessage(), 403);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 404);
        } catch (Throwable $e) {
            Response::error('Error al obtener la tarjeta.', 500);
        }
    }

    public function activate(Request $request, int $businessId, int $cardId): void
    {
        $session = $this->authenticate($request);
        $this->verifyCsrf($request, $session);

        try {
            $this->authzService->requirePermission($session['user_id'], $businessId, Permission::CARD_ASSIGN);

            $body = $request->getJsonBody();
            $loyaltyAccountId = (int) ($body['loyalty_account_id'] ?? 0);

            if ($loyaltyAccountId <= 0) {
                Response::error('Debe proporcionar un loyalty_account_id válido.', 422);
            }

            $card = $this->cardService->activateCard($businessId, $cardId, $loyaltyAccountId, (int) $session['user_id']);

            Response::success('Tarjeta física activada y vinculada a la cuenta exitosamente.', [
                'data' => $card,
            ], 200);
        } catch (ForbiddenException $e) {
            Response::error($e->getMessage(), 403);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 400);
        } catch (Throwable $e) {
            Response::error('Error al activar tarjeta física.', 500);
        }
    }

    public function suspend(Request $request, int $businessId, int $cardId): void
    {
        $session = $this->authenticate($request);
        $this->verifyCsrf($request, $session);

        try {
            $this->authzService->requirePermission($session['user_id'], $businessId, Permission::CARD_REVOKE);

            $card = $this->cardService->suspendCard($businessId, $cardId);

            Response::success('Tarjeta física suspendida exitosamente.', [
                'data' => $card,
            ], 200);
        } catch (ForbiddenException $e) {
            Response::error($e->getMessage(), 403);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 400);
        } catch (Throwable $e) {
            Response::error('Error al suspender tarjeta física.', 500);
        }
    }

    public function reactivate(Request $request, int $businessId, int $cardId): void
    {
        $session = $this->authenticate($request);
        $this->verifyCsrf($request, $session);

        try {
            $this->authzService->requirePermission($session['user_id'], $businessId, Permission::CARD_ASSIGN);

            $card = $this->cardService->reactivateCard($businessId, $cardId);

            Response::success('Tarjeta física reactivada exitosamente.', [
                'data' => $card,
            ], 200);
        } catch (ForbiddenException $e) {
            Response::error($e->getMessage(), 403);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 400);
        } catch (Throwable $e) {
            Response::error('Error al reactivar tarjeta física.', 500);
        }
    }

    public function revoke(Request $request, int $businessId, int $cardId): void
    {
        $session = $this->authenticate($request);
        $this->verifyCsrf($request, $session);

        try {
            $this->authzService->requirePermission($session['user_id'], $businessId, Permission::CARD_REVOKE);

            $card = $this->cardService->revokeCard($businessId, $cardId);

            Response::success('Tarjeta física revocada exitosamente.', [
                'data' => $card,
            ], 200);
        } catch (ForbiddenException $e) {
            Response::error($e->getMessage(), 403);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 400);
        } catch (Throwable $e) {
            Response::error('Error al revocar tarjeta física.', 500);
        }
    }

    public function replace(Request $request, int $businessId, int $oldCardId): void
    {
        $session = $this->authenticate($request);
        $this->verifyCsrf($request, $session);

        try {
            $this->authzService->requirePermission($session['user_id'], $businessId, Permission::CARD_ASSIGN);

            $body = $request->getJsonBody();
            $newCardId = (int) ($body['new_card_id'] ?? 0);

            if ($newCardId <= 0) {
                Response::error('Debe proporcionar un new_card_id válido en estado issued.', 422);
            }

            $result = $this->cardService->replaceCard($businessId, $oldCardId, $newCardId, (int) $session['user_id']);

            Response::success('Tarjeta física reemplazada exitosamente sin pérdida de saldo ni historial.', [
                'data' => $result,
            ], 200);
        } catch (ForbiddenException $e) {
            Response::error($e->getMessage(), 403);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 400);
        } catch (Throwable $e) {
            Response::error('Error al reemplazar tarjeta física.', 500);
        }
    }

    public function reassign(Request $request, int $businessId, int $cardId): void
    {
        $session = $this->authenticate($request);
        $this->verifyCsrf($request, $session);

        try {
            $this->authzService->requirePermission($session['user_id'], $businessId, Permission::CARD_REASSIGN);

            $body = $request->getJsonBody();
            $newLoyaltyAccountId = (int) ($body['new_loyalty_account_id'] ?? 0);

            if ($newLoyaltyAccountId <= 0) {
                Response::error('Debe proporcionar un new_loyalty_account_id válido.', 422);
            }

            $result = $this->cardService->reassignCard($businessId, $cardId, $newLoyaltyAccountId, (int) $session['user_id']);

            Response::success('Tarjeta reasignada con rotación segura de credencial exitosamente.', [
                'data' => $result,
            ], 200);
        } catch (ForbiddenException $e) {
            Response::error($e->getMessage(), 403);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 400);
        } catch (Throwable $e) {
            Response::error('Error al reasignar tarjeta.', 500);
        }
    }

    public function unassign(Request $request, int $businessId, int $cardId): void
    {
        $session = $this->authenticate($request);
        $this->verifyCsrf($request, $session);

        try {
            $this->authzService->requirePermission($session['user_id'], $businessId, Permission::CARD_ASSIGN);

            $result = $this->cardService->unassignCard($businessId, $cardId, (int) $session['user_id']);

            Response::success('Carta disassociata con successo.', [
                'data' => $result,
            ], 200);
        } catch (ForbiddenException $e) {
            Response::error($e->getMessage(), 403);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 400);
        } catch (Throwable $e) {
            Response::error('Errore durante la disassociazione della carta.', 500);
        }
    }
}
