-- database/manual-migrations/framework_assessments.sql
--
-- Motor de Enquadramento NIS2-PT (DL 125/2025) — tabela de assessments.
-- Aplicar MANUALMENTE no shell MySQL do Railway ANTES do deploy.
-- Verificar com: SHOW TABLES LIKE 'framework_assessments';

CREATE TABLE `framework_assessments` (
  `id`             INT            NOT NULL AUTO_INCREMENT,
  `organizationId` INT            NOT NULL,
  `userId`         INT            NOT NULL,
  `frameworkSlug`  VARCHAR(50)    NOT NULL,
  `answers`        JSON           NULL,
  `decisionPath`   JSON           NULL,
  `legalBasis`     JSON           NULL,
  `classification` VARCHAR(30)    NULL,
  `resultLabel`    VARCHAR(255)   NULL,
  `engineVersion`  VARCHAR(16)    NOT NULL,
  `status`         ENUM('in_progress','completed') NOT NULL DEFAULT 'in_progress',
  `completedAt`    TIMESTAMP      NULL DEFAULT NULL,
  `createdAt`      TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt`      TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_fa_org`  (`organizationId`),
  INDEX `idx_fa_user` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
