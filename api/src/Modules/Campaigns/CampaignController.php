<?php

declare(strict_types=1);

namespace App\Modules\Campaigns;

use App\Core\Auth\AuthService;
use App\Core\Http\Request;
use App\Core\Http\Response;
use App\Core\Security\Csrf;
use App\Modules\Businesses\AuthorizationService;
use App\Modules\Businesses\ForbiddenException;
use App\Modules\Businesses\Permission;
use App\Modules\Plans\PlanService;
use Throwable;

final class CampaignController
{
    private CampaignService $service;
    private AuthService $authService;
    private AuthorizationService $authzService;
    private PlanService $planService;

    public function __construct(
        CampaignService $service,
        ?AuthService $authService = null,
        ?AuthorizationService $authzService = null,
        ?PlanService $planService = null
    ) {
        $this->service = $service;
        $this->authService = $authService ?? new AuthService();
        $this->authzService = $authzService ?? new AuthorizationService();
        $this->planService = $planService ?? new PlanService(\App\Core\Database\Connection::get(), new \App\Core\Audit\AuditLogger(\App\Core\Database\Connection::get()));
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

    private function authorizeCampaignAccess(int $userId, int $businessId): void
    {
        // 1. Validar permisos del usuario en el negocio
        $this->authzService->requirePermission($userId, $businessId, Permission::CAMPAIGN_SEND);

        // 2. Validar que el comercio tenga el módulo 'campaigns' en su plan contratado
        $plan = $this->planService->getPlanForBusiness($businessId);
        $modules = $plan['modules'] ?? [];
        if (!in_array('campaigns', $modules, true)) {
            throw new ForbiddenException('Il modulo Campagne non è incluso nel piano di questo commercio.');
        }
    }

    public function list(Request $request): void
    {
        $session = $this->authenticate($request);
        $businessId = (int) $request->getRouteParam('id');

        try {
            $this->authorizeCampaignAccess($session['user_id'], $businessId);
            $page = max(1, (int) ($request->getQuery('page') ?? 1));
            $result = $this->service->listCampaigns($businessId, $page);
            Response::success('Campañas recuperadas', $result);
        } catch (ForbiddenException $e) {
            Response::error($e->getMessage(), 403);
        } catch (Throwable $e) {
            Response::error('Error al listar campañas: ' . $e->getMessage(), 500);
        }
    }

    public function create(Request $request): void
    {
        $session = $this->authenticate($request);
        $this->verifyCsrf($request, $session);
        $businessId = (int) $request->getRouteParam('id');
        $data = $request->getJsonBody() ?? [];

        try {
            $this->authorizeCampaignAccess($session['user_id'], $businessId);
            $campaign = $this->service->createCampaign($businessId, $data, (int) $session['user_id']);
            Response::success('Campaña creada', ['campaign' => $campaign], 201);
        } catch (ForbiddenException $e) {
            Response::error($e->getMessage(), 403);
        } catch (Throwable $e) {
            Response::error($e->getMessage(), 400);
        }
    }

    public function update(Request $request): void
    {
        $session = $this->authenticate($request);
        $this->verifyCsrf($request, $session);
        $businessId = (int) $request->getRouteParam('id');
        $campaignId = (int) $request->getRouteParam('campaignId');
        $data = $request->getJsonBody() ?? [];

        try {
            $this->authorizeCampaignAccess($session['user_id'], $businessId);
            $campaign = $this->service->updateCampaign($businessId, $campaignId, $data, (int) $session['user_id']);
            Response::success('Campaña actualizada', ['campaign' => $campaign]);
        } catch (ForbiddenException $e) {
            Response::error($e->getMessage(), 403);
        } catch (Throwable $e) {
            Response::error($e->getMessage(), 400);
        }
    }

    public function confirm(Request $request): void
    {
        $session = $this->authenticate($request);
        $this->verifyCsrf($request, $session);
        $businessId = (int) $request->getRouteParam('id');
        $campaignId = (int) $request->getRouteParam('campaignId');

        try {
            $this->authorizeCampaignAccess($session['user_id'], $businessId);
            $campaign = $this->service->confirmCampaign($businessId, $campaignId, (int) $session['user_id']);
            Response::success('Campaña confirmada', ['campaign' => $campaign]);
        } catch (ForbiddenException $e) {
            Response::error($e->getMessage(), 403);
        } catch (Throwable $e) {
            Response::error($e->getMessage(), 400);
        }
    }

    public function cancel(Request $request): void
    {
        $session = $this->authenticate($request);
        $this->verifyCsrf($request, $session);
        $businessId = (int) $request->getRouteParam('id');
        $campaignId = (int) $request->getRouteParam('campaignId');

        try {
            $this->authorizeCampaignAccess($session['user_id'], $businessId);
            $campaign = $this->service->cancelCampaign($businessId, $campaignId, (int) $session['user_id']);
            Response::success('Campaña cancelada', ['campaign' => $campaign]);
        } catch (ForbiddenException $e) {
            Response::error($e->getMessage(), 403);
        } catch (Throwable $e) {
            Response::error($e->getMessage(), 400);
        }
    }
}

