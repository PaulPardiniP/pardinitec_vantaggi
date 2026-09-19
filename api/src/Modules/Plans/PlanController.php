<?php

declare(strict_types=1);

namespace App\Modules\Plans;

use App\Core\Http\Request;
use App\Core\Http\Response;

final class PlanController
{
    private PlanService $service;

    public function __construct(PlanService $service)
    {
        $this->service = $service;
    }

    public function list(Request $request): void
    {
        if (empty($request->getAttribute('user')['is_super_admin'])) { Response::error('Acceso denegado', 403); }

        $activeOnly = (bool) $request->getQuery('active');
        $plans = $this->service->listPlans($activeOnly);
        Response::success('Planes recuperados', ['plans' => $plans]);
    }

    public function create(Request $request): void
    {
        $data = $request->getJson();
        $user = $request->getAttribute('user');
        
        if (empty($user['is_super_admin'])) {
            Response::error('Acceso denegado', 403);
        }

        try {
            $plan = $this->service->createPlan($data, (int) $user['id']);
            Response::success('Plan creado', ['plan' => $plan], 201);
        } catch (\Throwable $e) {
            Response::error($e->getMessage(), 400);
        }
    }

    public function update(Request $request): void
    {
        $id = (int) $request->getRouteParam('id');
        $data = $request->getJson();
        $user = $request->getAttribute('user');
        
        if (empty($user['is_super_admin'])) {
            Response::error('Acceso denegado', 403);
        }

        try {
            $plan = $this->service->updatePlan($id, $data, (int) $user['id']);
            Response::success('Plan actualizado', ['plan' => $plan]);
        } catch (\Throwable $e) {
            Response::error($e->getMessage(), 400);
        }
    }

    public function assignToBusiness(Request $request): void
    {
        $businessId = (int) $request->getRouteParam('id');
        $data = $request->getJson();
        $planId = (int) ($data['plan_id'] ?? 0);
        $user = $request->getAttribute('user');
        
        if (empty($user['is_super_admin'])) {
            Response::error('Acceso denegado', 403);
        }

        if ($planId <= 0) {
            Response::error('El ID del plan es requerido', 400);
        }

        try {
            $this->service->assignPlanToBusiness($businessId, $planId, (int) $user['id']);
            Response::success('Plan asignado correctamente');
        } catch (\Throwable $e) {
            Response::error($e->getMessage(), 400);
        }
    }
}
