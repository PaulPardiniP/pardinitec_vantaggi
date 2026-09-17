<?php

declare(strict_types=1);

namespace App\Modules\Cards;

use App\Core\Auth\AuthService;
use App\Core\Http\Request;
use App\Core\Http\Response;
use App\Core\Security\RateLimiter;
use App\Modules\AccessCredentials\CredentialService;
use App\Modules\Businesses\AuthorizationService;
use Throwable;

final class PublicCardController
{
    private CredentialService $credentialService;
    private AuthService $authService;
    private AuthorizationService $authzService;
    private RateLimiter $rateLimiter;

    public function __construct(
        ?CredentialService $credentialService = null,
        ?AuthService $authService = null,
        ?AuthorizationService $authzService = null,
        ?RateLimiter $rateLimiter = null
    ) {
        $this->credentialService = $credentialService ?? new CredentialService();
        $this->authService = $authService ?? new AuthService();
        $this->authzService = $authzService ?? new AuthorizationService();
        $this->rateLimiter = $rateLimiter ?? new RateLimiter();
    }

    /**
     * Resuelve de forma segura y adaptativa la URL pública /c/<token> o /api/v1/public/cards/<token>.
     * Distingue si quien consulta es anónimo, personal del comercio, usuario de otro comercio o Super Admin.
     */
    public function resolve(Request $request, string $token): void
    {
        try {
            $clientIp = $request->getClientIp() ?? '127.0.0.1';
            $ipHash = hash('sha256', $clientIp);
            $tokenHash = hash('sha256', trim($token));

            // 1. Rate limit por token: evita ataques dirigidos contra una tarjeta específica (sin guardar el token plano)
            $tokenHit = $this->rateLimiter->hit('public.card_token', 'token:' . $tokenHash, 60, 60);
            if (!$tokenHit['allowed']) {
                Response::error(
                    'Límite de consultas excedido para esta tarjeta. Por favor intente más tarde.',
                    429,
                    [],
                    ['Retry-After' => (string) $tokenHit['retry_after']]
                );
            }

            // 2. Rate limit general por IP para ráfagas (permite legítimamente escanear hasta 120 tarjetas distintas por minuto)
            $ipHit = $this->rateLimiter->hit('public.card_ip', 'ip:' . $ipHash, 120, 60);
            if (!$ipHit['allowed']) {
                Response::error(
                    'Límite general de consultas excedido. Por favor intente más tarde.',
                    429,
                    [],
                    ['Retry-After' => (string) $ipHit['retry_after']]
                );
            }
            $viewer = null;

            // Intentar detectar sesión autenticada opcional
            $cookieName = $this->authService->getSessionManager()->getCookieName();
            $sessionId = $request->getCookie($cookieName);

            if ($sessionId !== null) {
                $session = $this->authService->getCurrentSession($sessionId);
                if ($session !== null) {
                    $userId = (int) $session['user_id'];
                    $isSuperAdmin = $this->authzService->isSuperAdmin($userId);

                    // Buscar si tiene membresía en el comercio asociado a la credencial
                    $cred = $this->credentialService->findByRawToken($token);
                    $businessId = $cred['business_id'] !== null ? (int) $cred['business_id'] : null;

                    $membership = ($businessId !== null)
                        ? $this->authzService->getMembership($userId, $businessId)
                        : null;

                    $viewer = [
                        'user_id' => $userId,
                        'is_super_admin' => $isSuperAdmin,
                        'business_id' => $membership['business_id'] ?? null,
                        'role' => $membership['role'] ?? null,
                    ];
                }
            }

            $viewData = $this->credentialService->getPublicCredentialView($token, $viewer);

            if ($viewData === null) {
                $invalidHit = $this->rateLimiter->hit('public.card_invalid', 'invalid:' . $ipHash, 20, 60);
                if (!$invalidHit['allowed']) {
                    Response::error(
                        'Demasiadas consultas de tarjetas inválidas. Por favor intente más tarde.',
                        429,
                        [],
                        ['Retry-After' => (string) $invalidHit['retry_after']]
                    );
                }
                Response::error('Carta non trovata o non disponibile.', 404);
            }

            if (($viewData['state'] ?? '') === 'forbidden') {
                Response::error('Accesso negato.', 403);
            }

            if (($viewData['state'] ?? '') === 'not_available') {
                Response::error($viewData['message'] ?? 'Carta non disponibile.', 404);
            }

            if (($viewData['state'] ?? '') === 'suspended') {
                Response::error($viewData['message'] ?? 'Carta temporaneamente sospesa.', 403);
            }

            Response::success('Informazioni della carta recuperate correttamente.', [
                'data' => $viewData,
            ], 200);
        } catch (Throwable $e) {
            Response::error('Errore durante la consultazione della carta.', 500);
        }
    }
}
