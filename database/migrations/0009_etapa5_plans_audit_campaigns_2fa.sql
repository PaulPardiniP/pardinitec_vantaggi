-- =============================================================================
-- MIGRACIÓN 0009: Planes, Módulos, Auditoría, Campañas, Outbox, 2FA, Privacidad
-- Etapa 5 – Pardinitec Vantaggi
-- =============================================================================

-- ─── 1. PLANES Y MÓDULOS CONTRATADOS ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `plans` (
    `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `name`        VARCHAR(100) NOT NULL,
    `description` TEXT         NULL,
    `price_eur`   DECIMAL(8,2) NOT NULL DEFAULT 0.00,
    `is_active`   TINYINT(1)   NOT NULL DEFAULT 1,
    `created_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_plans_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `plan_modules` (
    `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `plan_id`     INT UNSIGNED NOT NULL,
    `module_code` VARCHAR(50)  NOT NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_plan_module` (`plan_id`, `module_code`),
    CONSTRAINT `fk_plan_modules_plan` FOREIGN KEY (`plan_id`)
        REFERENCES `plans` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `business_plans` (
    `id`               INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `business_id`      INT UNSIGNED NOT NULL,
    `plan_id`          INT UNSIGNED NOT NULL,
    `assigned_at`      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `assigned_by_user_id` INT UNSIGNED NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_business_plan` (`business_id`),
    CONSTRAINT `fk_bp_business` FOREIGN KEY (`business_id`)
        REFERENCES `businesses` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_bp_plan` FOREIGN KEY (`plan_id`)
        REFERENCES `plans` (`id`) ON DELETE RESTRICT,
    CONSTRAINT `fk_bp_user` FOREIGN KEY (`assigned_by_user_id`)
        REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed de planes básicos
INSERT IGNORE INTO `plans` (`name`, `description`, `price_eur`) VALUES
    ('Starter',    'Piano base: Punti e credenziali digitali', 0.00),
    ('Business',   'Punti, Premi, Offerte e Campagne',         29.00),
    ('Enterprise', 'Tutti i moduli inclusi VIP e Analytics',   79.00);

INSERT IGNORE INTO `plan_modules` (`plan_id`, `module_code`) VALUES
    (1, 'points'), (1, 'digital_credentials'),
    (2, 'points'), (2, 'digital_credentials'), (2, 'rewards'), (2, 'offers'), (2, 'campaigns'),
    (3, 'points'), (3, 'digital_credentials'), (3, 'rewards'), (3, 'offers'),
    (3, 'campaigns'), (3, 'vip_offers'), (3, 'analytics');

-- ─── 2. AUDIT LOGS (APPEND-ONLY) ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `audit_logs` (
    `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `business_id`   INT UNSIGNED    NULL,
    `actor_user_id` INT UNSIGNED    NULL,
    `action`        VARCHAR(100)    NOT NULL,
    `resource`      VARCHAR(100)    NOT NULL,
    `resource_id`   INT UNSIGNED    NULL,
    `meta`          JSON            NULL,
    `ip_address`    VARCHAR(45)     NULL,
    `created_at`    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_audit_business`  (`business_id`, `created_at`),
    KEY `idx_audit_actor`     (`actor_user_id`),
    KEY `idx_audit_resource`  (`resource`, `resource_id`),
    KEY `idx_audit_action`    (`action`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Append-only audit trail. No UPDATE or DELETE allowed via application.';

-- ─── 3. CAMPAÑAS ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `campaigns` (
    `id`             INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `business_id`    INT UNSIGNED NOT NULL,
    `created_by`     INT UNSIGNED NULL,
    `name`           VARCHAR(255) NOT NULL,
    `channel`        ENUM('email','sms','whatsapp','push') NOT NULL DEFAULT 'email',
    `subject`        VARCHAR(255) NULL,
    `body`           TEXT         NOT NULL,
    `status`         ENUM('draft','scheduled','processing','completed','failed','cancelled')
                     NOT NULL DEFAULT 'draft',
    `scheduled_at`   DATETIME     NULL,
    `confirmed_at`   DATETIME     NULL,
    `completed_at`   DATETIME     NULL,
    `recipient_count` INT UNSIGNED NOT NULL DEFAULT 0,
    `sent_count`     INT UNSIGNED NOT NULL DEFAULT 0,
    `failed_count`   INT UNSIGNED NOT NULL DEFAULT 0,
    `created_at`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_campaigns_business_status` (`business_id`, `status`),
    CONSTRAINT `fk_campaigns_business` FOREIGN KEY (`business_id`)
        REFERENCES `businesses` (`id`) ON DELETE RESTRICT,
    CONSTRAINT `fk_campaigns_user` FOREIGN KEY (`created_by`)
        REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `campaign_recipients` (
    `id`               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `campaign_id`      INT UNSIGNED    NOT NULL,
    `customer_id`      INT UNSIGNED    NOT NULL,
    `channel_address`  VARCHAR(320)    NULL COMMENT 'email, phone number, etc.',
    `consent_verified_at` DATETIME     NOT NULL,
    `status`           ENUM('pending','sent','failed','unsubscribed') NOT NULL DEFAULT 'pending',
    `created_at`       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_campaign_recipient` (`campaign_id`, `customer_id`),
    CONSTRAINT `fk_cr_campaign`  FOREIGN KEY (`campaign_id`)
        REFERENCES `campaigns` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_cr_customer`  FOREIGN KEY (`customer_id`)
        REFERENCES `customers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 4. OUTBOX EVENTS ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `outbox_events` (
    `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `campaign_id`    INT UNSIGNED    NULL,
    `recipient_id`   BIGINT UNSIGNED NULL,
    `business_id`    INT UNSIGNED    NOT NULL,
    `event_type`     VARCHAR(100)    NOT NULL DEFAULT 'campaign.message',
    `payload`        JSON            NOT NULL,
    `status`         ENUM('pending','processing','sent','failed') NOT NULL DEFAULT 'pending',
    `retry_count`    TINYINT UNSIGNED NOT NULL DEFAULT 0,
    `max_retries`    TINYINT UNSIGNED NOT NULL DEFAULT 3,
    `next_retry_at`  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `locked_at`      DATETIME        NULL,
    `hmac_nonce`     VARCHAR(64)     NULL,
    `sent_at`        DATETIME        NULL,
    `last_error`     TEXT            NULL,
    `created_at`     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_outbox_dispatch`  (`status`, `next_retry_at`),
    KEY `idx_outbox_campaign`  (`campaign_id`),
    KEY `idx_outbox_business`  (`business_id`),
    CONSTRAINT `fk_outbox_campaign`   FOREIGN KEY (`campaign_id`)
        REFERENCES `campaigns` (`id`) ON DELETE SET NULL,
    CONSTRAINT `fk_outbox_recipient`  FOREIGN KEY (`recipient_id`)
        REFERENCES `campaign_recipients` (`id`) ON DELETE SET NULL,
    CONSTRAINT `fk_outbox_business`   FOREIGN KEY (`business_id`)
        REFERENCES `businesses` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 5. 2FA TOTP ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `totp_secrets` (
    `id`                     INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id`                INT UNSIGNED NOT NULL,
    `secret_encrypted`       VARCHAR(512) NOT NULL COMMENT 'Base32 secret, stored encrypted with APP_SECRET_KEY',
    `is_active`              TINYINT(1)   NOT NULL DEFAULT 0,
    `activated_at`           DATETIME     NULL,
    `recovery_codes_hash`    JSON         NULL     COMMENT 'Array of bcrypt hashes of 8 recovery codes',
    `recovery_codes_used`    JSON         NULL     COMMENT 'Timestamps of used codes by index',
    `created_at`             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_totp_user` (`user_id`),
    CONSTRAINT `fk_totp_user` FOREIGN KEY (`user_id`)
        REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Agregar columna totp_enabled a users
ALTER TABLE `users`
    ADD COLUMN IF NOT EXISTS `totp_enabled` TINYINT(1) NOT NULL DEFAULT 0
    AFTER `is_super_admin`;

-- ─── 6. SOLICITUDES DE PRIVACIDAD ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `privacy_requests` (
    `id`             INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `business_id`    INT UNSIGNED NOT NULL,
    `customer_id`    INT UNSIGNED NOT NULL,
    `requested_by`   INT UNSIGNED NULL,
    `type`           ENUM('export','correction','anonymize','deletion') NOT NULL,
    `status`         ENUM('pending','processing','completed','failed') NOT NULL DEFAULT 'pending',
    `notes`          TEXT         NULL,
    `completed_at`   DATETIME     NULL,
    `created_at`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_privacy_business_customer` (`business_id`, `customer_id`),
    CONSTRAINT `fk_pr_business`  FOREIGN KEY (`business_id`)
        REFERENCES `businesses` (`id`) ON DELETE RESTRICT,
    CONSTRAINT `fk_pr_customer`  FOREIGN KEY (`customer_id`)
        REFERENCES `customers` (`id`) ON DELETE RESTRICT,
    CONSTRAINT `fk_pr_user`      FOREIGN KEY (`requested_by`)
        REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
