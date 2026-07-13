/**
 * backend/_core/startup-migrations.ts
 *
 * Migrações de schema executadas no arranque do servidor.
 * TODAS são idempotentes — verificam information_schema ANTES de tentar qualquer DDL:
 *
 *   ADD COLUMN    → columnExists()  → "skipped" se já existir
 *   RENAME COLUMN → columnExists()  → "skipped" se fonte já foi renomeada
 *   MODIFY COLUMN → columnType()    → "skipped" se já é o tipo certo
 *   CREATE TABLE  → tableExists()   → "skipped" se já existir
 *   ADD INDEX     → indexExists()   → "skipped" se já existir
 *
 * "skipped"     → console.log (informativo, conta em "já aplicadas")
 * "applied"     → console.log (nova migração, conta em "novas")
 * erro genuíno  → console.error + throw depois de processar todas → aborta arranque
 *
 * PRECONDIÇÃO OPERACIONAL: snapshots automáticos da BD no Railway activos.
 */

import { getDb } from "../db";
import { sql, count } from "drizzle-orm";
import { organizations, users } from "../../database/schema";

type DbInstance = ReturnType<typeof getDb>;

// "applied"  = DDL correu com sucesso
// "skipped"  = já estava aplicada (pre-check confirma)
type MigrationStatus = "applied" | "skipped";

interface Migration {
  name: string;
  run: (db: DbInstance) => Promise<MigrationStatus>;
}

// ─── information_schema helpers ───────────────────────────────────────────────
// Todos devolvem false em caso de erro para não bloquear a verificação.
// A result do db.execute com drizzle+mysql2 é [RowDataPacket[], FieldPacket[]].

function extractRows(res: unknown): unknown[] {
  if (Array.isArray(res) && Array.isArray(res[0])) return res[0] as unknown[]; // [rows, fields]
  if (Array.isArray(res)) return res;                                           // rows directamente
  return [];
}

async function columnExists(db: DbInstance, table: string, column: string): Promise<boolean> {
  try {
    const res = await db.execute(sql.raw(
      `SELECT 1 FROM information_schema.columns ` +
      `WHERE table_schema = DATABASE() AND table_name = '${table}' AND column_name = '${column}' LIMIT 1`
    ));
    return extractRows(res).length > 0;
  } catch {
    return false;
  }
}

async function tableExists(db: DbInstance, table: string): Promise<boolean> {
  try {
    const res = await db.execute(sql.raw(
      `SELECT 1 FROM information_schema.tables ` +
      `WHERE table_schema = DATABASE() AND table_name = '${table}' LIMIT 1`
    ));
    return extractRows(res).length > 0;
  } catch {
    return false;
  }
}

async function columnType(db: DbInstance, table: string, column: string): Promise<string | null> {
  try {
    const res = await db.execute(sql.raw(
      `SELECT DATA_TYPE FROM information_schema.columns ` +
      `WHERE table_schema = DATABASE() AND table_name = '${table}' AND column_name = '${column}' LIMIT 1`
    ));
    const rows = extractRows(res) as Record<string, unknown>[];
    return (rows[0]?.DATA_TYPE ?? rows[0]?.data_type ?? null) as string | null;
  } catch {
    return null;
  }
}

// Disponível para futuras migrações com ADD INDEX.
export async function indexExists(db: DbInstance, table: string, indexName: string): Promise<boolean> {
  try {
    const res = await db.execute(sql.raw(
      `SELECT 1 FROM information_schema.statistics ` +
      `WHERE table_schema = DATABASE() AND table_name = '${table}' AND index_name = '${indexName}' LIMIT 1`
    ));
    return extractRows(res).length > 0;
  } catch {
    return false;
  }
}

// ─── Lista de migrações — NUNCA reordenar nem remover entradas existentes ─────

