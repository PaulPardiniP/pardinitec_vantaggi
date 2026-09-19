<?php

declare(strict_types=1);

namespace App\Modules\Customers;

use App\Core\Auth\AuthService;
use App\Core\Auth\ValidationException;
use App\Core\Http\Request;
use App\Core\Http\Response;
use App\Core\Security\Csrf;
use App\Modules\Businesses\AuthorizationService;
use App\Modules\Businesses\ForbiddenException;
use App\Modules\Businesses\Permission;
use InvalidArgumentException;
use Throwable;

final class CustomerController
{
    private CustomerService $customerService;
    private AuthService $authService;
    private AuthorizationService $authzService;

    public function __construct(
        ?CustomerService $customerService = null,
        ?AuthService $authService = null,
        ?AuthorizationService $authzService = null
    ) {
        $this->customerService = $customerService ?? new CustomerService();
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

    public function onboard(Request $request, int $businessId): void
    {
        $session = $this->authenticate($request);
        $this->verifyCsrf($request, $session);

        try {
            $this->authzService->requirePermission($session['user_id'], $businessId, Permission::CUSTOMER_EDIT);

            $body = $request->getJsonBody();
            $result = $this->customerService->onboardCustomer($businessId, $body, (int) $session['user_id']);

            Response::success('Cliente y credencial digital registrados exitosamente.', [
                'data' => $result,
            ], 201);
        } catch (ForbiddenException $e) {
            Response::error($e->getMessage(), 403);
        } catch (ValidationException $e) {
            Response::error($e->getMessage(), 422, $e->getErrors());
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 400);
        } catch (Throwable $e) {
            Response::error('Error al registrar cliente.', 500);
        }
    }

    public function list(Request $request, int $businessId): void
    {
        $session = $this->authenticate($request);

        try {
            $this->authzService->requirePermission($session['user_id'], $businessId, Permission::CUSTOMER_VIEW);

            $filters = [
                'search' => $request->getQuery('search'),
                'phone' => $request->getQuery('phone'),
                'email' => $request->getQuery('email'),
            ];
            $page = (int) ($request->getQuery('page') ?? 1);
            $perPage = (int) ($request->getQuery('per_page') ?? 20);

            $result = $this->customerService->listCustomers($businessId, $filters, $page, $perPage);

            Response::success('Clientes recuperados correctamente.', $result, 200);
        } catch (ForbiddenException $e) {
            Response::error($e->getMessage(), 403);
        } catch (Throwable $e) {
            Response::error('Error al listar clientes.', 500);
        }
    }

