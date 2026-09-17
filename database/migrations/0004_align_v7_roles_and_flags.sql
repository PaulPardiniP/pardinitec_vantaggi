-- Migración 0004: Alineación con Contrato Técnico v7
-- 1. Agregar columna is_super_admin a users
ALTER TABLE `users`
    ADD COLUMN `is_super_admin` BOOLEAN NOT NULL DEFAULT FALSE AFTER `status`,
    ADD INDEX `idx_users_is_super_admin` (`is_super_admin`);

-- 2. Agregar columna self_registration_enabled a businesses (Regla 8B: false por defecto)
ALTER TABLE `businesses`
    ADD COLUMN `self_registration_enabled` BOOLEAN NOT NULL DEFAULT FALSE AFTER `status`,
    ADD INDEX `idx_businesses_self_reg` (`self_registration_enabled`);

-- 3. Actualizar enum de roles en business_memberships: reemplazar cashier por staff
-- Primero expandimos el enum para permitir staff junto a cashier
ALTER TABLE `business_memberships`
    MODIFY COLUMN `role` ENUM('owner', 'manager', 'cashier', 'staff') NOT NULL DEFAULT 'staff';

-- Migramos los datos existentes de cashier a staff
UPDATE `business_memberships`
    SET `role` = 'staff'
    WHERE `role` = 'cashier';

-- Consolidamos el enum final sin cashier
ALTER TABLE `business_memberships`
    MODIFY COLUMN `role` ENUM('owner', 'manager', 'staff') NOT NULL DEFAULT 'staff';
