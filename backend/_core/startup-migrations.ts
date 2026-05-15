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
