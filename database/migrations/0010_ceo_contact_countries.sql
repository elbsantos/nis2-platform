-- Migration 0010: ceoContact + countriesOfOperation em organizations
-- Aplicar MANUALMENTE no painel Railway → MySQL → Query antes do deploy.
-- Aditivas e NULL — não tocam em dados existentes.
--
-- Motivo: 2 dos 14 campos do Registo Inicial CNCS (ponto de contacto
-- alternativo de gestão de topo; países de operação além de Portugal) não
-- tinham fonte no perfil.

ALTER TABLE `organizations` ADD COLUMN `ceoContact`           VARCHAR(120) NULL AFTER `city`;
ALTER TABLE `organizations` ADD COLUMN `countriesOfOperation` JSON         NULL AFTER `ceoContact`;

-- Rollback (ordem inversa):
--   ALTER TABLE `organizations` DROP COLUMN `countriesOfOperation`;
--   ALTER TABLE `organizations` DROP COLUMN `ceoContact`;
