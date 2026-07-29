#!/usr/bin/env node
/**
 * Plano B — aplica a migração das obrigações de cobrança, cortesias e sombra.
 *
 * Usa o cliente PRISMA (`$queryRawUnsafe`/`$executeRawUnsafe`), não o driver
 * `pg`: este repo não tem `pg` instalado (quem tem é o Domus) e não há `psql`
 * na máquina. Idempotente, e MOSTRA O HOST antes de escrever para que ninguém
 * aplique no banco errado.
 *
 * É uma migração ADITIVA: 3 tabelas novas, 2 enums, 1 coluna nullable em
 * `Invoice`, 1 coluna nullable em `dunning_events`, índices e triggers. Não
 * reescreve linha existente, não tem downtime, e é reversível (DROP dos
 * objetos criados).
 *
 * 🔑 Duas PROVAS em transação com ROLLBACK, no fim. Este script é o único
 * lugar onde elas podem existir: mock de Prisma não executa constraint nem
 * dispara trigger, então unit test não prova nenhuma das duas.
 *   1. Unicidade de (subscriptionId, sequence).
 *   2. I2 — mexer numa obrigação BUMPA a revisão de entitlement da empresa.
 *      Sem esta prova o trigger é suposto, não provado; e I2 falhando em
 *      silêncio significa clínica escrevendo prontuário achando-se bloqueada.
 *
 * Uso: node scripts/apply-billing-obligations.cjs
 */
require("dotenv").config();
const fs = require("node:fs");
const path = require("node:path");
const { PrismaClient } = require("@prisma/client");

const MIGRATION_SQL = path.join(
  __dirname,
  "..",
  "prisma",
  "migrations",
  "20260729180000_billing_obligations",
  "migration.sql"
);

/** Sentinela de rollback: o throw é o MECANISMO, não uma falha. */
const SENTINELA = "__rollback_esperado__";

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
  const q = async (sql, params) => {
    const rows = params
      ? await prisma.$queryRawUnsafe(sql, ...params)
      : await prisma.$queryRawUnsafe(sql);
    return { rows, rowCount: Array.isArray(rows) ? rows.length : 0 };
  };

  try {
    // -----------------------------------------------------------------------
    // 1) ANTES: o que já existe? Idempotência OBSERVADA, não suposta.
    // -----------------------------------------------------------------------
    console.log("\n── ANTES ──");
    const estadoAntes = await inventario(q);
    imprimirInventario(estadoAntes);

    // -----------------------------------------------------------------------
    // 2) Aplica. O .sql inteiro num único $executeRawUnsafe: todos os
    //    statements são idempotentes (IF NOT EXISTS / DO $$ / DROP antes de
    //    CREATE TRIGGER), então reexecutar é seguro.
    //
    //    ⚠️ $executeRawUnsafe com múltiplos statements exige que o Postgres
    //    aceite simple query protocol. Se o driver recusar, o fallback é
    //    dividir por statement — mas dividir DO $$ ... $$ por ';' quebraria os
    //    corpos de função. Por isso mandamos inteiro e, se falhar, o erro sobe
    //    claro em vez de aplicar metade.
    // -----------------------------------------------------------------------
    const sql = fs.readFileSync(MIGRATION_SQL, "utf8");
    console.log(`\n── APLICANDO (${MIGRATION_SQL.split("/").slice(-2).join("/")}) ──`);
    await prisma.$executeRawUnsafe(sql);
    console.log("   statements executados");

    // -----------------------------------------------------------------------
    // 3) DEPOIS: prova que TUDO existe. Sem esta checagem o script "passaria"
    //    mesmo se algum CREATE fosse silenciosamente ignorado.
    // -----------------------------------------------------------------------
    console.log("\n── DEPOIS ──");
    const estadoDepois = await inventario(q);
    imprimirInventario(estadoDepois);

    const faltando = Object.entries(estadoDepois)
      .filter(([, presente]) => !presente)
      .map(([nome]) => nome);
    if (faltando.length > 0) {
      throw new Error(`verificação pós-migração FALHOU — ausentes: ${faltando.join(", ")}`);
    }
    console.log("\n✅ todos os objetos presentes");

    // -----------------------------------------------------------------------
    // 4) PROVAS em transação revertida.
    // -----------------------------------------------------------------------
    const alvo = await escolherAssinaturaDeProva(q);
    if (!alvo) {
      console.log(
        "\n⚠️  Nenhuma assinatura no banco — as duas provas foram PULADAS.\n" +
          "    Os objetos existem, mas constraint e trigger seguem NÃO PROVADOS.\n" +
          "    Rode este script de novo quando houver ao menos uma assinatura."
      );
      return;
    }
    console.log(
      `\n── PROVAS (assinatura ${alvo.subscriptionId}, empresa ${alvo.companyId}) ──`
    );

    // `finally`: a checagem de limpeza roda mesmo se uma prova falhar no meio.
    // Se a sonda deixou lixo E a prova falhou, o dono precisa das DUAS notícias
    // — e a do lixo é a urgente.
    try {
      await provaUnicidade(prisma, alvo);
      await provaI2(prisma, q, alvo);
    } finally {
      await verificarLimpeza(q).catch((err) => {
        console.error(`\n🚨 ${err.message}`);
        throw err;
      });
    }

    console.log("\n✅ migração aplicada e provada.\n");
  } finally {
    await prisma.$disconnect();
  }
}

