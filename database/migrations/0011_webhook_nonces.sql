CREATE TABLE `webhook_nonces` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `nonce` VARCHAR(128) NOT NULL,
    `created_at` DATETIME NOT NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_webhook_nonce` (`nonce`),
    INDEX `idx_webhook_nonce_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
