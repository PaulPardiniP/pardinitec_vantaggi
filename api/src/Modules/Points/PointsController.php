<?php

declare(strict_types=1);

namespace App\Modules\Points;

use App\Core\Auth\AuthService;
use App\Core\Http\Request;
use App\Core\Http\Response;
use App\Core\Security\Csrf;
use App\Modules\Businesses\AuthorizationService;
use App\Modules\Businesses\ForbiddenException;
use App\Modules\Businesses\Permission;
use InvalidArgumentException;
use Throwable;

final class PointsController
{
    private PointsService $pointsService;
    private LoyaltyProgramService $programService;
    private AuthService $authService;
    private AuthorizationService $authzService;

    public function __construct(
        ?PointsService $pointsService = null,
        ?LoyaltyProgramService $programService = null,
        ?AuthService $authService = null,
        ?AuthorizationService $authzService = null
    ) {
        $this->pointsService = $pointsService ?? new PointsService();
        $this->programService = $programService ?? new LoyaltyProgramService();
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

    /**
     * GET /api/v1/businesses/{id}/loyalty-program
     */
    public function getProgram(Request $request, int $businessId): void
    {
        $session = $this->authenticate($request);

        try {
            $this->authzService->requireMembership((int) $session['user_id'], $businessId);

            $program = $this->programService->getProgram($businessId);

            Response::success('Configurazione del programma fedeltà recuperata.', [
                'data' => $program,
            ], 200);
        } catch (ForbiddenException $e) {
            Response::error($e->getMessage(), 403);
        } catch (Throwable $e) {
            Response::error('Errore durante il recupero del programma fedeltà.', 500);
        }
    }

    /**
     * PUT /api/v1/businesses/{id}/loyalty-program
     */
    public function updateProgram(Request $request, int $businessId): void
    {
        $session = $this->authenticate($request);
        $this->verifyCsrf($request, $session);

        try {
            $this->authzService->requirePermission((int) $session['user_id'], $businessId, Permission::SETTINGS_MANAGE);

            $body = $request->getJsonBody();
            $updated = $this->programService->updateProgram($businessId, $body);

            Response::success('Configurazione del programma fedeltà aggiornata con successo.', [
                'data' => $updated,
            ], 200);
        } catch (ForbiddenException $e) {
            Response::error($e->getMessage(), 403);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 422);
        } catch (Throwable $e) {
            Response::error('Errore durante l\'aggiornamento del programma fedeltà.', 500);
        }
    }

    /**
     * POST /api/v1/businesses/{id}/loyalty-program/calculate
     */
    public function calculate(Request $request, int $businessId): void
    {
        $session = $this->authenticate($request);

        try {
            $this->authzService->requireMembership((int) $session['user_id'], $businessId);

            $body = $request->getJsonBody();
            $spentAmount = isset($body['spent_amount']) ? (float) $body['spent_amount'] : 0.0;

            $points = $this->programService->calculatePoints($businessId, $spentAmount);

            Response::success('Calcolo punti effettuato.', [
                'spent_amount' => $spentAmount,
                'points' => $points,
            ], 200);
        } catch (ForbiddenException $e) {
            Response::error($e->getMessage(), 403);
        } catch (Throwable $e) {
            Response::error('Errore durante il calcolo dei punti.', 500);
        }
    }

    /**
     * POST /api/v1/businesses/{id}/loyalty-accounts/{accountId}/points/adjust
     */
    public function adjust(Request $request, int $businessId, int $loyaltyAccountId): void
    {
        $session = $this->authenticate($request);
        $this->verifyCsrf($request, $session);

        try {
            $this->authzService->requirePermission((int) $session['user_id'], $businessId, Permission::POINTS_ADJUST);

            $body = $request->getJsonBody();

            $rawPoints = $body['points'] ?? ($body['points_delta'] ?? null);
            if ($rawPoints === null || !is_numeric($rawPoints)) {
                Response::error('Il campo points è obbligatorio e deve essere un numero intero.', 422);
            }
            $pointsDelta = (int) $rawPoints;

            $type = isset($body['type']) ? (string) $body['type'] : 'manual_adjustment';
            $reason = isset($body['reason']) ? trim((string) $body['reason']) : null;
            $operationId = isset($body['operation_id']) ? trim((string) $body['operation_id']) : '';
            $spentAmount = isset($body['spent_amount']) ? (float) $body['spent_amount'] : null;

            if ($operationId === '') {
                Response::error('Il campo operation_id è obbligatorio per garantire l\'idempotenza dell\'operazione.', 422);
            }

            $result = $this->pointsService->adjustPoints(
                $businessId,
                $loyaltyAccountId,
                $pointsDelta,
                $type,
                $reason,
                $operationId,
                (int) $session['user_id'],
                $spentAmount
            );

            $result['new_balance'] = $result['balance'];

            $message = $result['idempotent']
                ? 'Operazione già eseguita in precedenza (idempotente).'
                : 'Punti aggiornati correttamente.';

            Response::success($message, [
                'data' => $result,
            ], 200);
        } catch (ForbiddenException $e) {
            Response::error($e->getMessage(), 403);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 422);
        } catch (Throwable $e) {
            Response::error('Errore durante l\'aggiornamento dei punti: ' . $e->getMessage(), 500);
        }
    }

    /**
     * GET /api/v1/businesses/{id}/loyalty-accounts/{accountId}/points/transactions
     */
    public function listTransactions(Request $request, int $businessId, int $loyaltyAccountId): void
    {
        $session = $this->authenticate($request);

        try {
            $this->authzService->requirePermission((int) $session['user_id'], $businessId, Permission::CUSTOMER_VIEW);

            $page = max(1, (int) $request->getQuery('page', 1));
            $perPage = max(1, min(100, (int) $request->getQuery('per_page', 20)));

            $data = $this->pointsService->getAccountTransactions($businessId, $loyaltyAccountId, $page, $perPage);

            Response::success('Storico movimenti punti recuperato correttamente.', $data, 200);
        } catch (ForbiddenException $e) {
            Response::error($e->getMessage(), 403);
        } catch (Throwable $e) {
            Response::error('Errore durante il recupero dello storico punti.', 500);
        }
    }
}
