<?php

declare(strict_types=1);

namespace App\Modules\Automations;

use PDO;
use App\Core\Mail\Mailer;
use Throwable;

final class OutboxDispatcher
{
    private PDO $pdo;
    private Mailer $mailer;
    private string $webhookUrl;
    private string $hmacSecret;
    private int $timeout;
    private int $maxRetries;

    public function __construct(PDO $pdo, ?Mailer $mailer = null)
    {
        $this->pdo = $pdo;
        $this->mailer = $mailer ?? new Mailer();
        $this->webhookUrl = $_ENV['N8N_WEBHOOK_URL'] ?? '';
        $this->hmacSecret = $_ENV['N8N_HMAC_SECRET'] ?? '';
        $this->timeout = (int) ($_ENV['N8N_TIMEOUT_SECONDS'] ?? 10);
        $this->maxRetries = (int) ($_ENV['N8N_MAX_RETRIES'] ?? 3);
    }

    public function dispatchBatch(int $limit = 50, ?string $eventType = null): int
    {
        $dispatched = 0;

        $stmt = $this->pdo->prepare("
            SELECT `id`, `event_type`, `payload`, `retry_count`
            FROM `outbox_events`
            WHERE `hmac_nonce` = ?
            ORDER BY `id` ASC
        ");

        try {
            $this->pdo->exec("
                UPDATE `outbox_events`
                SET `status` = 'pending', `locked_at` = NULL, `hmac_nonce` = NULL
                WHERE `status` = 'processing' AND `locked_at` < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 15 MINUTE)
            ");

            $this->pdo->beginTransaction();
            $worker = bin2hex(random_bytes(16));
            $typeClause = ($eventType !== null) ? " AND `event_type` = :event_type" : "";
            $upd = $this->pdo->prepare("
                UPDATE `outbox_events`
                SET `status` = 'processing', `locked_at` = UTC_TIMESTAMP(), `hmac_nonce` = :worker
                WHERE `status` = 'pending' AND `next_retry_at` <= UTC_TIMESTAMP(){$typeClause}
                ORDER BY `id` ASC
                LIMIT {$limit}
            ");
            $params = ['worker' => $worker];
            if ($eventType !== null) {
                $params['event_type'] = $eventType;
            }
            $upd->execute($params);

            $stmt->execute([$worker]);
            $events = $stmt->fetchAll(PDO::FETCH_ASSOC);

            if (empty($events)) {
                $this->pdo->commit();
                return 0;
            }

            $this->pdo->commit();
        } catch (Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e;
        }

        foreach ($events as $event) {
            $this->processEvent($event);
            $dispatched++;
        }

        return $dispatched;
    }

    public function dispatchEvent(int $id): bool
    {
        $stmt = $this->pdo->prepare("
            SELECT `id`, `event_type`, `payload`, `retry_count`
            FROM `outbox_events`
            WHERE `id` = :id
            LIMIT 1
        ");
        $stmt->execute(['id' => $id]);
        $event = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$event) {
            return false;
        }

        $this->processEvent($event);
        return true;
    }

    private function processEvent(array $event): void
    {
        $eventType = (string) ($event['event_type'] ?? 'campaign.message');

        if ($eventType === 'owner.invitation' || $eventType === 'member.invitation') {
            $this->processOwnerInvitation($event);
            return;
        }

        $this->processWebhookEvent($event);
    }

    private function processOwnerInvitation(array $event): void
    {
        $id = (int) $event['id'];
        $payload = json_decode((string) $event['payload'], true) ?: [];
        $retryCount = (int) $event['retry_count'];

        $email = trim((string) ($payload['email'] ?? ''));
        $firstName = trim((string) ($payload['first_name'] ?? 'Gentile Amministratore'));
        $bizName = trim((string) ($payload['business_name'] ?? 'Attività'));
        $invitationUrl = (string) ($payload['invitation_url'] ?? '');
        $expiresAt = (string) ($payload['expires_at'] ?? '');

        if ($email === '' || $invitationUrl === '') {
            $this->markEventFailed($id, $retryCount, 'Payload invito non valido: email o URL mancanti.');
            return;
        }

        $baseUrl = rtrim($_ENV['APP_URL'] ?? 'http://localhost:5173', '/');
        $fullUrl = (str_starts_with($invitationUrl, 'http://') || str_starts_with($invitationUrl, 'https://'))
            ? $invitationUrl
            : $baseUrl . $invitationUrl;

        $subject = "Invito ad amministrare {$bizName} su Pardinitec Vantaggi";

        $htmlBody = <<<HTML
<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <title>{$subject}</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
        .header { background: #1e3a8a; color: #ffffff; padding: 24px; text-align: center; }
        .header h1 { margin: 0; font-size: 22px; font-weight: 700; }
        .content { padding: 32px 24px; line-height: 1.6; font-size: 15px; }
        .btn-box { text-align: center; margin: 30px 0; }
        .btn { background: #2563eb; color: #ffffff !important; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; }
        .footer { background: #f1f5f9; padding: 16px 24px; font-size: 12px; color: #64748b; text-align: center; border-top: 1px solid #e2e8f0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Pardinitec Vantaggi</h1>
        </div>
        <div class="content">
            <p>Gentile <strong>{$firstName}</strong>,</p>
            <p>Sei stato invitato come <strong>Proprietario / Gestore</strong> per amministrare l'attività <strong>{$bizName}</strong> sulla piattaforma Pardinitec Vantaggi.</p>
            <p>Clicca sul pulsante sottostante per attivare il tuo account e impostare le credenziali di accesso:</p>
            <div class="btn-box">
                <a href="{$fullUrl}" class="btn">Accetta Invito e Accedi</a>
            </div>
            <p style="font-size: 13px; color: #64748b;">Se il pulsante non funziona, puoi incollare il seguente indirizzo nel browser:<br><a href="{$fullUrl}" style="color: #2563eb;">{$fullUrl}</a></p>
            <p style="font-size: 13px; color: #64748b;">Questo link è strettamente personale e scadrà il <strong>{$expiresAt}</strong> (valido per 7 giorni).</p>
        </div>
        <div class="footer">
            <p>Se non attendevi questo messaggio o ritieni si tratti di un errore, puoi ignorarlo in sicurezza.<br>&copy; Pardinitec Vantaggi - Tutti i diritti riservati.</p>
        </div>
    </div>
</body>
</html>
HTML;

        $textBody = "Gentile {$firstName},\n\n" .
            "Sei stato invitato ad amministrare l'attività {$bizName} su Pardinitec Vantaggi.\n\n" .
            "Per accettare l'invito e accedere al pannello, utilizza il seguente link:\n" .
            "{$fullUrl}\n\n" .
            "Questo link scadrà il: {$expiresAt} (valido per 7 giorni).\n\n" .
            "Se non attendevi questa email, puoi ignorarla in sicurezza.\n\n" .
            "Pardinitec Vantaggi";

        try {
            $sent = $this->mailer->send($email, $subject, $htmlBody, $textBody);
            if ($sent) {
                $upd = $this->pdo->prepare("
                    UPDATE `outbox_events`
                    SET `status` = 'sent', `sent_at` = UTC_TIMESTAMP(), `last_error` = NULL, `locked_at` = NULL
                    WHERE `id` = ?
                ");
                $upd->execute([$id]);
            } else {
                $this->markEventFailed($id, $retryCount, 'Impossibile inviare email tramite il trasporto configurato.');
            }
        } catch (Throwable $e) {
            $this->markEventFailed($id, $retryCount, 'Errore invio email: ' . $e->getMessage());
        }
    }

    private function processWebhookEvent(array $event): void
    {
        $id = (int) $event['id'];
        $payload = json_decode((string) $event['payload'], true) ?: [];
        $retryCount = (int) $event['retry_count'];

        if (empty($this->webhookUrl) || empty($this->hmacSecret)) {
            $this->markEventFailed($id, $retryCount, 'Webhook URL o secret HMAC non configurati.');
            return;
        }

        $nonce = bin2hex(random_bytes(16));
        $timestamp = time();

        $envelope = [
            'id' => $id,
            'timestamp' => $timestamp,
            'nonce' => $nonce,
            'data' => $payload,
        ];

        $jsonBody = json_encode($envelope);
        $payloadData = $timestamp . '.' . $nonce . '.' . $jsonBody;
        $signature = hash_hmac('sha256', $payloadData, $this->hmacSecret);

        $success = false;
        $errorMsg = null;

        $ch = curl_init($this->webhookUrl);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $jsonBody);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Content-Type: application/json',
            'X-Webhook-Signature: sha256=' . $signature,
        ]);
        curl_setopt($ch, CURLOPT_TIMEOUT, $this->timeout);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

        if ($response === false) {
            $errorMsg = curl_error($ch);
        } elseif ($httpCode < 200 || $httpCode >= 300) {
            $errorMsg = "HTTP Error {$httpCode}: {$response}";
        } else {
            $success = true;
        }

        curl_close($ch);

        if ($success) {
            $upd = $this->pdo->prepare("
                UPDATE `outbox_events`
                SET `status` = 'sent', `sent_at` = UTC_TIMESTAMP(), `hmac_nonce` = ?, `last_error` = NULL, `locked_at` = NULL
                WHERE `id` = ?
            ");
            $upd->execute([$nonce, $id]);
        } else {
            $this->markEventFailed($id, $retryCount, (string) $errorMsg);
        }
    }

    private function markEventFailed(int $id, int $retryCount, string $errorMsg): void
    {
        $retryCount++;
        if ($retryCount >= $this->maxRetries) {
            $status = 'failed';
            $next = 'UTC_TIMESTAMP()';
        } else {
            $status = 'pending';
            $minutes = pow(2, $retryCount);
            $next = "DATE_ADD(UTC_TIMESTAMP(), INTERVAL {$minutes} MINUTE)";
        }

        $upd = $this->pdo->prepare("
            UPDATE `outbox_events`
            SET `status` = ?, `retry_count` = ?, `next_retry_at` = {$next}, `last_error` = ?, `locked_at` = NULL
            WHERE `id` = ?
        ");
        $upd->execute([$status, $retryCount, substr($errorMsg, 0, 1000), $id]);
    }
}
