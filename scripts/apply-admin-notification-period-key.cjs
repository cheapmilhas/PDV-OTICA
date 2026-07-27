#!/usr/bin/env node
/**
 * N5 — aplica a migração `periodKey` + unique em admin_notifications.
 *
 * Usa o cliente PRISMA (`$queryRawUnsafe`/`$executeRawUnsafe`), não o driver
 * `pg`: este repo não tem `pg` instalado (quem tem é o Domus) e não há `psql`
 * na máquina. Idempotente, e MOSTRA O HOST antes de escrever para que ninguém
 * aplique no banco errado.
 *
 * É uma migração ADITIVA: coluna nullable + índice. Não reescreve linha
 * existente, não tem downtime, e é reversível (DROP dos dois objetos).
 */
require("dotenv").config();
const { PrismaClient } = require("@prisma/client");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL ausente. Abortado.");
    process.exit(1);
  }

  const host = (() => {
    try {
      return new URL(url).host;
    } catch {
      return "(host ilegível)";
    }
  })();
  console.log(`\n🎯 Banco: ${host}`);

  const prisma = new PrismaClient();
  const client = {
    query: async (sql, params) => {
      const rows = params
        ? await prisma.$queryRawUnsafe(sql, ...params)
        : await prisma.$queryRawUnsafe(sql);
      return { rows, rowCount: Array.isArray(rows) ? rows.length : 0 };
    },
    exec: (sql, params) =>
      params ? prisma.$executeRawUnsafe(sql, ...params) : prisma.$executeRawUnsafe(sql),
  };

  try {
    // 1) ANTES: o que já existe? Idempotência precisa ser observada, não suposta.
    const colBefore = await client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'admin_notifications' AND column_name = 'periodKey'`
    );
    const idxBefore = await client.query(
      `SELECT indexname FROM pg_indexes
       WHERE tablename = 'admin_notifications'
         AND indexname = 'admin_notifications_adminId_type_periodKey_key'`
    );
    const total = await client.query(`SELECT count(*)::int AS n FROM admin_notifications`);
    console.log(`   linhas na tabela: ${total.rows[0].n}`);
    console.log(`   coluna periodKey: ${colBefore.rowCount ? "JÁ EXISTE" : "ausente"}`);
    console.log(`   índice unique:    ${idxBefore.rowCount ? "JÁ EXISTE" : "ausente"}`);

    // 2) Aplica (idempotente nos dois passos).
    await client.exec(
      `ALTER TABLE "admin_notifications" ADD COLUMN IF NOT EXISTS "periodKey" TEXT`
    );
    await client.exec(
      `CREATE UNIQUE INDEX IF NOT EXISTS "admin_notifications_adminId_type_periodKey_key"
         ON "admin_notifications" ("adminId", "type", "periodKey")`
    );

    // 3) DEPOIS: prova que os dois objetos existem. Sem esta checagem o script
    //    "passaria" mesmo se o CREATE fosse silenciosamente ignorado.
    const colAfter = await client.query(
      `SELECT data_type, is_nullable FROM information_schema.columns
       WHERE table_name = 'admin_notifications' AND column_name = 'periodKey'`
    );
    const idxAfter = await client.query(
      `SELECT indexdef FROM pg_indexes
       WHERE tablename = 'admin_notifications'
         AND indexname = 'admin_notifications_adminId_type_periodKey_key'`
    );

    if (colAfter.rowCount !== 1 || idxAfter.rowCount !== 1) {
      throw new Error("verificação pós-migração FALHOU: coluna ou índice ausente");
    }
    console.log(
      `\n✅ coluna periodKey: ${colAfter.rows[0].data_type}, nullable=${colAfter.rows[0].is_nullable}`
    );
    console.log(`✅ índice: ${idxAfter.rows[0].indexdef}`);

    // 4) PROVA a propriedade da qual todo o desenho depende: dois NULLs
    //    coexistem no unique. Se o Postgres tratasse NULL como igual, as
    //    notificações legadas e as de dunning/tickets (periodKey NULL)
    //    quebrariam na segunda inserção — e só descobriríamos em produção.
    //
    //    Roda em transação que SEMPRE dá rollback: não deixa lixo na tabela.
    //    O throw sentinela é o mecanismo de rollback, não uma falha.
    const SENTINELA = "__rollback_esperado__";
    let nullsCoexistem = false;
    try {
      await prisma.$transaction(async (tx) => {
        const ins = `INSERT INTO admin_notifications (id, "adminId", type, title, message, "createdAt")
                     VALUES ($1, NULL, 'TRIAL_EXPIRING', 'probe', 'probe', now())`;
        await tx.$executeRawUnsafe(ins, "__probe_null_1__");
        await tx.$executeRawUnsafe(ins, "__probe_null_2__");
        nullsCoexistem = true; // as duas inserções passaram
        throw new Error(SENTINELA);
      });
    } catch (err) {
      if (err.message !== SENTINELA) throw err; // erro de verdade: propaga
    }
    if (!nullsCoexistem) throw new Error("sonda não completou as duas inserções");
    console.log("✅ dois NULLs coexistem no unique (comportamento esperado do Postgres)");

    const sobrou = await client.query(
      `SELECT count(*)::int AS n FROM admin_notifications WHERE id LIKE '__probe_null_%'`
    );
    if (Number(sobrou.rows[0].n) !== 0) {
      throw new Error(`ROLLBACK falhou: ${sobrou.rows[0].n} linha(s) de sonda ficaram na tabela`);
    }
    console.log("✅ sonda revertida, tabela limpa\n");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("\n❌ Falhou:", err.message);
  process.exit(1);
});
