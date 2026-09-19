<?php
declare(strict_types=1);

namespace App\Modules\Automations;

use App\Core\Http\Request;
use App\Core\Http\Response;
use PDO;

final class WebhookController
{
    private PDO $pdo;
    private string $hmacSecret;
    
    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
        $this->hmacSecret = $_ENV['N8N_HMAC_SECRET'] ?? '';
    }

    public function handle(Request $request): void
    {
        if (empty($this->hmacSecret)) {
            Response::error('Webhook no configurado', 500);
        }

        $signature = $request->getHeader('x-webhook-signature');
        if (strpos((string)$signature, 'sha256=') !== 0) {
            Response::error('Firma inválida: expected ' . $expected . ' got ' . $signature, 401);
        }
        
        $signature = substr((string)$signature, 7);
        $body = $request->getJsonBody(); $body = json_encode($body);
        
        $data = json_decode((string)$request->body ?? '', true) ?: [];
        $timestamp = $data['timestamp'] ?? 0;
        $nonce = $data['nonce'] ?? '';
        $bodyStr = (string)($request->body ?? '');
        $signaturePayload = $timestamp . '.' . $nonce . '.' . $bodyStr;

        $expected = hash_hmac('sha256', $signaturePayload, $this->hmacSecret);
        
        if (!hash_equals($expected, $signature)) {
            Response::error('Firma inválida: expected ' . $expected . ' got ' . $signature, 401);
        }

        $data = json_decode((string)$body, true);
        $timestamp = (int) ($data['timestamp'] ?? 0);
        
        if (abs(time() - $timestamp) > 300) {
            Response::error('Timestamp expirado o inválido', 401);
        }
        
        $nonce = (string) ($data['nonce'] ?? '');
        if (empty($nonce)) {
            Response::error('Nonce requerido', 400);
        }

        try {
            $this->pdo->exec("DELETE FROM webhook_nonces WHERE created_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 HOUR)");
            $this->pdo->beginTransaction();
            
            // Check if nonce used (using outbox_events or a dedicated table, let's just create a quick check)
            $stmt = $this->pdo->prepare("SELECT id FROM webhook_nonces WHERE nonce = ?");
            $stmt->execute([$nonce]);
            if ($stmt->fetch()) {
                Response::error('Nonce repetido', 401);
            }
            
            $ins = $this->pdo->prepare("INSERT INTO webhook_nonces (nonce, created_at) VALUES (?, UTC_TIMESTAMP())");
            $ins->execute([$nonce]);
            
            // Process the webhook ... (e.g. status update)
            // outbox_id, status, error...
            
            $this->pdo->commit();
            Response::success('Webhook procesado');
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            Response::error('Error interno', 500);
        }
    }
}
