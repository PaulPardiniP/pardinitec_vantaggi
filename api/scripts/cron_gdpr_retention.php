<?php

declare(strict_types=1);

require_once __DIR__ . '/../bootstrap.php';

use App\Core\Database\Connection;
use App\Modules\Businesses\BusinessService;

try {
    $pdo = Connection::get();
    $businessService = new BusinessService($pdo);
    $processedCount = $businessService->processExpiredGdprDeletions();
    echo date('Y-m-d H:i:s') . " [GDPR Cron] Processed {$processedCount} expired businesses.\n";
} catch (\Throwable $e) {
    echo date('Y-m-d H:i:s') . " [GDPR Cron Error] " . $e->getMessage() . "\n";
    exit(1);
}
