-- Migration 0016: Add encrypted token fields to access_credentials for safe recovery
-- Enables authorized retrieval of digital card links without storing plain text tokens
-- Uses AES-256-GCM (ciphertext, 12-byte IV/nonce, 16-byte authentication tag in base64)

ALTER TABLE `access_credentials`
    ADD COLUMN `encrypted_token` VARCHAR(255) NULL DEFAULT NULL AFTER `public_token_hash`,
    ADD COLUMN `encryption_iv` VARCHAR(64) NULL DEFAULT NULL AFTER `encrypted_token`,
    ADD COLUMN `encryption_tag` VARCHAR(64) NULL DEFAULT NULL AFTER `encryption_iv`;
