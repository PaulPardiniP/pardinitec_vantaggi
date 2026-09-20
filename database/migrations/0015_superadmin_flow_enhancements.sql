-- Migración 0015: Mejoras al flujo de Super Admin (Lotes de tarjetas, Invitaciones de Propietario y Ciclo de Vida GDPR)
-- Pardinitec Vantaggi

-- 1. Añadir batch_id a cards para agrupación persistente de lotes
ALTER TABLE `cards`
    ADD COLUMN `batch_id` VARCHAR(36) NULL AFTER `design_profile_id`,
    ADD INDEX `idx_cards_batch_id` (`batch_id`);

-- 2. Añadir campos de archivo y ciclo de vida GDPR a businesses
ALTER TABLE `businesses`
    ADD COLUMN `is_archived` TINYINT(1) NOT NULL DEFAULT 0 AFTER `status`,
    ADD COLUMN `terminated_at` DATETIME NULL AFTER `is_archived`,
    ADD COLUMN `scheduled_deletion_at` DATETIME NULL AFTER `terminated_at`,
    ADD INDEX `idx_businesses_archived` (`is_archived`),
    ADD INDEX `idx_businesses_deletion` (`scheduled_deletion_at`);

-- 3. Tabla para invitaciones a nuevos propietarios/miembros (almacenamiento de token sólo en hash SHA-256)
CREATE TABLE IF NOT EXISTS `business_invitations` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `business_id` INT UNSIGNED NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `first_name` VARCHAR(100) NOT NULL,
    `last_name` VARCHAR(100) NOT NULL,
    `role` ENUM('owner', 'manager', 'staff') NOT NULL DEFAULT 'owner',
    `token_hash` VARCHAR(64) NOT NULL UNIQUE,
    `status` ENUM('pending', 'accepted', 'cancelled', 'expired') NOT NULL DEFAULT 'pending',
    `expires_at` DATETIME NOT NULL,
    `created_by_user_id` INT UNSIGNED NULL,
    `accepted_at` DATETIME NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT `fk_invitations_biz` FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_invitations_creator` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
    INDEX `idx_invitations_email_status` (`email`, `status`),
    INDEX `idx_invitations_biz_status` (`business_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

