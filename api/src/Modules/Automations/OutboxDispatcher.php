<?php

declare(strict_types=1);

namespace App\Modules\Automations;

use PDO;
use Exception;

final class OutboxDispatcher
{
    private PDO $pdo;
    private string $webhookUrl;
    private string $hmacSecret;
    private int $timeout;
    private int $maxRetries;

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
        $this->webhookUrl = $_ENV['N8N_WEBHOOK_URL'] ?? '';
        $this->hmacSecret = $_ENV['N8N_HMAC_SECRET'] ?? '';
        $this->timeout = (int) ($_ENV['N8N_TIMEOUT_SECONDS'] ?? 10);
        $this->maxRetries = (int) ($_ENV['N8N_MAX_RETRIES'] ?? 3);
    }

    public function dispatchBatch(int $limit = 50): int
    {
        if (empty($this->webhookUrl) || empty($this->hmacSecret)) {
            // Can't dispatch without config. Just return 0.
            return 0;
        }

        $dispatched = 0;

        $stmt = $this->pdo->prepare("
            SELECT `id`, `payload`, `retry_count` FROM `outbox_events` WHERE `hmac_nonce` = ? ORDER BY `id` ASC
        ");
        
        try {
            $this->pdo->exec("UPDATE `outbox_events` SET `status` = 'pending', `locked_at` = NULL, `hmac_nonce` = NULL WHERE `status` = 'processing' AND `locked_at` < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 15 MINUTE)");

            $this->pdo->beginTransaction();
            $worker = bin2hex(random_bytes(16));
            $upd = $this->pdo->prepare("UPDATE `outbox_events` SET `status` = 'processing', `locked_at` = UTC_TIMESTAMP(), `hmac_nonce` = ? WHERE `status` = 'pending' AND `next_retry_at` <= UTC_TIMESTAMP() ORDER BY `id` ASC LIMIT $limit");
            $upd->bindValue(1, $worker, PDO::PARAM_STR);
            $upd->execute();
            $stmt->execute([$worker]);
            $events = $stmt->fetchAll(PDO::FETCH_ASSOC);

            if (empty($events)) {
                $this->pdo->commit();
                return 0;
            }

            // lock is already acquired
            
            $this->pdo->commit();
        } catch (\Throwable $e) {
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

    private function processEvent(array $event): void
    {
        $id = (int) $event['id'];
        $payload = json_decode($event['payload'], true);
        $retryCount = (int) $event['retry_count'];

        $nonce = bin2hex(random_bytes(16));
        $timestamp = time();

        $envelope = [
            'id' => $id,
            'timestamp' => $timestamp,
            'nonce' => $nonce,
            'data' => $payload
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
            'X-Webhook-Signature: sha256=' . $signature
        ]);
        curl_setopt($ch, CURLOPT_TIMEOUT, $this->timeout);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

        if ($response === false) {
            $errorMsg = curl_error($ch);
        } else if ($httpCode < 200 || $httpCode >= 300) {
            $errorMsg = "HTTP Error $httpCode: $response";
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
            $retryCount++;
            if ($retryCount >= $this->maxRetries) {
                $status = 'failed';
                $next = 'UTC_TIMESTAMP()'; // doesn't matter
            } else {
                $status = 'pending';
                // Exponential backoff: 2, 4, 8, 16... minutes
                $minutes = pow(2, $retryCount);
                $next = "DATE_ADD(UTC_TIMESTAMP(), INTERVAL $minutes MINUTE)";
            }

            $upd = $this->pdo->prepare("
                UPDATE `outbox_events`
                SET `status` = ?, `retry_count` = ?, `next_retry_at` = $next, `last_error` = ?, `locked_at` = NULL
                WHERE `id` = ?
            ");
            $upd->execute([$status, $retryCount, substr($errorMsg, 0, 1000), $id]);
        }
    }
}
