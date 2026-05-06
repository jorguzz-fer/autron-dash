"use strict";
/**
 * Custom migration runner — usa apenas @prisma/client (sem o CLI do Prisma).
 * Necessário porque o Next.js standalone build não inclui todas as dependências
 * transitivas do Prisma CLI no runtime.
 */
const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id"                  VARCHAR(36)  NOT NULL PRIMARY KEY,
      "checksum"            VARCHAR(64)  NOT NULL,
      "finished_at"         TIMESTAMPTZ,
      "migration_name"      VARCHAR(255) NOT NULL,
      "logs"                TEXT,
      "rolled_back_at"      TIMESTAMPTZ,
      "started_at"          TIMESTAMPTZ NOT NULL DEFAULT now(),
      "applied_steps_count" INTEGER NOT NULL DEFAULT 0
    )
  `);

  const force = process.argv.includes("--force");
  if (force) {
    await prisma.$executeRawUnsafe(`DELETE FROM "_prisma_migrations"`);
    console.log("force: registros de migrations removidos");
  }

  // Limpa registros stuck (tentativas anteriores que falharam com finished_at NULL)
  // Mantém histórico das migrations bem-sucedidas, só remove o ruído.
  const stuck = await prisma.$executeRawUnsafe(
    `DELETE FROM "_prisma_migrations" WHERE finished_at IS NULL`,
  );
  if (stuck > 0) {
    console.log(`limpeza: ${stuck} registro(s) stuck removido(s) (finished_at NULL)`);
  }

  const rows = await prisma.$queryRawUnsafe(
    `SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`,
  );
  const applied = new Set(rows.map((r) => r.migration_name));

  const migrationsDir = path.join(__dirname, "../prisma/migrations");
  const entries = fs
    .readdirSync(migrationsDir)
    .filter(
      (d) =>
        !d.endsWith(".toml") && fs.statSync(path.join(migrationsDir, d)).isDirectory(),
    )
    .sort();

  for (const entry of entries) {
    if (applied.has(entry)) {
      console.log(`skip  ${entry}`);
      continue;
    }

    const sqlPath = path.join(migrationsDir, entry, "migration.sql");
    if (!fs.existsSync(sqlPath)) continue;

    const sql = fs.readFileSync(sqlPath, "utf8");
    const checksum = crypto.createHash("sha256").update(sql).digest("hex");
    const id = crypto.randomUUID();

    console.log(`apply ${entry}`);

    await prisma.$executeRawUnsafe(
      `INSERT INTO "_prisma_migrations"(id,checksum,migration_name,started_at) VALUES($1,$2,$3,now())`,
      id,
      checksum,
      entry,
    );

    const statements = sql
      .split(/;\s*\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    // Sanity check: cada statement deve começar com uma keyword SQL conhecida
    // (proteção contra warnings/erros do Prisma CLI vazando pro arquivo).
    const SQL_KEYWORDS = new Set([
      "CREATE", "ALTER", "DROP", "INSERT", "UPDATE", "DELETE",
      "GRANT", "REVOKE", "COMMENT", "BEGIN", "COMMIT", "ROLLBACK",
      "DO", "SET", "TRUNCATE", "WITH", "SELECT",
    ]);
    for (const stmt of statements) {
      const stripped = stmt.replace(/^(\s*--[^\n]*\n)+/g, "").trim();
      if (!stripped) continue;
      const firstWord = stripped.split(/\s+/)[0].toUpperCase().replace(/[^A-Z]/g, "");
      if (!SQL_KEYWORDS.has(firstWord)) {
        throw new Error(
          `migration ${entry}: statement não começa com SQL keyword reconhecida (got "${firstWord.slice(0, 40)}"). Conteúdo não-SQL detectado no migration.sql — verifique se warnings da CLI vazaram pro arquivo.`,
        );
      }
    }

    let steps = 0;
    for (const stmt of statements) {
      await prisma.$executeRawUnsafe(stmt);
      steps++;
    }

    await prisma.$executeRawUnsafe(
      `UPDATE "_prisma_migrations" SET finished_at=now(), applied_steps_count=$1 WHERE id=$2`,
      steps,
      id,
    );

    console.log(`done  ${entry} (${steps} statements)`);
  }

  console.log("Migrations OK");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
