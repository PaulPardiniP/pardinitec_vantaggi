<?php

declare(strict_types=1);

namespace App\Modules\Audit;

use App\Core\Http\Request;
use App\Core\Http\Response;
use PDO;

final class AuditController
{
    private PDO $pdo;

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    public function listGlobal(Request $request): void
    {
        $user = $request->getAttribute('user');
        if (empty($user['is_super_admin'])) {
            Response::error('Acceso denegado', 403);
        }

        $this->fetchLogs($request, null);
    }

    public function listForBusiness(Request $request): void
    {
        $businessId = (int) $request->getRouteParam('id');
        $user = $request->getAttribute('user');
        
        $isSuperAdmin = !empty($user['is_super_admin']);
        $role = $request->getAttribute('business_role');

        if (!$isSuperAdmin && (!\App\Modules\Businesses\Permission::can($role, \App\Modules\Businesses\Permission::SETTINGS_MANAGE) || (int) $user['business_id'] !== $businessId)) {
            Response::error('Acceso denegado. Se requiere permiso settings.manage.', 403);
        }

        $this->fetchLogs($request, $businessId);
    }

    private function fetchLogs(Request $request, ?int $businessId): void
    {
        $page = max(1, (int) $request->getQuery('page', 1));
        $perPage = max(1, min(100, (int) $request->getQuery('per_page', 50)));
        $offset = ($page - 1) * $perPage;

        $action = $request->getQuery('action');
        $resource = $request->getQuery('resource');

        $where = [];
        $params = [];

        if ($businessId !== null) {
            $where[] = "`business_id` = :business_id";
            $params['business_id'] = $businessId;
        }

        if ($action) {
            $where[] = "`action` = :action";
            $params['action'] = $action;
        }

        if ($resource) {
            $where[] = "`resource` = :resource";
            $params['resource'] = $resource;
        }

        $whereClause = empty($where) ? "" : "WHERE " . implode(" AND ", $where);

        $countSql = "SELECT COUNT(*) FROM `audit_logs` $whereClause";
        $stmtCount = $this->pdo->prepare($countSql);
        $stmtCount->execute($params);
        $total = (int) $stmtCount->fetchColumn();

        $sql = "
            SELECT 
                al.`id`, al.`action`, al.`resource`, al.`resource_id`, al.`meta`, al.`ip_address`, al.`created_at`,
                u.`first_name` AS `actor_first_name`, u.`last_name` AS `actor_last_name`, u.`email` AS `actor_email`,
                b.`name` AS `business_name`
            FROM `audit_logs` al
            LEFT JOIN `users` u ON al.`actor_user_id` = u.`id`
            LEFT JOIN `businesses` b ON al.`business_id` = b.`id`
            $whereClause
            ORDER BY al.`id` DESC
            LIMIT :limit OFFSET :offset
        ";

        $stmt = $this->pdo->prepare($sql);
        foreach ($params as $k => $v) {
            $stmt->bindValue($k, $v);
        }
        $stmt->bindValue('limit', $perPage, PDO::PARAM_INT);
        $stmt->bindValue('offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        
        $logs = $stmt->fetchAll(PDO::FETCH_ASSOC);

        foreach ($logs as &$log) {
            $log['meta'] = $log['meta'] ? json_decode($log['meta'], true) : null;
        }

        Response::success('Audit logs recuperados', [
            'logs' => $logs,
            'pagination' => [
                'page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'total_pages' => ceil($total / $perPage),
            ]
        ]);
    }
}
