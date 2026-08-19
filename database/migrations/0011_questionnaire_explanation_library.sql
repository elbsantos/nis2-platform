-- Migration 0011: biblioteca canónica de explicações do questionário (controlId, sector, size)
-- Aplicar MANUALMENTE no painel Railway → MySQL → Query antes do deploy.
-- Mesmo padrão da 0007 (remediation_library) — CREATE TABLE IF NOT EXISTS (idempotente).
-- Rollback, se necessário:
--   DROP TABLE IF EXISTS questionnaire_explanation_library;

CREATE TABLE IF NOT EXISTS `questionnaire_explanation_library` (
  `id`            INT AUTO_INCREMENT PRIMARY KEY,
  `controlId`     VARCHAR(20) NOT NULL,
  `sector`        VARCHAR(60) NOT NULL,
  `size`          VARCHAR(30) NOT NULL,
  `explanation`   TEXT NOT NULL,
  `promptVersion` INT NOT NULL DEFAULT 1,
  `createdAt`     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt`     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_expl_control_sector_size` (`controlId`, `sector`, `size`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
