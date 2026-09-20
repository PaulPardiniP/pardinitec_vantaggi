<?php

declare(strict_types=1);

namespace App\Modules\Offers;

use App\Core\Auth\AuthService;
use App\Core\Http\Request;
use App\Core\Http\Response;
use App\Core\Security\Csrf;
use App\Modules\Businesses\AuthorizationService;
use App\Modules\Businesses\ForbiddenException;
use App\Modules\Businesses\Permission;
use App\Modules\Loyalty\CapabilityService;
use InvalidArgumentException;
use Throwable;

final class OfferController
{
    private OfferService $offerService;
    private AuthService $authService;
    private AuthorizationService $authzService;
    private CapabilityService $capabilityService;

    public function __construct(
        ?OfferService $offerService = null,
        ?AuthService $authService = null,
        ?AuthorizationService $authzService = null,
        ?CapabilityService $capabilityService = null
    ) {
        $this->offerService = $offerService ?? new OfferService();
        $this->authService = $authService ?? new AuthService();
        $this->authzService = $authzService ?? new AuthorizationService();
        $this->capabilityService = $capabilityService ?? new CapabilityService();
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

    /**
     * GET /api/v1/businesses/{id}/offers
     */
    public function list(Request $request, int $businessId): void
    {
        $session = $this->authenticate($request);

        try {
            $this->authzService->requireMembership((int) $session['user_id'], $businessId);

            $hasOffers = $this->capabilityService->isCapabilityEnabledForBusiness($businessId, 'offers');
            $hasVip = $this->capabilityService->isCapabilityEnabledForBusiness($businessId, 'vip_offers');

            if (!$hasOffers && !$hasVip) {
                Response::error('Nessun pacchetto promozioni o VIP attivo per questo commercio.', 403);
            }

            $onlyActive = $request->getQuery('all') !== '1';
            $capability = $request->getQuery('capability');
            $targetAudience = $request->getQuery('target_audience');
            $status = $request->getQuery('status');

            $offers = $this->offerService->listOffers(
                $businessId,
                $onlyActive,
                null,
                $capability ? (string) $capability : null,
                $targetAudience ? (string) $targetAudience : null,
                $status ? (string) $status : null
            );

            Response::success('Elenco offerte recuperato.', [
                'data' => $offers,
            ], 200);
        } catch (ForbiddenException $e) {
            Response::error($e->getMessage(), 403);
        } catch (Throwable $e) {
            Response::error('Errore durante il recupero delle offerte.', 500);
        }
    }

    /**
     * POST /api/v1/businesses/{id}/offers
     */
    public function create(Request $request, int $businessId): void
    {
        $session = $this->authenticate($request);
        $this->verifyCsrf($request, $session);

        try {
            $this->authzService->requirePermission((int) $session['user_id'], $businessId, Permission::OFFER_MANAGE);

            $body = $request->getJsonBody();
            $targetAudience = $body['target_audience'] ?? 'vantaggi';

            if ($targetAudience === 'vantaggi' && !$this->capabilityService->isCapabilityEnabledForBusiness($businessId, 'offers')) {
                Response::error('Il modulo Vantaggi non è attivo per questo commercio.', 403);
            }
            if ($targetAudience === 'vip' && !$this->capabilityService->isCapabilityEnabledForBusiness($businessId, 'vip_offers')) {
                Response::error('Il modulo VIP non è attivo per questo commercio.', 403);
            }
            if ($targetAudience === 'vantaggi_vip') {
                if (!$this->capabilityService->isCapabilityEnabledForBusiness($businessId, 'offers') ||
                    !$this->capabilityService->isCapabilityEnabledForBusiness($businessId, 'vip_offers')) {
                    Response::error('È necessario avere attivi sia il modulo Vantaggi sia il modulo VIP per condividere offerte.', 403);
                }
            }

            $offer = $this->offerService->createOffer($businessId, $body);

            Response::success('Offerta creata con successo.', [
                'data' => $offer,
            ], 201);
        } catch (ForbiddenException $e) {
            Response::error($e->getMessage(), 403);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 422);
        } catch (Throwable $e) {
            Response::error('Errore durante la creazione dell\'offerta: ' . $e->getMessage(), 500);
        }
    }

    /**
     * GET /api/v1/businesses/{id}/offers/{offerId}
     */
    public function get(Request $request, int $businessId, int $offerId): void
    {
        $session = $this->authenticate($request);

        try {
            $this->authzService->requireMembership((int) $session['user_id'], $businessId);

            $offer = $this->offerService->getOffer($businessId, $offerId);
            if (!$offer) {
                Response::error('Offerta non trovata.', 404);
            }

            Response::success('Dettagli dell\'offerta recuperati.', [
                'data' => $offer,
            ], 200);
        } catch (ForbiddenException $e) {
            Response::error($e->getMessage(), 403);
        } catch (Throwable $e) {
            Response::error('Errore durante il recupero dell\'offerta.', 500);
        }
    }

