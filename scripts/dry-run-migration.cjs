/**
 * Dry-run de migração: aplica o .sql dentro de uma TRANSAÇÃO e faz ROLLBACK.
 *
 * Por que existe: `migrate deploy` é irreversível e este projeto não tem banco
 * de dev isolado (DATABASE_URL = produção). Este script prova o efeito REAL do
 * SQL contra o schema real — sem deixar rastro. Se o SQL falhar, falha aqui.
 *
 * O rollback é garantido pelo Postgres, não pelo script: DDL é transacional no
 * Postgres, então nada é commitado. Ainda assim, o script é conservador — só
 * roda SQL que ele mesmo classifica como aditivo, e recusa qualquer verbo
 * destrutivo (DROP/TRUNCATE/DELETE/ALTER COLUMN).
 *
 * Uso: node scripts/dry-run-migration.cjs <caminho-do-migration.sql>
 */
const fs = require("node:fs");
const { PrismaClient } = require("@prisma/client");
require("dotenv").config();

const FORBIDDEN = /\b(DROP\s+(TABLE|DATABASE|SCHEMA|COLUMN)|TRUNCATE|DELETE\s+FROM|ALTER\s+COLUMN|FORCE)\b/i;

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("uso: node scripts/dry-run-migration.cjs <migration.sql>");
    process.exit(1);
  }

  const sql = fs.readFileSync(file, "utf8");

  // Gate: este script NÃO é para migração destrutiva. Essas exigem revisão
  // humana e janela — não um dry-run automatizado.
  if (FORBIDDEN.test(sql)) {
    console.error("RECUSADO: o SQL contém verbo destrutivo. Revise à mão.");
    console.error("Trecho:", sql.match(FORBIDDEN)[0]);
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const host = (process.env.DATABASE_URL || "").match(/@([^/]+)\//)?.[1] ?? "?";
  console.log("banco :", host);
  console.log("arquivo:", file);
  console.log("");

  const statements = sql
    .split(";")
    .map((s) => s.replace(/--[^\n]*/g, "").trim())
    .filter(Boolean);

  try {
    await prisma.$transaction(async (tx) => {
      for (const st of statements) {
        console.log("→", st.replace(/\s+/g, " ").slice(0, 90));
        await tx.$executeRawUnsafe(st);
      }

      // Prova que o efeito pretendido aconteceu DENTRO da transação.
      const cols = await tx.$queryRawUnsafe(
        `SELECT column_name, data_type, is_nullable
           FROM information_schema.columns
          WHERE table_name='Company' AND column_name='domusClinicId'`,
      );
      const idx = await tx.$queryRawUnsafe(
        `SELECT indexname FROM pg_indexes
          WHERE tablename='Company' AND indexname='Company_domusClinicId_key'`,
      );
      const empresas = await tx.$queryRawUnsafe(
        `SELECT count(*)::int AS n FROM "Company"`,
      );

      console.log("");
      console.log("EFEITO DENTRO DA TRANSAÇÃO:");
      console.log("  coluna criada :", JSON.stringify(cols));
      console.log("  índice criado :", JSON.stringify(idx));
      console.log("  empresas      :", JSON.stringify(empresas), "(tem que continuar 14)");

      // Aborta de propósito: nada é commitado.
      throw new Error("__ROLLBACK_INTENCIONAL__");
    });
  } catch (e) {
    if (e.message.includes("__ROLLBACK_INTENCIONAL__")) {
      console.log("");
      console.log("✅ ROLLBACK feito — o banco NÃO foi alterado.");
    } else {
      console.log("");
      console.log("❌ A MIGRAÇÃO FALHARIA:", e.message.split("\n").slice(0, 4).join(" | "));
      await prisma.$disconnect();
      process.exit(1);
    }
  }

  // Confirma, FORA da transação, que nada sobrou.
  const after = await prisma.$queryRawUnsafe(
    `SELECT count(*)::int AS n FROM information_schema.columns
      WHERE table_name='Company' AND column_name='domusClinicId'`,
  );
  console.log("pós-rollback, coluna existe?", after[0].n === 0 ? "não (correto)" : "SIM — ALERTA!");
  await prisma.$disconnect();
}

main();
