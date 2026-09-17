-- Migración 0005: Creación de tablas para Customers, Consents, Card Profiles, Loyalty Accounts y Access Credentials
-- Alineado estrictamente con el Contrato Técnico v7

-- 1. Tabla de Perfiles de Tarjetas (card_profiles)
CREATE TABLE IF NOT EXISTS `card_profiles` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `code` VARCHAR(50) NOT NULL UNIQUE,
    `name` VARCHAR(100) NOT NULL,
    `status` ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX `idx_card_profiles_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sembrado de perfiles estándar por defecto
INSERT IGNORE INTO `card_profiles` (`code`, `name`, `status`) VALUES
('punti', 'Punti', 'active'),
('vantaggi', 'Vantaggi', 'active'),
('vip', 'VIP', 'active');

-- 2. Tabla de Clientes (customers)
CREATE TABLE IF NOT EXISTS `customers` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `business_id` INT UNSIGNED NOT NULL,
    `first_name` VARCHAR(100) NOT NULL,
    `last_name` VARCHAR(100) NOT NULL,
    `phone` VARCHAR(50) NULL,
    `email` VARCHAR(150) NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT `fk_customers_business` FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`) ON DELETE CASCADE,
    INDEX `idx_customers_business_phone` (`business_id`, `phone`),
    INDEX `idx_customers_business_email` (`business_id`, `email`),
    INDEX `idx_customers_business_created` (`business_id`, `created_at`),
    INDEX `idx_customers_business_name` (`business_id`, `last_name`, `first_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Tabla de Consentimientos (consents)
CREATE TABLE IF NOT EXISTS `consents` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `business_id` INT UNSIGNED NOT NULL,
    `customer_id` INT UNSIGNED NOT NULL,
    `type` ENUM('privacy', 'marketing') NOT NULL,
    `status` ENUM('granted', 'revoked') NOT NULL DEFAULT 'granted',
    `source` VARCHAR(50) NOT NULL DEFAULT 'in_store_staff',
    `text_version` VARCHAR(50) NOT NULL DEFAULT 'v1.0',
    `granted_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `revoked_at` DATETIME NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT `fk_consents_business` FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_consents_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE,
    INDEX `idx_consents_customer_type` (`customer_id`, `type`),
    INDEX `idx_consents_business_customer` (`business_id`, `customer_id`),
    INDEX `idx_consents_business_type_status` (`business_id`, `type`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Tabla de Cuentas de Fidelización (loyalty_accounts)
CREATE TABLE IF NOT EXISTS `loyalty_accounts` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `business_id` INT UNSIGNED NOT NULL,
    `customer_id` INT UNSIGNED NOT NULL,
    `card_profile_id` INT UNSIGNED NOT NULL,
    `balance` INT NOT NULL DEFAULT 0,
    `status` ENUM('active', 'suspended', 'closed') NOT NULL DEFAULT 'active',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT `fk_loyalty_business` FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_loyalty_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_loyalty_card_profile` FOREIGN KEY (`card_profile_id`) REFERENCES `card_profiles` (`id`) ON DELETE RESTRICT,
    UNIQUE KEY `uk_business_customer_profile` (`business_id`, `customer_id`, `card_profile_id`),
    INDEX `idx_loyalty_business_customer` (`business_id`, `customer_id`),
    INDEX `idx_loyalty_business_status` (`business_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Tabla de Credenciales de Acceso (access_credentials)
CREATE TABLE IF NOT EXISTS `access_credentials` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `business_id` INT UNSIGNED NOT NULL,
    `loyalty_account_id` INT UNSIGNED NOT NULL,
    `card_id` INT UNSIGNED NULL,
    `type` ENUM('digital', 'physical') NOT NULL DEFAULT 'digital',
    `public_token_hash` VARCHAR(64) NOT NULL UNIQUE,
    `status` ENUM('active', 'suspended', 'revoked', 'replaced') NOT NULL DEFAULT 'active',
    `issued_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `revoked_at` DATETIME NULL,
    `replaced_by_credential_id` INT UNSIGNED NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT `fk_credentials_business` FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_credentials_loyalty` FOREIGN KEY (`loyalty_account_id`) REFERENCES `loyalty_accounts` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_credentials_replaced_by` FOREIGN KEY (`replaced_by_credential_id`) REFERENCES `access_credentials` (`id`) ON DELETE SET NULL,
    INDEX `idx_credentials_token_hash` (`public_token_hash`),
    INDEX `idx_credentials_loyalty_status` (`loyalty_account_id`, `status`),
    INDEX `idx_credentials_business_account` (`business_id`, `loyalty_account_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
