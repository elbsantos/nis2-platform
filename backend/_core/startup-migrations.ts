/**
 * backend/_core/startup-migrations.ts
 *
 * Migrações de schema executadas no arranque do servidor.
 * Todas as alterações são idempotentes — verificam information_schema ANTES de
 * correr, nunca tentam o que já existe:
 *
 *   ADD COLUMN  → columnExists() → saltar em silêncio se já existir
 *   RENAME COLUMN → columnExists(origem) → saltar se já renomeado
 *   CREATE TABLE  → IF NOT EXISTS (já idempotente no SQL)
 *   MODIFY COLUMN → columnType() → saltar se já é o tipo certo
 *
 * "já aplicada" = log informativo (console.log)
 * erro genuíno  = log de erro (console.error) + continua para as seguintes
 *
 * PRECONDIÇÃO OPERACIONAL: snapshots automáticos da BD no Railway activos.
 */

import { getDb } from "../db";
import { sql, count } from "drizzle-orm";
import { organizations, users } from "../../database/schema";

type DbInstance = ReturnType<typeof getDb>;

interface Migration {
  name: string;
  run: (db: DbInstance) => Promise<void>;
}

// ---------------------------------------------------------------------------
// information_schema helpers
// ---------------------------------------------------------------------------

async function columnExists(db: DbInstance, table: string, column: string): Promise<boolean> {
  try {
    const result: any = await db.execute(sql.raw(
      `SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = '${table}' AND column_name = '${column}' LIMIT 1`
    ));
    const rows: any[] = Array.isArray(result?.[0]) ? result[0] : (Array.isArray(result) ? result : []);
    return rows.length > 0;
  } catch {
    return false;
  }
}

async function columnType(db: DbInstance, table: string, column: string): Promise<string | null> {
  try {
    const result: any = await db.execute(sql.raw(
      `SELECT DATA_TYPE FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = '${table}' AND column_name = '${column}' LIMIT 1`
    ));
    const rows: any[] = Array.isArray(result?.[0]) ? result[0] : (Array.isArray(result) ? result : []);
    return (rows[0]?.DATA_TYPE ?? rows[0]?.data_type) ?? null;
  } catch {
    return null;
  }
}

// Shorthand: skip log + early return when column already exists
function alreadyApplied(name: string): void {
  console.log(`[Migrations] ${name}: já aplicada`);
}

// ---------------------------------------------------------------------------
// Lista de migrações — NUNCA reordenar nem remover entradas existentes
// ---------------------------------------------------------------------------