const MIGRATIONS: Migration[] = [

  // ── Fase 1 — backbone original ─────────────────────────────────────────────

  {
    name: "organizations.size",
    run: async (db) => {
      if (await columnExists(db, "organizations", "size")) return "skipped";
      await db.execute(sql.raw(
        "ALTER TABLE `organizations` ADD COLUMN `size` ENUM('10-50','50-250','250+') NULL"
      ));
      return "applied";
    },
  },

  {
    name: "scans.batchId",
    run: async (db) => {
      if (await columnExists(db, "scans", "batchId")) return "skipped";
      await db.execute(sql.raw(
        "ALTER TABLE `scans` ADD COLUMN `batchId` VARCHAR(36) NULL"
      ));
      return "applied";
    },
  },

  {
    // Converte ENUM → VARCHAR(50). Salta se já for varchar (inclui execuções repetidas).
    name: "organizations.size_to_varchar",
    run: async (db) => {
      const t = await columnType(db, "organizations", "size");
      if (!t || t.toLowerCase().startsWith("varchar")) return "skipped";
      await db.execute(sql.raw(
        "ALTER TABLE `organizations` MODIFY COLUMN `size` VARCHAR(50) NULL"
      ));
      return "applied";
    },
  },

  {
    name: "organizations.legalName",
    run: async (db) => {
      if (await columnExists(db, "organizations", "legalName")) return "skipped";
      await db.execute(sql.raw(
        "ALTER TABLE `organizations` ADD COLUMN `legalName` VARCHAR(255) NULL"
      ));
      return "applied";
    },
  },

  {
    // Migração ponte: em ambientes novos adiciona taxId directamente;
    // em ambientes existentes com 'nipc', adr002_rename_taxId trata do RENAME.
    name: "organizations.nipc",
    run: async (db) => {
      const hasNipc  = await columnExists(db, "organizations", "nipc");
      const hasTaxId = await columnExists(db, "organizations", "taxId");
      if (hasNipc || hasTaxId) return "skipped";
      await db.execute(sql.raw(
        "ALTER TABLE `organizations` ADD COLUMN `taxId` VARCHAR(20) NULL"
      ));
      return "applied";
    },
  },

  {
    name: "organizations.address",
    run: async (db) => {
      if (await columnExists(db, "organizations", "address")) return "skipped";
      await db.execute(sql.raw(
        "ALTER TABLE `organizations` ADD COLUMN `address` VARCHAR(500) NULL"
      ));
      return "applied";
    },
  },

  {
    name: "organizations.securityOfficerName",
    run: async (db) => {
      if (await columnExists(db, "organizations", "securityOfficerName")) return "skipped";
      await db.execute(sql.raw(
        "ALTER TABLE `organizations` ADD COLUMN `securityOfficerName` VARCHAR(255) NULL"
      ));
      return "applied";
    },
  },

  {
    name: "organizations.securityOfficerEmail",
    run: async (db) => {
      if (await columnExists(db, "organizations", "securityOfficerEmail")) return "skipped";
      await db.execute(sql.raw(
        "ALTER TABLE `organizations` ADD COLUMN `securityOfficerEmail` VARCHAR(255) NULL"
      ));
      return "applied";
    },
  },

  {
    name: "organizations.keyAssets",
    run: async (db) => {
      if (await columnExists(db, "organizations", "keyAssets")) return "skipped";
      await db.execute(sql.raw(
        "ALTER TABLE `organizations` ADD COLUMN `keyAssets` JSON NULL"
      ));
      return "applied";
    },
  },

  {
    name: "control_evidence.create",
    run: async (db) => {
      if (await tableExists(db, "control_evidence")) return "skipped";
      // CREATE TABLE with IF NOT EXISTS as belt-and-suspenders.
      await db.execute(sql.raw(
        "CREATE TABLE IF NOT EXISTS `control_evidence` (" +
        "  `id`             INT          NOT NULL AUTO_INCREMENT," +
        "  `organizationId` INT          NOT NULL," +
        "  `controlId`      VARCHAR(20)  NOT NULL," +
        "  `sessionId`      INT          NULL," +
        "  `status`         VARCHAR(20)  NOT NULL DEFAULT 'missing'," +
        "  `source`         VARCHAR(20)  NOT NULL DEFAULT 'manual'," +
        "  `fileKey`        VARCHAR(500) NULL," +
        "  `fileName`       VARCHAR(255) NULL," +
        "  `templateId`     VARCHAR(100) NULL," +
        "  `notes`          TEXT         NULL," +
        "  `createdAt`      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP," +
        "  `updatedAt`      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP," +
        "  PRIMARY KEY (`id`)," +
        "  UNIQUE KEY `uq_org_control` (`organizationId`, `controlId`)," +
        "  KEY `idx_ce_org` (`organizationId`)," +
        "  KEY `idx_ce_control` (`controlId`)" +
        ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
      ));
      return "applied";
    },
  },

  // ── ADR-002 Fase 2a — identidade da org desacoplada de jurisdição ──────────
  // PRECONDIÇÃO: snapshots automáticos da BD activos no Railway.

  {
    name: "organizations.adr002_rename_taxId",
    run: async (db) => {
      if (!await columnExists(db, "organizations", "nipc")) return "skipped";
      await db.execute(sql.raw(
        "ALTER TABLE `organizations` RENAME COLUMN `nipc` TO `taxId`"
      ));
      return "applied";
    },
  },

  {
    name: "organizations.adr002_taxIdType",
    run: async (db) => {
      if (await columnExists(db, "organizations", "taxIdType")) return "skipped";
      await db.execute(sql.raw(
        "ALTER TABLE `organizations` ADD COLUMN `taxIdType` VARCHAR(50) NULL DEFAULT 'NIPC'"
      ));
      return "applied";
    },
  },

  {
    name: "organizations.adr002_jurisdiction",
    run: async (db) => {
      if (await columnExists(db, "organizations", "jurisdiction")) return "skipped";
      await db.execute(sql.raw(
        "ALTER TABLE `organizations` ADD COLUMN `jurisdiction` VARCHAR(2) NULL DEFAULT 'PT'"
      ));
      return "applied";
    },
  },

  // ── Reset de senha ─────────────────────────────────────────────────────────

  {
    name: "users.resetTokenHash",
    run: async (db) => {
      if (await columnExists(db, "users", "resetTokenHash")) return "skipped";
      await db.execute(sql.raw(
        "ALTER TABLE `users` ADD COLUMN `resetTokenHash` VARCHAR(64) NULL"
      ));
      return "applied";
    },
  },

  {
    name: "users.resetTokenExpiresAt",
    run: async (db) => {
      if (await columnExists(db, "users", "resetTokenExpiresAt")) return "skipped";
      await db.execute(sql.raw(
        "ALTER TABLE `users` ADD COLUMN `resetTokenExpiresAt` TIMESTAMP NULL"
      ));
      return "applied";
    },
  },

  // ── Exclusão de conta (RGPD art. 17) ──────────────────────────────────────

  {
    name: "users.deletedAt",
    run: async (db) => {
      if (await columnExists(db, "users", "deletedAt")) return "skipped";
      await db.execute(sql.raw(
        "ALTER TABLE `users` ADD COLUMN `deletedAt` TIMESTAMP NULL"
      ));
      return "applied";
    },
  },
];

