#!/usr/bin/env node
/**
 * Plano B — etapa 2 do rollout: BOOTSTRAP das obrigações de cobrança.
 *
 * Cria a âncora (`sequence = 1`) de cada assinatura que importa, mais as
 * cortesias formais e o mapeamento das faturas com PIX vivo. Enquanto o
 * bootstrap não roda para uma assinatura, o motor devolve
 * `skipped/needs_bootstrap` e NÃO COBRA NINGUÉM — a âncora é por assinatura,
 * então ligar a emissão para uma clínica não exige regularizar as 16.
 *
 * Fonte da verdade dos valores: `docs/superpowers/plans/2026-07-30-bootstrap-obrigacoes-aprovado.md`,
 * aprovado linha a linha pelo dono em 2026-07-30 a partir de levantamento
 * read-only em produção. Este script NÃO decide nada de comercial: ele
 * TRANSCREVE aquele documento e se recusa a rodar se o banco divergir dele.
 *
 * ⛔ NÃO chama o Asaas. Nenhuma cobrança nova é criada — as duas faturas com PIX
 *    já existem no gateway. Este script só escreve no banco.
 *
 * ## Padrão é DRY-RUN. Persistir exige `--apply`.
 *
 * Decisão deliberada: `node scripts/bootstrap-billing-obligations.cjs` sem
 * argumento NÃO deixa nada no banco. Um comando distraído (histórico do shell,
 * copiar e colar de um runbook, seta pra cima) não pode gravar registro contábil
 * em produção. O modo que PERSISTE tem que ser DIGITADO.
 *
 * ⚠️ Precisão importante: o dry-run **executa as escritas dentro da transação e
 * dá ROLLBACK** — ele não é "lê e imprime o que faria". Sem exercitar as
 * escritas, o gate de commit leria o banco ATUAL (sem obrigação nenhuma) em vez
 * do estado FUTURO, e reprovaria sempre — o dry-run falharia exatamente na foto
 * que existe para conferir, sem provar contiguidade, unicidade nem FK. O preço
 * dessa honestidade é um GAP na `entitlement_revision_seq` (sequence do Postgres
 * não volta no rollback), inofensivo porque a garantia daquele contador é ser
 * monotônico, não denso. O rollback é CONFERIDO no fim, não suposto.
 *
 * ## O que é verificado ANTES de escrever (e aborta se falhar)
 *
 * Idempotência aqui NÃO é "se já existe, pula". É comparação EXATA:
 *
 *   - não existe            → cria
 *   - existe e é idêntico   → no-op (reexecução segura)
 *   - existe e DIVERGE      → ABORTA a transação inteira
 *
 * "Se existe, pula" aceitaria silenciosamente uma obrigação com preço, período
 * ou disposição errados e commitaria o resto por cima — o pior dos mundos numa
 * tabela contábil. Divergência é decisão humana, não palpite do script.
 *
 * ## ⏳ ESTE SCRIPT É ONE-SHOT, e a idempotência tem PRAZO DE VALIDADE
 *
 * A reexecução é no-op só enquanto o mundo continuar igual à foto aprovada. Ela
 * deixa de ser executável por EVOLUÇÃO NORMAL do sistema, não por defeito:
 *
 *   - quando o PIX da TESTE/MedFacil for PAGO (e a Task 8 promover a obrigação
 *     para `PAID`), a comparação exata verá `PAID` onde o plano pede `ISSUED` e
 *     ABORTARÁ;
 *   - quando o motor emitir a `sequence` 9 da Ultra em janeiro/2027, o gate verá
 *     uma obrigação que não está no plano.
 *
 * Isso é CORRETO — abortar é melhor que reescrever um registro contábil que já
 * seguiu a vida — mas significa que o script tem uma JANELA de uso: entre agora e
 * o primeiro pagamento/renovação. Depois disso ele não é mais a ferramenta certa,
 * e o estado do banco deve ser lido pela tela da Task 10, não por reexecução
 * daqui. Não é "quebrou": é uma migração que já cumpriu o papel.
 *
 * Além disso, cada precondição do documento aprovado é conferida contra o banco
 * (plano, ciclo, preço, status, período, valor e dono de cada fatura). Se o
 * banco tiver derivado desde a aprovação, o script ABORTA em vez de se adaptar:
 * adaptar-se transformaria drift de produção em decisão comercial nova, sem
 * autorização de ninguém.
 *
 * ## Advisory lock por empresa — o mesmo do motor
 *
 * O motor de obrigação segura `pg_advisory_xact_lock(advisoryKeyForCompany(...))`
 * nas duas fases (`billing-obligation.service.ts`). Este script pega o MESMO
 * lock das empresas envolvidas, em ordem determinística por companyId (evita
 * deadlock com outra execução), antes de ler qualquer coisa. Sem isso, o cron
 * poderia criar/reservar obrigação no meio do bootstrap. A unique de
 * `(subscriptionId, sequence)` não basta: ela protege a obrigação, não os
 * UPDATEs de `Invoice`.
 *
 * ⚠️ O lock NÃO protege contra o webhook do Asaas, que hoje não o adquire
 *    (`src/app/api/webhooks/asaas/route.ts`).
 *
 * ## ⚠️ RISCO ABERTO: a corrida dos PIX vivos (ler antes do `--apply`)
 *
 * Duas obrigações nascem `ISSUED` amarradas a faturas com PIX vivo (TESTE e
 * MedFacil). Hoje o webhook do Asaas **não** promove a obrigação vinculada para
 * `PAID` — isso é a Task 8, ainda PENDENTE (conferido: o arquivo do webhook não
 * menciona `billingObligation` em lugar nenhum).
 *
 * Consequência: se o cliente pagar o PIX depois deste bootstrap e antes da Task
 * 8 estar no ar, o banco fica com `Invoice = PAID` e `obligation = ISSUED` com
 * `dueAt` no passado — que é o gatilho exato de I1, ou seja, RESTRINGIR o acesso
 * de quem acabou de pagar.
 *
 * Mitigação possível aqui: o script confere o estado da fatura no último instante
 * (dentro da transação, sob o lock) e ABORTA se ela já estiver paga. Isso encurta
 * a janela, mas não a fecha — o pagamento pode cair um segundo depois do commit.
 *
 * 🔑 Recomendação: rodar o `--apply` **depois** da Task 8, ou aceitar a janela
 * conscientemente e vigiar as duas assinaturas até ela subir. A decisão é do
 * dono; o script não tem como resolver isso sozinho.
 *
 * ## Códigos de saída
 *
 *   0 — dry-run concluído (nada escrito), ou `--apply` commitado e reconferido
 *   1 — falha: precondição violada, divergência com o documento aprovado, ou
 *       erro de banco. Em `--apply`, 1 significa ROLLBACK: nada foi escrito.
 *   2 — argumentos inválidos
 *
 * Uso:
 *   node scripts/bootstrap-billing-obligations.cjs              # dry-run (padrão)
 *   node scripts/bootstrap-billing-obligations.cjs --dry-run    # idem, explícito
 *   node scripts/bootstrap-billing-obligations.cjs --apply      # ESCREVE
 */
require("dotenv").config();
const { PrismaClient } = require("@prisma/client");

// ---------------------------------------------------------------------------
// Aritmética de período — réplica CONSCIENTE de `nextPeriod`
// (`src/lib/billing-clock.ts`).
//
// Duplicação deliberada e localizada: `billing-clock.ts` é ESM/TS e este script
// é `.cjs` rodado por `node` cru, sem passo de build. Importá-lo exigiria
// tsx/esbuild no caminho de um script que o dono roda à mão em produção — mais
// peça móvel do que a conta que ela carregaria.
//
// A réplica é coberta por teste que compara os DOIS lado a lado
// (`src/lib/bootstrap-billing-obligations.test.ts` — vive em `src/` porque o
// `include` do vitest.config.ts só varre `src/**`): se `billing-clock.ts` mudar
// a regra de fim de mês, o teste fica vermelho. Sem esse teste a duplicação
// seria dívida silenciosa.
// ---------------------------------------------------------------------------

const MONTHS_BY_CYCLE = { MONTHLY: 1, YEARLY: 12 };

/** `day` se o mês tiver esse dia, senão o último dia do mês (clamp, não estouro). */
function lastValidDay(year, month, day) {
  const lastDayOfMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return Math.min(day, lastDayOfMonth);
}

/** Fim do período que começa em `previousEnd`, avançando o ciclo. Tudo em UTC. */
function periodEndFrom(previousEnd, cycle) {
  if (Number.isNaN(previousEnd.getTime())) {
    throw new Error("bootstrap: previousEnd é uma data inválida");
  }
  const monthsToAdd = MONTHS_BY_CYCLE[cycle];
  if (monthsToAdd === undefined) {
    throw new Error(`bootstrap: ciclo de cobrança não suportado: ${String(cycle)}`);
  }
  const anchorDay = previousEnd.getUTCDate();
  const year = previousEnd.getUTCFullYear();
  const month = previousEnd.getUTCMonth();
  const targetYear = year + Math.floor((month + monthsToAdd) / 12);
  const targetMonth = (month + monthsToAdd) % 12;
  return new Date(
    Date.UTC(
      targetYear,
      targetMonth,
      lastValidDay(targetYear, targetMonth, anchorDay),
      previousEnd.getUTCHours(),
      previousEnd.getUTCMinutes(),
      previousEnd.getUTCSeconds(),
      previousEnd.getUTCMilliseconds()
    )
  );
}

