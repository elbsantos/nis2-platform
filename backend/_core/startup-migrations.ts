/**
 * backend/_core/startup-migrations.ts
 *
 * Migrações de schema executadas no arranque do servidor.
 * Todas as alterações são idempotentes:
 *   - ADD COLUMN  → ignorar errno 1060 (coluna já existe)
 *   - RENAME COLUMN → verificar information_schema antes de executar
 *   - Nunca recriar tabelas; nunca apagar colunas com dados.
 *
 * LIÇÃO DO INCIDENTE: verificar snapshots Railway antes de qualquer migração.
 */

import { getDb } from "../db";
import { sql, count } from "drizzle-orm";
import { organizations, users } from "../../database/schema";

type DbInstance = ReturnType<typeof getDb>;

interface Migration {
  name: string;
  sql?: string;
  run?: (db: DbInstance) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Helper: verificar existência de coluna via information_schema
// ---------------------------------------------------------------------------

async function columnExists(db: DbInstance, table: string, column: string): Promise<boolean> {
  try {
    const result: any = await db.execute(sql.raw(
      `SELECT 1 as found FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = '${table}' AND column_name = '${column}' LIMIT 1`
    ));
    // MySQL2 via Drizzle: result pode ser [rows, fields] ou apenas rows
    const rows: any[] = Array.isArray(result?.[0]) ? result[0] : (Array.isArray(result) ? result : []);
    return rows.length > 0;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Lista de migrações — NUNCA reordenar nem remover entradas existentes
// ---------------------------------------------------------------------------

const MIGRATIONS: Migration[] = [
  // ── Fase 1 — backbone original ──────────────────────────────────────────

  {
    name: "organizations.size",
    sql:  "ALTER TABLE organizations ADD COLUMN size ENUM('10-50','50-250','250+') NULL",
  },
  {
    name: "scans.batchId",
    sql:  "ALTER TABLE scans ADD COLUMN batchId VARCHAR(36) NULL",
  },
  {
    name: "organizations.size_to_varchar",
    sql:  "ALTER TABLE organizations MODIFY COLUMN size VARCHAR(50) NULL",
  },
  {
    name: "organizations.legalName",
    sql:  "ALTER TABLE organizations ADD COLUMN legalName VARCHAR(255) NULL",
  },
  {
    // Substituído por ADR-002 RENAME: nesta entrada agora adicionamos taxId
    // diretamente (ambientes novos). Em ambientes existentes com 'nipc', a
    // migração adr002_rename cuidará do RENAME; aqui o ADD é ignorado (1060).
    name: "organizations.nipc",
    run: async (db) => {
      const hasNipc  = await columnExists(db, "organizations", "nipc");
      const hasTaxId = await columnExists(db, "organizations", "taxId");
      if (!hasNipc && !hasTaxId) {
        // Ambiente novo — adicionar taxId diretamente (ADR-002)
        await db.execute(sql.raw(`ALTER TABLE organizations ADD COLUMN taxId VARCHAR(20) NULL`));
      }
      // nipc existe → a migração adr002_rename cuidará do RENAME
      // taxId existe → já está; nada a fazer
    },
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

  // ── ADR-002 Fase 2a — identidade da org desacoplada de jurisdição ──────
  // PRECONDIÇÃO: snapshots automáticos da BD ativos no Railway.

  {
    name: "organizations.adr002_rename_taxId",
    run: async (db) => {
      const hasNipc = await columnExists(db, "organizations", "nipc");
      if (hasNipc) {
        await db.execute(sql.raw(`ALTER TABLE organizations RENAME COLUMN nipc TO taxId`));
        console.log("[Migrations] ADR-002: coluna nipc renomeada para taxId");
      }
      // nipc já não existe (RENAME feito ou ambiente novo) → nada a fazer
    },
  },
  {
    name: "organizations.adr002_taxIdType",
    sql:  "ALTER TABLE organizations ADD COLUMN taxIdType VARCHAR(50) NULL DEFAULT 'NIPC'",
  },
  {
    name: "organizations.adr002_jurisdiction",
    sql:  "ALTER TABLE organizations ADD COLUMN jurisdiction VARCHAR(2) NULL DEFAULT 'PT'",
  },
];

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export async function runStartupMigrations(): Promise<void> {
  const db = getDb();

  // Contar linhas antes das migrações ADR-002 (segurança: ZERO perda de dados)
  let orgCountBefore = 0;
  let userCountBefore = 0;
  try {
    const [orgRow]  = await db.select({ cnt: count() }).from(organizations);
    const [userRow] = await db.select({ cnt: count() }).from(users);
    orgCountBefore  = orgRow.cnt;
    userCountBefore = userRow.cnt;
    console.log(`[Migrations] Pré-migração: organizations=${orgCountBefore}, users=${userCountBefore}`);
  } catch {
    // Tabelas podem não existir ainda em ambiente completamente novo
  }

  let applied = 0;

  for (const migration of MIGRATIONS) {
    try {
      if (migration.run) {
        await migration.run(db);
      } else if (migration.sql) {
        await db.execute(sql.raw(migration.sql));
      }
      applied++;
    } catch (err: any) {
      // 1060 = Duplicate column (ADD já feito)
      // 1054 = Unknown column (RENAME já feito — coluna origem não existe)
      if (err?.errno === 1060 || err?.errno === 1054) {
        continue;
      }
      console.error(`[Migrations] Falha em "${migration.name}":`, err?.message ?? err);
    }
  }

  // Verificar que não se perderam linhas
  try {
    const [orgRow]  = await db.select({ cnt: count() }).from(organizations);
    const [userRow] = await db.select({ cnt: count() }).from(users);
    const orgCountAfter  = orgRow.cnt;
    const userCountAfter = userRow.cnt;
    console.log(`[Migrations] Pós-migração: organizations=${orgCountAfter} (Δ${orgCountAfter - orgCountBefore}), users=${userCountAfter} (Δ${userCountAfter - userCountBefore})`);
    if (orgCountAfter < orgCountBefore || userCountAfter < userCountBefore) {
      console.error("[Migrations] ALERTA CRÍTICO: perda de linhas detectada após migração!");
    }
  } catch {
    // Se a contagem falhar após migração, não é fatal — as tabelas podem estar ainda a criar
  }

  if (applied > 0) {
    console.log(`[Migrations] ${applied} migração(ões) aplicada(s)`);
  } else {
    console.log("[Migrations] Schema já actualizado");
  }
}
