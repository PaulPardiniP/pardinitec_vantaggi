-- Migración 0014: Añadir columnas notes y delivered_at a reward_redemptions para notas operativas y confirmación de entrega
ALTER TABLE `reward_redemptions`
ADD COLUMN `notes` TEXT NULL AFTER `points_spent`,
ADD COLUMN `delivered_at` DATETIME NULL AFTER `notes`;