/**
 * Chave de advisory lock por empresa — réplica de `advisoryKeyForCompany`
 * (`src/lib/advisory-lock.ts`), pelo mesmo motivo ESM/TS acima.
 *
 * 🔑 Tem que ser BIT A BIT idêntica à do motor. Chave diferente = lock que não
 * protege nada: as duas transações passam juntas achando-se serializadas.
 * Travada pelo mesmo teste comparativo.
 */
function advisoryKeyForCompany(companyId) {
  let h = 0;
  for (let i = 0; i < companyId.length; i++) {
    h = (Math.imul(31, h) + companyId.charCodeAt(i)) | 0;
  }
  return h;
}

const U = (iso) => new Date(`${iso}T00:00:00.000Z`);
const brl = (cents) =>
  `R$ ${(cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
const d10 = (date) => date.toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// O PLANO APROVADO, declarativo.
//
// Tudo que este script escreve está aqui. Os ids vieram do levantamento em
// produção de 2026-07-30 e foram aprovados um a um — o script não inventa id,
// não busca "a assinatura ativa da empresa X", não adivinha nada.
// ---------------------------------------------------------------------------

/**
 * ⚠️ RETIFICAÇÃO DE REDAÇÃO NA DECISÃO 2 (Óticas Ultra) — leia antes de aplicar.
 *
 * O documento aprovado escreve a obrigação de maio como `[01/05/2026 → 31/05/2026)`
 * e a cortesia começando em `01/06/2026`. Tomado ao pé da letra, isso é
 * IMPOSSÍVEL de executar sem quebrar o motor, por três razões que se somam:
 *
 *  1. BURACO. Períodos são semiabertos e contíguos: `next.periodStart` tem que
 *     ser EXATAMENTE `previous.periodEnd`. Com fim em 31/05 e a seguinte
 *     começando em 01/06 sobra um vão de 24h — `isContiguous` devolve `false` e
 *     a Task 7 transforma isso em alarme operacional.
 *
 *  2. A CORTESIA NÃO PEGARIA. Encadeando de 31/05, a seq 2 começaria em 31/05.
 *     A disposição é decidida contra `periodStart` e exige `startsAt <= periodStart`
 *     (`billing-courtesy.ts`). Cortesia começando em 01/06 NÃO cobre um período
 *     que começa em 31/05 → a seq 2 sairia `CHARGE`, e o cliente que o dono
 *     decidiu isentar seria COBRADO. É o oposto da decisão aprovada.
 *
 *  3. DRIFT PERMANENTE. 31/05 encadeia para 30/06, 30/07, 30/08… A âncora migra
 *     para o dia 30 para sempre (o clamp não preserva a âncora original — ver
 *     ressalva no docblock de `nextPeriod`).
 *
 * A própria aritmética do documento resolve a ambiguidade: ele declara
 * "receita não faturada ~R$ 1.049,30 (7 meses)", e 7 × R$ 149,90 = R$ 1.049,30
 * EXATO. Sete períodos mensais limpos de junho a dezembro só existem com a
 * âncora no dia 1º — jun/01, jul/01, …, dez/01, fechando em 01/01/2027. A
 * leitura literal de 31/05 não produz sete meses limpos de jeito nenhum.
 *
 * Conclusão: "31/05/2026" é redação humana para "o fim de maio", e o valor
 * executável é o limite EXCLUSIVO `01/06/2026` — o mesmo instante, escrito na
 * convenção semiaberta do motor. Mesma coisa para o fim da cortesia: "até
 * 31/12/2026" vira `endsAt = 01/01/2027` exclusivo, que é o que faz o período de
 * dezembro inteiro ficar coberto.
 *
 * Isto é RETIFICAÇÃO DE FORMA, não mudança de mérito: as datas de calendário que
 * o dono aprovou (maio pago, junho a dezembro de cortesia) ficam idênticas.
 * Ainda assim está sinalizado aqui e no relatório, e o dry-run imprime os
 * períodos resolvidos em cima — o dono confere maio a dezembro antes do
 * `--apply`.
 */
const ULTRA_ANCHOR = U("2026-05-01");
const ULTRA_COURTESY_FROM = U("2026-06-01");
const ULTRA_COURTESY_UNTIL = U("2027-01-01"); // exclusivo = "até o fim de 31/12/2026"

/**
 * Períodos mensais encadeados da Ultra, de maio (pago) até dezembro (cortesia).
 *
 * Construído pela MESMA aritmética do motor, nunca por datas digitadas à mão:
 * datas digitadas é como se produz buraco de contiguidade.
 */
function ultraPeriods() {
  const periods = [];
  let start = ULTRA_ANCHOR;
  // seq 1 = maio (pago) + as de cortesia enquanto o período COMEÇAR antes do
  // fim da concessão. O período de dezembro começa em 01/12 (< 01/01/2027) e
  // entra; o de janeiro/2027 começa exatamente em 01/01/2027 e fica FORA — é o
  // primeiro que o motor volta a cobrar, encadeando sozinho a partir daqui.
  for (let sequence = 1; ; sequence += 1) {
    const end = periodEndFrom(start, "MONTHLY");
    periods.push({ sequence, periodStart: start, periodEnd: end });
    start = end;
    if (start.getTime() >= ULTRA_COURTESY_UNTIL.getTime()) break;
  }
  return periods;
}

const ULTRA_PERIODS = ultraPeriods();

const PLANO = [
  // ── Decisão 1 — Óticas Atacadão: cortesia retroativa do período anual ──────
  {
    rotulo: "Óticas Atacadão",
    subscriptionId: "cmm1993ga000c90ezc38kk28n",
    esperado: {
      status: "ACTIVE",
      cycle: "YEARLY",
      priceYearly: 149900,
      planNameLike: "Básico",
    },
    obrigacoes: [
      {
        sequence: 1,
        periodStart: U("2026-02-24"),
        periodEnd: U("2027-02-24"),
        disposition: "COURTESY",
        state: "PAID",
        priceCents: 149900,
      },
    ],
    cortesias: [
      {
        startsAt: U("2026-02-24"),
        endsAt: U("2027-02-24"),
        reason: "ótica do dono",
      },
    ],
    // Lixo de teste. O enum `InvoiceStatus` NÃO tem `VOID` (ver relatório):
    // `CANCELED` é o valor real que neutraliza a fatura para o motor, cuja
    // guarda de cobrança dupla só olha PENDING/OVERDUE/PAID.
    cancelarFaturas: "TODAS_VIVAS_DA_ASSINATURA",
    // Doc aprovado: "Nenhuma paga." Se aparecer uma paga, é drift → aborta.
    pagasEsperadas: 0,
  },

  // ── Decisão 2 — Óticas Ultra: maio pago, jun→dez de cortesia ──────────────
  {
    rotulo: "Óticas Ultra",
    subscriptionId: "cmn8ww0yy0008m25s5avfmk23",
    esperado: {
      status: "ACTIVE",
      cycle: "MONTHLY",
      priceMonthly: 14990,
      planNameLike: "Básico",
    },
    obrigacoes: ULTRA_PERIODS.map((p) =>
      p.sequence === 1
        ? {
            ...p,
            // Maio: efetivamente cobrado e PAGO, com desconto (R$ 99,90). O
            // preço gravado é o que o cliente pagou, não o de tabela.
            disposition: "CHARGE",
            state: "PAID",
            priceCents: 9990,
          }
        : {
            ...p,
            // Junho em diante: isenta. Nasce PAID de propósito — isenta escrita
            // como PLANNED TRAVA a assinatura para sempre (o motor devolve
            // `settled` toda rodada, sem cobrar e SEM ALERTAR NINGUÉM).
            disposition: "COURTESY",
            state: "PAID",
            priceCents: 14990,
          }
    ),
    cortesias: [
      {
        startsAt: ULTRA_COURTESY_FROM,
        endsAt: ULTRA_COURTESY_UNTIL,
        reason: "carência concedida",
      },
    ],
    cancelarFaturas: "TODAS_VIVAS_DA_ASSINATURA",
    // Doc aprovado: UMA fatura paga (maio, R$ 99,90). Ela é vinculada à seq 1,
    // não cancelada — é dinheiro que entrou.
    pagasEsperadas: 1,
  },

  // ── Decisão 3 — TESTE e MedFacil: mapear a fatura com PIX vivo ────────────
  {
    rotulo: "TESTE",
    subscriptionId: "cmryty1d1008ewikgogat8gtv",
    esperado: { status: "TRIAL", cycle: "MONTHLY" },
    obrigacoes: [
      {
        sequence: 1,
        periodStart: U("2026-08-07"),
        periodEnd: U("2026-09-07"),
        disposition: "CHARGE",
        state: "ISSUED",
        priceCents: 18990,
        // Vínculo nos DOIS sentidos com a fatura que já tem PIX no gateway.
        // Sem ele o motor emitiria uma SEGUNDA mensalidade do mesmo período.
        vincularFatura: {
          invoiceId: "cms4vwe7b001c10quxzva1ww3",
          asaasPaymentId: "pay_eo8jup3l0gd7b1b5",
          total: 18990,
        },
      },
    ],
    cortesias: [],
    cancelarFaturas: "NENHUMA",
  },
  {
    rotulo: "MedFacil",
    subscriptionId: "cms18lj5800034z37xamv6ez5",
    esperado: { status: "TRIAL", cycle: "MONTHLY" },
    obrigacoes: [
      {
        sequence: 1,
        periodStart: U("2026-08-09"),
        periodEnd: U("2026-09-09"),
        disposition: "CHARGE",
        state: "ISSUED",
        priceCents: 8990,
        vincularFatura: {
          invoiceId: "cms50bzgu000cq2snrim3kcyw",
          asaasPaymentId: "pay_805aqzhcpooy0f9d",
          total: 8990,
        },
      },
    ],
    cortesias: [],
    cancelarFaturas: "NENHUMA",
  },
];

/**
 * Quem concedeu a cortesia (`SubscriptionCourtesy.grantedBy`, obrigatório).
 *
 * O schema aceita "id ou e-mail do admin", e a tentação é preencher com o
 * `AdminUser` do dono. Recusado: escolher um id de admin real seria INVENTAR
 * autoria — nenhum humano clicou em "conceder cortesia" nestas quatro linhas; o
 * que existe é um documento aprovado e um script que o transcreve. Atribuir a
 * concessão a uma pessoa produziria uma trilha de auditoria falsa, e é
 * justamente a trilha honesta que esta tabela existe para criar (ela substitui o
 * `accessEnabled`, que era bypass "sem registro, sem prazo e sem dono").
 *
 * Então o autor é o PROCESSO, nomeado de forma rastreável: quem quiser saber de
 * onde a cortesia veio acha o script, e por ele o documento aprovado. É o mesmo
 * padrão que a sonda de `apply-billing-obligations.cjs` já usou neste campo.
 *
 * ⚠️ É também o valor comparado na idempotência: uma cortesia preexistente com
 * `grantedBy` diferente conta como DIVERGÊNCIA e aborta — se um humano concedeu
 * de verdade pela tela, o script não passa por cima da autoria dele.
 */
const GRANTED_BY = "bootstrap-billing-obligations.cjs";

/** Status de fatura que o motor considera VIVOS (guarda de cobrança dupla). */
const STATUS_VIVOS = ["PENDING", "OVERDUE", "PAID"];

// ---------------------------------------------------------------------------

/**
 * Sentinela de rollback do dry-run: o throw é o MECANISMO, não uma falha.
 *
 * Classe própria (e não `new Error("__sentinela__")`) para que o `catch` a
 * reconheça por `instanceof`. Comparar `err.message` faria qualquer erro real
 * que contivesse o texto ser tratado como rollback esperado — em `--apply`, isso
 * viraria "commit concluído" depois de um ROLLBACK.
 */
class RollbackDoDryRun extends Error {
  constructor() {
    super("rollback esperado do dry-run");
    this.name = "RollbackDoDryRun";
  }
}

/**
 * Vira `true` no instante em que o COMMIT do `--apply` é confirmado.
 *
 * 🔑 Existe para a mensagem de erro não MENTIR. O inventário "DEPOIS" roda
 * depois do commit; se ele falhar (queda de conexão, por exemplo), o `catch`
 * final diria "ROLLBACK: nada foi escrito" — falso, e é a pior informação
 * possível para quem vai decidir se roda o script de novo.
 */
let commitFeito = false;

async function main() {
  const modo = lerModo(process.argv.slice(2));

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL ausente. Abortado.");
    process.exit(1);
  }
  // Só o HOST. Nunca a URL inteira: ela carrega usuário e senha, e este log
  // costuma ser colado em conversa.
  const host = (() => {
    try {
      return new URL(url).host;
    } catch {
      return "(host ilegível)";
    }
  })();

  console.log(`\n🎯 Banco: ${host}`);
  console.log(
    `🔧 Modo: ${modo === "apply" ? "APPLY — VAI ESCREVER" : "DRY-RUN — não escreve nada"}`
  );
  if (modo === "dry-run") {
    console.log("   (para PERSISTIR de verdade: --apply)");
  }
  console.log("⛔ Este script NÃO chama o Asaas. Nenhuma cobrança nova é criada.");

  const prisma = new PrismaClient();
  try {
    console.log("\n── ANTES ──");
    await imprimirInventario(prisma);
    // Linha de base para provar o rollback do dry-run (ver `exigirNadaEscrito`).
    const contagemAntes = await contarPorAssinatura(prisma);

    // Uma transação só: ou tudo entra ou nada entra.
    //
    // 🔑 O DRY-RUN ESCREVE E DÁ ROLLBACK — não é "lê e imprime o que faria".
    //
    // A primeira versão deste script não escrevia no dry-run, e por isso o
    // `gateDeCommit` lia o banco ATUAL (zero obrigações) em vez do estado
    // FUTURO: o gate reprovava com "nenhuma obrigação ao fim da transação" e o
    // dry-run FALHAVA SEMPRE, no exato estado que ele existe para conferir.
    // Um dry-run que não exercita as mesmas escritas não prova contiguidade,
    // não prova unicidade de `(subscriptionId, sequence)`, não prova FK e não
    // prova o gate — ele viraria teatro.
    //
    // Escrevendo dentro da transação e revertendo, o dry-run prova TUDO isso
    // contra o schema e os dados REAIS, e não deixa rastro.
    //
    // ⚠️ Efeito colateral honesto: os triggers de entitlement chamam
    // `nextval('entitlement_revision_seq')`, e sequence do Postgres NÃO volta no
    // ROLLBACK. O dry-run consome alguns números da sequência, abrindo um GAP.
    // Isso é inofensivo por construção — a garantia daquele contador é ser
    // MONOTÔNICO, não denso — e é o mesmo efeito que as provas em transação
    // revertida de `apply-billing-obligations.cjs` já produziram em produção.
    // As linhas de `EntitlementRevision`/`EntitlementOutbox` são revertidas.
    let resumo = null;
    let revertido = false;
    try {
      await prisma.$transaction(
        async (tx) => {
          // Caminho ÚNICO: o dry-run executa exatamente as mesmas escritas.
          resumo = await executar(tx, modo);
          if (modo === "dry-run") {
            revertido = true;
            throw new RollbackDoDryRun();
          }
        },
        // Poucas linhas, mas o lock pode esperar e o Neon pode ter cold start.
        // O padrão do Prisma (5s) é apertado demais para um script manual.
        { timeout: 25_000, maxWait: 8_000 }
      );
    } catch (err) {
      // Identidade de CLASSE, não comparação de mensagem: um erro interno que
      // por acidente carregasse o texto da sentinela seria engolido, e em
      // `--apply` o script anunciaria commit depois de um ROLLBACK.
      if (!(err instanceof RollbackDoDryRun)) throw err;
    }

    imprimirResumo(resumo, modo);

    if (modo === "dry-run") {
      if (!revertido) throw new Error("dry-run não atingiu o ponto de rollback");
      // Confirmação OBSERVADA de que o rollback funcionou. Um dry-run que
      // escreveu e não reverteu seria o pior resultado possível deste script, e
      // não é algo para supor: é para conferir.
      await exigirNadaEscrito(prisma, contagemAntes);
      console.log(
        "\n✅ DRY-RUN concluído — escritas exercitadas e REVERTIDAS (rollback conferido).\n" +
          "   O gate de commit rodou contra o estado FUTURO real, não contra o banco vazio.\n" +
          "   Confira os períodos e valores acima. Para aplicar:\n" +
          "     node scripts/bootstrap-billing-obligations.cjs --apply\n" +
          "   ⚠️  O --apply relê e revalida tudo dentro da transação, e aborta se o banco\n" +
          "       tiver mudado nesse intervalo."
      );
      return;
    }

    console.log("\n✅ COMMIT CONCLUÍDO — as escritas estão no banco.");
    commitFeito = true;

    // Reconferência FORA da transação, contra o estado commitado. Se esta
    // leitura falhar, o commit já aconteceu — daí a linha acima vir antes.
    console.log("\n── DEPOIS ──");
    await imprimirInventario(prisma);
    console.log(
      "\n✅ bootstrap aplicado. O motor deixa de responder `needs_bootstrap`\n" +
        "   para estas 4 assinaturas."
    );
  } finally {
    await prisma.$disconnect();
  }
}

/** `--apply` | `--dry-run` | (nada) → dry-run. Argumento desconhecido = exit 2. */
function lerModo(argv) {
  const desconhecidos = argv.filter((a) => a !== "--apply" && a !== "--dry-run");
  if (desconhecidos.length > 0) {
    console.error(`Argumento desconhecido: ${desconhecidos.join(", ")}`);
    console.error("Uso: node scripts/bootstrap-billing-obligations.cjs [--dry-run|--apply]");
    process.exit(2);
  }
  if (argv.includes("--apply") && argv.includes("--dry-run")) {
    console.error("--apply e --dry-run são mutuamente exclusivos.");
    process.exit(2);
  }
  return argv.includes("--apply") ? "apply" : "dry-run";
}

/**
 * Corpo do bootstrap. UMA função para os dois modos — o dry-run não pode ter um
 * caminho próprio, senão ele mente: dois fluxos divergem no primeiro ajuste, e
 * o dono conferiria um plano que não é o que o `--apply` executa. A ÚNICA
 * diferença é o ROLLBACK no fim (e o verbo do log).
 */
async function executar(tx, modo) {
  // 🔑 SEMPRE escreve — inclusive no dry-run, que reverte tudo no fim (ver a
  // nota em `main`). Não existe caminho "só leitura": era ele que fazia o gate
  // validar o banco vazio e o dry-run falhar sempre.
  // Verbo dos relatos: no dry-run tudo é revertido, então dizer "CRIADA" seria
  // enganoso. `vb(feito, futuro)` mantém o log honesto nos dois modos.
  const vb = modo === "apply" ? (feito) => feito : (_feito, futuro) => futuro;
  const acoes = [];
  if (modo === "dry-run") {
    acoes.push("ℹ️  dry-run: as escritas abaixo são EXERCITADAS de verdade e revertidas no fim.");
  }

  // 1) Advisory lock das empresas envolvidas, em ordem determinística por
  //    companyId — a mesma chave do motor. Ordem fixa evita deadlock com outra
  //    execução que pegue os mesmos locks.
  //
  // 🔑 TRÊS PASSOS, nesta ordem: descobre companyId → TRAVA → RELÊ.
  //
  // A primeira leitura serve SÓ para descobrir de quais empresas travar. Ela não
  // é usada para decidir nada, e é descartada. Motivo: adquirir o lock pode
  // ESPERAR (o motor pode estar no meio de uma rodada), e o que foi lido antes da
  // espera pode estar velho — plano, ciclo, status e preço podem ter mudado
  // justamente pela transação que detinha o lock. Validar drift contra dado
  // pré-lock seria validar contra o passado.
  const SELECT_SUB = {
    id: true,
    companyId: true,
    planId: true,
    status: true,
    billingCycle: true,
    plan: { select: { name: true, priceMonthly: true, priceYearly: true } },
    company: { select: { name: true } },
  };

  const companyIds = new Set();
  for (const alvo of PLANO) {
    const descoberta = await tx.subscription.findUnique({
      where: { id: alvo.subscriptionId },
      select: { companyId: true },
    });
    if (!descoberta) {
      throw new Error(
        `${alvo.rotulo}: assinatura ${alvo.subscriptionId} NÃO existe neste banco. ` +
          "Os ids vieram do levantamento aprovado; se não batem, este é o banco errado " +
          "ou a assinatura foi apagada. Abortado sem escrever."
      );
    }
    companyIds.add(descoberta.companyId);
  }

  const ordenadas = [...companyIds].sort();
  for (const companyId of ordenadas) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${advisoryKeyForCompany(companyId)})`;
  }
  acoes.push(
    `🔒 advisory lock de ${ordenadas.length} empresa(s), mesma chave do motor ` +
      "(adquirido ANTES da leitura que decide)"
  );

  // RELEITURA autoritativa, já sob o lock. É esta que alimenta as decisões.
  const assinaturas = new Map();
  for (const alvo of PLANO) {
    const sub = await tx.subscription.findUnique({
      where: { id: alvo.subscriptionId },
      select: SELECT_SUB,
    });
    if (!sub) {
      throw new Error(
        `${alvo.rotulo}: assinatura ${alvo.subscriptionId} desapareceu entre a descoberta e ` +
          "o lock. Abortado sem escrever."
      );
    }
    // A empresa mudou entre a descoberta e o lock? Então travamos a empresa
    // errada e não estamos protegidos. Fail-closed.
    if (!companyIds.has(sub.companyId)) {
      throw new Error(
        `${alvo.rotulo}: a assinatura mudou de empresa entre a descoberta e o lock ` +
          `(agora ${sub.companyId}). O lock adquirido não protege esta empresa. Abortado.`
      );
    }
    assinaturas.set(alvo.subscriptionId, sub);
  }

  // 2) Por assinatura: valida o esperado, cria cortesias, cria obrigações,
  //    vincula faturas, cancela lixo.
  for (const alvo of PLANO) {
    const sub = assinaturas.get(alvo.subscriptionId);
    acoes.push(
      `\n▸ ${alvo.rotulo} — ${sub.company?.name ?? "?"} (plano ${sub.plan.name}, ${sub.billingCycle})`
    );

    conferirEsperado(alvo, sub);

    for (const c of alvo.cortesias) {
      acoes.push(await garantirCortesia(tx, alvo, sub, c, vb));
    }
    for (const o of alvo.obrigacoes) {
      acoes.push(...(await garantirObrigacao(tx, alvo, sub, o, vb)));
    }
    acoes.push(...(await cancelarFaturas(tx, alvo, sub, vb)));
  }

  // 3) Gate de commit: valida o resultado DENTRO da transação. Falhando,
  //    lança → ROLLBACK. Conferir depois do commit seria conferir tarde demais.
  acoes.push(...(await gateDeCommit(tx)));

  return acoes;
}

