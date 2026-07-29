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
 * ## COMO O SQL CHEGA AO BANCO (leia antes de mexer)
 *
 * Um statement POR CHAMADA, todos dentro de UMA `$transaction` interativa.
 *
 * A primeira versão deste script mandava o `.sql` inteiro num único
 * `$executeRawUnsafe` e confiava no `BEGIN;`/`COMMIT;` escritos dentro do
 * arquivo. Isso FALHOU em produção, sem escrever nada:
 *
 *   Code: `42601`. `cannot insert multiple commands into a prepared statement`
 *
 * O Prisma emite `$executeRawUnsafe` como PREPARED STATEMENT, e um prepared
 * statement aceita EXATAMENTE UM comando — não existe como mandar 35 juntos.
 * (O script irmão `apply-admin-notification-period-key.cjs` nunca bateu nisso
 * porque sempre mandou um statement por vez.)
 *
 * Dividir o arquivo, porém, NÃO pode ser `split(";")`: medido contra este
 * `.sql`, isso produz 59 fragmentos, vários deles pedaços SOLTOS do corpo das
 * funções plpgsql (`END IF`, `RETURN OLD`, `PERFORM ...`), inválidos isolados.
 * O divisor correto vive em `src/lib/sql-statements.cjs` — respeita `$$` e
 * `$tag$`, string literal, identificador entre aspas e comentário — e é coberto
 * por `src/lib/sql-statements.test.ts`, inclusive contra o `.sql` REAL desta
 * migração, provando que os corpos `$$` ficam intactos.
 *
 * A atomicidade passou a vir da `$transaction` do Prisma, e não do envelope
 * escrito no arquivo. O porquê está no docblock de `aplicarAtomicamente`
 * (resumo: chamadas raw separadas são aquisições separadas do pool do Prisma,
 * e nada garante que caiam na mesma conexão — `$transaction` reserva uma só).
 * E o inventário dos objetos virou GATE DE COMMIT: é conferido dentro da
 * transação, então "faltou trigger" vira ROLLBACK, não um laudo pós-fato.
 *
 * ## ANTES de rodar isto: faça o dry-run
 *
 * O repo tem `scripts/dry-run-migration.cjs`, que aplica um `.sql` dentro de
 * uma transação e dá ROLLBACK — prova o SQL contra o schema REAL sem deixar
 * rastro.
 *
 * ⚠️ RESSALVA VERIFICADA, AINDA VÁLIDA: aquele script está amarrado a OUTRA
 * migração — afirma o efeito de `Company.domusClinicId` e "tem que continuar 14
 * empresas" no fim, e divide o arquivo por ';', que é exatamente o erro que
 * estilhaça os corpos `$$`. Rodá-lo cru contra ESTA migração falha por
 * limitação DELE, não por defeito do SQL. Para usá-lo aqui seria preciso trocar
 * o split por `splitSqlStatements` e reescrever as asserções finais. Enquanto
 * isso não for feito, a rede de segurança é a `$transaction` deste script mais
 * o preflight `prepararStatements`, que roda antes de qualquer escrita.
 *
 * ## Códigos de saída
 *
 *   0 — migração aplicada, registrada, e AS DUAS PROVAS passaram
 *   2 — migração aplicada e registrada, mas as provas foram PULADAS
 *       (nenhuma Subscription no banco). Constraint e trigger seguem NÃO
 *       PROVADOS — não é sucesso pleno, e o exit code diz isso.
 *   1 — falhou
 *
 * Uso: node scripts/apply-billing-obligations.cjs
 */