    /**
     * PUT /api/v1/businesses/{id}/offers/{offerId}
     */
    public function update(Request $request, int $businessId, int $offerId): void
    {
        $session = $this->authenticate($request);
        $this->verifyCsrf($request, $session);

        try {
            $this->authzService->requirePermission((int) $session['user_id'], $businessId, Permission::OFFER_MANAGE);

            $body = $request->getJsonBody();
            if (isset($body['target_audience'])) {
                $targetAudience = $body['target_audience'];
                if ($targetAudience === 'vantaggi' && !$this->capabilityService->isCapabilityEnabledForBusiness($businessId, 'offers')) {
                    Response::error('Il modulo Vantaggi non è attivo per questo commercio.', 403);
                }
                if ($targetAudience === 'vip' && !$this->capabilityService->isCapabilityEnabledForBusiness($businessId, 'vip_offers')) {
                    Response::error('Il modulo VIP non è attivo per questo commercio.', 403);
                }
                if ($targetAudience === 'vantaggi_vip') {
                    if (!$this->capabilityService->isCapabilityEnabledForBusiness($businessId, 'offers') ||
                        !$this->capabilityService->isCapabilityEnabledForBusiness($businessId, 'vip_offers')) {
                        Response::error('È necessario avere attivi sia il modulo Vantaggi sia il modulo VIP per condividere offerte.', 403);
                    }
                }
            }

            $updated = $this->offerService->updateOffer($businessId, $offerId, $body);

            Response::success('Offerta aggiornata con successo.', [
                'data' => $updated,
            ], 200);
        } catch (ForbiddenException $e) {
            Response::error($e->getMessage(), 403);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 422);
        } catch (Throwable $e) {
            Response::error('Errore durante l\'aggiornamento dell\'offerta.', 500);
        }
    }

    /**
     * DELETE /api/v1/businesses/{id}/offers/{offerId}
     */
    public function delete(Request $request, int $businessId, int $offerId): void
    {
        $session = $this->authenticate($request);
        $this->verifyCsrf($request, $session);

        try {
            $this->authzService->requirePermission((int) $session['user_id'], $businessId, Permission::OFFER_MANAGE);

            $result = $this->offerService->deleteOffer($businessId, $offerId);
            $msg = $result['action'] === 'deleted'
                ? 'Offerta eliminata definitivamente.'
                : 'Offerta archiviata nei contenuti storici.';

            Response::success($msg, $result, 200);
        } catch (ForbiddenException $e) {
            Response::error($e->getMessage(), 403);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 422);
        } catch (Throwable $e) {
            Response::error('Errore durante la cancellazione dell\'offerta.', 500);
        }
    }

    /**
     * POST /api/v1/businesses/{id}/offers/{offerId}/restore
     */
    public function restore(Request $request, int $businessId, int $offerId): void
    {
        $session = $this->authenticate($request);
        $this->verifyCsrf($request, $session);

        try {
            $this->authzService->requirePermission((int) $session['user_id'], $businessId, Permission::OFFER_MANAGE);

            $offer = $this->offerService->restoreOffer($businessId, $offerId);

            Response::success('Offerta ripristinata con successo.', [
                'data' => $offer,
            ], 200);
        } catch (ForbiddenException $e) {
            Response::error($e->getMessage(), 403);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 422);
        } catch (Throwable $e) {
            Response::error('Errore durante il ripristino dell\'offerta.', 500);
        }
    }

    /**
     * POST /api/v1/businesses/{id}/loyalty-accounts/{accountId}/offers/{offerId}/redeem
     */
    public function redeem(Request $request, int $businessId, int $loyaltyAccountId, int $offerId): void
    {
        $session = $this->authenticate($request);
        $this->verifyCsrf($request, $session);

        try {
            $this->authzService->requirePermission((int) $session['user_id'], $businessId, Permission::OFFER_REDEEM);

            $body = $request->getJsonBody();
            $operationId = isset($body['operation_id']) ? trim((string) $body['operation_id']) : '';

            if ($operationId === '') {
                Response::error('Il campo operation_id è obbligatorio per garantire l\'idempotenza del riscatto.', 422);
            }

            $result = $this->offerService->redeemOffer(
                $businessId,
                $loyaltyAccountId,
                $offerId,
                $operationId,
                (int) $session['user_id']
            );

            $msg = $result['idempotent']
                ? 'Offerta già utilizzata in precedenza (operazione idempotente).'
                : 'Offerta applicata con successo.';

            Response::success($msg, [
                'data' => $result,
            ], 200);
        } catch (ForbiddenException $e) {
            Response::error($e->getMessage(), 403);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 422);
        } catch (Throwable $e) {
            Response::error('Errore durante il riscatto dell\'offerta: ' . $e->getMessage(), 500);
        }
    }
}
