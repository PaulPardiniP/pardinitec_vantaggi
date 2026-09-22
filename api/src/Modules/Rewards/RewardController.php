<?php

declare(strict_types=1);

namespace App\Modules\Rewards;

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

final class RewardController
{
    private RewardService $rewardService;
    private AuthService $authService;
    private AuthorizationService $authzService;
    private CapabilityService $capabilityService;

    public function __construct(
        ?RewardService $rewardService = null,
        ?AuthService $authService = null,
        ?AuthorizationService $authzService = null,
        ?CapabilityService $capabilityService = null
    ) {
        $this->rewardService = $rewardService ?? new RewardService();
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
     * GET /api/v1/businesses/{id}/rewards
     */
    public function list(Request $request, int $businessId): void
    {
        $session = $this->authenticate($request);

        try {
            $this->authzService->requireMembership((int) $session['user_id'], $businessId);

            if (!$this->capabilityService->isCapabilityEnabledForBusiness($businessId, 'rewards')) {
                Response::error('Il catalogo premi non è attivo per questo commercio.', 403);
            }

            $status = $request->getQuery('status');
            $all = $request->getQuery('all') === '1';
            $onlyActive = !$all && empty($status);
            $profile = $request->getQuery('profile');
            $rewards = $this->rewardService->listRewards(
                $businessId,
                $onlyActive,
                null,
                $profile ? (string) $profile : null,
                $status ? (string) $status : null
            );

            Response::success('Catalogo premi recuperato.', [
                'data' => $rewards,
            ], 200);
        } catch (ForbiddenException $e) {
            Response::error($e->getMessage(), 403);
        } catch (Throwable $e) {
            Response::error('Errore durante il recupero del catalogo premi.', 500);
        }
    }

    /**
     * POST /api/v1/businesses/{id}/rewards
     */
    public function create(Request $request, int $businessId): void
    {
        $session = $this->authenticate($request);
        $this->verifyCsrf($request, $session);

        try {
            $this->authzService->requirePermission((int) $session['user_id'], $businessId, Permission::SETTINGS_MANAGE);

            if (!$this->capabilityService->isCapabilityEnabledForBusiness($businessId, 'rewards')) {
                Response::error('Il catalogo premi non è attivo per questo commercio.', 403);
            }

            $body = $request->getJsonBody();
            $reward = $this->rewardService->createReward($businessId, $body);

            Response::success('Premio creato con successo nel catalogo.', [
                'data' => $reward,
            ], 201);
        } catch (ForbiddenException $e) {
            Response::error($e->getMessage(), 403);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 422);
        } catch (Throwable $e) {
            Response::error('Errore durante la creazione del premio: ' . $e->getMessage(), 500);
        }
    }

    /**
     * GET /api/v1/businesses/{id}/rewards/{rewardId}
     */
    public function get(Request $request, int $businessId, int $rewardId): void
    {
        $session = $this->authenticate($request);

        try {
            $this->authzService->requireMembership((int) $session['user_id'], $businessId);

            $reward = $this->rewardService->getReward($businessId, $rewardId);
            if (!$reward) {
                Response::error('Premio non trovato.', 404);
            }

            Response::success('Dettagli del premio recuperati.', [
                'data' => $reward,
            ], 200);
        } catch (ForbiddenException $e) {
            Response::error($e->getMessage(), 403);
        } catch (Throwable $e) {
            Response::error('Errore durante il recupero del premio.', 500);
        }
    }

    /**
     * PUT /api/v1/businesses/{id}/rewards/{rewardId}
     */
    public function update(Request $request, int $businessId, int $rewardId): void
    {
        $session = $this->authenticate($request);
        $this->verifyCsrf($request, $session);

        try {
            $this->authzService->requirePermission((int) $session['user_id'], $businessId, Permission::SETTINGS_MANAGE);

            $body = $request->getJsonBody();
            $updated = $this->rewardService->updateReward($businessId, $rewardId, $body);

            Response::success('Premio aggiornato con successo.', [
                'data' => $updated,
            ], 200);
        } catch (ForbiddenException $e) {
            Response::error($e->getMessage(), 403);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 422);
        } catch (Throwable $e) {
            Response::error('Errore durante l\'aggiornamento del premio.', 500);
        }
    }

    /**
     * DELETE /api/v1/businesses/{id}/rewards/{rewardId}
     */
    public function delete(Request $request, int $businessId, int $rewardId): void
    {
        $session = $this->authenticate($request);
        $this->verifyCsrf($request, $session);

        try {
            $this->authzService->requirePermission((int) $session['user_id'], $businessId, Permission::SETTINGS_MANAGE);

            $result = $this->rewardService->deleteReward($businessId, $rewardId);
            $msg = $result['action'] === 'deleted'
                ? 'Premio eliminato definitivamente.'
                : 'Premio archiviato nei contenuti storici.';

            Response::success($msg, $result, 200);
        } catch (ForbiddenException $e) {
            Response::error($e->getMessage(), 403);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 422);
        } catch (Throwable $e) {
            Response::error('Errore durante la cancellazione del premio.', 500);
        }
    }

    /**
     * POST /api/v1/businesses/{id}/rewards/{rewardId}/restore
     */
    public function restore(Request $request, int $businessId, int $rewardId): void
    {
        $session = $this->authenticate($request);
        $this->verifyCsrf($request, $session);

        try {
            $this->authzService->requirePermission((int) $session['user_id'], $businessId, Permission::SETTINGS_MANAGE);

            $reward = $this->rewardService->restoreReward($businessId, $rewardId);

            Response::success('Premio ripristinato con successo.', [
                'data' => $reward,
            ], 200);
        } catch (ForbiddenException $e) {
            Response::error($e->getMessage(), 403);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 422);
        } catch (Throwable $e) {
            Response::error('Errore durante il ripristino del premio.', 500);
        }
    }

    /**
     * POST /api/v1/businesses/{id}/loyalty-accounts/{accountId}/rewards/{rewardId}/redeem
     */
    public function redeem(Request $request, int $businessId, int $loyaltyAccountId, int $rewardId): void
    {
        $session = $this->authenticate($request);
        $this->verifyCsrf($request, $session);

        try {
            $this->authzService->requirePermission((int) $session['user_id'], $businessId, Permission::REWARD_REDEEM);

            $body = $request->getJsonBody();
            if (($body['delivery_confirmed'] ?? false) !== true) {
                Response::error('La conferma di avvenuta consegna del premio è obbligatoria.', 422);
            }
            $operationId = isset($body['operation_id']) ? trim((string) $body['operation_id']) : '';
            $notes = isset($body['notes']) && trim((string) $body['notes']) !== '' ? trim((string) $body['notes']) : null;

            if ($operationId === '') {
                Response::error('Il campo operation_id è obbligatorio per garantire l\'idempotenza del riscatto.', 422);
            }

            $result = $this->rewardService->redeemReward(
                $businessId,
                $loyaltyAccountId,
                $rewardId,
                $operationId,
                (int) $session['user_id'],
                $notes
            );

            $msg = $result['idempotent']
                ? 'Premio già riscattato in precedenza (operazione idempotente).'
                : 'Premio riscattato con successo.';

            Response::success($msg, [
                'data' => $result,
            ], 200);
        } catch (ForbiddenException $e) {
            Response::error($e->getMessage(), 403);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 422);
        } catch (Throwable $e) {
            Response::error('Errore durante il riscatto del premio: ' . $e->getMessage(), 500);
        }
    }
}