require("dotenv").config();
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { PrismaClient } = require("@prisma/client");
const {
  splitSqlStatements,
  removerComentarios,
  ehControleDeTransacao,
} = require("../src/lib/sql-statements.cjs");

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
    // 2) Aplica: UM statement por chamada, TODOS dentro de UMA transação
    //    interativa do Prisma.
    // -----------------------------------------------------------------------
    const sql = fs.readFileSync(MIGRATION_SQL, "utf8");
    const statements = prepararStatements(sql);
    console.log(`\n── APLICANDO (${MIGRATION_SQL.split("/").slice(-2).join("/")}) ──`);
    console.log(
      `   ${statements.length} statements DDL, todos dentro de UMA $transaction interativa`
    );
    await aplicarAtomicamente(prisma, statements);
    console.log("   statements executados, inventário conferido DENTRO da tx, e commitados");

    // -----------------------------------------------------------------------
    // 3) DEPOIS: reconfere FORA da transação, agora contra o estado commitado.
    //
    //    Não é redundância com a conferência de dentro da tx: aquela DECIDE
    //    (commit ou rollback), esta CONSTATA o que ficou no banco de verdade.
    //    Se as duas divergissem, algo muito errado aconteceu entre o commit e
    //    agora — e é melhor descobrir aqui do que no primeiro cliente.
    // -----------------------------------------------------------------------
    console.log("\n── DEPOIS ──");
    const estadoDepois = await inventario(q);
    imprimirInventario(estadoDepois);

    const faltando = nomesAusentes(estadoDepois);
    if (faltando.length > 0) {
      throw new Error(
        `verificação pós-COMMIT FALHOU — ausentes: ${faltando.join(", ")}. ` +
          "A transação reportou sucesso mas os objetos não estão no banco."
      );
    }
    console.log("\n✅ todos os objetos presentes");

    // -----------------------------------------------------------------------
    // 3b) Registra em `_prisma_migrations`.
    // -----------------------------------------------------------------------
    await registrarMigracao(prisma, q, sql);

    // -----------------------------------------------------------------------
    // 4) PROVAS em transação revertida.
    // -----------------------------------------------------------------------
    const alvo = await escolherAssinaturaDeProva(q);
    if (!alvo) {
      // Exit 2, não 0: os objetos existem, mas constraint e trigger NÃO foram
      // exercitados. "Aplicado" e "provado" são coisas diferentes, e o exit
      // code precisa distingui-las — senão um CI (ou o próprio dono) leria
      // sucesso pleno onde houve meia verificação.
      console.log(
        "\n⚠️  Nenhuma assinatura no banco — as duas provas foram PULADAS.\n" +
          "    Os objetos existem e a migração foi registrada, mas a constraint de\n" +
          "    unicidade e os triggers de I2 seguem NÃO PROVADOS.\n" +
          "    Rode este script de novo quando houver ao menos uma assinatura.\n" +
          "    (exit 2 = aplicado sem provas)"
      );
      process.exitCode = 2;
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

/**
 * Registra a migração em `_prisma_migrations` — a tabela de controle do Prisma.
 *
 * 🔑 Sem isto, o Prisma considera esta migração PENDENTE mesmo com o DDL já
 * aplicado, e o próximo `migrate deploy` tentaria re-rodá-la. Aqui o dano é
 * pior que o normal: `migrate deploy` PARA na primeira migração pendente que
 * falhe, então TODA migração futura ficaria travada atrás desta.
 *
 * O repo já tem essa cicatriz — as 3 migrações do F1 estão aplicadas no banco
 * e ausentes da tabela (`docs/superpowers/plans/2026-07-16-vis-medical-fluxo-atendimento.md:150`),
 * e o plano da Fase 2 de cobrança registra o alerta textualmente
 * (`2026-06-11-saas-cobranca-asaas-fase2.md:1580`). Não repetir.
 *
 * `checksum` = SHA-256 do arquivo, que é como o Prisma o calcula. Se o `.sql`
 * for editado depois de aplicado, o Prisma acusa drift — comportamento
 * desejado, e o motivo de gravar o checksum real em vez de um placeholder.
 *
 * Idempotente: se a linha já existe (reexecução do script), não duplica.
 */
async function registrarMigracao(prisma, q, sql) {
  const NOME = "20260729180000_billing_obligations";
  console.log("\n── REGISTRO EM _prisma_migrations ──");

  const existeTabela = await q(
    `SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = '_prisma_migrations'`
  );
  if (existeTabela.rowCount === 0) {
    console.log(
      "   ⚠️  tabela _prisma_migrations não existe neste banco — nada a registrar.\n" +
        "       (Se um dia usarem `migrate deploy` aqui, esta migração vai parecer pendente.)"
    );
    return;
  }

  const jaRegistrada = await q(
    `SELECT "finished_at" FROM "_prisma_migrations" WHERE "migration_name" = $1`,
    [NOME]
  );
  if (jaRegistrada.rowCount > 0) {
    console.log(`   já registrada (finished_at=${jaRegistrada.rows[0].finished_at}) — ok`);
    return;
  }

  const checksum = crypto.createHash("sha256").update(sql).digest("hex");
  await prisma.$executeRawUnsafe(
    `INSERT INTO "_prisma_migrations"
       ("id", "checksum", "migration_name", "started_at", "finished_at",
        "applied_steps_count", "logs", "rolled_back_at")
     VALUES ($1, $2, $3, now(), now(), 1, NULL, NULL)`,
    crypto.randomUUID(),
    checksum,
    NOME
  );

  // Verificação: o INSERT precisa ter produzido a linha.
  const conferindo = await q(
    `SELECT "checksum" FROM "_prisma_migrations" WHERE "migration_name" = $1`,
    [NOME]
  );
  if (conferindo.rowCount !== 1) {
    throw new Error(
      `FALHOU registrar em _prisma_migrations. Rode à mão:\n` +
        `  ./node_modules/.bin/prisma migrate resolve --applied ${NOME}`
    );
  }
  console.log(`   ✅ registrada (checksum sha256 ${checksum.slice(0, 12)}…)`);
  console.log("   `migrate deploy` futuro não vai tentar re-rodar esta migração.");
}

/**
 * Divide o `.sql` em statements executáveis e PROVA que a aplicação vai ser
 * atômica. Este é o preflight — a mesma intenção do antigo
 * `exigirEnvelopeTransacional`, adaptada ao novo transporte.
 *
 * ## O que mudou, e por quê
 *
 * A versão anterior mandava o arquivo INTEIRO num único `$executeRawUnsafe` e
 * dependia do `BEGIN;`/`COMMIT;` escritos DENTRO do `.sql`. Isso falhou em
 * produção, sem escrever nada:
 *
 *   Code: `42601`. `cannot insert multiple commands into a prepared statement`
 *
 * O Prisma emite `$executeRawUnsafe` como prepared statement, e um prepared
 * statement aceita EXATAMENTE UM comando. Não há como mandar 35 de uma vez.
 *
 * Então agora vai um por chamada — e a atomicidade passa a vir de uma
 * `$transaction` interativa do Prisma, que é uma transação DE VERDADE numa
 * conexão pinada. Consequência direta: o `BEGIN;`/`COMMIT;` do arquivo viram
 * ESTORVO. `BEGIN` dentro de transação aberta gera `WARNING: there is already a
 * transaction in progress`, e `COMMIT` no meio encerraria a transação do Prisma
 * pelas costas dele — que é exatamente o cenário "tabelas sim, triggers não"
 * que queremos impedir. Por isso este preflight os LOCALIZA e os REMOVE da
 * lista, em vez de mandá-los ao banco.
 *
 * ## O que continua sendo exigido
 *
 * A garantia não afrouxou; mudou de dono. Antes: "o arquivo tem envelope".
 * Agora, três exigências verificadas ANTES de qualquer escrita:
 *
 *   1. o arquivo declara a intenção de atomicidade (BEGIN … COMMIT presentes);
 *   2. o BEGIN é o PRIMEIRO statement e o COMMIT é o ÚLTIMO — envelope de
 *      verdade, não um `COMMIT` perdido no meio que deixaria metade fora;
 *   3. não sobra NENHUM outro comando de controle de transação no miolo. E
 *      "controle" aqui é a família inteira (`COMMIT WORK`, `END`, `ABORT`,
 *      `SAVEPOINT`, `COMMIT AND CHAIN`…), não só as formas secas — ver
 *      `ehControleDeTransacao`. Um reconhecedor estreito seria um furo: o
 *      comando escaparia para dentro da `$transaction` e a encerraria pelo
 *      meio.
 *
 * Falhando qualquer uma, o script aborta sem tocar no banco.
 *
 * A quarta garantia não cabe aqui e mora em `aplicarAtomicamente`: o inventário
 * dos objetos é conferido DENTRO da transação e é ele quem autoriza o commit.
 * Preflight lê o arquivo; só o gate de dentro da tx sabe o que o banco REALMENTE
 * ganhou.
 */
function prepararStatements(sql) {
  const statements = splitSqlStatements(sql);

  const indicesControle = statements
    .map((st, i) => (ehControleDeTransacao(st) ? i : -1))
    .filter((i) => i >= 0);

  const primeiro = statements[0] ?? "";
  const ultimo = statements[statements.length - 1] ?? "";
  const abreComBegin = /^(BEGIN|START\s+TRANSACTION)$/i.test(
    removerComentarios(primeiro).trim().replace(/;+$/, "").trim()
  );
  const fechaComCommit = /^COMMIT$/i.test(
    removerComentarios(ultimo).trim().replace(/;+$/, "").trim()
  );

  if (!abreComBegin || !fechaComCommit) {
    throw new Error(
      "ABORTADO: o migration.sql não declara envelope transacional " +
        `(primeiro statement é BEGIN? ${abreComBegin}; último é COMMIT? ${fechaComCommit}). ` +
        "O envelope é a declaração explícita de que este arquivo SÓ pode ser aplicado " +
        "por inteiro. Sem ele, alguém poderia aplicá-lo com outra ferramenta, statement a " +
        "statement, e uma falha no meio deixaria as tabelas criadas e os TRIGGERS NÃO — " +
        "I2 quebrada em silêncio. Restaure o envelope."
    );
  }

  // Controle de transação SÓ nas pontas. Um COMMIT no miolo dividiria a
  // migração em dois pedaços commitáveis — atomicidade de mentira.
  const controleNoMiolo = indicesControle.filter(
    (i) => i !== 0 && i !== statements.length - 1
  );
  if (controleNoMiolo.length > 0) {
    const amostra = controleNoMiolo
      .map((i) => `#${i + 1} ${resumo(statements[i])}`)
      .join("; ");
    throw new Error(
      `ABORTADO: há comando de controle de transação NO MEIO do arquivo (${amostra}). ` +
        "Isso partiria a migração em pedaços commitáveis separados — o oposto de atômico."
    );
  }

  // Fora as pontas, o que roda é o miolo. O BEGIN/COMMIT do arquivo NÃO é
  // enviado: quem abre e fecha a transação é o Prisma.
  const miolo = statements.slice(1, -1);
  if (miolo.length === 0) {
    throw new Error("ABORTADO: o migration.sql não tem nenhum statement além do envelope.");
  }
  return miolo;
}

/**
 * Executa os statements DENTRO de uma `$transaction` interativa. Ou tudo entra,
 * ou nada entra.
 *
 * ## Por que `$transaction` e não o BEGIN/COMMIT do arquivo
 *
 * Escolha deliberada entre duas opções:
 *
 *  (a) `$transaction` interativa, mandando cada statement pelo `tx`. ESCOLHIDA.
 *      O Prisma abre `BEGIN`, PINA a conexão para todas as chamadas do callback
 *      e dá `COMMIT` no fim (ou `ROLLBACK` se o callback lançar). A conexão
 *      pinada é o ponto: é o único jeito de garantir que os 33 statements caem
 *      na MESMA sessão.
 *
 *  (b) mandar `BEGIN;` e `COMMIT;` como statements soltos via
 *      `$executeRawUnsafe`, confiando que caiam na mesma conexão. RECUSADA.
 *
 *      Precisão sobre o porquê, porque é fácil errar o argumento: o PgBouncer
 *      em transaction pooling NÃO troca a conexão upstream a cada statement
 *      depois de um `BEGIN` — ele segura a conexão até a transação fechar. O
 *      problema está um andar acima: quem não garante nada é o POOL DO PRISMA.
 *      Duas chamadas `$executeRawUnsafe` separadas são duas aquisições
 *      independentes do pool, e nada obriga a segunda a pegar a mesma conexão
 *      da primeira. Basta uma para o `BEGIN` cair numa conexão e o
 *      `CREATE TRIGGER` em outra — a segunda em autocommit, cada DDL entrando
 *      sozinho, e o `COMMIT` final sem transação para fechar.
 *
 *      O modo de falha seria silencioso e seria exatamente "tabelas sim,
 *      triggers não". `$transaction` existe precisamente para resolver isso:
 *      ela reserva UMA conexão para todo o callback. Por isso (a).
 *
 * ## Timeout: explícito, não o padrão
 *
 * O padrão do Prisma é `timeout: 5000` (5s) e `maxWait: 2000`. São 33 DDLs
 * contra um Postgres remoto atrás de pooler — estourar 5s é plausível, e o
 * estouro cairia como ROLLBACK no meio: nada perdido, mas o dono ficaria
 * olhando um erro obscuro de timeout achando que o SQL está errado. 120s dá
 * folga de sobra sem virar espera infinita; `maxWait` de 20s cobre cold start
 * da conexão.
 *
 * ## Mensagem de erro
 *
 * Se um statement falhar, o erro do Postgres sozinho ("relation already
 * exists") não diz ONDE. Aqui o erro é reembalado com o índice, o total e o
 * início do statement — o dono abre o `.sql` e vai direto no ponto.
 *
 * ## O inventário roda DENTRO da transação — e é ele quem decide o commit
 *
 * 🔑 Conferir os objetos DEPOIS do commit seria conferir tarde demais. Se
 * alguém editasse o `.sql` e removesse os `CREATE TRIGGER` (ou um `IF NOT
 * EXISTS` encontrasse um objeto homônimo e virasse no-op), todos os statements
 * "passariam", o COMMIT aconteceria, e só então a conferência acusaria os
 * triggers ausentes. O script gritaria — mas o banco já estaria commitado no
 * estado PROIBIDO: tabelas criadas, triggers não. Exatamente o que a I2 existe
 * para impedir, e o pior estado possível segundo a própria migração.
 *
 * Por isso o inventário é lido aqui, com o `tx`, antes do callback retornar:
 * faltando qualquer objeto, este código LANÇA, o Prisma dá ROLLBACK, e o banco
 * volta ao estado anterior. A verificação deixa de ser um laudo e passa a ser
 * um GATE.
 */
async function aplicarAtomicamente(prisma, statements) {
  await prisma.$transaction(
    async (tx) => {
      for (let i = 0; i < statements.length; i += 1) {
        const st = statements[i];
        try {
          await tx.$executeRawUnsafe(st);
        } catch (err) {
          throw new Error(
            `statement ${i + 1}/${statements.length} FALHOU — nada foi aplicado (ROLLBACK).\n` +
              `   statement: ${resumo(st)}\n` +
              `   erro do banco: ${String(err.message ?? err).split("\n")[0]}`
          );
        }
      }

      // Gate de commit: o inventário lido pela MESMA transação.
      const qTx = async (sql, params) => {
        const rows = params
          ? await tx.$queryRawUnsafe(sql, ...params)
          : await tx.$queryRawUnsafe(sql);
        return { rows, rowCount: Array.isArray(rows) ? rows.length : 0 };
      };
      const faltando = nomesAusentes(await inventario(qTx));
      if (faltando.length > 0) {
        throw new Error(
          `os ${statements.length} statements rodaram sem erro, mas ${faltando.length} objeto(s) ` +
            `NÃO existem ao fim da transação: ${faltando.join(", ")}.\n` +
            "   ROLLBACK feito — o banco NÃO ficou com metade da migração. Um `.sql` que roda\n" +
            "   sem erro e não cria o objeto é sinal de CREATE virado no-op (IF NOT EXISTS que\n" +
            "   achou homônimo) ou de statement removido do arquivo por engano."
        );
      }
    },
    // 33 DDLs remotos mais o inventário não cabem nos 5s padrão do Prisma.
    { timeout: 120_000, maxWait: 20_000 }
  );
}

/** Nomes dos objetos ausentes num inventário. */
function nomesAusentes(estado) {
  return Object.entries(estado)
    .filter(([, presente]) => !presente)
    .map(([nome]) => nome);
}

/** Início legível de um statement, para mensagem de erro. */
function resumo(statement) {
  const limpo = removerComentarios(statement).replace(/\s+/g, " ").trim();
  return limpo.length > 80 ? `${limpo.slice(0, 80)}…` : limpo;
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
