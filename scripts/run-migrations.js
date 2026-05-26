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
    .sort((a, b) => {
      // Ordena pelo prefixo numérico (1, 2, ... 9, 10, 11...). O .sort()
      // lexicográfico puro colocaria "10_" antes de "2_", quebrando a ordem
      // das FKs em bancos novos. Empate ou sem prefixo numérico: cai pro
      // comparativo de string. Para as migrations 1-9 o resultado é idêntico
      // ao sort anterior (zero mudança de comportamento).
      const na = parseInt(a, 10);
      const nb = parseInt(b, 10);
      if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb;
      return a < b ? -1 : a > b ? 1 : 0;
    });

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

    const statements = splitSql(sql);

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

/**
 * Split SQL respeitando blocos `$$ ... $$` (PostgreSQL anonymous code blocks).
 * Não quebra ponto-e-vírgula DENTRO de DO $$ ... EXCEPTION ... END $$;.
 */
/**
 * Splitta um arquivo .sql em statements respeitando:
 *  - blocos $$...$$ (PL/pgSQL)
 *  - comentários de linha "-- ..."
 *  - comentários de bloco "/* ... *\/"
 *  - strings simples 'foo' (com escape de '' literal)
 *  - identificadores entre aspas duplas "Foo"
 *
 * Anteriormente o splitter olhava só $$ e ;, então qualquer `$$` aparecendo
 * dentro de um comentário (ex: "-- bloco DO $$ ...") invertia o estado e
 * quebrava o parsing. Agora processamos por contexto para evitar essa
 * armadilha sutil.
 */
function splitSql(sql) {
  const stmts = [];
  let buf = "";
  let inDollar = false;
  let inLineComment = false;
  let inBlockComment = false;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    const c2 = sql[i + 1];

    // Comentário de linha
    if (inLineComment) {
      buf += c;
      if (c === "\n") inLineComment = false;
      continue;
    }
    // Comentário de bloco
    if (inBlockComment) {
      buf += c;
      if (c === "*" && c2 === "/") {
        buf += c2;
        i++;
        inBlockComment = false;
      }
      continue;
    }
    // String entre aspas simples (com escape '' = aspa literal)
    if (inSingleQuote) {
      buf += c;
      if (c === "'") {
        if (c2 === "'") {
          buf += c2;
          i++;
        } else {
          inSingleQuote = false;
        }
      }
      continue;
    }
    // Identificador entre aspas duplas
    if (inDoubleQuote) {
      buf += c;
      if (c === '"') inDoubleQuote = false;
      continue;
    }

    // Fora de comentário/string: detectar início de comentário ou string
    if (c === "-" && c2 === "-") {
      inLineComment = true;
      buf += c;
      continue;
    }
    if (c === "/" && c2 === "*") {
      inBlockComment = true;
      buf += c;
      continue;
    }
    if (c === "'") {
      inSingleQuote = true;
      buf += c;
      continue;
    }
    if (c === '"') {
      inDoubleQuote = true;
      buf += c;
      continue;
    }

    // $$ — toggla bloco PL/pgSQL (só fora de string/comentário)
    if (c === "$" && c2 === "$") {
      inDollar = !inDollar;
      buf += "$$";
      i++;
      continue;
    }
    // ; — termina statement (só fora de $$)
    if (c === ";" && !inDollar) {
      const trimmed = buf.trim();
      if (trimmed) stmts.push(trimmed);
      buf = "";
      continue;
    }
    buf += c;
  }
  const tail = buf.trim();
  if (tail) stmts.push(tail);
  return stmts;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