/** Presença de cada objeto que a migração cria. */
async function inventario(q) {
  const temTabela = async (nome) =>
    (
      await q(
        `SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = $1`,
        [nome]
      )
    ).rowCount > 0;
  const temColuna = async (tabela, coluna) =>
    (
      await q(
        `SELECT 1 FROM information_schema.columns
          WHERE table_name = $1 AND column_name = $2`,
        [tabela, coluna]
      )
    ).rowCount > 0;
  const temIndice = async (nome) =>
    (await q(`SELECT 1 FROM pg_indexes WHERE indexname = $1`, [nome])).rowCount > 0;
  const temTipo = async (nome) =>
    (await q(`SELECT 1 FROM pg_type WHERE typname = $1`, [nome])).rowCount > 0;
  const temTrigger = async (nome) =>
    (await q(`SELECT 1 FROM pg_trigger WHERE tgname = $1`, [nome])).rowCount > 0;
  const temFuncao = async (nome) =>
    (await q(`SELECT 1 FROM pg_proc WHERE proname = $1`, [nome])).rowCount > 0;

  return {
    "enum ObligationDisposition": await temTipo("ObligationDisposition"),
    "enum ObligationState": await temTipo("ObligationState"),
    "tabela billing_obligations": await temTabela("billing_obligations"),
    "tabela subscription_courtesies": await temTabela("subscription_courtesies"),
    "tabela billing_shadow_decisions": await temTabela("billing_shadow_decisions"),
    "unique (subscriptionId, sequence)": await temIndice(
      "billing_obligations_subscriptionId_sequence_key"
    ),
    'Invoice."billingObligationId"': await temColuna("Invoice", "billingObligationId"),
    'dunning_events."stage"': await temColuna("dunning_events", "stage"),
    "unique dunning (invoiceId, action, stage)": await temIndice(
      "dunning_events_invoiceId_action_stage_key"
    ),
    "índice dunning (companyId, action, status)": await temIndice(
      "dunning_events_companyId_action_status_idx"
    ),
    "índice dunning (companyId, stage, status)": await temIndice(
      "dunning_events_companyId_stage_status_idx"
    ),
    "função bump_..._by_subscription": await temFuncao("bump_entitlement_revision_by_subscription"),
    "trigger obligation INSERT": await temTrigger("billing_obligation_entitlement_revision_ins"),
    "trigger obligation UPDATE": await temTrigger("billing_obligation_entitlement_revision_upd"),
    "trigger obligation DELETE": await temTrigger("billing_obligation_entitlement_revision_del"),
    "trigger courtesy INSERT": await temTrigger("subscription_courtesy_entitlement_revision_ins"),
    "trigger courtesy UPDATE": await temTrigger("subscription_courtesy_entitlement_revision_upd"),
    "trigger courtesy DELETE": await temTrigger("subscription_courtesy_entitlement_revision_del"),
  };
}