/**
 * O banco ainda corresponde ao que o dono aprovou?
 *
 * Aborta em vez de se adaptar. Se o plano, ciclo, preço ou status mudou desde
 * 2026-07-30, seguir com os valores novos seria o script tomando uma decisão
 * comercial que ninguém autorizou.
 */
function conferirEsperado(alvo, sub) {
  const e = alvo.esperado;
  const erros = [];
  if (e.status && sub.status !== e.status) {
    erros.push(`status esperado ${e.status}, encontrado ${sub.status}`);
  }
  if (e.cycle && sub.billingCycle !== e.cycle) {
    erros.push(`ciclo esperado ${e.cycle}, encontrado ${sub.billingCycle}`);
  }
  if (e.priceMonthly !== undefined && sub.plan.priceMonthly !== e.priceMonthly) {
    erros.push(
      `plano.priceMonthly esperado ${e.priceMonthly}, encontrado ${sub.plan.priceMonthly}`
    );
  }
  if (e.priceYearly !== undefined && sub.plan.priceYearly !== e.priceYearly) {
    erros.push(
      `plano.priceYearly esperado ${e.priceYearly}, encontrado ${sub.plan.priceYearly}`
    );
  }
  // Identidade do PLANO, não só o preço dele. Sem isto, uma assinatura que
  // trocou para outro plano de preço igual passaria, e a obrigação congelaria o
  // `planId` novo — o histórico afirmaria que se cobrou um plano que o dono não
  // aprovou. `planNameLike` é conferido por prefixo porque o nome comercial
  // costuma ganhar sufixo ("Básico", "Básico Anual").
  if (e.planNameLike && !sub.plan.name.toLowerCase().includes(e.planNameLike.toLowerCase())) {
    erros.push(`plano esperado contendo "${e.planNameLike}", encontrado "${sub.plan.name}"`);
  }
  if (erros.length > 0) {
    throw new Error(
      `${alvo.rotulo}: o banco DIVERGE do documento aprovado (${erros.join("; ")}).\n` +
        "   O script NÃO se adapta a drift — isso viraria decisão comercial sem aprovação.\n" +
        "   Reveja o documento com o dono e atualize o PLANO deste script."
    );
  }
}

