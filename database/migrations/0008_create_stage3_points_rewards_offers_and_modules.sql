-- Migración 0008: Creación de tablas para la Etapa 3 (Módulos, Capacidades, Puntos, Premios y Ofertas)
-- Alineado estrictamente con el Contrato Técnico v7

-- 1. Tabla de Módulos / Capacidades del Sistema (modules)
CREATE TABLE IF NOT EXISTS `modules` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `code` VARCHAR(50) NOT NULL UNIQUE,
    `name` VARCHAR(100) NOT NULL,
    `description` VARCHAR(255) NULL,
    `status` ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX `idx_modules_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sembrado de módulos y capacidades estándar del Contrato v7
INSERT IGNORE INTO `modules` (`code`, `name`, `description`, `status`) VALUES
('points', 'Punti e Saldo', 'Gestione e accumulo punti su acquisti o importi', 'active'),
('rewards', 'Catalogo Premi', 'Catalogo premi e riscatto a punti', 'active'),
('offers', 'Offerte e Promozioni', 'Offerte promozionali e sconti riservati', 'active'),
('benefits', 'Vantaggi e Benefici', 'Accesso a vantaggi esclusivi', 'active'),
('vip_offers', 'Offerte Esclusive VIP', 'Offerte dedicate specificamente ai clienti VIP', 'active'),
('discounts', 'Sconti Riservati', 'Applicazione di sconti percentuali o fissi', 'active');

-- 2. Tabla de Módulos Habilitados por Negocio (business_modules)
CREATE TABLE IF NOT EXISTS `business_modules` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `business_id` INT UNSIGNED NOT NULL,
    `module_id` INT UNSIGNED NOT NULL,
    `is_enabled` TINYINT(1) NOT NULL DEFAULT 1,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT `fk_biz_modules_business` FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_biz_modules_module` FOREIGN KEY (`module_id`) REFERENCES `modules` (`id`) ON DELETE CASCADE,
    UNIQUE KEY `uk_business_module` (`business_id`, `module_id`),
    INDEX `idx_biz_modules_enabled` (`business_id`, `is_enabled`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Tabla de Capacidades por Perfil de Tarjeta (card_profile_modules)
CREATE TABLE IF NOT EXISTS `card_profile_modules` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `card_profile_id` INT UNSIGNED NOT NULL,
    `module_id` INT UNSIGNED NOT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `fk_cp_modules_profile` FOREIGN KEY (`card_profile_id`) REFERENCES `card_profiles` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_cp_modules_module` FOREIGN KEY (`module_id`) REFERENCES `modules` (`id`) ON DELETE CASCADE,
    UNIQUE KEY `uk_profile_module` (`card_profile_id`, `module_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sembrado de relaciones perfil -> capacidades según Contrato Técnico v7:
-- Punti -> points
-- Vantaggi -> points + rewards + offers + benefits
-- VIP -> benefits + vip_offers + discounts
INSERT IGNORE INTO `card_profile_modules` (`card_profile_id`, `module_id`)
SELECT cp.`id`, m.`id`
FROM `card_profiles` cp
JOIN `modules` m ON (
    (cp.`code` = 'punti' AND m.`code` IN ('points')) OR
    (cp.`code` = 'vantaggi' AND m.`code` IN ('points', 'rewards', 'offers', 'benefits')) OR
    (cp.`code` = 'vip' AND m.`code` IN ('benefits', 'vip_offers', 'discounts'))
);

-- Habilitar módulos por defecto para todos los comercios ya existentes
INSERT IGNORE INTO `business_modules` (`business_id`, `module_id`, `is_enabled`)
SELECT b.`id`, m.`id`, 1
FROM `businesses` b
CROSS JOIN `modules` m;

-- 4. Tabla de Configuración del Programa de Puntos (loyalty_programs)
CREATE TABLE IF NOT EXISTS `loyalty_programs` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `business_id` INT UNSIGNED NOT NULL,
    `program_type` ENUM('fixed_per_purchase', 'points_per_amount', 'manual') NOT NULL DEFAULT 'fixed_per_purchase',
    `fixed_points` INT UNSIGNED NOT NULL DEFAULT 10,
    `points_per_currency_unit` DECIMAL(10, 2) NOT NULL DEFAULT 1.00,
    `currency` VARCHAR(3) NOT NULL DEFAULT 'EUR',
    `status` ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT `fk_loyalty_programs_business` FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`) ON DELETE CASCADE,
    UNIQUE KEY `uk_loyalty_programs_business` (`business_id`),
    INDEX `idx_loyalty_programs_status` (`business_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Tabla de Ledger Inmutable de Puntos (points_transactions)
CREATE TABLE IF NOT EXISTS `points_transactions` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `business_id` INT UNSIGNED NOT NULL,
    `loyalty_account_id` INT UNSIGNED NOT NULL,
    `actor_user_id` INT UNSIGNED NULL,
    `type` ENUM('purchase_fixed', 'purchase_amount', 'bonus', 'reward_redeem', 'correction', 'manual_adjustment') NOT NULL,
    `points` INT NOT NULL,
    `balance_after` INT NOT NULL,
    `spent_amount` DECIMAL(10, 2) NULL,
    `reason` VARCHAR(255) NULL,
    `operation_id` VARCHAR(64) NOT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `fk_points_tx_business` FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_points_tx_loyalty_account` FOREIGN KEY (`loyalty_account_id`) REFERENCES `loyalty_accounts` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_points_tx_actor_user` FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
    UNIQUE KEY `uk_points_biz_operation` (`business_id`, `operation_id`),
    INDEX `idx_points_biz_account_created` (`business_id`, `loyalty_account_id`, `created_at`),
    INDEX `idx_points_account_created` (`loyalty_account_id`, `created_at`),
    INDEX `idx_points_operation` (`operation_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Tabla de Catálogo de Premios (rewards)
CREATE TABLE IF NOT EXISTS `rewards` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `business_id` INT UNSIGNED NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `description` TEXT NULL,
    `points_cost` INT UNSIGNED NOT NULL,
    `min_profile_id` INT UNSIGNED NULL,
    `status` ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    `valid_from` DATETIME NULL,
    `valid_until` DATETIME NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT `fk_rewards_business` FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_rewards_min_profile` FOREIGN KEY (`min_profile_id`) REFERENCES `card_profiles` (`id`) ON DELETE SET NULL,
    INDEX `idx_rewards_biz_status` (`business_id`, `status`),
    INDEX `idx_rewards_biz_cost` (`business_id`, `points_cost`),
    INDEX `idx_rewards_validity` (`business_id`, `valid_from`, `valid_until`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Tabla de Canjes de Premios (reward_redemptions)
CREATE TABLE IF NOT EXISTS `reward_redemptions` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `business_id` INT UNSIGNED NOT NULL,
    `loyalty_account_id` INT UNSIGNED NOT NULL,
    `reward_id` INT UNSIGNED NOT NULL,
    `points_spent` INT UNSIGNED NOT NULL,
    `actor_user_id` INT UNSIGNED NULL,
    `operation_id` VARCHAR(64) NOT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `fk_reward_redemptions_biz` FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_reward_redemptions_account` FOREIGN KEY (`loyalty_account_id`) REFERENCES `loyalty_accounts` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_reward_redemptions_reward` FOREIGN KEY (`reward_id`) REFERENCES `rewards` (`id`) ON DELETE RESTRICT,
    CONSTRAINT `fk_reward_redemptions_actor` FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
    UNIQUE KEY `uk_reward_redemptions_biz_op` (`business_id`, `operation_id`),
    INDEX `idx_reward_redemptions_account` (`loyalty_account_id`, `created_at`),
    INDEX `idx_reward_redemptions_biz_created` (`business_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. Tabla de Ofertas y Promociones (offers)
CREATE TABLE IF NOT EXISTS `offers` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `business_id` INT UNSIGNED NOT NULL,
    `title` VARCHAR(150) NOT NULL,
    `description` TEXT NULL,
    `offer_type` ENUM('standard', 'vip_exclusive', 'discount', 'gift') NOT NULL DEFAULT 'standard',
    `required_capability` VARCHAR(50) NOT NULL DEFAULT 'offers',
    `card_profile_id` INT UNSIGNED NULL,
    `is_single_use` TINYINT(1) NOT NULL DEFAULT 1,
    `discount_percentage` DECIMAL(5, 2) NULL,
    `status` ENUM('active', 'inactive', 'expired') NOT NULL DEFAULT 'active',
    `start_date` DATETIME NULL,
    `end_date` DATETIME NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT `fk_offers_business` FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_offers_card_profile` FOREIGN KEY (`card_profile_id`) REFERENCES `card_profiles` (`id`) ON DELETE SET NULL,
    INDEX `idx_offers_biz_status` (`business_id`, `status`),
    INDEX `idx_offers_biz_type` (`business_id`, `offer_type`),
    INDEX `idx_offers_biz_dates` (`business_id`, `start_date`, `end_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. Tabla de Canjes/Uso de Ofertas (offer_redemptions)
CREATE TABLE IF NOT EXISTS `offer_redemptions` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `business_id` INT UNSIGNED NOT NULL,
    `loyalty_account_id` INT UNSIGNED NOT NULL,
    `offer_id` INT UNSIGNED NOT NULL,
    `actor_user_id` INT UNSIGNED NULL,
    `operation_id` VARCHAR(64) NOT NULL,
    `redeemed_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `fk_offer_redemptions_biz` FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_offer_redemptions_account` FOREIGN KEY (`loyalty_account_id`) REFERENCES `loyalty_accounts` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_offer_redemptions_offer` FOREIGN KEY (`offer_id`) REFERENCES `offers` (`id`) ON DELETE RESTRICT,
    CONSTRAINT `fk_offer_redemptions_actor` FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
    UNIQUE KEY `uk_offer_redemptions_biz_op` (`business_id`, `operation_id`),
    INDEX `idx_offer_redemptions_account_offer` (`loyalty_account_id`, `offer_id`),
    INDEX `idx_offer_redemptions_biz_created` (`business_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
