-- Migration 0005: ADR-001 Fase 1 — backbone controlo→evidência
-- Perfil alargado da empresa + tabela de evidências por controlo.
-- Todas as colunas novas são NULLABLE — sem impacto nos dados existentes.
-- O MODIFY COLUMN em `size` converte de ENUM para VARCHAR preservando os valores.

-- ─── 1. Perfil alargado da tabela organizations ──────────────────────────────

ALTER TABLE `organizations`
  MODIFY COLUMN `size` VARCHAR(50) NULL,
  ADD COLUMN IF NOT EXISTS `legalName`            VARCHAR(255) NULL AFTER `name`,
  ADD COLUMN IF NOT EXISTS `nipc`                 VARCHAR(20)  NULL AFTER `legalName`,
  ADD COLUMN IF NOT EXISTS `address`              VARCHAR(500) NULL AFTER `domain`,
  ADD COLUMN IF NOT EXISTS `securityOfficerName`  VARCHAR(255) NULL AFTER `sector`,
  ADD COLUMN IF NOT EXISTS `securityOfficerEmail` VARCHAR(255) NULL AFTER `securityOfficerName`,
  ADD COLUMN IF NOT EXISTS `keyAssets`            JSON         NULL AFTER `securityOfficerEmail`;

-- ─── 2. Tabela de evidências por controlo ────────────────────────────────────

CREATE TABLE IF NOT EXISTS `control_evidence` (
  `id`             INT          NOT NULL AUTO_INCREMENT,
  `organizationId` INT          NOT NULL,
  `controlId`      VARCHAR(20)  NOT NULL COMMENT 'id do controlo em NIS2_CONTROLS (ex.: a-1)',
  `sessionId`      INT          NULL     COMMENT 'FK questionnaire_sessions.id',
  `status`         VARCHAR(20)  NOT NULL DEFAULT 'missing'
                     COMMENT 'missing|in_progress|provided|verified|na',
  `source`         VARCHAR(20)  NOT NULL DEFAULT 'manual'
                     COMMENT 'manual|scan|ai',
  `fileKey`        VARCHAR(500) NULL     COMMENT 'chave S3 do ficheiro carregado',
  `fileName`       VARCHAR(255) NULL,
  `templateId`     VARCHAR(100) NULL     COMMENT 'ligação futura ao docs-catalog',
  `notes`          TEXT         NULL,
  `createdAt`      TIMESTAMP    NOT NULL DEFAULT NOW(),
  `updatedAt`      TIMESTAMP    NOT NULL DEFAULT NOW() ON UPDATE NOW(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_org_control` (`organizationId`, `controlId`),
  INDEX `idx_ce_org` (`organizationId`),
  INDEX `idx_ce_control` (`controlId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