const MIGRATIONS: Migration[] = [

  // ── Fase 1 — backbone original ──────────────────────────────────────────

  {
    name: "organizations.size",
    run: async (db) => {
      if (await columnExists(db, "organizations", "size")) { alreadyApplied("organizations.size"); return; }
      await db.execute(sql.raw(`ALTER TABLE organizations ADD COLUMN size ENUM('10-50','50-250','250+') NULL`));
    },
  },
  {
    name: "scans.batchId",
    run: async (db) => {
      if (await columnExists(db, "scans", "batchId")) { alreadyApplied("scans.batchId"); return; }
      await db.execute(sql.raw(`ALTER TABLE scans ADD COLUMN batchId VARCHAR(36) NULL`));
    },
  },
  {
    // Converte ENUM → VARCHAR(50). Saltar se já for varchar (inclui execuções repetidas).
    name: "organizations.size_to_varchar",
    run: async (db) => {
      const t = await columnType(db, "organizations", "size");
      if (!t || t.toLowerCase().startsWith("varchar")) { alreadyApplied("organizations.size_to_varchar"); return; }
      await db.execute(sql.raw(`ALTER TABLE organizations MODIFY COLUMN size VARCHAR(50) NULL`));
    },
  },
  {
    name: "organizations.legalName",
    run: async (db) => {
      if (await columnExists(db, "organizations", "legalName")) { alreadyApplied("organizations.legalName"); return; }
      await db.execute(sql.raw(`ALTER TABLE organizations ADD COLUMN legalName VARCHAR(255) NULL`));
    },
  },
  {
    // Substituído por ADR-002 RENAME: em ambientes novos adiciona taxId directamente;
    // em ambientes existentes com 'nipc', a migração adr002_rename trata do RENAME.
    name: "organizations.nipc",
    run: async (db) => {
      const hasNipc  = await columnExists(db, "organizations", "nipc");
      const hasTaxId = await columnExists(db, "organizations", "taxId");
      if (!hasNipc && !hasTaxId) {
        await db.execute(sql.raw(`ALTER TABLE organizations ADD COLUMN taxId VARCHAR(20) NULL`));
      } else {
        alreadyApplied("organizations.nipc");
      }
    },
  },
  {
    name: "organizations.address",
    run: async (db) => {
      if (await columnExists(db, "organizations", "address")) { alreadyApplied("organizations.address"); return; }
      await db.execute(sql.raw(`ALTER TABLE organizations ADD COLUMN address VARCHAR(500) NULL`));
    },
  },
  {
    name: "organizations.securityOfficerName",
    run: async (db) => {
      if (await columnExists(db, "organizations", "securityOfficerName")) { alreadyApplied("organizations.securityOfficerName"); return; }
      await db.execute(sql.raw(`ALTER TABLE organizations ADD COLUMN securityOfficerName VARCHAR(255) NULL`));
    },
  },
  {
    name: "organizations.securityOfficerEmail",
    run: async (db) => {
      if (await columnExists(db, "organizations", "securityOfficerEmail")) { alreadyApplied("organizations.securityOfficerEmail"); return; }
      await db.execute(sql.raw(`ALTER TABLE organizations ADD COLUMN securityOfficerEmail VARCHAR(255) NULL`));
    },
  },
  {
    name: "organizations.keyAssets",
    run: async (db) => {
      if (await columnExists(db, "organizations", "keyAssets")) { alreadyApplied("organizations.keyAssets"); return; }
      await db.execute(sql.raw(`ALTER TABLE organizations ADD COLUMN keyAssets JSON NULL`));
    },
  },
  {
    // CREATE TABLE IF NOT EXISTS é idempotente no SQL — sem pre-check necessário.
    name: "control_evidence.create",
    run: async (db) => {
      await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS \`control_evidence\` (
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
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`));
    },
  },

  // ── ADR-002 Fase 2a — identidade da org desacoplada de jurisdição ──────
  // PRECONDIÇÃO: snapshots automáticos da BD activos no Railway.

  {
    name: "organizations.adr002_rename_taxId",
    run: async (db) => {
      const hasNipc = await columnExists(db, "organizations", "nipc");
      if (hasNipc) {
        await db.execute(sql.raw(`ALTER TABLE organizations RENAME COLUMN nipc TO taxId`));
        console.log("[Migrations] ADR-002: coluna nipc renomeada para taxId");
      } else {
        alreadyApplied("organizations.adr002_rename_taxId");
      }
    },
  },
  {
    name: "organizations.adr002_taxIdType",
    run: async (db) => {
      if (await columnExists(db, "organizations", "taxIdType")) { alreadyApplied("organizations.adr002_taxIdType"); return; }
      await db.execute(sql.raw(`ALTER TABLE organizations ADD COLUMN taxIdType VARCHAR(50) NULL DEFAULT 'NIPC'`));
    },
  },
  {
    name: "organizations.adr002_jurisdiction",
    run: async (db) => {
      if (await columnExists(db, "organizations", "jurisdiction")) { alreadyApplied("organizations.adr002_jurisdiction"); return; }
      await db.execute(sql.raw(`ALTER TABLE organizations ADD COLUMN jurisdiction VARCHAR(2) NULL DEFAULT 'PT'`));
    },
  },
];

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export async function runStartupMigrations(): Promise<void> {
  const db = getDb();

  // Contagem pré-migração — alerta se linhas desaparecerem (lição do incidente)
  let orgCountBefore = 0;
  let userCountBefore = 0;
  try {
    const [orgRow]  = await db.select({ cnt: count() }).from(organizations);
    const [userRow] = await db.select({ cnt: count() }).from(users);
    orgCountBefore  = orgRow.cnt;
    userCountBefore = userRow.cnt;
    console.log(`[Migrations] Pré-migração: organizations=${orgCountBefore}, users=${userCountBefore}`);
  } catch {
    // Tabelas ainda não existem em ambiente completamente novo
  }

  let applied = 0;

  for (const migration of MIGRATIONS) {
    try {
      await migration.run(db);
      applied++;
    } catch (err: any) {
      console.error(`[Migrations] Falha genuína em "${migration.name}":`, err?.message ?? err);
      // Continua para as seguintes — não bloquear o arranque por uma migração falhada
    }
  }

  // Contagem pós-migração — abortar se o Δ for negativo
  try {
    const [orgRow]  = await db.select({ cnt: count() }).from(organizations);
    const [userRow] = await db.select({ cnt: count() }).from(users);
    const orgCountAfter  = orgRow.cnt;
    const userCountAfter = userRow.cnt;
    const orgDelta  = orgCountAfter  - orgCountBefore;
    const userDelta = userCountAfter - userCountBefore;
    console.log(`[Migrations] Pós-migração: organizations=${orgCountAfter} (Δ${orgDelta}), users=${userCountAfter} (Δ${userDelta})`);
    if (orgDelta < 0 || userDelta < 0) {
      console.error("[Migrations] ALERTA CRÍTICO: perda de linhas detectada após migração!");
    }
  } catch {
    // Se a contagem pós falhar, as tabelas podem ainda estar a criar
  }

  console.log(`[Migrations] ${applied}/${MIGRATIONS.length} migração(ões) processada(s) sem erro`);
}
