-- Migration 0009: campo "city" (localidade) em organizations
-- Aplicar MANUALMENTE no painel Railway → MySQL → Query antes do deploy.
-- Aditiva e NULL — não toca em dados existentes.
--
-- Motivo: a Carta de Nomeação do CISO derivava a localidade da morada livre
-- (address) por heurística de texto (último segmento após vírgula, sem
-- código postal) — falhava em casos como "Rua Exemplo, 86, 1000-001 Lisboa"
-- (apanhava "86", o número da porta, em vez de "Lisboa"). Um campo dedicado
-- resolve isto sem depender de parsing de texto livre.

ALTER TABLE `organizations` ADD COLUMN `city` VARCHAR(120) NULL AFTER `annualBalance`;

-- Rollback:
--   ALTER TABLE `organizations` DROP COLUMN `city`;