function imprimirInventario(estado) {
  for (const [nome, presente] of Object.entries(estado)) {
    console.log(`   ${presente ? "✔" : "·"} ${nome}${presente ? "" : " (ausente)"}`);
  }
}

/** Uma assinatura qualquer, com plano — as sondas precisam de FKs válidas. */
async function escolherAssinaturaDeProva(q) {
  const r = await q(
    `SELECT s."id" AS "subscriptionId", s."companyId", s."planId", s."billingCycle"::text AS cycle
       FROM "Subscription" s
      ORDER BY s."createdAt" ASC
      LIMIT 1`
  );
  return r.rowCount > 0 ? r.rows[0] : null;
}

/**
 * `true` só se o erro for VIOLAÇÃO DE UNICIDADE (SQLSTATE 23505).
 *
 * 🔑 Checar o CÓDIGO, não "houve exceção". Se a prova aceitasse qualquer erro,
 * uma falha de FK (23503), de NOT NULL (23502) ou de tipo passaria por
 * "unicidade funcionando" — prova FALSA, que é pior que nenhuma prova: daria
 * confiança para ligar um motor cuja constraint não existe.
 *
 * O Prisma envolve o erro do Postgres: `P2002` é o código dele para unique
 * violation, e o SQLSTATE cru aparece em `meta.code`/`message` conforme o
 * caminho (`$executeRawUnsafe` costuma propagar o 23505 no texto). Aceitamos
 * qualquer uma das formas — mas SÓ elas.
 */
function ehViolacaoDeUnicidade(err) {
  if (!err) return false;
  const code = String(err.code ?? "");
  if (code === "23505" || code === "P2002") return true;
  const metaCode = String(err.meta?.code ?? "");
  if (metaCode === "23505") return true;
  return /\b23505\b|unique constraint|duplicate key value/i.test(String(err.message ?? ""));
}

/**
 * PROVA 1 — a unicidade de (subscriptionId, sequence) MORDE.
 *
 * Insere duas obrigações com a mesma chave e exige que a SEGUNDA falhe **por
 * unicidade**. Sem esta prova, um índice criado sem `UNIQUE` (ou não criado
 * por um `IF NOT EXISTS` que encontrou um índice homônimo não-único) passaria
 * despercebido, e duas execuções concorrentes do motor duplicariam a cobrança
 * do mesmo período — o mesmo furo que produziu INV-000003/4 em `Invoice`.
 *
 * 🔑 Cada inserção vai em sua PRÓPRIA transação, e não nas duas dentro de uma
 * só. Motivo: no Postgres, um erro aborta a transação inteira e todo comando
 * seguinte falha com `25P02 (current transaction is aborted)`. Reaproveitar a
 * tx depois da violação exigiria `SAVEPOINT`/`ROLLBACK TO SAVEPOINT` — mais
 * peça móvel para o mesmo resultado. Duas transações, ambas revertidas, é a
 * versão simples e honesta:
 *
 *   tx A: insere a linha 1 → lê de volta (confirma que existe) → ROLLBACK
 *   tx B: insere a linha 1 e a linha 2 → a 2ª estoura → ROLLBACK automático
 *
 * A tx B é a que prova; a tx A existe para separar "a segunda falhou porque a
 * constraint mordeu" de "as inserções falham por qualquer motivo" — se a linha
 * sozinha já não entra, a prova é declarada INCONCLUSIVA em vez de verde.
 *
 * Reversão garantida nos dois caminhos: `$transaction` sempre dá ROLLBACK
 * quando o callback lança, seja o SENTINELA (caminho feliz) seja o erro real
 * do banco (caminho de exceção). Nada é commitado em nenhum cenário.
 */