/** Cria a cortesia, ou confirma que a existente é IDÊNTICA, ou aborta. */
async function garantirCortesia(tx, alvo, sub, desejada, vb) {
  const existentes = await tx.subscriptionCourtesy.findMany({
    where: { subscriptionId: sub.id },
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      reason: true,
      grantedBy: true,
      revokedAt: true,
    },
  });

  const rotulo =
    `cortesia ${d10(desejada.startsAt)} → ${desejada.endsAt ? d10(desejada.endsAt) : "∞"}` +
    ` ("${desejada.reason}")`;

  const mesmaJanela = existentes.filter(
    (c) => c.startsAt.getTime() === desejada.startsAt.getTime()
  );

  if (mesmaJanela.length > 1) {
    throw new Error(
      `${alvo.rotulo}: ${mesmaJanela.length} cortesias já começam em ${d10(desejada.startsAt)}. ` +
        "Ambíguo — resolver à mão antes de rodar."
    );
  }

  if (mesmaJanela.length === 1) {
    const c = mesmaJanela[0];
    const divergencias = [];
    const fimIgual =
      (c.endsAt === null && desejada.endsAt === null) ||
      (c.endsAt !== null &&
        desejada.endsAt !== null &&
        c.endsAt.getTime() === desejada.endsAt.getTime());
    if (!fimIgual) divergencias.push(`endsAt ${c.endsAt ? d10(c.endsAt) : "null"}`);
    if (c.reason !== desejada.reason) divergencias.push(`reason "${c.reason}"`);
    if (c.grantedBy !== GRANTED_BY) divergencias.push(`grantedBy "${c.grantedBy}"`);
    // Revogada é o caso mais perigoso: o dono desfez a concessão de propósito, e
    // recriá-la (ou aceitá-la como "já existe") reverteria a decisão dele.
    if (c.revokedAt !== null) divergencias.push(`REVOGADA em ${d10(c.revokedAt)}`);

    if (divergencias.length > 0) {
      throw new Error(
        `${alvo.rotulo}: já existe cortesia começando em ${d10(desejada.startsAt)}, mas ela ` +
          `DIVERGE do aprovado (${divergencias.join("; ")}). Abortado — divergência é decisão ` +
          "humana, não algo para o script sobrescrever."
      );
    }
    return `   = ${rotulo} — já existe, idêntica (no-op)`;
  }

  await tx.subscriptionCourtesy.create({
    data: {
      subscriptionId: sub.id,
      startsAt: desejada.startsAt,
      endsAt: desejada.endsAt,
      reason: desejada.reason,
      grantedBy: GRANTED_BY,
    },
  });
  return `   + ${rotulo} — ${vb("CRIADA", "criaria")}`;
}

