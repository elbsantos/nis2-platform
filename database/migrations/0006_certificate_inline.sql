-- Migration 0006: certificado inline base64 — remove dependência do S3
-- Adiciona certificateIssuedAt; faz backfill das linhas com certificateUrl existente;
-- limpa os URLs fictícios (domínio storage.nis2pt.pt não tinha acesso real).

ALTER TABLE `course_progress`
  ADD COLUMN IF NOT EXISTS `certificateIssuedAt` TIMESTAMP NULL AFTER `certificateUrl`;

-- Backfill: linhas com certificateUrl preenchido recebem completedAt como data de emissão
UPDATE `course_progress`
  SET `certificateIssuedAt` = `completedAt`
  WHERE `certificateUrl` IS NOT NULL AND `certificateIssuedAt` IS NULL;

-- Limpar URLs fictícias (os certificados nunca foram acessíveis via esse URL)
UPDATE `course_progress`
  SET `certificateUrl` = NULL
  WHERE `certificateUrl` IS NOT NULL;
