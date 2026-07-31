-- Migration 0008: Perfil da Entidade completo (10 colunas para alimentar os 6 documentos)
-- Aplicar MANUALMENTE no painel Railway → MySQL → Query antes do deploy.
-- Todas as colunas são aditivas e NULL — não tocam em dados existentes.
-- Nota: MySQL 8 não suporta ADD COLUMN IF NOT EXISTS de forma fiável — usar instruções
-- individuais para poder correr/reverter coluna a coluna se algo falhar a meio.

ALTER TABLE `organizations` ADD COLUMN `caeCode`                  VARCHAR(20)     NULL AFTER `keyAssets`;
ALTER TABLE `organizations` ADD COLUMN `legalRepresentativeRole`  VARCHAR(120)    NULL AFTER `caeCode`;
ALTER TABLE `organizations` ADD COLUMN `securityOfficerRole`      VARCHAR(120)    NULL AFTER `legalRepresentativeRole`;
ALTER TABLE `organizations` ADD COLUMN `securityOfficerPhone`     VARCHAR(30)     NULL AFTER `securityOfficerRole`;
ALTER TABLE `organizations` ADD COLUMN `securityOfficerTaxId`     VARCHAR(20)     NULL AFTER `securityOfficerPhone`;
ALTER TABLE `organizations` ADD COLUMN `securityOfficerStartDate` DATE            NULL AFTER `securityOfficerTaxId`;
ALTER TABLE `organizations` ADD COLUMN `ceoName`                  VARCHAR(255)    NULL AFTER `securityOfficerStartDate`;
ALTER TABLE `organizations` ADD COLUMN `employeeCount`            INT             NULL AFTER `ceoName`;
ALTER TABLE `organizations` ADD COLUMN `annualTurnover`           DECIMAL(15,2)   NULL AFTER `employeeCount`;
ALTER TABLE `organizations` ADD COLUMN `annualBalance`            DECIMAL(15,2)   NULL AFTER `annualTurnover`;

-- Rollback (coluna a coluna, ordem inversa):
--   ALTER TABLE `organizations` DROP COLUMN `annualBalance`;
--   ALTER TABLE `organizations` DROP COLUMN `annualTurnover`;
--   ALTER TABLE `organizations` DROP COLUMN `employeeCount`;
--   ALTER TABLE `organizations` DROP COLUMN `ceoName`;
--   ALTER TABLE `organizations` DROP COLUMN `securityOfficerStartDate`;
--   ALTER TABLE `organizations` DROP COLUMN `securityOfficerTaxId`;
--   ALTER TABLE `organizations` DROP COLUMN `securityOfficerPhone`;
--   ALTER TABLE `organizations` DROP COLUMN `securityOfficerRole`;
--   ALTER TABLE `organizations` DROP COLUMN `legalRepresentativeRole`;
--   ALTER TABLE `organizations` DROP COLUMN `caeCode`;