async function provaUnicidade(prisma, alvo) {
  const SEQ = -777777; // sequência impossível no uso real (o motor começa em 1)

  // ---- tx A: a linha sozinha entra? (linha de base) ----
  let linhaSozinhaEntrou = false;
  try {
    await prisma.$transaction(async (tx) => {
      await inserirObrigacaoSonda(tx, alvo, "__probe_uniq_1__", SEQ);
      const r = await tx.$queryRawUnsafe(
        `SELECT 1 FROM "billing_obligations" WHERE "id" = $1`,
        "__probe_uniq_1__"
      );
      linhaSozinhaEntrou = r.length === 1;
      throw new Error(SENTINELA); // ROLLBACK
    });
  } catch (err) {
    if (err.message !== SENTINELA) {
      throw new Error(
        `PROVA 1 INCONCLUSIVA: nem a PRIMEIRA obrigação-sonda entrou (${err.message}). ` +
          "Constraint não foi exercitada."
      );
    }
  }
  if (!linhaSozinhaEntrou) {
    throw new Error("PROVA 1 INCONCLUSIVA: a inserção isolada não produziu linha");
  }

  // ---- tx B: a MESMA chave duas vezes tem que estourar 23505 ----
  let erroDaSegunda = null;
  let segundaPassou = false;
  try {
    await prisma.$transaction(async (tx) => {
      await inserirObrigacaoSonda(tx, alvo, "__probe_uniq_1__", SEQ);
      try {
        await inserirObrigacaoSonda(tx, alvo, "__probe_uniq_2__", SEQ);
        segundaPassou = true; // não devia chegar aqui
      } catch (err) {
        erroDaSegunda = err;
      }
      // A tx já está abortada se houve violação; lançar aqui apenas garante o
      // ROLLBACK explícito nos DOIS caminhos (violação ou ausência dela).
      throw new Error(SENTINELA);
    });
  } catch (err) {
    // Erro inesperado só é repassado se não for o sentinela nem a própria
    // violação (que o Prisma pode propagar pelo $transaction).
    if (err.message !== SENTINELA && err !== erroDaSegunda && !ehViolacaoDeUnicidade(err)) {
      throw err;
    }
    if (!erroDaSegunda && ehViolacaoDeUnicidade(err)) erroDaSegunda = err;
  }

  if (segundaPassou || !erroDaSegunda) {
    throw new Error(
      "PROVA 1 FALHOU: duas obrigações com o mesmo (subscriptionId, sequence) foram ACEITAS. " +
        "O índice unique não existe ou não é único — o motor duplicaria cobrança."
    );
  }
  if (!ehViolacaoDeUnicidade(erroDaSegunda)) {
    throw new Error(
      "PROVA 1 INCONCLUSIVA: a segunda inserção falhou, mas NÃO por unicidade " +
        `(code=${erroDaSegunda.code ?? "?"}): ${erroDaSegunda.message}`
    );
  }
  console.log("✅ prova 1 — unique (subscriptionId, sequence) rejeita a duplicata (23505)");
}