/** Cria a obrigação (e o vínculo da fatura), ou confirma idêntica, ou aborta. */
async function garantirObrigacao(tx, alvo, sub, desejada, vb) {
  const linhas = [];
  const rotulo =
    `obrigação seq ${desejada.sequence} [${d10(desejada.periodStart)} → ` +
    `${d10(desejada.periodEnd)}) ${desejada.disposition}/${desejada.state} ` +
    `${brl(desejada.priceCents)}`;

  const existente = await tx.billingObligation.findUnique({
    where: {
      subscriptionId_sequence: { subscriptionId: sub.id, sequence: desejada.sequence },
    },
    select: {
      id: true,
      periodStart: true,
      periodEnd: true,
      planId: true,
      cycle: true,
      priceCents: true,
      disposition: true,
      state: true,
      invoiceId: true,
      issuedAt: true,
      dueAt: true,
      paidAt: true,
      voidReason: true,
    },
  });

  if (existente) {
    const divergencias = [];
    if (existente.periodStart.getTime() !== desejada.periodStart.getTime()) {
      divergencias.push(`periodStart ${d10(existente.periodStart)}`);
    }
    if (existente.periodEnd.getTime() !== desejada.periodEnd.getTime()) {
      divergencias.push(`periodEnd ${d10(existente.periodEnd)}`);
    }
    if (existente.planId !== sub.planId) divergencias.push(`planId ${existente.planId}`);
    if (existente.cycle !== sub.billingCycle) divergencias.push(`cycle ${existente.cycle}`);
    if (existente.priceCents !== desejada.priceCents) {
      divergencias.push(`priceCents ${existente.priceCents}`);
    }
    if (existente.disposition !== desejada.disposition) {
      divergencias.push(`disposition ${existente.disposition}`);
    }
    if (existente.state !== desejada.state) divergencias.push(`state ${existente.state}`);
    // Carimbos também: uma obrigação com os campos estruturais certos mas
    // `issuedAt`/`dueAt`/`paidAt` divergentes NÃO é "idêntica". O caso perigoso é
    // a isenta que ganhou issuedAt/dueAt por outro caminho — ela restringe por I1
    // e o script anunciaria "no-op, tudo certo".
    const isentaExistente =
      existente.disposition === "COURTESY" ||
      existente.disposition === "INTERNAL" ||
      existente.disposition === "LEGACY_WAIVED";
    if (isentaExistente && (existente.issuedAt !== null || existente.dueAt !== null)) {
      divergencias.push("isenta COM issuedAt/dueAt (restringiria por I1)");
    }
    if (existente.state === "ISSUED" && (existente.issuedAt === null || existente.dueAt === null)) {
      divergencias.push("ISSUED sem issuedAt/dueAt");
    }
    if (existente.state === "PAID" && existente.paidAt === null) {
      divergencias.push("PAID sem paidAt");
    }
    if (existente.voidReason !== null) {
      divergencias.push(`voidReason "${existente.voidReason}"`);
    }

    if (divergencias.length > 0) {
      throw new Error(
        `${alvo.rotulo}: obrigação seq ${desejada.sequence} JÁ EXISTE e diverge do aprovado ` +
          `(${divergencias.join("; ")}). Abortado sem escrever nada — uma obrigação errada ` +
          "num registro contábil é para o dono decidir, não para o script sobrescrever."
      );
    }
    linhas.push(`   = ${rotulo} — já existe, idêntica (no-op)`);

    if (desejada.vincularFatura) {
      linhas.push(
        await garantirVinculo(tx, alvo, sub, desejada, existente.id, existente.invoiceId, vb)
      );
    }
    return linhas;
  }

  // Fatura conferida ANTES de criar a obrigação: se ela não estiver no estado
  // aprovado, nada deve ser criado.
  let fatura = null;
  if (desejada.vincularFatura) {
    fatura = await conferirFaturaAlvo(tx, alvo, sub, desejada);
  }

  // Carimbos derivados da disposição/estado. Calculados DEPOIS da conferência da
  // fatura de propósito: `issuedAt` de uma obrigação `ISSUED` vem do `issuedAt`
  // da fatura que já existe, e só a conferência acima o obtém.
  const carimbos = carimbosDe(desejada, fatura);

  let novaId;
  const criada = await tx.billingObligation.create({
    data: {
      subscriptionId: sub.id,
      sequence: desejada.sequence,
      periodStart: desejada.periodStart,
      periodEnd: desejada.periodEnd,
      // Plano e ciclo VÊM DA ASSINATURA, congelados agora — é o que o
      // histórico precisa para saber qual plano foi cobrado.
      planId: sub.planId,
      cycle: sub.billingCycle,
      priceCents: desejada.priceCents,
      disposition: desejada.disposition,
      state: desejada.state,
      issuedAt: carimbos.issuedAt,
      dueAt: carimbos.dueAt,
      paidAt: carimbos.paidAt,
      invoiceId: fatura ? fatura.id : null,
    },
    select: { id: true },
  });
  novaId = criada.id;
  linhas.push(
    `   + ${rotulo} — ${vb(`CRIADA (${novaId})`, "criaria")}` +
      carimbosLegiveis(carimbos)
  );

  if (fatura) {
    await tx.invoice.update({
      where: { id: fatura.id },
      data: { billingObligationId: novaId },
    });
    linhas.push(
      `   ↔ fatura ${fatura.number} (${fatura.id}) ${vb("VINCULADA", "vincularia")} ` +
        `nos dois sentidos — PIX ${desejada.vincularFatura.asaasPaymentId}`
    );
  }
  return linhas;
}

/**
 * Carimbos coerentes com disposição e estado.
 *
 * 🔑 `ISSUED` recebe `issuedAt` E `dueAt` — sem os dois a obrigação fica
 * semanticamente incompleta e I1 não tem como provar que venceu. `dueAt` é o
 * INÍCIO do período (o cliente paga antes de o período começar, spec §4.5, o
 * mesmo que o motor grava). `issuedAt` vem da fatura que já existe, NUNCA de
 * "agora": a cobrança foi emitida quando o PIX foi criado, e usar o relógio de
 * hoje falsificaria o histórico.
 *
 * As isentas `PAID` recebem `paidAt` e NADA de `issuedAt`/`dueAt`.
 */
function carimbosDe(desejada, fatura) {
  if (desejada.state === "ISSUED") {
    // Sem fatura não há `issuedAt` honesto a gravar, e uma `ISSUED` sem
    // `issuedAt` reprova no gate. Falha aqui, com a causa, em vez de deixar o
    // gate acusar o sintoma três telas depois.
    if (!fatura || !fatura.issuedAt) {
      throw new Error(
        `obrigação seq ${desejada.sequence}: estado ISSUED exige a fatura de origem para ` +
          "derivar `issuedAt`. Usar `now()` falsificaria o histórico da cobrança."
      );
    }
    return {
      issuedAt: fatura.issuedAt,
      dueAt: desejada.periodStart,
      paidAt: null,
    };
  }
  if (desejada.state === "PAID") {
    return {
      // Sem issuedAt/dueAt de propósito — ver docblock.
      issuedAt: null,
      dueAt: null,
      // Quitada no início do período: é o instante que o período representa, e
      // não "agora" (que inventaria um pagamento feito hoje). Se houver fatura
      // paga de origem, o `paidAt` dela é a verdade.
      paidAt: fatura?.paidAt ?? desejada.periodStart,
    };
  }
  return { issuedAt: null, dueAt: null, paidAt: null };
}

function carimbosLegiveis(c) {
  const partes = [];
  if (c.issuedAt) partes.push(`issuedAt ${d10(c.issuedAt)}`);
  if (c.dueAt) partes.push(`dueAt ${d10(c.dueAt)}`);
  if (c.paidAt) partes.push(`paidAt ${d10(c.paidAt)}`);
  return partes.length > 0 ? ` [${partes.join(", ")}]` : " [sem carimbos]";
}

/**
 * A fatura com PIX vivo está EXATAMENTE como o documento aprovado descreve?
 *
 * ⚠️ CORRIDA DOS PIX VIVOS — a razão desta função ser tão paranoica. O webhook
 * do Asaas hoje NÃO adquire o advisory lock e NÃO promove a obrigação vinculada
 * para `PAID` (Task 8, ainda pendente). Se o cliente pagar entre esta validação
 * e o commit, o banco fica em `Invoice=PAID` + `obligation=ISSUED` com `dueAt`
 * no passado — que é exatamente o gatilho de I1: restringiria o acesso de quem
 * ACABOU DE PAGAR. Ver o aviso no relatório: o ideal é a Task 8 estar no ar
 * antes do `--apply`. Aqui a defesa é conferir o estado no último instante
 * possível, dentro da transação e sob o lock.
 */
async function conferirFaturaAlvo(tx, alvo, sub, desejada) {
  const v = desejada.vincularFatura;
  const inv = await tx.invoice.findUnique({
    where: { id: v.invoiceId },
    select: {
      id: true,
      number: true,
      subscriptionId: true,
      status: true,
      total: true,
      asaasPaymentId: true,
      billingObligationId: true,
      isManual: true,
      issuedAt: true,
      paidAt: true,
      periodStart: true,
      periodEnd: true,
    },
  });
  if (!inv) {
    throw new Error(
      `${alvo.rotulo}: fatura ${v.invoiceId} NÃO existe. Id vem do levantamento aprovado.`
    );
  }

  const erros = [];
  if (inv.subscriptionId !== sub.id) {
    erros.push(`pertence à assinatura ${inv.subscriptionId}, não a ${sub.id}`);
  }
  if (inv.status !== "PENDING") {
    erros.push(`status ${inv.status} (esperado PENDING — PIX vivo, não pago)`);
  }
  if (inv.paidAt !== null) erros.push(`já tem paidAt ${d10(inv.paidAt)}`);
  if (inv.total !== v.total) erros.push(`total ${inv.total} (esperado ${v.total})`);
  if (inv.asaasPaymentId !== v.asaasPaymentId) {
    erros.push(`asaasPaymentId ${inv.asaasPaymentId} (esperado ${v.asaasPaymentId})`);
  }
  if (inv.billingObligationId !== null) {
    erros.push(`já está vinculada à obrigação ${inv.billingObligationId}`);
  }
  // Período EXATO. Sem isto, uma fatura com id/PIX/total certos mas período
  // divergente seria vinculada — e o vínculo existe justamente para provar que
  // aquele PERÍODO já está cobrado. Um vínculo de período torto reabriria a
  // porta da cobrança dupla que a guarda `unmapped_invoice_overlap` fecha.
  if (inv.periodStart.getTime() !== desejada.periodStart.getTime()) {
    erros.push(`periodStart ${d10(inv.periodStart)} (esperado ${d10(desejada.periodStart)})`);
  }
  if (inv.periodEnd.getTime() !== desejada.periodEnd.getTime()) {
    erros.push(`periodEnd ${d10(inv.periodEnd)} (esperado ${d10(desejada.periodEnd)})`);
  }
  // Fatura manual/avulsa não é cobrança do motor: a guarda de cobrança dupla a
  // ignora (`isManual: false`), então vinculá-la daria ao motor uma âncora que
  // ele mesmo não reconheceria.
  if (inv.isManual) erros.push("é fatura MANUAL (isManual=true)");

  if (erros.length > 0) {
    throw new Error(
      `${alvo.rotulo}: a fatura ${inv.number} não está no estado aprovado ` +
        `(${erros.join("; ")}).\n` +
        "   Se o PIX foi PAGO nesse intervalo, NÃO force: a obrigação ISSUED com dueAt no\n" +
        "   passado restringiria um cliente que pagou (I1). Reavalie com o dono."
    );
  }

  // Devolve a fatura inteira: `carimbosDe` tira dela o `issuedAt` REAL da
  // cobrança, para não falsificar o histórico com "agora".
  return inv;
}

