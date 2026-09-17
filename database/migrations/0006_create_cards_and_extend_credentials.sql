-- Migración 0006: Creación de tabla cards y extensión de access_credentials
-- Alineado estrictamente con el Contrato Técnico v7 - Etapa 2

-- 1. Tabla de Tarjetas Físicas (cards)
CREATE TABLE IF NOT EXISTS `cards` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `business_id` INT UNSIGNED NULL,
    `loyalty_account_id` INT UNSIGNED NULL,
    `design_profile_id` INT UNSIGNED NULL,
    `status` ENUM('inventory', 'issued', 'active', 'suspended', 'revoked', 'replaced') NOT NULL DEFAULT 'inventory',
    `issued_at` DATETIME NULL,
    `assigned_at` DATETIME NULL,
    `revoked_at` DATETIME NULL,
    `replaced_by_card_id` INT UNSIGNED NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT `fk_cards_business` FOREIGN KEY (`business_id`) REFERENCES `businesses` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_cards_loyalty` FOREIGN KEY (`loyalty_account_id`) REFERENCES `loyalty_accounts` (`id`) ON DELETE SET NULL,
    CONSTRAINT `fk_cards_replaced_by` FOREIGN KEY (`replaced_by_card_id`) REFERENCES `cards` (`id`) ON DELETE SET NULL,
    INDEX `idx_cards_status` (`status`),
    INDEX `idx_cards_business_status` (`business_id`, `status`),
    INDEX `idx_cards_loyalty_account` (`loyalty_account_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Extensión de access_credentials para soportar credenciales físicas previas a la vinculación
-- En inventario (inventory) y asignación previa (issued), la tarjeta física aún no tiene business_id o loyalty_account_id
ALTER TABLE `access_credentials`
    MODIFY COLUMN `business_id` INT UNSIGNED NULL,
    MODIFY COLUMN `loyalty_account_id` INT UNSIGNED NULL;

-- 3. Clave foránea e índice para card_id en access_credentials
ALTER TABLE `access_credentials`
    ADD CONSTRAINT `fk_credentials_card` FOREIGN KEY (`card_id`) REFERENCES `cards` (`id`) ON DELETE CASCADE,
    ADD INDEX `idx_credentials_card_id` (`card_id`);