/**
 * PROVA 2 (a mais importante) — I2: mexer na obrigação BUMPA a revisão.
 *
 * Lê a revisão de entitlement da empresa, insere uma obrigação dela dentro de
 * uma transação, relê a revisão e exige que tenha AUMENTADO. Depois faz um
 * UPDATE numa coluna do WHEN e exige novo aumento — o INSERT e o UPDATE usam
 * caminhos diferentes do trigger, e provar só o INSERT deixaria o UPDATE (que
 * é o caso real: PLANNED → ISSUED) sem cobertura.
 *
 * Se isto falhar, a publicação ao Domus sairia com a revisão de ontem, o Domus
 * rejeitaria por revisão não-crescente, e o cadeado da clínica ficaria preso no
 * estado antigo — silenciosamente.
 *
 * A leitura da revisão é feita DENTRO da mesma transação: o trigger escreve em
 * `EntitlementRevision`, e essa escrita também é revertida no rollback. Nada
 * fica na tabela.
 *
 * 🔑 A prova FALHA ALTO se o trigger não existir ou não disparar. Uma prova que
 * fica verde com o trigger ausente é pior que nenhuma prova. Três leituras
 * (antes, pós-INSERT, pós-UPDATE) e aumento ESTRITO exigido nas duas
 * transições — igualdade é falha, não empate.
 *
 * Cobre também a `subscription_courtesies`: é a segunda tabela com trigger, e
 * conceder cortesia muda o acesso tanto quanto emitir obrigação.
 */
async function provaI2(prisma, q, alvo) {
  let revAntes = null;
  let revDepoisInsert = null;
  let revDepoisUpdate = null;
  let revDepoisCortesia = null;

  try {
    await prisma.$transaction(async (tx) => {
      const lerRev = async () => {
        const r = await tx.$queryRawUnsafe(
          `SELECT "revision"::text AS r FROM "EntitlementRevision" WHERE "companyId" = $1`,
          alvo.companyId
        );
        // Empresa sem linha ainda: trata como 0 — qualquer bump gera valor > 0,
        // então a ausência de linha NUNCA faz a prova passar por acidente.
        return r.length > 0 ? BigInt(r[0].r) : 0n;
      };

      revAntes = await lerRev();

      // (a) INSERT de obrigação → bump
      await inserirObrigacaoSonda(tx, alvo, "__probe_i2__", -888888);
      revDepoisInsert = await lerRev();

      // (b) UPDATE de `state` (PLANNED → ISSUED, a transição real) → bump
      await tx.$executeRawUnsafe(
        `UPDATE "billing_obligations" SET "state" = 'ISSUED', "issuedAt" = now()
          WHERE "id" = $1`,
        "__probe_i2__"
      );
      revDepoisUpdate = await lerRev();

      // (c) INSERT de cortesia → bump (segunda tabela com trigger)
      await tx.$executeRawUnsafe(
        `INSERT INTO "subscription_courtesies"
           ("id", "subscriptionId", "startsAt", "reason", "grantedBy", "updatedAt")
         VALUES ($1, $2, now(), 'sonda da migracao (revertida)', 'apply-billing-obligations.cjs', now())`,
        "__probe_i2_courtesy__",
        alvo.subscriptionId
      );
      revDepoisCortesia = await lerRev();

      throw new Error(SENTINELA); // ROLLBACK de tudo acima
    });
  } catch (err) {
    // Qualquer erro que NÃO seja o sentinela é erro de verdade — mas a
    // transação já reverteu de qualquer forma ($transaction sempre dá ROLLBACK
    // quando o callback lança), então nada fica no banco nem neste caminho.
    if (err.message !== SENTINELA) {
      throw new Error(`PROVA 2 abortada por erro no meio da sonda: ${err.message}`);
    }
  }

  const incompleta = [revAntes, revDepoisInsert, revDepoisUpdate, revDepoisCortesia].some(
    (v) => v === null
  );
  if (incompleta) {
    throw new Error("PROVA 2 não completou — sonda interrompida antes de todas as leituras");
  }

  const exigirAumento = (de, para, rotulo, diagnostico) => {
    if (para > de) return;
    throw new Error(
      `PROVA 2 FALHOU (I2/${rotulo}): revisão NÃO aumentou (${de} → ${para}). ${diagnostico}`
    );
  };

  exigirAumento(
    revAntes,
    revDepoisInsert,
    "INSERT obrigação",
    "O trigger billing_obligation_entitlement_revision_ins não existe ou não dispara. " +
      "Consequência: o Domus receberia payload novo com revisão antiga e rejeitaria a " +
      "publicação — a clínica seguiria no estado de acesso ERRADO, em silêncio."
  );
  exigirAumento(
    revDepoisInsert,
    revDepoisUpdate,
    "UPDATE state",
    "O WHEN do trigger de UPDATE não cobre a coluna `state` — justamente a transição " +
      "PLANNED → ISSUED, que é o momento em que a obrigação passa a poder restringir."
  );
  exigirAumento(
    revDepoisUpdate,
    revDepoisCortesia,
    "INSERT cortesia",
    "O trigger subscription_courtesy_entitlement_revision_ins não existe ou não dispara. " +
      "Conceder cortesia mudaria o acesso sem bumpar a revisão."
  );

  console.log(
    `✅ prova 2 — I2 confirmada: ${revAntes} → ${revDepoisInsert} (INSERT obrigação) → ` +
      `${revDepoisUpdate} (UPDATE state) → ${revDepoisCortesia} (INSERT cortesia)`
  );

}

