<?php

declare(strict_types=1);

namespace App\Modules\Points;

use App\Core\Database\Connection;
use InvalidArgumentException;
use PDO;

final class LoyaltyProgramService
{
    private PDO $pdo;

    public function __construct(?PDO $pdo = null)
    {
        $this->pdo = $pdo ?? Connection::get();
    }

    /**
     * Obtiene la configuración del programa de fidelización y puntos de un negocio.
     * Si no existe todavía, crea la configuración por defecto (puntos fijos por compra: 10 pts).
     *
     * @return array{id: int, business_id: int, program_type: string, fixed_points: int, points_per_currency_unit: float, currency: string, status: string}
     */
    public function getProgram(int $businessId): array
    {
        $stmt = $this->pdo->prepare("
            SELECT * FROM `loyalty_programs`
            WHERE `business_id` = :business_id
            LIMIT 1
        ");
        $stmt->execute(['business_id' => $businessId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$row) {
            // Inicializar por defecto
            $init = $this->pdo->prepare("
                INSERT INTO `loyalty_programs` (
                    `business_id`, `program_type`, `fixed_points`, `points_per_currency_unit`, `currency`, `status`
                ) VALUES (
                    :business_id, 'fixed_per_purchase', 10, 1.00, 'EUR', 'active'
                )
            ");
            $init->execute(['business_id' => $businessId]);

            return $this->getProgram($businessId);
        }

        return [
            'id' => (int) $row['id'],
            'business_id' => (int) $row['business_id'],
            'program_type' => (string) $row['program_type'],
            'fixed_points' => (int) $row['fixed_points'],
            'points_per_currency_unit' => (float) $row['points_per_currency_unit'],
            'currency' => (string) $row['currency'],
            'status' => (string) $row['status'],
        ];
    }

    /**
     * Actualiza la configuración del programa de puntos de un negocio.
     *
     * @param array<string, mixed> $data
     * @return array{id: int, business_id: int, program_type: string, fixed_points: int, points_per_currency_unit: float, currency: string, status: string}
     */
    public function updateProgram(int $businessId, array $data): array
    {
        $allowedTypes = ['fixed_per_purchase', 'points_per_amount', 'manual'];

        $current = $this->getProgram($businessId);

        $programType = isset($data['program_type']) ? (string) $data['program_type'] : $current['program_type'];
        if (!in_array($programType, $allowedTypes, true)) {
            throw new InvalidArgumentException("Tipo de programa inválido: '{$programType}'. Permitidos: " . implode(', ', $allowedTypes));
        }

        $fixedPoints = isset($data['fixed_points']) ? max(0, (int) $data['fixed_points']) : $current['fixed_points'];
        $pointsPerUnit = isset($data['points_per_currency_unit']) ? max(0.01, (float) $data['points_per_currency_unit']) : $current['points_per_currency_unit'];
        $currency = isset($data['currency']) ? strtoupper(trim((string) $data['currency'])) : $current['currency'];
        $status = isset($data['status']) && in_array($data['status'], ['active', 'inactive'], true) ? (string) $data['status'] : $current['status'];

        $stmt = $this->pdo->prepare("
            UPDATE `loyalty_programs`
            SET `program_type` = :program_type,
                `fixed_points` = :fixed_points,
                `points_per_currency_unit` = :points_per_unit,
                `currency` = :currency,
                `status` = :status,
                `updated_at` = UTC_TIMESTAMP()
            WHERE `business_id` = :business_id
        ");
        $stmt->execute([
            'program_type' => $programType,
            'fixed_points' => $fixedPoints,
            'points_per_unit' => $pointsPerUnit,
            'currency' => $currency,
            'status' => $status,
            'business_id' => $businessId,
        ]);

        return $this->getProgram($businessId);
    }

    /**
     * Calcula los puntos que corresponden según la modalidad configurada en el comercio.
     */
    public function calculatePoints(int $businessId, float $spentAmount): int
    {
        $program = $this->getProgram($businessId);

        if ($program['status'] !== 'active') {
            return 0;
        }

        return match ($program['program_type']) {
            'fixed_per_purchase' => $program['fixed_points'],
            'points_per_amount' => (int) floor(max(0.0, $spentAmount) * $program['points_per_currency_unit']),
            'manual' => 0,
            default => 0,
        };
    }
}
