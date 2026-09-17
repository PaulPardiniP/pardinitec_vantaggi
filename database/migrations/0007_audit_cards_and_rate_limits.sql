-- Migración 0007: Auditoría de tarjetas físicas, relaciones con usuarios y rate limiting
-- Alineado estrictamente con el Contrato Técnico v7 y auditoría de la Etapa 2

-- 1. Columnas de auditoría y reprogramabilidad en cards
-- Tipos de datos deben coincidir exactamente con users.id (INT UNSIGNED)
ALTER TABLE `cards`
    ADD COLUMN `created_by_user_id` INT UNSIGNED NULL AFTER `design_profile_id`,
    ADD COLUMN `assigned_by_user_id` INT UNSIGNED NULL AFTER `created_by_user_id`,
    ADD COLUMN `is_reprogrammable` TINYINT(1) NOT NULL DEFAULT 1 AFTER `assigned_by_user_id`,
    ADD CONSTRAINT `fk_cards_created_by` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
    ADD CONSTRAINT `fk_cards_assigned_by` FOREIGN KEY (`assigned_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL;

-- 2. Tabla para Rate Limiting seguro y con preservación de privacidad (sin PII ni tokens planos)
CREATE TABLE IF NOT EXISTS `rate_limits` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `action` VARCHAR(50) NOT NULL,
    `identifier_hash` VARCHAR(64) NOT NULL,
    `hits` INT UNSIGNED NOT NULL DEFAULT 1,
    `first_hit_at` DATETIME NOT NULL,
    `last_hit_at` DATETIME NOT NULL,
    `expires_at` DATETIME NOT NULL,
    UNIQUE KEY `uk_action_identifier` (`action`, `identifier_hash`),
    INDEX `idx_rate_limits_expires` (`expires_at`),
    INDEX `idx_rate_limits_action_expires` (`action`, `expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