/** Vínculo idempotente quando a obrigação já existia. */
async function garantirVinculo(tx, alvo, sub, desejada, obligationId, invoiceIdAtual, vb) {
  const v = desejada.vincularFatura;
  const inv = await tx.invoice.findUnique({
    where: { id: v.invoiceId },
    select: {
      id: true,
      number: true,
      billingObligationId: true,
      subscriptionId: true,
      status: true,
      paidAt: true,
    },
  });
  if (!inv) throw new Error(`${alvo.rotulo}: fatura ${v.invoiceId} NÃO existe.`);
  if (inv.subscriptionId !== sub.id) {
    throw new Error(
      `${alvo.rotulo}: fatura ${inv.number} pertence a outra assinatura (${inv.subscriptionId}).`
    );
  }

  // 🔑 Reconfere o ESTADO da fatura mesmo quando o vínculo já existe. Um
  // "no-op" cego aqui esconderia o caso mais perigoso da reexecução: o PIX foi
  // PAGO e a obrigação continuou `ISSUED` com `dueAt` no passado — I1
  // restringiria um cliente que pagou. O vínculo existir não diz nada sobre o
  // estado dele.
  if (inv.status !== "PENDING" || inv.paidAt !== null) {
    throw new Error(
      `${alvo.rotulo}: fatura ${inv.number} está ${inv.status}` +
        `${inv.paidAt ? ` (paidAt ${d10(inv.paidAt)})` : ""}, não PENDING.\n` +
        "   Se o PIX foi PAGO, a obrigação vinculada precisa ir para PAID (Task 8) — uma\n" +
        "   obrigação ISSUED com dueAt no passado RESTRINGE quem pagou (I1). Reavalie."
    );
  }

  if (inv.billingObligationId === obligationId && invoiceIdAtual === inv.id) {
    return `   = fatura ${inv.number} já vinculada nos dois sentidos (no-op)`;
  }
  if (inv.billingObligationId !== null && inv.billingObligationId !== obligationId) {
    throw new Error(
      `${alvo.rotulo}: fatura ${inv.number} está vinculada a OUTRA obrigação ` +
        `(${inv.billingObligationId}). Abortado.`
    );
  }
  if (invoiceIdAtual !== null && invoiceIdAtual !== inv.id) {
    throw new Error(
      `${alvo.rotulo}: obrigação seq ${desejada.sequence} já aponta para a fatura ` +
        `${invoiceIdAtual}, diferente de ${inv.id}. Abortado.`
    );
  }

  if (inv.billingObligationId === null) {
    await tx.invoice.update({
      where: { id: inv.id },
      data: { billingObligationId: obligationId },
    });
  }
  if (invoiceIdAtual === null) {
    await tx.billingObligation.update({
      where: { id: obligationId },
      data: { invoiceId: inv.id },
    });
  }
  return `   ↔ fatura ${inv.number} — vínculo ${vb("COMPLETADO", "completaria")}`;
}

/**
 * Cancela as faturas-lixo (`CANCELED`, porque o enum não tem `VOID`).
 *
 * NÃO é só higiene, ao contrário do que parece: a guarda de cobrança dupla do
 * motor é por EMPRESA, não por assinatura, então uma fatura viva sem vínculo
 * pode travar a emissão de OUTRA assinatura da mesma empresa
 * (`unmapped_invoice_overlap`). Ela também segue aparecendo como dívida viva no
 * financeiro e pode ser rebaixada pelo webhook (`PAYMENT_OVERDUE` → `PAST_DUE`).
 *
 * ⚠️ Cancelar o status LOCAL não cancela a cobrança no Asaas. Se uma dessas
 * faturas tiver `asaasPaymentId`, existe cobrança remota que pode ser paga
 * depois e ressuscitada pelo webhook. Este script NÃO chama o gateway, então
 * não pode declarar isso neutralizado: ele ABORTA e manda o dono cancelar no
 * Asaas primeiro.
 */
