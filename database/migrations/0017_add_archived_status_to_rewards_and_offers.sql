-- Migrazione 0017: Aggiunta stato 'archived' a premi e offerte per separare disattivazione da archiviazione storica
ALTER TABLE `rewards` MODIFY COLUMN `status` ENUM('active', 'inactive', 'archived') NOT NULL DEFAULT 'active';
ALTER TABLE `offers` MODIFY COLUMN `status` ENUM('active', 'inactive', 'expired', 'archived') NOT NULL DEFAULT 'active';
