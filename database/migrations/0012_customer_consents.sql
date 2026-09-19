CREATE TABLE `customer_consents` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `customer_id` INT UNSIGNED NOT NULL,
    `type` VARCHAR(50) NOT NULL,
    `is_granted` TINYINT(1) NOT NULL DEFAULT 0,
    `updated_at` DATETIME NOT NULL DEFAULT UTC_TIMESTAMP(),
    UNIQUE KEY `uk_customer_consent` (`customer_id`, `type`),
    CONSTRAINT `fk_consent_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;