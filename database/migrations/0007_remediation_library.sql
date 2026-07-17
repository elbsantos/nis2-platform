-- Migration 0007: biblioteca canónica de remediação (cveId, osKey)
-- Aplicar MANUALMENTE no painel Railway → MySQL → Query antes do deploy.
-- Nota: MySQL 8 não suporta ADD COLUMN IF NOT EXISTS.
-- Este ficheiro usa apenas CREATE TABLE IF NOT EXISTS (idempotente).
-- Se a tabela já existir do 0007 anterior, adicionar as colunas em separado:
--   ALTER TABLE remediation_library ADD COLUMN osKey VARCHAR(20) NOT NULL DEFAULT 'generic';
--   ALTER TABLE remediation_library ADD COLUMN riskSummary TEXT NULL;
--   DROP INDEX uq_lib_cve ON remediation_library;
--   ALTER TABLE remediation_library ADD UNIQUE KEY uq_lib_cve_os (cveId, osKey);

CREATE TABLE IF NOT EXISTS `remediation_library` (
  `id`            INT AUTO_INCREMENT PRIMARY KEY,
  `cveId`         VARCHAR(50)  NOT NULL,
  `osKey`         VARCHAR(20)  NOT NULL DEFAULT 'generic',
  `steps`         JSON,
  `riskSummary`   TEXT,
  `effort`        ENUM('low','medium','high') NOT NULL DEFAULT 'medium',
  `nis2Articles`  JSON,
  `promptVersion` INT NOT NULL DEFAULT 1,
  `createdAt`     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt`     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_lib_cve_os` (`cveId`, `osKey`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
