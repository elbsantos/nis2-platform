-- Migration 0007: biblioteca canónica de remediação cross-org
-- Aplicar MANUALMENTE no painel Railway → MySQL → Query antes do deploy.
-- Idempotente: usa CREATE TABLE IF NOT EXISTS e ADD COLUMN IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS `remediation_library` (
  `id`            INT AUTO_INCREMENT PRIMARY KEY,
  `cveId`         VARCHAR(50)  NOT NULL,
  `steps`         JSON,
  `effort`        ENUM('low','medium','high') NOT NULL DEFAULT 'medium',
  `nis2Articles`  JSON,
  `promptVersion` INT NOT NULL DEFAULT 1,
  `createdAt`     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt`     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_lib_cve` (`cveId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
