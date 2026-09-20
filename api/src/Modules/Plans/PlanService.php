<?php

declare(strict_types=1);

namespace App\Modules\Plans;

use PDO;
use RuntimeException;
use App\Core\Audit\AuditLogger;

final class PlanService
{
    private PDO $pdo;
    private AuditLogger $audit;

    public function __construct(PDO $pdo, AuditLogger $audit)
    {
        $this->pdo = $pdo;
        $this->audit = $audit;
    }

    public function listPlans(bool $activeOnly = false): array
    {
        $sql = "
            SELECT p.`id`, p.`name`, p.`description`, p.`price_eur`, p.`is_active`
            FROM `plans` p
        ";
        if ($activeOnly) {
            $sql .= " WHERE p.`is_active` = 1";
        }
        $sql .= " ORDER BY p.`price_eur` ASC";

        $stmt = $this->pdo->query($sql);
        $plans = $stmt->fetchAll(PDO::FETCH_ASSOC);

        if (empty($plans)) {
            return [];
        }

        $planIds = array_column($plans, 'id');
        $placeholders = implode(',', array_fill(0, count($planIds), '?'));
        
        $modStmt = $this->pdo->prepare("SELECT `plan_id`, `module_code` FROM `plan_modules` WHERE `plan_id` IN ($placeholders)");
        $modStmt->execute($planIds);
        $modules = $modStmt->fetchAll(PDO::FETCH_ASSOC);

        $modsByPlan = [];
        foreach ($modules as $m) {
            $modsByPlan[(int) $m['plan_id']][] = $m['module_code'];
        }

        foreach ($plans as &$p) {
            $p['id'] = (int) $p['id'];
            $p['is_active'] = (bool) $p['is_active'];
            $p['price_eur'] = (float) $p['price_eur'];
            $p['modules'] = $modsByPlan[$p['id']] ?? [];
        }

        return $plans;
    }

    public function createPlan(array $data, ?int $actorUserId): array
    {
        $name = trim($data['name'] ?? '');
        if ($name === '') {
            throw new RuntimeException('El nombre del plan es requerido.');
        }

        try {
            $this->pdo->beginTransaction();

            $stmt = $this->pdo->prepare("
                INSERT INTO `plans` (`name`, `description`, `price_eur`, `is_active`)
                VALUES (:name, :desc, :price, :active)
            ");
            $stmt->execute([
                'name'  => $name,
                'desc'  => $data['description'] ?? null,
                'price' => (float) ($data['price_eur'] ?? 0.0),
                'active'=> (int) ($data['is_active'] ?? 1),
            ]);
            $planId = (int) $this->pdo->lastInsertId();

            $modules = $data['modules'] ?? [];
            if (is_array($modules) && !empty($modules)) {
                $this->syncPlanModules($planId, $modules);
            }

            $this->audit->log('plan.created', 'plans', $planId, $data, $actorUserId);

            $this->pdo->commit();
            return $this->getPlan($planId);
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }

    public function updatePlan(int $planId, array $data, ?int $actorUserId): array
    {
        try {
            $this->pdo->beginTransaction();

            $stmt = $this->pdo->prepare("
                UPDATE `plans` 
                SET `name` = :name, `description` = :desc, `price_eur` = :price, `is_active` = :active
                WHERE `id` = :id
            ");
            $stmt->execute([
                'id'    => $planId,
                'name'  => trim($data['name'] ?? ''),
                'desc'  => $data['description'] ?? null,
                'price' => (float) ($data['price_eur'] ?? 0.0),
                'active'=> (int) ($data['is_active'] ?? 1),
            ]);

            if (isset($data['modules']) && is_array($data['modules'])) {
                $this->syncPlanModules($planId, $data['modules']);
            }

            $this->audit->log('plan.updated', 'plans', $planId, $data, $actorUserId);

            $this->pdo->commit();
            return $this->getPlan($planId);
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }

    public function assignPlanToBusiness(int $businessId, int $planId, ?int $actorUserId): void
    {
        $hasOwnTx = !$this->pdo->inTransaction();
        try {
            if ($hasOwnTx) {
                $this->pdo->beginTransaction();
            }

            $stmt = $this->pdo->prepare("SELECT `id` FROM `business_plans` WHERE `business_id` = ? FOR UPDATE");
            $stmt->execute([$businessId]);
            $existing = $stmt->fetchColumn();

            if ($existing) {
                $update = $this->pdo->prepare("
                    UPDATE `business_plans` 
                    SET `plan_id` = ?, `assigned_by_user_id` = ?, `assigned_at` = UTC_TIMESTAMP()
                    WHERE `business_id` = ?
                ");
                $update->execute([$planId, $actorUserId, $businessId]);
            } else {
                $insert = $this->pdo->prepare("
                    INSERT INTO `business_plans` (`business_id`, `plan_id`, `assigned_by_user_id`)
                    VALUES (?, ?, ?)
                ");
                $insert->execute([$businessId, $planId, $actorUserId]);
            }

            $this->audit->log('business.plan_assigned', 'businesses', $businessId, ['plan_id' => $planId], $actorUserId, $businessId);

            if ($hasOwnTx) {
                $this->pdo->commit();
            }
        } catch (\Throwable $e) {
            if ($hasOwnTx && $this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e;
        }
    }

    public function getPlanForBusiness(int $businessId): ?array
    {
        $stmt = $this->pdo->prepare("
            SELECT p.`id`, p.`name`, p.`description`, p.`price_eur`, p.`is_active`, bp.`assigned_at`
            FROM `business_plans` bp
            JOIN `plans` p ON bp.`plan_id` = p.`id`
            WHERE bp.`business_id` = ?
        ");
        $stmt->execute([$businessId]);
        $plan = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$plan) {
            return null;
        }

        $plan['id'] = (int) $plan['id'];
        $plan['is_active'] = (bool) $plan['is_active'];
        $plan['price_eur'] = (float) $plan['price_eur'];

        $modStmt = $this->pdo->prepare("SELECT `module_code` FROM `plan_modules` WHERE `plan_id` = ?");
        $modStmt->execute([$plan['id']]);
        $plan['modules'] = $modStmt->fetchAll(PDO::FETCH_COLUMN);

        return $plan;
    }

    private function getPlan(int $planId): array
    {
        $plans = $this->listPlans();
        foreach ($plans as $p) {
            if ($p['id'] === $planId) {
                return $p;
            }
        }
        throw new RuntimeException("Plan no encontrado");
    }

    private function syncPlanModules(int $planId, array $modules): void
    {
        $del = $this->pdo->prepare("DELETE FROM `plan_modules` WHERE `plan_id` = ?");
        $del->execute([$planId]);

        if (empty($modules)) {
            return;
        }

        $insert = $this->pdo->prepare("INSERT INTO `plan_modules` (`plan_id`, `module_code`) VALUES (?, ?)");
        foreach ($modules as $modCode) {
            $insert->execute([$planId, (string)$modCode]);
        }
    }
}