/**
 * Confere que NENHUMA sonda sobrou, nas duas tabelas que elas tocam.
 *
 * Roda no `finally` das provas — ou seja, TAMBÉM quando uma prova falhou no
 * meio. Este script roda contra PRODUÇÃO, e uma sonda esquecida é lixo
 * contábil numa tabela de obrigações de cobrança: o operador precisa saber
 * disso mesmo (aliás, sobretudo) quando algo deu errado.
 *
 * ⚠️ `_` é curinga de UM caractere no LIKE do Postgres, então `'__probe%'` cru
 * casaria também com "xyprobe...". `ESCAPE '\'` torna a busca literal — a
 * contagem é exatamente das sondas, sem falso positivo que assustaria o dono à
 * toa nem falso negativo que esconderia lixo.
 */
async function verificarLimpeza(q) {
  const LIKE = `'\\_\\_probe%' ESCAPE '\\'`;
  const sobrouObrigacao = await q(
    `SELECT count(*)::int AS n FROM "billing_obligations" WHERE "id" LIKE ${LIKE}`
  );
  const sobrouCortesia = await q(
    `SELECT count(*)::int AS n FROM "subscription_courtesies" WHERE "id" LIKE ${LIKE}`
  );
  const nObrigacao = Number(sobrouObrigacao.rows[0].n);
  const nCortesia = Number(sobrouCortesia.rows[0].n);

  if (nObrigacao + nCortesia !== 0) {
    throw new Error(
      `ROLLBACK falhou: ${nObrigacao} obrigação(ões) e ${nCortesia} cortesia(s) de sonda ` +
        "ficaram no banco. REMOVER À MÃO (ids começam com '__probe') antes de qualquer " +
        "outra coisa — são linhas FALSAS numa tabela contábil."
    );
  }
  console.log("✅ sondas revertidas — billing_obligations e subscription_courtesies limpas");
}

/** Insere uma obrigação-sonda com FKs válidas e valores inofensivos. */
function inserirObrigacaoSonda(tx, alvo, id, sequence) {
  return tx.$executeRawUnsafe(
    `INSERT INTO "billing_obligations"
       ("id", "subscriptionId", "sequence", "periodStart", "periodEnd",
        "planId", "cycle", "priceCents", "disposition", "state", "updatedAt")
     VALUES ($1, $2, $3, now(), now() + interval '30 days',
             $4, $5::"BillingCycle", 0, 'CHARGE', 'PLANNED', now())`,
    id,
    alvo.subscriptionId,
    sequence,
    alvo.planId,
    alvo.cycle
  );
}

main().catch((err) => {
  console.error("\n❌ Falhou:", err.message);
  process.exit(1);
});