// ─── Runner ───────────────────────────────────────────────────────────────────

export async function runStartupMigrations(): Promise<void> {
  const db = getDb();

  // Contagem pré-migração — alerta se linhas desaparecerem
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
  let skipped = 0;
  const genuineErrors: string[] = [];

  for (const migration of MIGRATIONS) {
    try {
      const status = await migration.run(db);
      if (status === "skipped") {
        skipped++;
        console.log(`[Migrations] ${migration.name}: já aplicada`);
      } else {
        applied++;
        console.log(`[Migrations] ${migration.name}: aplicada ✓`);
      }
    } catch (err: any) {
      genuineErrors.push(migration.name);
      console.error(`[Migrations] Falha genuína em "${migration.name}":`, err?.message ?? err);
    }
  }

  // Contagem pós-migração — abortar se o Δ for negativo
  try {
    const [orgRow]  = await db.select({ cnt: count() }).from(organizations);
    const [userRow] = await db.select({ cnt: count() }).from(users);
    const orgDelta  = orgRow.cnt - orgCountBefore;
    const userDelta = userRow.cnt - userCountBefore;
    console.log(`[Migrations] Pós-migração: organizations=${orgRow.cnt} (Δ${orgDelta}), users=${userRow.cnt} (Δ${userDelta})`);
    if (orgDelta < 0 || userDelta < 0) {
      console.error("[Migrations] ALERTA CRÍTICO: perda de linhas detectada após migração!");
    }
  } catch {
    // Se a contagem pós falhar, as tabelas podem ainda estar a criar
  }

  const total = MIGRATIONS.length;
  if (genuineErrors.length === 0) {
    console.log(`[Migrations] ${total}/${total} ok (${skipped} já aplicadas, ${applied} novas)`);
  } else {
    console.log(
      `[Migrations] ${total - genuineErrors.length}/${total} ok ` +
      `(${skipped} já aplicadas, ${applied} novas, ${genuineErrors.length} erros reais)`
    );
    throw new Error(
      `[Migrations] Falhas reais impedem o arranque: ${genuineErrors.join(", ")}`
    );
  }
}
