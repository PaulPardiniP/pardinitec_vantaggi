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
    private CapabilityService $capabilityService;

    public function __construct(
        ?LoyaltyService $loyaltyService = null,
        ?AuthService $authService = null,
        ?AuthorizationService $authzService = null,
        ?CapabilityService $capabilityService = null
    ) {
        $this->loyaltyService = $loyaltyService ?? new LoyaltyService();
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
            $issueCredential = filter_var($body['issue_credential'] ?? true, FILTER_VALIDATE_BOOLEAN);

            if ($issueCredential) {
                $customerService = new \App\Modules\Customers\CustomerService();
                $res = $customerService->addAccountToCustomer($businessId, $customerId, $profileCode, (int) $session['user_id']);
                $msg = !empty($res['upgraded'])
                    ? 'Profilo conto aggiornato a Vantaggi con successo.'
                    : 'Conto di fidelizzazione creato con successo.';
                Response::success($msg, [
                    'data' => $res,
                ], 201);
            } else {
                $account = $this->loyaltyService->createAccount($businessId, $customerId, $profileCode);
                $msg = !empty($account['upgraded'])
                    ? 'Profilo conto aggiornato a Vantaggi con successo.'
                    : 'Conto di fidelizzazione creato con successo.';
                Response::success($msg, [
                    'data' => $account,
                ], 201);
            }
        } catch (ForbiddenException $e) {
            Response::error($e->getMessage(), 403);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 400);
        } catch (Throwable $e) {
            Response::error('Error al crear cuenta de fidelización.', 500);
        }
    }

    public function preview(Request $request, int $businessId, int $accountId): void
    {
        $session = $this->authenticate($request);

        try {
            $this->authzService->requirePermission($session['user_id'], $businessId, Permission::CUSTOMER_VIEW);

            $preview = $this->loyaltyService->getAccountPreview($businessId, $accountId);

            Response::success('Anteprima carta recuperata correttamente.', [
                'data' => $preview,
            ], 200);
        } catch (ForbiddenException $e) {
            Response::error($e->getMessage(), 403);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 404);
        } catch (Throwable $e) {
            Response::error('Error al obtener la anteprima de la carta.', 500);
        }
    }

    public function changeProfile(Request $request, int $businessId, int $accountId): void
    {
        $session = $this->authenticate($request);
        $this->verifyCsrf($request, $session);

        try {
            $this->authzService->requirePermission($session['user_id'], $businessId, Permission::CUSTOMER_EDIT);

            $body = $request->getJsonBody();
            $profileCode = $body['profile_code'] ?? ($body['card_profile_id'] ?? 'punti');

            $updated = $this->loyaltyService->changeAccountProfile($businessId, $accountId, $profileCode);

            $msg = ($updated['profile_code'] === 'vantaggi')
                ? 'Profilo conto aggiornato a Vantaggi con successo. Saldo e credenziali rimangono invariati.'
                : 'Profilo conto aggiornato a Punti con successo. Saldo e credenziali rimangono invariati.';

            Response::success($msg, [
                'data' => $updated,
            ], 200);
        } catch (ForbiddenException $e) {
            Response::error($e->getMessage(), 403);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 400);
        } catch (Throwable $e) {
            Response::error('Errore durante la modifica del profilo del conto.', 500);
        }
    }

    public function getVipStats(Request $request, int $businessId): void
    {
        $session = $this->authenticate($request);

        try {
            $this->authzService->requirePermission($session['user_id'], $businessId, Permission::CUSTOMER_VIEW);

            $hasVipModule = $this->capabilityService->isCapabilityEnabledForBusiness($businessId, 'vip_offers');

            $stmt = Connection::get()->prepare("
                SELECT COUNT(DISTINCT la.`customer_id`) 
                FROM `loyalty_accounts` la
                INNER JOIN `card_profiles` cp ON la.`card_profile_id` = cp.`id`
                WHERE la.`business_id` = :business_id 
                  AND cp.`code` = 'vip' 
                  AND la.`status` = 'active'
            ");
            $stmt->execute(['business_id' => $businessId]);
            $vipCount = (int) $stmt->fetchColumn();

            Response::success('Statistiche VIP recuperate con successo.', [
                'data' => [
                    'business_id' => $businessId,
                    'active_vip_customers' => $vipCount,
                    'vip_module_enabled' => $hasVipModule,
                    'can_create_vip_offers' => $hasVipModule,
                ],
                'active_vip_customers' => $vipCount,
                'vip_module_enabled' => $hasVipModule,
                'can_create_vip_offers' => $hasVipModule,
            ], 200);
        } catch (ForbiddenException $e) {
            Response::error($e->getMessage(), 403);
        } catch (Throwable $e) {
            Response::error('Errore durante il recupero delle statistiche VIP.', 500);
        }
    }
}