    public function get(Request $request, int $businessId, int $customerId): void
    {
        $session = $this->authenticate($request);

        try {
            $this->authzService->requirePermission($session['user_id'], $businessId, Permission::CUSTOMER_VIEW);

            $customer = $this->customerService->getCustomer($businessId, $customerId);

            Response::success('Cliente recuperado correctamente.', [
                'data' => $customer,
            ], 200);
        } catch (ForbiddenException $e) {
            Response::error($e->getMessage(), 403);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 404);
        } catch (Throwable $e) {
            Response::error('Error al obtener cliente.', 500);
        }
    }

    public function update(Request $request, int $businessId, int $customerId): void
    {
        $session = $this->authenticate($request);
        $this->verifyCsrf($request, $session);

        try {
            $this->authzService->requirePermission($session['user_id'], $businessId, Permission::CUSTOMER_EDIT);

            $body = $request->getJsonBody();
            $customer = $this->customerService->updateCustomer($businessId, $customerId, $body);

            Response::success('Cliente actualizado correctamente.', [
                'data' => $customer,
            ], 200);
        } catch (ForbiddenException $e) {
            Response::error($e->getMessage(), 403);
        } catch (ValidationException $e) {
            Response::error($e->getMessage(), 422, $e->getErrors());
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 404);
        } catch (Throwable $e) {
            Response::error('Error al actualizar cliente.', 500);
        }
    }

    public function getConsents(Request $request, int $businessId, int $customerId): void
    {
        $session = $this->authenticate($request);

        try {
            $this->authzService->requirePermission($session['user_id'], $businessId, Permission::CUSTOMER_VIEW);

            $consents = $this->customerService->getConsents($businessId, $customerId);

            Response::success('Consentimientos recuperados correctamente.', [
                'data' => $consents,
            ], 200);
        } catch (ForbiddenException $e) {
            Response::error($e->getMessage(), 403);
        } catch (Throwable $e) {
            Response::error('Error al recuperar consentimientos.', 500);
        }
    }

    public function recordConsent(Request $request, int $businessId, int $customerId): void
    {
        $session = $this->authenticate($request);
        $this->verifyCsrf($request, $session);

        try {
            $this->authzService->requirePermission($session['user_id'], $businessId, Permission::CUSTOMER_EDIT);

            $body = $request->getJsonBody();
            $type = (string) ($body['type'] ?? '');
            $status = (string) ($body['status'] ?? 'granted');
            $source = (string) ($body['source'] ?? 'in_store_staff');
            $textVersion = (string) ($body['text_version'] ?? 'v1.0');

            $consent = $this->customerService->recordConsent($businessId, $customerId, $type, $status, $source, $textVersion);

            Response::success('Consentimiento registrado exitosamente.', [
                'data' => $consent,
            ], 201);
        } catch (ForbiddenException $e) {
            Response::error($e->getMessage(), 403);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 400);
        } catch (Throwable $e) {
            Response::error('Error al registrar consentimiento.', 500);
        }
    }

    public function revokeMarketing(Request $request, int $businessId, int $customerId): void
    {
        $session = $this->authenticate($request);
        $this->verifyCsrf($request, $session);

        try {
            $this->authzService->requirePermission($session['user_id'], $businessId, Permission::CUSTOMER_EDIT);

            $consent = $this->customerService->revokeMarketingConsent($businessId, $customerId);

            Response::success('Consentimiento de marketing revocado exitosamente.', [
                'data' => $consent,
            ], 200);
        } catch (ForbiddenException $e) {
            Response::error($e->getMessage(), 403);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 404);
        } catch (Throwable $e) {
            Response::error('Error al revocar consentimiento de marketing.', 500);
        }
    }

    public function grantMarketing(Request $request, int $businessId, int $customerId): void
    {
        $session = $this->authenticate($request);
        $this->verifyCsrf($request, $session);

        try {
            $this->authzService->requirePermission($session['user_id'], $businessId, Permission::CUSTOMER_EDIT);

            $body = $request->getJsonBody();
            if (($body['confirmed'] ?? false) !== true) {
                Response::error('La conferma esplicita del consenso marketing è obbligatoria.', 422);
            }
            $source = (string) ($body['source'] ?? 'in_person');
            $privacyPolicyVersion = (string) ($body['privacy_policy_version'] ?? 'v1.0');

            $consent = $this->customerService->grantMarketingConsent(
                $businessId,
                $customerId,
                $source,
                $privacyPolicyVersion,
                (int) $session['user_id']
            );

            Response::success('Consenso marketing acquisito con successo.', [
                'data' => $consent,
            ], 200);
        } catch (ForbiddenException $e) {
            Response::error($e->getMessage(), 403);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 404);
        } catch (Throwable $e) {
            Response::error('Errore durante l\'acquisizione del consenso marketing.', 500);
        }
    }

    public function export(Request $request): void
    {
        $session = $this->authenticate($request);
        $businessId = (int) $request->getRouteParam('id');
        $customerId = (int) $request->getRouteParam('customerId');

        try {
            $this->authzService->requirePermission($session['user_id'], $businessId, Permission::CUSTOMER_VIEW);
            $data = $this->customerService->exportCustomerData($businessId, $customerId);
            Response::success('Dati cliente esportati con successo.', ['data' => $data], 200);
        } catch (ForbiddenException $e) {
            Response::error($e->getMessage(), 403);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 404);
        } catch (Throwable $e) {
            Response::error('Errore durante l\'esportazione dei dati cliente.', 500);
        }
    }

    public function anonymize(Request $request): void
    {
        $session = $this->authenticate($request);
        $this->verifyCsrf($request, $session);
        $businessId = (int) $request->getRouteParam('id');
        $customerId = (int) $request->getRouteParam('customerId');

        try {
            $this->authzService->requirePermission($session['user_id'], $businessId, Permission::CUSTOMER_EDIT);
            $this->customerService->anonymizeCustomer($businessId, $customerId, (int) $session['user_id']);
            Response::success('Cliente anonimizzato con successo.', [], 200);
        } catch (ForbiddenException $e) {
            Response::error($e->getMessage(), 403);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 404);
        } catch (Throwable $e) {
            Response::error('Errore durante l\'anonimizzazione del cliente.', 500);
        }
    }
}