async function cancelarFaturas(tx, alvo, sub, vb) {
  if (alvo.cancelarFaturas === "NENHUMA") return [];

  const vivas = await tx.invoice.findMany({
    where: {
      subscriptionId: sub.id,
      status: { in: STATUS_VIVOS },
      // As que este bootstrap acabou de mapear ficam de fora: são cobranças
      // legítimas em curso.
      billingObligationId: null,
    },
    select: {
      id: true,
      number: true,
      status: true,
      total: true,
      asaasPaymentId: true,
      paidAt: true,
      isManual: true,
      periodStart: true,
      periodEnd: true,
    },
    orderBy: { issuedAt: "asc" },
  });

  if (vivas.length === 0) {
    return [`   = nenhuma fatura viva sem vínculo (no-op)`];
  }

  // Fatura MANUAL é lançamento humano, não lixo do motor — e a guarda de
  // cobrança dupla já a ignora (`isManual: false`), então ela não travaria
  // emissão nenhuma. Cancelá-la seria o script desfazendo à revelia um
  // lançamento que alguém fez de propósito. Aborta e devolve a decisão ao dono.
  //
  // ⚠️ EXCEÇÃO NOMINAL, aprovada pelo dono em 2026-07-30 DEPOIS de o dry-run ter
  // barrado e ele ter inspecionado as duas linhas. NÃO é afrouxamento da regra:
  // a lista é de IDs LITERAIS, então qualquer outra fatura manual — nesta ou em
  // outra assinatura, hoje ou amanhã — continua abortando.
  //
  // O que são: R$ 5,00 numa assinatura ANUAL de R$ 1.499,00, descritas "TESTE" e
  // "MENSALIDADE JJULHO" (com o typo), criadas em 11 e 12/06/2026.
  //
  // 🚨 A guarda de PIX VIVO logo abaixo continua valendo para elas. Anular a
  // fatura local NÃO cancela a cobrança no Asaas — o cliente ainda conseguiria
  // pagar, e o webhook (que hoje mexe em obrigação) ressuscitaria a fatura como
  // PAID. Por isso esta exceção sozinha NÃO destrava o script: o dono tem que
  // cancelar os PIX no painel do Asaas primeiro. É de propósito.
  const MANUAIS_APROVADAS_PARA_VOID = new Set([
    "cmqa5j96l0003mndw7n7hdqe6", // INV-000005 "TESTE" — pay_nfmlisx8urjclfid
    "cmqabuwzf00014brjd91vvspg", // INV-000006 "MENSALIDADE JJULHO" — pay_8q0tv3vfmuva0a2w
  ]);
  const manuais = vivas.filter(
    (i) => i.isManual && !MANUAIS_APROVADAS_PARA_VOID.has(i.id)
  );
  if (manuais.length > 0) {
    throw new Error(
      `${alvo.rotulo}: ${manuais.length} fatura(s) viva(s) são MANUAIS ` +
        `(${manuais.map((i) => i.number).join(", ")}).\n` +
        "   Lançamento manual é decisão de alguém, e o motor já as ignora — este script\n" +
        "   não as cancela. Resolva à mão (ou vincule) e rode de novo."
    );
  }

  // Fatura PAGA não é lixo: é dinheiro que entrou. Cancelá-la apagaria a
  // evidência do pagamento.
  const pagas = vivas.filter((i) => i.status === "PAID");
  const comGateway = vivas.filter((i) => i.status !== "PAID" && i.asaasPaymentId);
  if (comGateway.length > 0) {
    throw new Error(
      `${alvo.rotulo}: ${comGateway.length} fatura(s) a cancelar TÊM cobrança no Asaas ` +
        `(${comGateway.map((i) => `${i.number}=${i.asaasPaymentId}`).join(", ")}).\n` +
        "   Mudar o status local NÃO cancela o PIX/boleto no gateway: o cliente ainda pode\n" +
        "   pagar, e o webhook ressuscitaria a fatura como PAID. Este script não chama o\n" +
        "   Asaas de propósito. CANCELE no painel do Asaas primeiro, depois rode de novo."
    );
  }

  // Fatura PAGA onde o documento aprovado diz que NÃO há nenhuma paga é DRIFT,
  // não um caso a tratar. A Atacadão é declarada com "nenhuma paga"; se apareceu
  // uma, o dinheiro mudou de lugar desde a aprovação e a decisão de cortesia
  // precisa ser reavaliada pelo dono — não contornada pelo script.
  // Contagem EXATA nos dois sentidos. Só olhar "apareceu paga onde o doc diz
  // zero" deixava o oposto passar por vacuidade: a fatura paga da Ultra poder
  // DESAPARECER (cancelada à mão, estornada) e o script seguir em frente
  // gravando `paidAt = periodStart`, afirmando um pagamento que já não existe.
  if (pagas.length !== alvo.pagasEsperadas) {
    throw new Error(
      `${alvo.rotulo}: o documento aprovado prevê ${alvo.pagasEsperadas} fatura(s) PAGA(s), ` +
        `mas o banco tem ${pagas.length}` +
        (pagas.length > 0
          ? ` (${pagas.map((i) => `${i.number}=${brl(i.total)}`).join(", ")})`
          : "") +
        ".\n   O dinheiro mudou de lugar desde a aprovação — a decisão precisa ser\n" +
        "   reavaliada pelo dono. Abortado sem escrever."
    );
  }

  const linhas = [];
  for (const paga of pagas) {
    // Vincula à obrigação cujo período é EXATAMENTE o da fatura.
    //
    // 🔑 Igualdade exata, não interseção. Interseção (`periodStart < fim AND
    // periodEnd > início`) casaria com QUALQUER sobreposição: uma fatura que
    // atravessasse 01/06 casaria com duas obrigações e o `findFirst` sem
    // `orderBy` escolheria uma delas de forma não determinística — podendo
    // pendurar a fatura paga de R$ 99,90 numa COURTESY de R$ 149,90.
    const cobre = await tx.billingObligation.findFirst({
      where: {
        subscriptionId: sub.id,
        periodStart: paga.periodStart,
        periodEnd: paga.periodEnd,
      },
      select: {
        id: true,
        sequence: true,
        invoiceId: true,
        priceCents: true,
        disposition: true,
        state: true,
        paidAt: true,
      },
    });
    if (!cobre) {
      throw new Error(
        `${alvo.rotulo}: fatura PAGA ${paga.number} (${brl(paga.total)}, ` +
          `${d10(paga.periodStart)}→${d10(paga.periodEnd)}) não tem obrigação com o período ` +
          "EXATAMENTE igual ao dela. Não vou cancelar dinheiro que entrou nem pendurá-lo " +
          "numa obrigação de outro período. Abortado."
      );
    }
    // O valor pago tem que ser o valor da obrigação, senão o vínculo afirmaria
    // que R$ X quitou uma obrigação de R$ Y.
    if (cobre.priceCents !== paga.total) {
      throw new Error(
        `${alvo.rotulo}: fatura PAGA ${paga.number} vale ${brl(paga.total)} mas a obrigação ` +
          `seq ${cobre.sequence} do mesmo período vale ${brl(cobre.priceCents)}. Abortado.`
      );
    }
    // Dinheiro que entrou quita uma cobrança, não uma cortesia.
    if (cobre.disposition !== "CHARGE") {
      throw new Error(
        `${alvo.rotulo}: fatura PAGA ${paga.number} casaria com a obrigação seq ` +
          `${cobre.sequence}, que é ${cobre.disposition} — cortesia não é quitada por ` +
          "pagamento. Abortado."
      );
    }

    await tx.invoice.update({
      where: { id: paga.id },
      data: { billingObligationId: cobre.id },
    });
    const patch = {};
    if (cobre.invoiceId === null) patch.invoiceId = paga.id;
    // 🔑 `paidAt` REAL do pagamento. A obrigação foi criada antes de a fatura
    // paga ser descoberta, então nasceu com `paidAt = periodStart` (o
    // fallback). Deixar assim falsificaria o instante em que o cliente pagou.
    if (paga.paidAt && cobre.paidAt?.getTime() !== paga.paidAt.getTime()) {
      patch.paidAt = paga.paidAt;
    }
    if (Object.keys(patch).length > 0) {
      await tx.billingObligation.update({ where: { id: cobre.id }, data: patch });
    }
    linhas.push(
      `   ↔ fatura PAGA ${paga.number} (${brl(paga.total)}) ${vb("VINCULADA", "vincularia")}` +
        ` à obrigação seq ${cobre.sequence}` +
        (paga.paidAt ? `, paidAt ${d10(paga.paidAt)} (real da fatura)` : "") +
        " — não é lixo, é dinheiro que entrou"
    );
  }

  const lixo = vivas.filter((i) => i.status !== "PAID");
  for (const inv of lixo) {
    // Captura o status ANTES do update: `inv` é a linha que o Prisma devolveu, e
    // relê-la depois de escrever imprimiria "CANCELED → CANCELED".
    const statusAntes = inv.status;
    await tx.invoice.update({
      where: { id: inv.id },
      data: { status: "CANCELED" },
    });
    linhas.push(
      `   ✂ fatura ${inv.number} (${brl(inv.total)}, ${statusAntes} → CANCELED, ` +
        `${d10(inv.periodStart)}→${d10(inv.periodEnd)}) ${vb("(feito)", "(faria)")}`
    );
  }
  return linhas;
}

/**
 * GATE DE COMMIT — roda DENTRO da transação e é ele quem autoriza o commit.
 *
 * Não é laudo pós-fato: conferir depois do commit deixaria o banco no estado
 * proibido e o script apenas gritando. Falhando aqui, lança → ROLLBACK.
 *
 * Verifica, por assinatura do plano:
 *   - `sequence` começa em 1 e não tem lacuna (1,2,3… sem salto);
 *   - contiguidade EXATA: fim de uma == início da próxima (sem buraco nem
 *     sobreposição), a regra que `billing-clock`/`isContiguous` exige;
 *   - intervalo positivo (fim > início);
 *   - nenhuma isenta ficou `PLANNED` (o estado que TRAVA a assinatura);
 *   - `ISSUED` tem `issuedAt` e `dueAt`; `PAID` tem `paidAt`;
 *   - isenta `PAID` NÃO tem `issuedAt`/`dueAt` (senão restringe por I1);
 *   - toda `COURTESY` tem cortesia vigente que a justifique;
 *   - vínculo obrigação↔fatura coerente nos dois sentidos.
 */
async function gateDeCommit(tx) {
  const linhas = ["\n── GATE DE COMMIT (dentro da transação) ──"];
  const problemas = [];
  let totalNaoFaturado = 0;
  // Por alvo também: é assim que o dono confere o R$ 1.049,30 da Ultra que o
  // documento aprovado declara, em vez de só um total somado.
  const naoFaturadoPorAlvo = {};

  for (const alvo of PLANO) {
    const obrigacoes = await tx.billingObligation.findMany({
      where: { subscriptionId: alvo.subscriptionId },
      orderBy: { sequence: "asc" },
      select: {
        id: true,
        sequence: true,
        periodStart: true,
        periodEnd: true,
        disposition: true,
        state: true,
        priceCents: true,
        issuedAt: true,
        dueAt: true,
        paidAt: true,
        invoiceId: true,
      },
    });
    const cortesias = await tx.subscriptionCourtesy.findMany({
      where: { subscriptionId: alvo.subscriptionId, revokedAt: null },
      select: { startsAt: true, endsAt: true },
    });

    if (obrigacoes.length === 0) {
      problemas.push(`${alvo.rotulo}: nenhuma obrigação ao fim da transação`);
      continue;
    }

    obrigacoes.forEach((o, i) => {
      const tag = `${alvo.rotulo} seq ${o.sequence}`;
      if (o.sequence !== i + 1) {
        problemas.push(`${tag}: sequência com lacuna (esperado ${i + 1})`);
      }
      if (o.periodEnd.getTime() <= o.periodStart.getTime()) {
        problemas.push(`${tag}: intervalo inválido (fim <= início)`);
      }
      if (i > 0) {
        const anterior = obrigacoes[i - 1];
        if (anterior.periodEnd.getTime() !== o.periodStart.getTime()) {
          problemas.push(
            `${tag}: NÃO contígua — anterior termina ${d10(anterior.periodEnd)}, ` +
              `esta começa ${d10(o.periodStart)}`
          );
        }
      }

      const isenta =
        o.disposition === "COURTESY" ||
        o.disposition === "INTERNAL" ||
        o.disposition === "LEGACY_WAIVED";

      if (isenta && o.state === "PLANNED") {
        problemas.push(
          `${tag}: isenta em PLANNED — TRAVA a assinatura para sempre (o motor devolve ` +
            "`settled` toda rodada, sem cobrar e sem alertar)"
        );
      }
      if (isenta && o.state === "PAID" && (o.issuedAt !== null || o.dueAt !== null)) {
        problemas.push(
          `${tag}: isenta PAID com issuedAt/dueAt — I1 a leria como emitida e vencida ` +
            "e restringiria o acesso"
        );
      }
      if (o.state === "ISSUED" && (o.issuedAt === null || o.dueAt === null)) {
        problemas.push(`${tag}: ISSUED sem issuedAt e/ou dueAt — I1 não tem como provar`);
      }
      if (o.state === "PAID" && o.paidAt === null) {
        problemas.push(`${tag}: PAID sem paidAt`);
      }
      if (o.disposition === "COURTESY") {
        totalNaoFaturado += o.priceCents;
        naoFaturadoPorAlvo[alvo.rotulo] =
          (naoFaturadoPorAlvo[alvo.rotulo] ?? 0) + o.priceCents;
        const coberta = cortesias.some(
          (c) =>
            c.startsAt.getTime() <= o.periodStart.getTime() &&
            (c.endsAt === null || o.periodStart.getTime() < c.endsAt.getTime())
        );
        if (!coberta) {
          problemas.push(
            `${tag}: COURTESY sem cortesia vigente que a justifique em ` +
              `${d10(o.periodStart)} — ledger contradiria a concessão`
          );
        }
      }
    });

    // Vínculo coerente nos dois sentidos.
    for (const o of obrigacoes) {
      if (o.invoiceId === null) continue;
      const inv = await tx.invoice.findUnique({
        where: { id: o.invoiceId },
        select: { number: true, billingObligationId: true },
      });
      if (!inv) {
        problemas.push(`${alvo.rotulo} seq ${o.sequence}: invoiceId aponta para fatura inexistente`);
      } else if (inv.billingObligationId !== o.id) {
        problemas.push(
          `${alvo.rotulo} seq ${o.sequence}: vínculo torto — fatura ${inv.number} aponta ` +
            `para ${inv.billingObligationId ?? "null"}`
        );
      }
    }

    // Sentido INVERSO: toda fatura que aponta para uma obrigação desta
    // assinatura tem que ser apontada de volta. Sem esta volta, um vínculo
    // UNILATERAL (fatura→obrigação, com `obligation.invoiceId` vazio) passaria
    // batido — e é exatamente o que acontece quando `cobre.invoiceId` já estava
    // ocupado por outra fatura.
    const idsDasObrigacoes = new Set(obrigacoes.map((o) => o.id));
    const faturasApontando = await tx.invoice.findMany({
      where: { billingObligationId: { in: [...idsDasObrigacoes] } },
      select: { id: true, number: true, billingObligationId: true },
    });
    for (const inv of faturasApontando) {
      const alvoObrig = obrigacoes.find((o) => o.id === inv.billingObligationId);
      if (alvoObrig && alvoObrig.invoiceId !== inv.id) {
        problemas.push(
          `${alvo.rotulo} seq ${alvoObrig.sequence}: vínculo UNILATERAL — fatura ` +
            `${inv.number} aponta para a obrigação, mas a obrigação aponta para ` +
            `${alvoObrig.invoiceId ?? "null"}`
        );
      }
    }

    linhas.push(
      `   ✔ ${alvo.rotulo}: ${obrigacoes.length} obrigação(ões), seq 1..${obrigacoes.length}, ` +
        `contígua de ${d10(obrigacoes[0].periodStart)} a ` +
        `${d10(obrigacoes[obrigacoes.length - 1].periodEnd)}`
    );
  }

  if (problemas.length > 0) {
    throw new Error(
      `GATE DE COMMIT REPROVOU (${problemas.length} problema(s)) — ROLLBACK, nada escrito:\n` +
        problemas.map((p) => `   ✗ ${p}`).join("\n")
    );
  }

  for (const [rotulo, cents] of Object.entries(naoFaturadoPorAlvo)) {
    linhas.push(`   ✔ ${rotulo}: receita não faturada ${brl(cents)}`);
  }
  linhas.push(
    `   ✔ receita NÃO FATURADA total registrada em cortesia: ${brl(totalNaoFaturado)}`
  );
  return linhas;
}

