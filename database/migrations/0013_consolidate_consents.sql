-- Trasladar datos válidos de customer_consents a consents si no existen previamente
INSERT INTO `consents` (`business_id`, `customer_id`, `type`, `status`, `granted_at`)
SELECT 
    c.`business_id`, 
    cc.`customer_id`, 
    cc.`type`, 
    IF(cc.`is_granted` = 1, 'granted', 'revoked'), 
    cc.`updated_at`
FROM `customer_consents` cc
JOIN `customers` c ON cc.`customer_id` = c.`id`
WHERE cc.`type` IN ('marketing', 'privacy')
AND NOT EXISTS (
    SELECT 1 FROM `consents` WHERE `customer_id` = cc.`customer_id` AND `type` = cc.`type`
);

-- Actualizar consents si is_granted era diferente y era más reciente (simplificación opcional, pero mejor ignorarlo si la tabla antigua es la canónica, pero bueno, consolidemos)
UPDATE `consents` co
JOIN `customer_consents` cc ON co.`customer_id` = cc.`customer_id` AND co.`type` = cc.`type`
SET 
    co.`status` = IF(cc.`is_granted` = 1, 'granted', 'revoked'),
    co.`revoked_at` = IF(cc.`is_granted` = 0, cc.`updated_at`, NULL)
WHERE cc.`updated_at` > co.`updated_at`;

-- Eliminar tabla duplicada
DROP TABLE `customer_consents`;