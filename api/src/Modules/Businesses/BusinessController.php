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

    public function update(Request $request, int $businessId): void
    {
        $session = $this->authenticate($request);
        $this->verifyCsrf($request, $session);

        try {
            $body = $request->getJsonBody();
            $business = $this->businessService->updateBusiness($session['user_id'], $businessId, $body);

            Response::success('Comercio actualizado exitosamente.', [
                'data' => $business,
            ], 200);
        } catch (ValidationException $e) {
            Response::error($e->getMessage(), 422, $e->getErrors());
        } catch (ForbiddenException $e) {
            Response::error($e->getMessage(), 403);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 404);
        } catch (Throwable $e) {
            Response::error('Error al actualizar el comercio.', 500);
        }
    }

    public function toggleStatus(Request $request, int $businessId): void
    {
        $session = $this->authenticate($request);
        $this->verifyCsrf($request, $session);

        try {
            $body = $request->getJsonBody();
            $status = isset($body['status']) ? (string) $body['status'] : null;
            $business = $this->businessService->toggleBusinessStatus($session['user_id'], $businessId, $status);

            Response::success('Estado del comercio modificado exitosamente.', [
                'data' => $business,
            ], 200);
        } catch (ForbiddenException $e) {
            Response::error($e->getMessage(), 403);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 404);
        } catch (Throwable $e) {
            Response::error('Error al cambiar el estado del comercio.', 500);
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

    public function listModules(Request $request, int $businessId): void
    {
        $session = $this->authenticate($request);

        try {
            $authzService = new AuthorizationService();
            $authzService->requirePermission($session['user_id'], $businessId, Permission::BUSINESS_VIEW);

            $capabilityService = new \App\Modules\Loyalty\CapabilityService();
            $modules = $capabilityService->getBusinessModules($businessId);

            // Módulos efectivos del plan contratado (ej. campaigns)
            $planService = new \App\Modules\Plans\PlanService(\App\Core\Database\Connection::get(), new \App\Core\Audit\AuditLogger(\App\Core\Database\Connection::get()));
            $plan = $planService->getPlanForBusiness($businessId);
            $planModules = $plan['modules'] ?? [];

            $hasCampaigns = in_array('campaigns', $planModules, true);
            $modules[] = [
                'code' => 'campaigns',
                'name' => 'Campagne di Comunicazione',
                'description' => 'Invio campagne promozionali e comunicazioni ai clienti',
                'is_enabled' => $hasCampaigns,
            ];

            Response::success('Moduli del commercio recuperati con successo.', [
                'data' => $modules,
            ], 200);
        } catch (ForbiddenException $e) {
            Response::error($e->getMessage(), 403);
        } catch (Throwable $e) {
            Response::error('Errore durante il recupero dei moduli del commercio.', 500);
        }
    }

    public function updateModules(Request $request, int $businessId): void
    {
        $session = $this->authenticate($request);
        $this->verifyCsrf($request, $session);

        try {
            $authzService = new AuthorizationService();
            $authzService->requirePermission($session['user_id'], $businessId, Permission::SETTINGS_MANAGE);

            $body = $request->getJsonBody();
            $capabilityService = new \App\Modules\Loyalty\CapabilityService();

            if (isset($body['module_code']) && isset($body['is_enabled'])) {
                $capabilityService->setBusinessModule($businessId, (string) $body['module_code'], (bool) $body['is_enabled']);
            } elseif (isset($body['modules']) && is_array($body['modules'])) {
                foreach ($body['modules'] as $modCode => $enabled) {
                    $capabilityService->setBusinessModule($businessId, (string) $modCode, (bool) $enabled);
                }
            } else {
                Response::error('Formato richiesta non valido.', 422);
            }

            $updated = $capabilityService->getBusinessModules($businessId);

            Response::success('Moduli aggiornati con successo.', [
                'data' => $updated,
            ], 200);
        } catch (ForbiddenException $e) {
            Response::error($e->getMessage(), 403);
        } catch (Throwable $e) {
            Response::error('Errore durante l\'aggiornamento dei moduli.', 500);
        }
    }

    public function getPackages(Request $request, int $businessId): void
    {
        $session = $this->authenticate($request);

        try {
            $authzService = new AuthorizationService();
            $authzService->requirePermission($session['user_id'], $businessId, Permission::BUSINESS_VIEW);

            $capabilityService = new \App\Modules\Loyalty\CapabilityService();
            $packages = $capabilityService->getBusinessPackages($businessId);
            $rawModules = $capabilityService->getBusinessModules($businessId);

            Response::success('Pacchetti e profili commerciali recuperati.', [
                'data' => [
                    'packages' => $packages,
                    'raw_modules' => $rawModules,
                ],
                'packages' => $packages,
                'raw_modules' => $rawModules,
            ], 200);
        } catch (ForbiddenException $e) {
            Response::error($e->getMessage(), 403);
        } catch (Throwable $e) {
            Response::error('Errore durante il recupero dei pacchetti.', 500);
        }
    }

    public function updatePackage(Request $request, int $businessId): void
    {
        $session = $this->authenticate($request);
        $this->verifyCsrf($request, $session);

        try {
            $authzService = new AuthorizationService();
            $authzService->requirePermission($session['user_id'], $businessId, Permission::SETTINGS_MANAGE);

            $body = $request->getJsonBody();
            $packageCode = trim((string) ($body['package_code'] ?? ''));
            $enabled = (bool) ($body['enabled'] ?? false);

            if ($packageCode === '') {
                Response::error('Parametro package_code mancante.', 422);
            }

            $capabilityService = new \App\Modules\Loyalty\CapabilityService();
            $capabilityService->setBusinessPackage($businessId, $packageCode, $enabled);

            $packages = $capabilityService->getBusinessPackages($businessId);
            $rawModules = $capabilityService->getBusinessModules($businessId);

            Response::success('Pacchetto commerciale aggiornato con successo.', [
                'data' => [
                    'packages' => $packages,
                    'raw_modules' => $rawModules,
                ],
                'packages' => $packages,
                'raw_modules' => $rawModules,
            ], 200);
        } catch (ForbiddenException $e) {
            Response::error($e->getMessage(), 403);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 422);
        } catch (Throwable $e) {
            Response::error('Errore durante l\'aggiornamento del pacchetto.', 500);
        }
    }

    public function listPaginated(Request $request): void
    {
        $session = $this->authenticate($request);

        try {
            $search  = trim((string) ($request->getQuery('search') ?? ''));
            $status  = trim((string) ($request->getQuery('status') ?? 'all'));
            $page    = max(1, (int) ($request->getQuery('page') ?? 1));
            $perPage = max(1, min(100, (int) ($request->getQuery('per_page') ?? 25)));

            $result = $this->businessService->listBusinessesPaginated($session['user_id'], $search, $status, $page, $perPage);

            Response::success('Comercios recuperados correctamente.', $result, 200);
        } catch (ForbiddenException $e) {
            Response::error($e->getMessage(), 403);
        } catch (Throwable $e) {
            Response::error('Error al listar comercios paginados.', 500);
        }
    }

    // ==========================================
    // INVITACIONES DE COMERCIO (OWNER ONBOARDING / COLLABORATORI)
    // ==========================================

    public function createInvitation(Request $request, int $businessId): void
    {
        $session = $this->authenticate($request);
        $this->verifyCsrf($request, $session);

        try {
            $body = $request->getJsonBody();
            $result = $this->businessService->createMemberInvitation($session['user_id'], $businessId, $body);
            Response::success('Invito inviato con successo.', ['data' => $result], 201);
        } catch (ForbiddenException $e) {
            Response::error($e->getMessage(), 403);
        } catch (ValidationException $e) {
            Response::error($e->getMessage(), 422, $e->getErrors());
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 422);
        } catch (Throwable $e) {
            Response::error('Errore durante la creazione dell\'invito.', 500);
        }
    }

    public function listInvitations(Request $request, int $businessId): void
    {
        $session = $this->authenticate($request);

        try {
            $invitations = $this->businessService->listInvitations($session['user_id'], $businessId);
            Response::success('Inviti recuperati con successo.', ['data' => $invitations], 200);
        } catch (ForbiddenException $e) {
            Response::error($e->getMessage(), 403);
        } catch (Throwable $e) {
            Response::error('Errore durante il recupero degli inviti.', 500);
        }
    }

    public function resendInvitation(Request $request, int $businessId, int $invitationId): void
    {
        $session = $this->authenticate($request);
        $this->verifyCsrf($request, $session);

        try {
            $result = $this->businessService->resendInvitation($session['user_id'], $businessId, $invitationId);
            Response::success('Invito reinviato con successo.', ['data' => $result], 200);
        } catch (ForbiddenException $e) {
            Response::error($e->getMessage(), 403);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 422);
        } catch (Throwable $e) {
            Response::error('Errore durante il reinvio dell\'invito.', 500);
        }
    }

    public function cancelInvitation(Request $request, int $businessId, int $invitationId): void
    {
        $session = $this->authenticate($request);
        $this->verifyCsrf($request, $session);

        try {
            $result = $this->businessService->cancelInvitation($session['user_id'], $businessId, $invitationId);
            Response::success('Invito annullato con successo.', ['data' => $result], 200);
        } catch (ForbiddenException $e) {
            Response::error($e->getMessage(), 403);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 422);
        } catch (Throwable $e) {
            Response::error('Errore durante l\'annullamento dell\'invito.', 500);
        }
    }

    // Endpoint público para validar invitación
    public function validateInvitation(Request $request): void
    {
        $token = trim((string) ($request->getQuery('token') ?? ''));
        if ($token === '') {
            Response::error('Token di invito mancante.', 400);
        }

        try {
            $data = $this->businessService->validateInvitation($token);
            Response::success('Invito valido.', ['data' => $data], 200);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 400);
        } catch (Throwable $e) {
            Response::error('Errore durante la verifica dell\'invito.', 500);
        }
    }

    // Endpoint público para aceptar invitación y crear/confirmar contraseña
    public function acceptInvitation(Request $request): void
    {
        try {
            $body = $request->getJsonBody();
            $token = trim((string) ($body['token'] ?? ''));
            $password = (string) ($body['password'] ?? '');

            if ($token === '') {
                Response::error('Token di invito obbligatorio.', 422);
            }

            $authUserId = null;
            $authHeader = $request->getHeader('Authorization');
            if ($authHeader && preg_match('/Bearer\s+(.*)$/i', $authHeader, $matches)) {
                try {
                    $sessionService = new \App\Core\Auth\SessionService($this->pdo);
                    $session = $sessionService->validateSession($matches[1]);
                    $authUserId = (int) $session['user_id'];
                } catch (\Throwable) {
                    // Nessuna sessione valida
                }
            }

            $user = $this->businessService->acceptInvitation($token, $password, $authUserId);
            Response::success('Invito accettato con successo. Ora puoi accedere al punto vendita.', ['data' => $user], 200);
        } catch (ValidationException $e) {
            Response::error($e->getMessage(), 422, $e->getErrors());
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 400);
        } catch (Throwable $e) {
            Response::error('Errore durante l\'accettazione dell\'invito.', 500);
        }
    }

    // ==========================================
    // CICLO DE VIDA Y GDPR (SUPER ADMIN)
    // ==========================================

    public function archive(Request $request, int $businessId): void
    {
        $session = $this->authenticate($request);
        $this->verifyCsrf($request, $session);

        try {
            $body = $request->getJsonBody();
            $isArchived = isset($body['is_archived']) ? (bool) $body['is_archived'] : true;
            $result = $this->businessService->archiveBusiness((int) $session['user_id'], $businessId, $isArchived);

            Response::success($isArchived ? 'Commercio archiviato con successo.' : 'Commercio ripristinato dall\'archivio.', [
                'data' => $result,
            ], 200);
        } catch (ForbiddenException $e) {
            Response::error($e->getMessage(), 403);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 404);
        } catch (Throwable $e) {
            Response::error('Errore durante l\'archiviazione del commercio.', 500);
        }
    }

    public function terminate(Request $request, int $businessId): void
    {
        $session = $this->authenticate($request);
        $this->verifyCsrf($request, $session);

        try {
            $body = $request->getJsonBody();
            $retentionDays = isset($body['retention_days']) ? (int) $body['retention_days'] : 30;
            $result = $this->businessService->terminateBusiness((int) $session['user_id'], $businessId, $retentionDays);

            Response::success('Commercio disattivato e cessazione programmata registrata con successo.', [
                'data' => $result,
            ], 200);
        } catch (ForbiddenException $e) {
            Response::error($e->getMessage(), 403);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 404);
        } catch (Throwable $e) {
            Response::error('Errore durante la terminazione del commercio.', 500);
        }
    }

    public function cancelTermination(Request $request, int $businessId): void
    {
        $session = $this->authenticate($request);
        $this->verifyCsrf($request, $session);

        try {
            $result = $this->businessService->cancelTermination((int) $session['user_id'], $businessId);

            Response::success('Cessazione programmata annullata e commercio riattivato.', [
                'data' => $result,
            ], 200);
        } catch (ForbiddenException $e) {
            Response::error($e->getMessage(), 403);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 404);
        } catch (Throwable $e) {
            Response::error('Errore durante l\'annullamento della terminazione.', 500);
        }
    }

    public function deleteEmpty(Request $request, int $businessId): void
    {
        $session = $this->authenticate($request);
        $this->verifyCsrf($request, $session);

        try {
            $body = $request->getJsonBody();
            $confirmSlug = trim((string) ($body['confirm_slug'] ?? ''));

            $result = $this->businessService->deleteEmptyBusiness((int) $session['user_id'], $businessId, $confirmSlug);

            Response::success('Commercio vuoto eliminato definitivamente.', [
                'data' => $result,
            ], 200);
        } catch (ForbiddenException $e) {
            Response::error($e->getMessage(), 403);
        } catch (ValidationException $e) {
            Response::error($e->getMessage(), 422, $e->getErrors());
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 404);
        } catch (Throwable $e) {
            Response::error('Errore durante l\'eliminazione del commercio.', 500);
        }
    }

    public function exportData(Request $request, int $businessId): void
    {
        $session = $this->authenticate($request);

        try {
            $data = $this->businessService->exportBusinessData((int) $session['user_id'], $businessId);

            $filename = 'export_commercio_' . $businessId . '_' . gmdate('Ymd_His') . '.json';
            header('Content-Type: application/json; charset=utf-8');
            header('Content-Disposition: attachment; filename="' . $filename . '"');
            echo json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
            exit;
        } catch (ForbiddenException $e) {
            Response::error($e->getMessage(), 403);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 404);
        } catch (Throwable $e) {
            Response::error('Errore durante l\'esportazione dei dati: ' . $e->getMessage(), 500);
        }
    }
}

