/**
 * backend/_core/startup-migrations.ts
 *
 * Migrações de schema executadas no arranque do servidor.
 * Usa ALTER TABLE ... ADD COLUMN para ser idempotente —
 * colunas já existentes são ignoradas sem erro.
 *
 * Por que aqui e não no drizzle-kit push?
 * O preDeployCommand do Railway corre antes da rede interna estar
 * completamente pronta, causando falhas silenciosas. Correr aqui garante
 * que o schema está sempre actualizado antes da primeira query.
 */

import { getDb } from "../db";
import { sql } from "drizzle-orm";

interface Migration {
  name: string;
  sql: string;
}

const MIGRATIONS: Migration[] = [
  // organizations — size foi adicionado depois da criação inicial
  {
    name: "organizations.size",
    sql:  "ALTER TABLE organizations ADD COLUMN size ENUM('10-50','50-250','250+') NULL",
  },
  // scans — batchId para scans em lote (supply chain)
  {
    name: "scans.batchId",
    sql:  "ALTER TABLE scans ADD COLUMN batchId VARCHAR(36) NULL",
  },

  // ── ADR-001 Fase 1 — backbone schema ─────────────────────────────────────
  // Converter size de ENUM para VARCHAR preservando valores existentes
  {
    name: "organizations.size_to_varchar",
    sql:  "ALTER TABLE organizations MODIFY COLUMN size VARCHAR(50) NULL",
  },
  // Perfil alargado da empresa — todos nullable, sem impacto em dados existentes
  {
    name: "organizations.legalName",
    sql:  "ALTER TABLE organizations ADD COLUMN legalName VARCHAR(255) NULL",
  },
  {
    name: "organizations.nipc",
    sql:  "ALTER TABLE organizations ADD COLUMN nipc VARCHAR(20) NULL",
  },
  {
    name: "organizations.address",
    sql:  "ALTER TABLE organizations ADD COLUMN address VARCHAR(500) NULL",
  },
  {
    name: "organizations.securityOfficerName",
    sql:  "ALTER TABLE organizations ADD COLUMN securityOfficerName VARCHAR(255) NULL",
  },
  {
    name: "organizations.securityOfficerEmail",
    sql:  "ALTER TABLE organizations ADD COLUMN securityOfficerEmail VARCHAR(255) NULL",
  },
  {
    name: "organizations.keyAssets",
    sql:  "ALTER TABLE organizations ADD COLUMN keyAssets JSON NULL",
  },
  // Tabela de evidências por controlo
  {
    name: "control_evidence.create",
    sql: `CREATE TABLE IF NOT EXISTS \`control_evidence\` (
      \`id\`             INT          NOT NULL AUTO_INCREMENT,
      \`organizationId\` INT          NOT NULL,
      \`controlId\`      VARCHAR(20)  NOT NULL,
      \`sessionId\`      INT          NULL,
      \`status\`         VARCHAR(20)  NOT NULL DEFAULT 'missing',
      \`source\`         VARCHAR(20)  NOT NULL DEFAULT 'manual',
      \`fileKey\`        VARCHAR(500) NULL,
      \`fileName\`       VARCHAR(255) NULL,
      \`templateId\`     VARCHAR(100) NULL,
      \`notes\`          TEXT         NULL,
      \`createdAt\`      TIMESTAMP    NOT NULL DEFAULT NOW(),
      \`updatedAt\`      TIMESTAMP    NOT NULL DEFAULT NOW() ON UPDATE NOW(),
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uq_org_control\` (\`organizationId\`, \`controlId\`),
      INDEX \`idx_ce_org\` (\`organizationId\`),
      INDEX \`idx_ce_control\` (\`controlId\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  },
];

export async function runStartupMigrations(): Promise<void> {
  const db = getDb();
  let applied = 0;

  for (const migration of MIGRATIONS) {
    try {
      await db.execute(sql.raw(migration.sql));
      applied++;
    } catch (err: any) {
      // 1060 = Duplicate column — coluna já existe (MySQL < 8.0 não suporta IF NOT EXISTS)
      if (err?.errno === 1060) {
        continue;
      }
      console.error(`[Migrations] Falha em "${migration.name}":`, err?.message ?? err);
    }
  }

  if (applied > 0) {
    console.log(`[Migrations] ${applied} migração(ões) de schema aplicada(s)`);
  } else {
    console.log("[Migrations] Schema já actualizado");
  }
}