/**
 * Confere que o ROLLBACK do dry-run funcionou: a CONTAGEM de obrigações e
 * cortesias das 4 assinaturas não aumentou.
 *
 * ⚠️ ESCOPO HONESTO: é uma conferência de CONTAGEM, não um diff completo. Ela não
 * detectaria uma alteração revertida-pela-metade em campo de linha preexistente
 * (status de fatura, vínculo, carimbo). Serve para o caso que importa aqui — o
 * dry-run cria linhas NOVAS, e é a permanência delas que seria grave — e o texto
 * do log diz exatamente isso, sem prometer mais do que prova.
 *
 * 🔑 O dry-run ESCREVE de verdade (ver nota em `main`), então "reverteu" não
 * pode ser suposição: um dry-run que escreveu e não reverteu é o pior resultado
 * possível deste script, e o operador tem que saber disso na hora, não no
 * próximo mês. Lê FORA da transação, contra o estado commitado.
 *
 * Compara com o inventário de ANTES: o dry-run é permitido em banco que JÁ
 * tenha obrigações (reexecução após um apply parcial), então o critério não é
 * "está zerado", é "não aumentou".
 */
async function exigirNadaEscrito(prisma, antes) {
  const depois = await contarPorAssinatura(prisma);
  const sobrou = [];
  for (const alvo of PLANO) {
    const a = antes[alvo.subscriptionId];
    const d = depois[alvo.subscriptionId];
    if (d.obrigacoes !== a.obrigacoes) {
      sobrou.push(
        `${alvo.rotulo}: obrigações ${a.obrigacoes} → ${d.obrigacoes}`
      );
    }
    if (d.cortesias !== a.cortesias) {
      sobrou.push(`${alvo.rotulo}: cortesias ${a.cortesias} → ${d.cortesias}`);
    }
  }
  if (sobrou.length > 0) {
    throw new Error(
      "🚨 A CONTAGEM SUBIU depois do dry-run:\n" +
        sobrou.map((s) => `   ✗ ${s}`).join("\n") +
        "\n   DUAS causas possíveis, e elas exigem ações OPOSTAS — não presuma:\n" +
        "     (a) o ROLLBACK falhou e sobraram linhas DESTE script. São linhas falsas\n" +
        "         numa tabela contábil e precisam sair à mão.\n" +
        "     (b) uma escrita CONCORRENTE legítima entrou no intervalo (o cron do motor,\n" +
        "         por exemplo). Nesse caso as linhas são VÁLIDAS e apagá-las seria o erro.\n" +
        "   Inspecione `createdAt` e a `sequence` das linhas novas antes de tocar em nada."
    );
  }
  console.log(
    "   ✔ rollback conferido: a contagem de obrigações/cortesias não aumentou"
  );
}

/** Contagem de obrigações e cortesias por assinatura do plano. */
async function contarPorAssinatura(prisma) {
  const out = {};
  for (const alvo of PLANO) {
    out[alvo.subscriptionId] = {
      obrigacoes: await prisma.billingObligation.count({
        where: { subscriptionId: alvo.subscriptionId },
      }),
      cortesias: await prisma.subscriptionCourtesy.count({
        where: { subscriptionId: alvo.subscriptionId },
      }),
    };
  }
  return out;
}

/** Inventário: o que existe hoje, por assinatura do plano. */
async function imprimirInventario(prisma) {
  const totalObrigacoes = await prisma.billingObligation.count();
  const totalCortesias = await prisma.subscriptionCourtesy.count();
  console.log(
    `   banco inteiro: ${totalObrigacoes} obrigação(ões), ${totalCortesias} cortesia(s)`
  );

  for (const alvo of PLANO) {
    const obrigacoes = await prisma.billingObligation.findMany({
      where: { subscriptionId: alvo.subscriptionId },
      orderBy: { sequence: "asc" },
      select: {
        sequence: true,
        periodStart: true,
        periodEnd: true,
        disposition: true,
        state: true,
        priceCents: true,
      },
    });
    const cortesias = await prisma.subscriptionCourtesy.count({
      where: { subscriptionId: alvo.subscriptionId },
    });
    const faturas = await prisma.invoice.groupBy({
      by: ["status"],
      where: { subscriptionId: alvo.subscriptionId },
      _count: { _all: true },
    });
    const resumoFaturas =
      faturas.map((f) => `${f.status}:${f._count._all}`).join(" ") || "nenhuma";

    console.log(
      `   ${alvo.rotulo}: ${obrigacoes.length} obrigação(ões), ${cortesias} cortesia(s), ` +
        `faturas [${resumoFaturas}]`
    );
    for (const o of obrigacoes) {
      console.log(
        `      seq ${o.sequence} [${d10(o.periodStart)} → ${d10(o.periodEnd)}) ` +
          `${o.disposition}/${o.state} ${brl(o.priceCents)}`
      );
    }
  }
}

function imprimirResumo(acoes, modo) {
  console.log(
    `\n── ${modo === "apply" ? "APLICADO" : "PLANO (nada escrito)"} ──`
  );
  for (const linha of acoes ?? []) console.log(linha);
}

/**
 * 🔑 `main()` SÓ roda quando este arquivo é o ponto de entrada do `node`.
 *
 * Sem esta guarda, um `require()` deste módulo (é o que o teste faz, para
 * exercitar a aritmética) EXECUTARIA o bootstrap — abrindo conexão com o banco
 * de PRODUÇÃO durante `vitest`. Este repo já teve incidente de banco de produção
 * zerado; um teste que conecta em prod por efeito colateral de import é
 * exatamente o tipo de acidente que não pode existir.
 *
 * Com a guarda, `require` só expõe as funções puras e nada acontece.
 */
if (require.main === module) {
  main().catch((err) => {
    console.error(`\n❌ Falhou: ${err.message}`);
    if (commitFeito) {
      console.error(
        "   ⚠️  ATENÇÃO: o COMMIT JÁ ACONTECEU antes desta falha — as escritas ESTÃO no\n" +
          "       banco. A falha foi na reconferência posterior. NÃO presuma rollback:\n" +
          "       confira o estado no banco antes de agir. O dry-run só serve aqui se nada\n" +
          "       tiver sido pago/renovado desde a foto aprovada (ver 'ONE-SHOT' no topo)."
      );
    } else {
      console.error("   Nada foi escrito: a transação sofreu ROLLBACK.");
    }
    process.exit(1);
  });
}

// Exportado só para o teste exercitar a aritmética e a chave de lock sem banco.
module.exports = {
  periodEndFrom,
  advisoryKeyForCompany,
  ultraPeriods,
  ULTRA_ANCHOR,
  ULTRA_COURTESY_FROM,
  ULTRA_COURTESY_UNTIL,
  PLANO,
  // `executar` é exportada para que o teste possa rodar o fluxo INTEIRO contra um
  // Prisma falso em memória. Não é o mesmo que provar contra o banco (constraint,
  // trigger e FK não existem no falso), mas pega a classe de erro que mais
  // assustaria no dia do apply: o script abortar sozinho na foto aprovada.
  executar,
};
