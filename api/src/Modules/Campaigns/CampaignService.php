<?php

declare(strict_types=1);

namespace App\Modules\Campaigns;

use PDO;
use RuntimeException;
use App\Core\Audit\AuditLogger;

final class CampaignService
{
    private PDO $pdo;
    private AuditLogger $audit;

    public function __construct(PDO $pdo, AuditLogger $audit)
    {
        $this->pdo = $pdo;
        $this->audit = $audit;
    }

    public function listCampaigns(int $businessId, int $page = 1, int $perPage = 50): array
    {
        $offset = ($page - 1) * $perPage;

        $countSql = "SELECT COUNT(*) FROM `campaigns` WHERE `business_id` = ?";
        $stmtCount = $this->pdo->prepare($countSql);
        $stmtCount->execute([$businessId]);
        $total = (int) $stmtCount->fetchColumn();

        $sql = "
            SELECT `id`, `name`, `channel`, `status`, `scheduled_at`, `recipient_count`, `sent_count`, `failed_count`, `created_at`
            FROM `campaigns`
            WHERE `business_id` = :biz
            ORDER BY `id` DESC
            LIMIT :limit OFFSET :offset
        ";
        $stmt = $this->pdo->prepare($sql);
        $stmt->bindValue('biz', $businessId, PDO::PARAM_INT);
        $stmt->bindValue('limit', $perPage, PDO::PARAM_INT);
        $stmt->bindValue('offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        
        return [
            'data' => $stmt->fetchAll(PDO::FETCH_ASSOC),
            'pagination' => [
                'page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'total_pages' => ceil($total / $perPage),
            ]
        ];
    }

    public function createCampaign(int $businessId, array $data, ?int $actorUserId): array
    {
        $name = trim($data['name'] ?? '');
        $channel = trim($data['channel'] ?? 'email');
        $body = trim($data['body'] ?? '');
        $subject = isset($data['subject']) ? trim($data['subject']) : null;

        if ($name === '' || $body === '') {
            throw new RuntimeException('Nombre y cuerpo son requeridos');
        }
        if (!in_array($channel, ['email', 'sms', 'whatsapp', 'push'])) {
            throw new RuntimeException('Canal inválido');
        }

        try {
            $this->pdo->beginTransaction();

            $stmt = $this->pdo->prepare("
                INSERT INTO `campaigns` (`business_id`, `created_by`, `name`, `channel`, `subject`, `body`, `status`)
                VALUES (?, ?, ?, ?, ?, ?, 'draft')
            ");
            $stmt->execute([$businessId, $actorUserId, $name, $channel, $subject, $body]);
            $id = (int) $this->pdo->lastInsertId();

            $this->audit->log('campaign.created', 'campaigns', $id, ['name' => $name, 'channel' => $channel], $actorUserId, $businessId);

            $this->pdo->commit();
            return $this->getCampaign($businessId, $id);
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }

    public function updateCampaign(int $businessId, int $campaignId, array $data, ?int $actorUserId): array
    {
        $campaign = $this->getCampaign($businessId, $campaignId);
        if ($campaign['status'] !== 'draft') {
            throw new RuntimeException('Solo se pueden editar campañas en borrador');
        }

        $name = trim($data['name'] ?? $campaign['name']);
        $channel = trim($data['channel'] ?? $campaign['channel']);
        $body = trim($data['body'] ?? $campaign['body']);
        $subject = array_key_exists('subject', $data) ? $data['subject'] : $campaign['subject'];

        try {
            $this->pdo->beginTransaction();

            $stmt = $this->pdo->prepare("
                UPDATE `campaigns`
                SET `name` = ?, `channel` = ?, `subject` = ?, `body` = ?
                WHERE `id` = ? AND `business_id` = ?
            ");
            $stmt->execute([$name, $channel, $subject, $body, $campaignId, $businessId]);

            $this->audit->log('campaign.updated', 'campaigns', $campaignId, ['name' => $name, 'channel' => $channel], $actorUserId, $businessId);

            $this->pdo->commit();
            return $this->getCampaign($businessId, $campaignId);
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }

    public function confirmCampaign(int $businessId, int $campaignId, ?int $actorUserId): array
    {
        try {
            $this->pdo->beginTransaction();

            $stmt = $this->pdo->prepare("SELECT * FROM `campaigns` WHERE `id` = ? AND `business_id` = ? FOR UPDATE");
            $stmt->execute([$campaignId, $businessId]);
            $campaign = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$campaign) {
                throw new RuntimeException('Campaña no encontrada');
            }
            if (!in_array($campaign['status'], ['draft', 'scheduled'])) {
                throw new RuntimeException('La campaña ya fue confirmada');
            }

            // Seleccionar clientes con el último consentimiento de marketing en estado 'granted' (ordenado por created_at + id)
            $custStmt = $this->pdo->prepare("
                SELECT c.`id`, c.`email`, c.`phone`
                FROM `customers` c
                JOIN `consents` cc ON cc.`id` = (
                    SELECT c2.`id`
                    FROM `consents` c2
                    WHERE c2.`customer_id` = c.`id`
                      AND c2.`business_id` = c.`business_id`
                      AND c2.`type` = 'marketing'
                    ORDER BY c2.`created_at` DESC, c2.`id` DESC
                    LIMIT 1
                )
                WHERE c.`business_id` = ?
                  AND cc.`status` = 'granted'
                  AND cc.`revoked_at` IS NULL
            ");
            $custStmt->execute([$businessId]);
            $customers = $custStmt->fetchAll(PDO::FETCH_ASSOC);

            $recipientsCreated = 0;
            
            $insRecip = $this->pdo->prepare("
                INSERT IGNORE INTO `campaign_recipients` (`campaign_id`, `customer_id`, `channel_address`, `consent_verified_at`)
                VALUES (?, ?, ?, UTC_TIMESTAMP())
            ");
            
            $insOutbox = $this->pdo->prepare("
                INSERT INTO `outbox_events` (`campaign_id`, `recipient_id`, `business_id`, `event_type`, `payload`)
                VALUES (?, ?, ?, 'campaign.message', ?)
            ");

            foreach ($customers as $cust) {
                $address = $campaign['channel'] === 'email' ? $cust['email'] : $cust['phone'];
                if (empty($address)) {
                    continue;
                }

                $insRecip->execute([$campaignId, $cust['id'], $address]);
                
                if ($insRecip->rowCount() > 0) {
                    $recipId = (int) $this->pdo->lastInsertId();
                    $recipientsCreated++;

                    $payload = json_encode([
                        'campaign_id' => $campaignId,
                        'customer_id' => $cust['id'],
                        'channel' => $campaign['channel'],
                        'address' => $address,
                        'subject' => $campaign['subject'],
                        'body' => $campaign['body']
                    ]);

                    $insOutbox->execute([$campaignId, $recipId, $businessId, $payload]);
                }
            }

            $update = $this->pdo->prepare("
                UPDATE `campaigns` 
                SET `status` = 'processing', `recipient_count` = ?, `confirmed_at` = UTC_TIMESTAMP()
                WHERE `id` = ?
            ");
            $update->execute([$recipientsCreated, $campaignId]);

            $this->audit->log('campaign.confirmed', 'campaigns', $campaignId, ['recipients' => $recipientsCreated], $actorUserId, $businessId);

            $this->pdo->commit();
            return $this->getCampaign($businessId, $campaignId);
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }

    public function cancelCampaign(int $businessId, int $campaignId, ?int $actorUserId): array
    {
        try {
            $this->pdo->beginTransaction();

            $stmt = $this->pdo->prepare("SELECT `status` FROM `campaigns` WHERE `id` = ? AND `business_id` = ? FOR UPDATE");
            $stmt->execute([$campaignId, $businessId]);
            $status = $stmt->fetchColumn();

            if (!$status) {
                throw new RuntimeException('Campaña no encontrada');
            }
            if (in_array($status, ['completed', 'cancelled'])) {
                throw new RuntimeException('Estado actual no permite cancelación');
            }

            $update = $this->pdo->prepare("UPDATE `campaigns` SET `status` = 'cancelled' WHERE `id` = ?");
            $update->execute([$campaignId]);

            $cancelOutbox = $this->pdo->prepare("UPDATE `outbox_events` SET `status` = 'failed', `last_error` = 'Cancelled by user' WHERE `campaign_id` = ? AND `status` IN ('pending', 'processing')");
            $cancelOutbox->execute([$campaignId]);

            $this->audit->log('campaign.cancelled', 'campaigns', $campaignId, [], $actorUserId, $businessId);

            $this->pdo->commit();
            return $this->getCampaign($businessId, $campaignId);
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }

    public function getCampaign(int $businessId, int $campaignId): array
    {
        $stmt = $this->pdo->prepare("SELECT * FROM `campaigns` WHERE `id` = ? AND `business_id` = ?");
        $stmt->execute([$campaignId, $businessId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$row) {
            throw new RuntimeException('Campaña no encontrada');
        }
        return $row;
    }
}
