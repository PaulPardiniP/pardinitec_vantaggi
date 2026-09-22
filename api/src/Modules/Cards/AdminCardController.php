<?php

declare(strict_types=1);

namespace App\Modules\Cards;

use App\Core\Auth\AuthService;
use App\Core\Http\Request;
use App\Core\Http\Response;
use App\Core\Security\Csrf;
use App\Modules\Businesses\AuthorizationService;
use InvalidArgumentException;
use Throwable;

final class AdminCardController
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

    private function authenticateSuperAdmin(Request $request): array
    {
        $cookieName = $this->authService->getSessionManager()->getCookieName();
        $sessionId = $request->getCookie($cookieName);

        $session = $this->authService->getCurrentSession($sessionId);
        if ($session === null) {
            Response::error('No autenticado o sesión expirada.', 401);
        }

        if (!$this->authzService->isSuperAdmin((int) $session['user_id'])) {
            Response::error('Acceso exclusivo para Super Administradores de la plataforma.', 403);
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
        $session = $this->authenticateSuperAdmin($request);
        $this->verifyCsrf($request, $session);

        try {
            $body = $request->getJsonBody();
            $designProfileId = isset($body['design_profile_id']) ? (int) $body['design_profile_id'] : null;
            $isReprogrammable = isset($body['is_reprogrammable']) ? (bool) $body['is_reprogrammable'] : true;

            $card = $this->cardService->createCardInInventory($designProfileId, (int) $session['user_id'], $isReprogrammable);

            Response::success('Tarjeta física creada en inventario exitosamente.', [
                'data' => $card,
            ], 201);
        } catch (Throwable $e) {
            Response::error('Error al crear tarjeta en inventario.', 500);
        }
    }

    public function createBatch(Request $request): void
    {
        $session = $this->authenticateSuperAdmin($request);
        $this->verifyCsrf($request, $session);

        try {
            $body = $request->getJsonBody();
            $count = (int) ($body['count'] ?? 1);
            $designProfileId = isset($body['design_profile_id']) ? (int) $body['design_profile_id'] : null;
            $isReprogrammable = isset($body['is_reprogrammable']) ? (bool) $body['is_reprogrammable'] : true;

            $batch = $this->cardService->createBatchInInventory($count, $designProfileId, (int) $session['user_id'], $isReprogrammable);

            Response::success('Lote de tarjetas físicas creado en inventario exitosamente.', [
                'data' => $batch,
                'count' => count($batch),
            ], 201);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 400);
        } catch (Throwable $e) {
            Response::error('Error al crear lote de tarjetas.', 500);
        }
    }

    public function list(Request $request): void
    {
        $this->authenticateSuperAdmin($request);

        try {
            $filters = [
                'status' => $request->getQuery('status'),
                'business_id' => $request->getQuery('business_id'),
            ];
            $page = (int) ($request->getQuery('page') ?? 1);
            $perPage = (int) ($request->getQuery('per_page') ?? 50);

            $result = $this->cardService->listCards($filters, $page, $perPage);

            Response::success('Tarjetas recuperadas correctamente.', $result, 200);
        } catch (Throwable $e) {
            Response::error('Error al listar tarjetas.', 500);
        }
    }

    public function get(Request $request, int $cardId): void
    {
        $this->authenticateSuperAdmin($request);

        try {
            $card = $this->cardService->getCard($cardId);
            if (!$card) {
                Response::error('Tarjeta no encontrada.', 404);
            }

            Response::success('Tarjeta recuperada correctamente.', [
                'data' => $card,
            ], 200);
        } catch (Throwable $e) {
            Response::error('Error al obtener tarjeta.', 500);
        }
    }

    public function assign(Request $request): void
    {
        $session = $this->authenticateSuperAdmin($request);
        $this->verifyCsrf($request, $session);

        try {
            $body = $request->getJsonBody();
            $cardIds = (array) ($body['card_ids'] ?? []);
            $businessId = (int) ($body['business_id'] ?? 0);

            if (empty($cardIds) || $businessId <= 0) {
                Response::error('Debe proporcionar card_ids y un business_id válido.', 400);
            }

            $updatedCards = $this->cardService->assignCardsToBusiness($cardIds, $businessId, (int) $session['user_id']);

            Response::success('Tarjetas asignadas al comercio exitosamente.', [
                'data' => $updatedCards,
            ], 200);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 400);
        } catch (Throwable $e) {
            Response::error('Error al asignar tarjetas al comercio.', 500);
        }
    }

    /**
     * Super Admin endpoint to reveal permanent NFC URL for a card.
     */
    public function revealLink(Request $request, int $cardId): void
    {
        $session = $this->authenticateSuperAdmin($request);
        $this->verifyCsrf($request, $session);

        // Anti-caching headers
        header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
        header('Pragma: no-cache');

        try {
            $card = $this->cardService->getCard($cardId);
            if (!$card) {
                Response::error('Carta non trovata.', 404);
            }

            if (in_array($card['status'], ['revoked', 'replaced'], true)) {
                Response::error('Impossibile programmare o recuperare il link di una carta revocata o sostituita.', 400);
            }

            $credential = $this->cardService->getLatestPhysicalCredentialForCard($cardId);
            if (!$credential) {
                Response::error('Link non recuperabile: nessuna credenziale fisica associata.', 400);
            }

            if (empty($credential['encrypted_token']) || empty($credential['encryption_iv']) || empty($credential['encryption_tag'])) {
                Response::error('Link non recuperabile: credenziale legacy senza token cifrato.', 400);
            }

            $result = $this->cardService->getCredentialService()->revealCredentialLink(
                null,
                (int) $credential['id'],
                (int) $session['user_id']
            );

            Response::success('Link NFC recuperato con successo.', [
                'data' => [
                    'card_id' => $cardId,
                    'credential_id' => $result['credential_id'],
                    'token' => $result['token'],
                    'public_url' => $result['public_url'],
                    'card_status' => $card['status'],
                    'business_id' => $card['business_id'],
                    'business_name' => $card['business_name'] ?? null,
                ],
            ], 200);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 400);
        } catch (Throwable $e) {
            Response::error('Errore durante il recupero del link NFC.', 500);
        }
    }

    public function delete(Request $request, int $cardId): void
    {
        $session = $this->authenticateSuperAdmin($request);
        $this->verifyCsrf($request, $session);

        try {
            $this->cardService->deleteCardFromInventory($cardId);

            Response::success('Carta eliminata con successo dall\'inventario.', null, 200);
        } catch (InvalidArgumentException $e) {
            Response::error($e->getMessage(), 400);
        } catch (Throwable $e) {
            Response::error('Errore durante l\'eliminazione della carta.', 500);
        }
    }
}
