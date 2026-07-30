import {
  Prisma,
  type BillingCycle,
  type ObligationDisposition as PrismaObligationDisposition,
  type ObligationState,
} from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/prisma";
import { advisoryKeyForCompany } from "@/lib/advisory-lock";
import { logger } from "@/lib/logger";
import { nextSaasInvoiceNumber } from "@/lib/saas-invoice-number";
import { ensureAsaasCustomer } from "@/services/asaas-customer.service";
import { ensureInvoiceCharge } from "@/services/invoice-charge.service";
import { sendInvoiceCharge } from "@/services/invoice-send.service";
import { resolveEffectiveSubscription } from "@/lib/effective-subscription";
import { resolveObligationDisposition } from "@/lib/billing-courtesy";
import {
  periodsOverlap,
  resolveNextObligationPlan,
  resolveObligationPriceCents,
} from "@/lib/billing-obligation";
import { decideOnExistingCharge } from "@/lib/trial-conversion-charge";
import {
  isIssuanceEnabledForCompany,
  isObligationGenerationEnabled,
} from "@/lib/billing-engine-flags";

const log = logger.child({ service: "billing-obligation" });

/**
 * Motor de obrigação de cobrança: materializa "a assinatura X deve o valor V
 * pelo período [início, fim)" e, quando a coorte libera, emite a cobrança.
 *
 * Padrão de TRÊS fases, estendendo o de `trial-conversion-charge.service.ts`:
 *
 *   Fase 1 (tx + advisory lock) — decide e RESERVA a obrigação.
 *   Fase 2 (tx curta + MESMO lock) — recalcula o preço, revalida as guardas e
 *           reserva a tentativa (Invoice) com CAS.
 *   Fase 3 (SEM tx) — fala com o gateway e só então promove a obrigação.
 *
 * Por que a fase 2 existe separada, e não junto da 1: o preço é congelado na
 * EMISSÃO, não na criação (schema, docstring de `BillingObligation`; spec
 * §4.1.2). Uma obrigação criada em setembro e emitida em outubro precisa do
 * plano de outubro. E a reserva da Invoice PRECISA do lock — não há unique em
 * `Invoice.billingObligationId`, só índice, então duas rodadas simultâneas
 * criariam duas faturas e DUAS cobranças reais no gateway, cada uma com sua
 * chave de idempotência.
 *
 * 🚨 O gateway Asaas é produção SEM sandbox: o primeiro disparo é dinheiro de
 * verdade. Toda guarda aqui é fail-closed de propósito — o modo de falha
 * aceitável é "não cobrou e avisou o operador", nunca "cobrou por engano".
 */

// ─────────────────────────────────────────────────────────────────────────────
// Contrato
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retrato da obrigação, para quem consome o resultado sem reler o banco.
 *
 * ⚠️ `disposition` usa o enum do PRISMA, não a união estreita de
 * `billing-courtesy.ts` (`CHARGE|COURTESY|INTERNAL`). O banco também guarda
 * `LEGACY_WAIVED`, escrita pelo bootstrap da etapa 2 — uma linha assim EXISTE e
 * pode ser lida por este serviço. Estreitar o tipo aqui obrigaria a um
 * `as`/`as never` para calar o compilador, e foi exatamente assim que um typo já
 * passou compilando neste repo. O tipo largo força o código a decidir o que faz
 * com `LEGACY_WAIVED` em vez de finge que ela não existe.
 */
export interface ObligationSnapshot {
  id: string;
  sequence: number;
  state: ObligationState;
  disposition: PrismaObligationDisposition;
  periodStart: Date;
  periodEnd: Date;
  priceCents: number;
}

export type ObligationSkipReason =
  /** Etapa 1 do rollout desligada. */
  | "generation_disabled"
  /** Nenhuma assinatura viva — ausência, não erro. */
  | "no_effective_subscription"
  /** O Asaas gerencia o ciclo desta assinatura (ver armadilha herdada). */
  | "native_asaas_subscription"
  /** A linha do tempo desta assinatura ainda não foi ancorada pelo bootstrap. */
  | "needs_bootstrap"
  /** O próximo período começa longe demais para materializar agora. */
  | "outside_horizon"
  /** Obrigação de cortesia — nenhuma fatura, nenhum e-mail, nenhum PIX. */
  | "courtesy"
  /** Plano de preço zero (conta interna do dono). */
  | "internal"
  /** Etapa 4 do rollout não liberada para esta empresa. */
  | "issuance_not_enabled"
  /** Obrigação já emitida/paga/anulada — nada a fazer nesta rodada. */
  | "already_settled";

export type ObligationFailReason =
  /** Duas assinaturas vivas: não escolhe, não cobra (fail-closed). */
  | "ambiguous_subscription"
  | "company_not_found"
  | "invalid_price"
  /** `billing-clock`/`billing-courtesy`/`billing-obligation` recusaram o dado. */
  | "invalid_calendar"
  /** Fatura `CANCELED`/`REFUNDED`: houve intervenção humana, humano decide. */
  | "needs_review"
  /** Fatura viva sem vínculo cobrindo o mesmo período (risco de cobrança dupla). */
  | "unmapped_invoice_overlap"
  | "missing_document"
  /** Outra rodada reservou a tentativa primeiro. */
  | "attempt_race"
  /** O gateway recusou — a obrigação permanece `PLANNED`. */
  | "gateway_error"
  /** Não deu para pegar o lock da empresa no tempo previsto. */
  | "lock_timeout"
  | "unexpected";

export type ObligationOutcome =
  | { kind: "skipped"; reason: ObligationSkipReason; obligation?: ObligationSnapshot }
  | {
      kind: "failed";
      reason: ObligationFailReason;
      detail: string;
      /** Vale tentar de novo na próxima rodada sem intervenção humana? */
      retryable: boolean;
      obligation?: ObligationSnapshot;
    }
  /** Obrigação materializada (ou reencontrada), sem emissão nesta rodada. */
  | { kind: "planned"; obligation: ObligationSnapshot; created: boolean }
  /** Obrigação de cortesia/interna já quitada no ato. */
  | { kind: "settled"; obligation: ObligationSnapshot; created: boolean }
  /** Cobrança emitida no gateway. */
  | {
      kind: "issued";
      obligation: ObligationSnapshot;
      invoiceId: string;
      dueAt: Date;
      /** Resultado do e-mail — best-effort, não desfaz a cobrança. */
      emailStatus: string;
    };

export interface ObligationDeps {
  prismaClient?: typeof defaultPrisma;
  ensureCustomerFn?: typeof ensureAsaasCustomer;
  ensureChargeFn?: typeof ensureInvoiceCharge;
  sendChargeEmailFn?: typeof sendInvoiceCharge;
  isGenerationEnabledFn?: typeof isObligationGenerationEnabled;
  isIssuanceEnabledFn?: typeof isIssuanceEnabledForCompany;
  /**
   * Âncora do primeiro período, por assinatura. Vem do bootstrap (etapa 2 do
   * rollout), NUNCA de `currentPeriodEnd` — ver `resolveNextObligationPlan`.
   */
  firstPeriodStartBySubscription?: Record<string, Date>;
  now?: Date;
}

/**
 * Quantos dias antes do início do período a obrigação é materializada e a
 * cobrança emitida. A emissão acontece ANTES do período começar para o cliente
 * pagar antes de estar devendo (spec §4.5) — e é o mesmo número que define o
 * horizonte de geração, para que nunca exista obrigação materializada que ainda
 * não pode ser emitida.
 */
export const ISSUE_LEAD_DAYS = 5;

/**
 * Teto da transação interativa. Mais alto que o default do Prisma (5s) porque o
 * checkout segura o MESMO advisory lock durante uma chamada real ao Asaas, com
 * `timeout: 20_000` (`billing/checkout/route.ts`). Herdar o default faria o
 * motor estourar esperando um lock legítimo — e o outcome pareceria erro de
 * cobrança, não contenção. Continua finito de propósito: aumentar sem limite
 * transformaria o cron numa fila de conexões pinadas no pooler.
 */
const TX_OPTIONS = { timeout: 25_000, maxWait: 8_000 } as const;

// ─────────────────────────────────────────────────────────────────────────────
// Lote — o isolamento por assinatura
// ─────────────────────────────────────────────────────────────────────────────

export interface BatchEntry {
  companyId: string;
  outcome: ObligationOutcome;
}

/**
 * Roda o motor para várias empresas, uma por vez.
 *
 * 🔑 ISOLAMENTO POR EMPRESA — a razão de este laço existir. Os módulos puros da
 * cadeia (`billing-clock`, `billing-courtesy`, `billing-obligation`) LANÇAM
 * diante de dado corrompido; isso é deliberado e fail-closed. Mas o chamador é
 * um cron que varre TODAS as assinaturas: se uma exceção subisse, uma única
 * linha com `periodEnd` inválido derrubaria a rodada inteira e NINGUÉM seria
 * cobrado — a falha de uma empresa viraria a falha do faturamento do mês.
 *
 * Como `runObligationForCompany` nunca lança, o laço não precisa de try/catch
 * para funcionar. O try/catch existe mesmo assim, como rede de segurança: se
 * uma refatoração futura reintroduzir um caminho que escapa (um `throw` novo
 * antes do try interno, por exemplo), o lote continua e o defeito aparece como
 * `unexpected` numa empresa em vez de zerar a cobrança de todas.
 *
 * Sequencial de propósito: em paralelo, N transações interativas prenderiam N
 * conexões pinadas no pooler do Neon ao mesmo tempo.
 */
export async function runObligationsForCompanies(
  companyIds: string[],
  deps: ObligationDeps = {},
): Promise<BatchEntry[]> {
  const results: BatchEntry[] = [];

  for (const companyId of companyIds) {
    try {
      results.push({ companyId, outcome: await runObligationForCompany(companyId, deps) });
    } catch (error) {
      log.error("Exceção escapou de runObligationForCompany (o lote continua)", {
        companyId,
        error: error instanceof Error ? error.message : String(error),
      });
      results.push({
        companyId,
        outcome: {
          kind: "failed",
          reason: "unexpected",
          detail: error instanceof Error ? error.message : String(error),
          retryable: false,
        },
      });
    }
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Uma empresa
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Garante a obrigação do período seguinte de uma empresa e, quando a coorte
 * libera, emite a cobrança.
 *
 * 🔑 NUNCA LANÇA. Toda falha vira `{ kind: "failed" }` com motivo. É o contrato
 * que permite ao cron processar o lote inteiro — ver `runObligationsForCompanies`.
 */
export async function runObligationForCompany(
  companyId: string,
  deps: ObligationDeps = {},
): Promise<ObligationOutcome> {
  const prisma = deps.prismaClient ?? defaultPrisma;
  const isGenerationEnabled = deps.isGenerationEnabledFn ?? isObligationGenerationEnabled;
  const isIssuanceEnabled = deps.isIssuanceEnabledFn ?? isIssuanceEnabledForCompany;
  const now = deps.now ?? new Date();

  try {
    // Flag antes de qualquer I/O: com a etapa 1 desligada o motor não abre nem
    // conexão. Nasce DESLIGADA — o modo de falha de um motor de cobrança ligado
    // por engano é cobrar quem não devia.
    //
    // DENTRO do try: a leitura da flag é injetável e um teste (ou uma
    // implementação futura que leia de outro lugar) pode lançar. Fora do try,
    // isso quebraria a promessa "nunca lança" e derrubaria o lote inteiro.
    if (!isGenerationEnabled()) {
      return { kind: "skipped", reason: "generation_disabled" };
    }

    // ── Fase 1: decidir e reservar a obrigação ───────────────────────────────
    const reserved = await reserveObligation(companyId, { prisma, deps, now });
    if (reserved.kind !== "reserved") return reserved.outcome;

    const { obligation, created } = reserved;

    // 🔑 Só `CHARGE` chega ao gateway. Cortesia, conta interna e passado
    // regularizado terminam aqui: nenhuma fatura, nenhum e-mail, nenhum PIX.
    //
    // `LEGACY_WAIVED` entra nesta lista de propósito. Ela nunca é PRODUZIDA por
    // este serviço (é escrita direta do bootstrap da etapa 2), mas uma linha
    // assim EXISTE no banco e pode ser lida aqui — e o passado regularizado é o
    // que menos pode ser cobrado de novo. Tratá-la por omissão faria o motor
    // cair no caminho de emissão e cobrar um período que o dono declarou
    // encerrado.
    if (obligation.disposition !== "CHARGE") {
      // ⚠️ E se essa linha isenta ainda estiver `PLANNED`? Ela TRAVA a assinatura.
      //
      // As obrigações isentas que este serviço cria já nascem `PAID`
      // (`reserveObligationOnce`), mas o bootstrap da etapa 2 e as ferramentas da
      // Task 9 escrevem `disposition` à mão e podem deixar a linha `PLANNED`.
      // Nesse estado a precedência de "trabalho pendente antes de trabalho novo"
      // devolve SEMPRE a mesma obrigação, a rodada devolve `settled`, e a
      // assinatura nunca gera o período seguinte — o cliente para de ser cobrado
      // em silêncio, com o outcome dizendo "quitada". Provado por teste: seis
      // rodadas seguidas, uma obrigação só, nenhuma nova.
      //
      // Quitar é a resposta certa e não é palpite: isenta é isenta em qualquer
      // uma das três disposições, e sem cobrança nenhuma pendurada (o caminho de
      // emissão nunca a alcançou, logo não há fatura nem PIX). Carimba `paidAt`
      // e deixa `issuedAt`/`dueAt` nulos, que é o que impede I1 de restringir.
      if (obligation.state === "PLANNED") {
        const quitada = await prisma.billingObligation.updateMany({
          where: { id: obligation.id, state: "PLANNED" },
          data: { state: "PAID", paidAt: now },
        });
        log.info("Obrigação isenta estava PLANNED — quitada para destravar a fila", {
          companyId,
          obligationId: obligation.id,
          disposition: obligation.disposition,
          alterada: quitada.count,
        });
        return {
          kind: "settled",
          obligation: { ...obligation, state: "PAID" },
          created,
        };
      }
      return { kind: "settled", obligation, created };
    }

    // A obrigação já não está mais em aberto (outra rodada emitiu, o webhook
    // marcou paga, o operador anulou). Nada a fazer — e sobretudo, NÃO
    // reemitir por cima.
    if (obligation.state !== "PLANNED") {
      return { kind: "skipped", reason: "already_settled", obligation };
    }

    if (!isIssuanceEnabled(companyId)) {
      // Etapa 1 do rollout: materializa a linha do tempo sem emitir centavo.
      // A obrigação fica `PLANNED` e a rodada de amanhã a reencontra — por isso
      // "já existe" NÃO é um resultado terminal neste serviço.
      return { kind: "skipped", reason: "issuance_not_enabled", obligation };
    }

    // ── Fase 2: recalcular, revalidar e reservar a tentativa ─────────────────
    const attempt = await reserveAttempt(companyId, obligation, { prisma, now });
    if (attempt.kind !== "reserved") return attempt.outcome;

    // ── Fase 3: gateway, FORA da transação ───────────────────────────────────
    return await issueAttempt(companyId, attempt.obligation, attempt.invoiceId, {
      prisma,
      deps,
      now,
    });
  } catch (error) {
    return classifyError(error, companyId);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Fase 1
// ─────────────────────────────────────────────────────────────────────────────

type ReserveResult =
  | {
      kind: "reserved";
      obligation: ObligationSnapshot;
      created: boolean;
      /** Presentes só na criação — usados para reler o vencedor após um P2002. */
      subscriptionId?: string;
      attemptedPeriodStart?: Date;
    }
  | { kind: "done"; outcome: ObligationOutcome };

interface Ctx {
  prisma: typeof defaultPrisma;
  deps: ObligationDeps;
  now: Date;
}

/**
 * Fase 1 com tratamento de P2002 em transação NOVA.
 *
 * 🔑 A releitura do vencedor não pode acontecer dentro da transação que
 * violou a unique: no PostgreSQL um erro de constraint ABORTA a transação, e o
 * próximo statement falha com "current transaction is aborted". Um teste com
 * banco falso não expõe isso — o fake continua respondendo normalmente — então
 * a separação em duas transações é estrutural, não estilística.
 *
 * P2002 aqui é o mecanismo FUNCIONANDO: duas rodadas concorrentes tentaram
 * criar a mesma `(subscriptionId, sequence)` e uma perdeu. A perdedora relê e
 * segue com a obrigação da vencedora, em vez de tratar concorrência normal
 * como defeito.
 */
async function reserveObligation(
  companyId: string,
  ctx: Ctx,
): Promise<ReserveResult> {
  try {
    return await reserveObligationOnce(companyId, ctx);
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;

    const winner = await ctx.prisma.billingObligation.findFirst({
      where: { subscription: { companyId }, state: { not: "VOID" } },
      orderBy: { sequence: "desc" },
      select: SNAPSHOT_SELECT,
    });
    if (winner) {
      return { kind: "reserved", obligation: winner, created: false };
    }
    // Colidiu, mas não há vencedor visível: a linha do tempo desta assinatura
    // não é o que o cálculo supôs. Não insiste nesta rodada.
    return done({
      kind: "failed",
      reason: "unexpected",
      detail: "P2002 na sequence sem vencedor visível",
      retryable: true,
    });
  }
}

async function reserveObligationOnce(
  companyId: string,
  ctx: Ctx,
): Promise<ReserveResult> {
  const { prisma, deps, now } = ctx;

  return prisma.$transaction(async (tx) => {
    // Advisory lock como PRIMEIRO statement, com a MESMA chave do checkout e da
    // conversão de trial (`advisory-lock.ts`). Chaves diferentes não protegeriam
    // nada: as duas transações passariam juntas achando que estavam serializadas.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${advisoryKeyForCompany(companyId)})`;

    const company = await tx.company.findUnique({
      where: { id: companyId },
      select: { id: true, cnpj: true },
    });
    if (!company) {
      return done({
        kind: "failed",
        reason: "company_not_found",
        detail: `empresa ${companyId} não encontrada`,
        retryable: false,
      });
    }

    // Carrega TODAS as assinaturas, sem `take`. O precedente usa `take: 2` para
    // detectar ambiguidade, mas ali o filtro de status é do próprio WHERE; aqui
    // quem filtra por status vivo é `resolveEffectiveSubscription`, então duas
    // linhas CANCELED antigas esconderiam a única viva e o motor concluiria
    // "não há assinatura" numa empresa que paga.
    const subs = await tx.subscription.findMany({
      where: { companyId },
      select: {
        id: true,
        status: true,
        billingCycle: true,
        asaasSubscriptionId: true,
        discountPercent: true,
        discountExpiresAt: true,
        planId: true,
        plan: { select: { id: true, name: true, priceMonthly: true, priceYearly: true } },
      },
    });

    const effective = resolveEffectiveSubscription(subs);
    if (effective.kind === "none") {
      return done({ kind: "skipped", reason: "no_effective_subscription" });
    }
    if (effective.kind === "ambiguous") {
      // FAIL-CLOSED. Escolher "a mais recente" cobraria a assinatura errada,
      // com plano e valor errados.
      return done({
        kind: "failed",
        reason: "ambiguous_subscription",
        detail: `assinaturas vivas: ${effective.ids.join(", ")}`,
        retryable: false,
      });
    }

    const sub = effective.subscription;

    // ⚠️ ARMADILHA HERDADA: `ensureInvoiceCharge` roda o sync nativo quando há
    // `asaasSubscriptionId` e, se o sync não produzir `paymentUrl`, cai no
    // caminho standalone e cria uma SEGUNDA cobrança
    // (`invoice-charge.service.ts:73-85`). O motor não opera nessas assinaturas.
    if (sub.asaasSubscriptionId) {
      return done({ kind: "skipped", reason: "native_asaas_subscription" });
    }

    // ── Trabalho PENDENTE vem antes de trabalho novo ────────────────────────
    //
    // 🔑 Uma obrigação ainda `PLANNED` é dívida NÃO EMITIDA: ela nasceu numa
    // rodada anterior em que a emissão estava desligada, ou em que o gateway
    // recusou, ou em que faltava documento. Ela tem que ser retomada ANTES de
    // se calcular qualquer período novo.
    //
    // Sem esta precedência o motor entra num impasse permanente: com a
    // `PLANNED` do período atual já criada, a âncora passa a ser o FIM dela, o
    // período seguinte cai fora do horizonte, e a rodada devolve
    // `outside_horizon` — todo dia, para sempre, sem nunca voltar à obrigação
    // que está ali esperando ser cobrada. A dívida ficaria eternamente
    // materializada e nunca emitida.
    //
    // Pega a MAIS ANTIGA (`sequence` ascendente): a recuperação de backlog é
    // gradual e em ordem, nunca cobrando o mês 5 antes do mês 3.
    //
    // ⚠️ CONSEQUÊNCIA ACEITA — bloqueio de cabeça de fila. Uma `PLANNED` que
    // exige intervenção humana (`needs_review`, `unmapped_invoice_overlap`,
    // `missing_document`) segura a geração dos períodos SEGUINTES desta
    // assinatura enquanto não for resolvida. É deliberado: a alternativa é
    // pular a obrigação travada e cobrar o mês 5 antes de alguém decidir o que
    // fazer com o mês 3 — cobrança fora de ordem sobre um período em disputa.
    // O impasse não é silencioso: TODA rodada devolve o `reason` e a
    // `obligation`, então o operador vê a mesma assinatura travada com o mesmo
    // motivo até agir. O custo real aparece se ninguém agir por meses: a
    // recuperação continua sendo de uma obrigação por rodada, e as cobranças
    // seguintes já nascem vencidas. A ferramenta para desatar (anular com
    // `voidReason`) é da Task 9/10.
    const pending = await tx.billingObligation.findFirst({
      where: { subscriptionId: sub.id, state: "PLANNED" },
      orderBy: { sequence: "asc" },
      select: SNAPSHOT_SELECT,
    });
    if (pending) {
      return { kind: "reserved" as const, obligation: pending, created: false };
    }

    // Duas leituras distintas de propósito (ver `resolveNextObligationPlan`):
    // a ÂNCORA de período vem da última não anulada; o NÚMERO contábil vem do
    // maior já usado, incluindo as anuladas.
    const [lastLive, highest] = await Promise.all([
      tx.billingObligation.findFirst({
        where: { subscriptionId: sub.id, state: { not: "VOID" } },
        orderBy: { sequence: "desc" },
        select: { sequence: true, periodEnd: true },
      }),
      tx.billingObligation.findFirst({
        where: { subscriptionId: sub.id },
        orderBy: { sequence: "desc" },
        select: { sequence: true },
      }),
    ]);

    const nextPlan = resolveNextObligationPlan({
      lastObligation: lastLive,
      maxSequence: highest?.sequence ?? null,
      firstPeriodStart: deps.firstPeriodStartBySubscription?.[sub.id] ?? null,
      cycle: sub.billingCycle,
      now,
      issueLeadDays: ISSUE_LEAD_DAYS,
    });

    if (nextPlan.kind === "needs_bootstrap") {
      // Estado NORMAL de toda assinatura legada antes da etapa 2 do rollout.
      // Inventar a âncora aqui cobraria de novo um período já pago.
      return done({ kind: "skipped", reason: "needs_bootstrap" });
    }
    if (nextPlan.kind === "outside_horizon") {
      return done({ kind: "skipped", reason: "outside_horizon" });
    }

    // A obrigação deste período já existe? Reencontrá-la NÃO encerra a rodada.
    //
    // ⚠️ Ignora as ANULADAS (`state: VOID`). Uma obrigação anulada é um período
    // que precisa ser REFEITO — os motivos previstos são "duplicata do
    // bootstrap", "trial estendido" e "troca de plano" (schema, `voidReason`), e
    // nos dois últimos o período volta a ser cobrável com outro plano ou outro
    // valor. Se a anulada bloqueasse o período, anular por troca de plano
    // deixaria o mês PERMANENTEMENTE sem cobrança: a rodada seguinte a
    // reencontraria, veria que não é `PLANNED` e devolveria "nada a fazer",
    // todo dia, para sempre. A substituta nasce com `sequence` NOVA (o número
    // contábil da anulada não se recicla) e o mesmo período.
    const already = await tx.billingObligation.findFirst({
      where: {
        subscriptionId: sub.id,
        periodStart: nextPlan.periodStart,
        state: { not: "VOID" },
      },
      select: SNAPSHOT_SELECT,
    });
    if (already) {
      return { kind: "reserved" as const, obligation: already, created: false };
    }

    const courtesies = await tx.subscriptionCourtesy.findMany({
      where: { subscriptionId: sub.id },
      select: { startsAt: true, endsAt: true, revokedAt: true },
    });

    // `planPriceMonthly` é SEMPRE o mensal: a pergunta que a função responde é
    // "este plano tem preço zero?" (conta interna do dono), não "quanto custa
    // este ciclo". Passar o anual num plano interno com anual mal cadastrado
    // classificaria a conta interna como cobrável.
    const disposition = resolveObligationDisposition({
      periodStart: nextPlan.periodStart,
      planPriceMonthly: sub.plan.priceMonthly,
      courtesies,
    });

    const priceCents = resolveObligationPriceCents({
      disposition,
      cycle: sub.billingCycle,
      priceMonthly: sub.plan.priceMonthly,
      priceYearly: sub.plan.priceYearly,
      discountPercent: sub.discountPercent,
      discountExpiresAt: sub.discountExpiresAt,
      now,
    });

    // 🔑 Cortesia e conta interna nascem QUITADAS (`PAID`), e sem `issuedAt`
    // nem `dueAt`.
    //
    // O acesso de quem está em cortesia é liberado pelo caminho NORMAL — "a
    // obrigação vigente está quitada, logo o cliente está em dia" (spec §4.3) —
    // e não por bypass. `PLANNED` seria a resposta errada: o gate que perguntar
    // "a obrigação vigente está quitada?" veria "não" e restringiria justamente
    // quem foi isentado.
    //
    // E como I1 exige `state = ISSUED` **com `dueAt` no passado** para
    // restringir, uma obrigação sem esses carimbos nunca pode restringir
    // ninguém — nem por engano.
    const settled = disposition === "COURTESY" || disposition === "INTERNAL";

    // ⚠️ O `create` NÃO é embrulhado em try/catch aqui de propósito. Num P2002
    // o PostgreSQL ABORTA a transação: qualquer statement seguinte na mesma
    // transação falha com "current transaction is aborted", então uma releitura
    // "para descobrir quem ganhou" feita AQUI dentro não funcionaria em
    // produção — só num banco falso. A violação sobe, encerra a transação, e a
    // releitura acontece numa transação NOVA (ver `reserveObligation` abaixo).
    const createdRow = await tx.billingObligation.create({
      data: {
        subscriptionId: sub.id,
        sequence: nextPlan.sequence,
        periodStart: nextPlan.periodStart,
        periodEnd: nextPlan.periodEnd,
        planId: sub.plan.id,
        cycle: sub.billingCycle,
        priceCents,
        disposition,
        state: settled ? "PAID" : "PLANNED",
        paidAt: settled ? now : null,
      },
      select: SNAPSHOT_SELECT,
    });
    return {
      kind: "reserved" as const,
      obligation: createdRow,
      created: true,
      subscriptionId: sub.id,
      attemptedPeriodStart: nextPlan.periodStart,
    };
  }, TX_OPTIONS);
}

// ─────────────────────────────────────────────────────────────────────────────
// Fase 2
// ─────────────────────────────────────────────────────────────────────────────

type AttemptResult =
  | { kind: "reserved"; obligation: ObligationSnapshot; invoiceId: string }
  | { kind: "done"; outcome: ObligationOutcome };

/**
 * Recalcula o preço, revalida as guardas e reserva a tentativa de cobrança.
 *
 * Transação curta e sob o MESMO advisory lock, separada da fase 1 por dois
 * motivos que não são estilo:
 *
 * 1. **Preço congelado na EMISSÃO, não na criação** (schema; spec §4.1.2). Uma
 *    obrigação materializada dias antes tem que cobrar o plano de hoje: sem
 *    isto, um upgrade ou reajuste entre a criação e a emissão cobraria o valor
 *    antigo, e a Task 9 não conseguiria consertar uma cobrança já emitida.
 *
 * 2. **A Invoice tem que nascer sob o lock.** `Invoice.billingObligationId` tem
 *    índice, não unique (`schema.prisma`). Duas rodadas que retomem a mesma
 *    `PLANNED` fora do lock veriam ambas "sem fatura", criariam duas Invoices e
 *    o Asaas receberia duas cobranças reais — chaves de idempotência diferentes
 *    (`invoice:<id>`), logo o gateway não as deduplicaria.
 */
async function reserveAttempt(
  companyId: string,
  obligation: ObligationSnapshot,
  ctx: { prisma: typeof defaultPrisma; now: Date },
): Promise<AttemptResult> {
  const { prisma, now } = ctx;

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${advisoryKeyForCompany(companyId)})`;

    const fresh = await tx.billingObligation.findUnique({
      where: { id: obligation.id },
      select: {
        ...SNAPSHOT_SELECT,
        invoiceId: true,
        // `cycle` congelado na materialização: é o que permite detectar troca de
        // ciclo depois de o período estar fechado (ver guarda abaixo).
        cycle: true,
        subscription: {
          select: {
            id: true,
            companyId: true,
            billingCycle: true,
            asaasSubscriptionId: true,
            discountPercent: true,
            discountExpiresAt: true,
            plan: { select: { id: true, priceMonthly: true, priceYearly: true, name: true } },
            company: { select: { cnpj: true } },
          },
        },
      },
    });

    if (!fresh) {
      return done({
        kind: "failed",
        reason: "unexpected",
        detail: "obrigação desapareceu entre as fases",
        retryable: false,
      });
    }

    // Relê o estado DENTRO do lock: entre as fases o webhook pode ter marcado
    // paga e o operador pode ter anulado.
    if (fresh.state !== "PLANNED") {
      return done({ kind: "skipped", reason: "already_settled", obligation: snapshot(fresh) });
    }

    // 🔑 DISPOSIÇÃO RELIDA DENTRO DO LOCK — a segunda camada de guarda contra
    // cobrar um período que o dono declarou encerrado.
    //
    // A fase 1 já barra o que não é `CHARGE` (`runObligationForCompany`), mas com
    // o dado que ela leu ANTES de commitar. A fase 2 abre transação NOVA e não
    // reaproveita aquele `disposition`: ela RECALCULA a partir de cortesias e
    // preço do plano, e `resolveObligationDisposition` só sabe devolver
    // `CHARGE`/`COURTESY`/`INTERNAL` — nunca `LEGACY_WAIVED`. Sem esta linha, uma
    // obrigação marcada `LEGACY_WAIVED` (ou `COURTESY` à mão) entre a fase 1 e a
    // fase 2 seria recalculada como `CHARGE` e COBRADA no gateway, deixando a
    // linha contraditória: `disposition = LEGACY_WAIVED` e `state = ISSUED`.
    //
    // Não é hipótese de laboratório: o bootstrap da etapa 2 e as ferramentas da
    // Task 9 escrevem `disposition` direto, e a janela entre as fases é
    // exatamente onde uma rodada do cron em andamento cruza com a mão do dono.
    // Fail-closed: divergência não cobra.
    if (fresh.disposition !== "CHARGE") {
      return done({
        kind: "failed",
        reason: "needs_review",
        detail: `disposição mudou para ${fresh.disposition} entre as fases — não cobra`,
        retryable: false,
        obligation: snapshot(fresh),
      });
    }

    const sub = fresh.subscription;

    // A obrigação continua sendo desta empresa? A fase 2 chega aqui com um
    // `companyId` vindo da fase 1; se a assinatura foi movida de empresa no
    // intervalo, o advisory lock desta execução está protegendo a empresa
    // ERRADA — e cobrar seria cobrar sem serialização nenhuma.
    if (sub.companyId !== companyId) {
      return done({
        kind: "failed",
        reason: "unexpected",
        detail: `assinatura mudou de empresa (${sub.companyId} ≠ ${companyId})`,
        retryable: false,
        obligation: snapshot(fresh),
      });
    }

    // TOCTOU da armadilha herdada: o checkout pode ter criado a assinatura
    // nativa no Asaas depois da fase 1. Revalidar aqui é o que impede a
    // assinatura de terminar com cobrança nativa E standalone.
    if (sub.asaasSubscriptionId) {
      return done({ kind: "skipped", reason: "native_asaas_subscription" });
    }

    // Ciclo trocado DEPOIS de o período ser materializado.
    //
    // 🔑 O período já está congelado em `[periodStart, periodEnd)`. Recalcular só
    // o preço com o ciclo novo cobraria um ANO pelo período de um MÊS (ou o
    // contrário): o valor viria de `priceYearly` enquanto a obrigação entrega 30
    // dias. A troca de ciclo é decisão comercial que exige ANULAR e refazer o
    // período — trabalho da Task 9 —, não um recálculo silencioso aqui.
    if (sub.billingCycle !== fresh.cycle) {
      return done({
        kind: "failed",
        reason: "needs_review",
        detail: `ciclo mudou de ${fresh.cycle} para ${sub.billingCycle} após a materialização do período — anular e refazer`,
        retryable: false,
        obligation: snapshot(fresh),
      });
    }

    // Documento é pré-requisito do gateway: sem 11/14 dígitos
    // `resolveAsaasCustomerId` lança lá dentro. Falhar aqui dá mensagem
    // acionável e não deixa Invoice órfã reservada.
    const doc = (sub.company?.cnpj ?? "").replace(/\D/g, "");
    if (doc.length !== 11 && doc.length !== 14) {
      return done({
        kind: "failed",
        reason: "missing_document",
        detail: "cadastre o CPF ou CNPJ antes de cobrar",
        retryable: false,
        obligation: snapshot(fresh),
      });
    }

    // RECALCULA a disposição e o preço com os dados de AGORA.
    const courtesies = await tx.subscriptionCourtesy.findMany({
      where: { subscriptionId: sub.id },
      select: { startsAt: true, endsAt: true, revokedAt: true },
    });
    const disposition = resolveObligationDisposition({
      periodStart: fresh.periodStart,
      planPriceMonthly: sub.plan.priceMonthly,
      courtesies,
    });

    // Cortesia concedida DEPOIS de a obrigação ser materializada: quita em vez
    // de cobrar. Sem isto, o motor cobraria quem o dono acabou de isentar.
    if (disposition !== "CHARGE") {
      const quitada = await tx.billingObligation.update({
        where: { id: fresh.id },
        data: {
          disposition,
          state: "PAID",
          paidAt: now,
          priceCents: resolveObligationPriceCents({
            disposition,
            cycle: sub.billingCycle,
            priceMonthly: sub.plan.priceMonthly,
            priceYearly: sub.plan.priceYearly,
            discountPercent: sub.discountPercent,
            discountExpiresAt: sub.discountExpiresAt,
            now,
          }),
        },
        select: SNAPSHOT_SELECT,
      });
      return done({ kind: "settled", obligation: quitada, created: false });
    }

    const priceCents = resolveObligationPriceCents({
      disposition,
      cycle: sub.billingCycle,
      priceMonthly: sub.plan.priceMonthly,
      priceYearly: sub.plan.priceYearly,
      discountPercent: sub.discountPercent,
      discountExpiresAt: sub.discountExpiresAt,
      now,
    });

    // 🔑 Vencimento = início do período: o cliente paga ANTES de o período
    // começar, nunca depois de já estar devendo (spec §4.5). Gravado
    // EXPLICITAMENTE na Invoice porque `ensureInvoiceCharge` calcula um
    // fallback ("agora + 3 dias úteis") e **não o persiste**
    // (`invoice-charge.service.ts`) — a Invoice ficaria sem `dueDate`, o dunning
    // a ignoraria, e I1 não teria como provar que venceu.
    const dueAt = fresh.periodStart;

    // ── Guarda de cobrança dupla contra o passado não mapeado ───────────────
    //
    // A cobrança de conversão de trial que já existe identifica-se por
    // `Invoice.source = "medical-trial-conversion:<subId>"` e **não** grava
    // `billingObligationId` (`trial-conversion-charge.service.ts`). O mesmo
    // vale para as 8 faturas históricas, incluindo as duplicatas
    // `INV-000003`/`INV-000004`. O motor não as reconhece por vínculo — só por
    // interseção de datas.
    //
    // A spec (§7, etapa 2) diz literalmente que sem esse mapeamento o motor
    // "emitiria uma segunda mensalidade do mesmo período". Então: qualquer
    // fatura viva, não manual, sem vínculo, cujo período cruze o desta
    // obrigação, PARA a emissão e chama o operador. Fail-closed — o custo de
    // um falso positivo é um alerta; o de um falso negativo é cobrar duas vezes
    // no gateway sem sandbox.
    //
    // 🔑 O escopo da busca é a EMPRESA, não a assinatura. `Subscription` não tem
    // unique em `companyId`: uma assinatura antiga CANCELADA da mesma empresa
    // pode ter fatura viva cobrindo o mês que a assinatura nova vai cobrar
    // (é o padrão "cancela e recontrata"). Filtrar por `subscriptionId`
    // deixaria essa passar e a EMPRESA pagaria duas vezes o mesmo mês, mesmo
    // com cada assinatura tendo uma cobrança só.
    const unmapped = await tx.invoice.findMany({
      where: {
        subscription: { companyId },
        billingObligationId: null,
        isManual: false,
        status: { in: ["PENDING", "OVERDUE", "PAID"] },
      },
      select: { id: true, number: true, periodStart: true, periodEnd: true },
    });
    const colliding = unmapped.find((inv) =>
      periodsOverlap(
        { periodStart: fresh.periodStart, periodEnd: fresh.periodEnd },
        { periodStart: inv.periodStart, periodEnd: inv.periodEnd },
      ),
    );
    if (colliding) {
      return done({
        kind: "failed",
        reason: "unmapped_invoice_overlap",
        detail: `fatura ${colliding.number} cobre o mesmo período sem vínculo com a obrigação`,
        retryable: false,
        obligation: snapshot(fresh),
      });
    }

    // Tentativa já reservada por uma rodada anterior?
    const existingAttempt = fresh.invoiceId
      ? await tx.invoice.findUnique({
          where: { id: fresh.invoiceId },
          select: {
            id: true,
            status: true,
            total: true,
            subscriptionId: true,
            billingObligationId: true,
            asaasPaymentId: true,
            // Necessário para manter `obligation.dueAt` e `invoice.dueDate` no
            // MESMO instante na retomada — ver a nota do `dueDate` abaixo.
            dueDate: true,
          },
        })
      : null;

    if (existingAttempt) {
      // O ponteiro aponta para a fatura CERTA? `BillingObligation.invoiceId` é
      // `String?` sem FK, e `Invoice.billingObligationId` é o ponteiro inverso —
      // nada no schema mantém os dois em sincronia. Um ponteiro torto faria o
      // motor mandar ao gateway (e por e-mail ao cliente) a fatura de OUTRA
      // assinatura. Fail-closed: divergência é revisão humana, não palpite.
      if (
        existingAttempt.subscriptionId !== sub.id ||
        (existingAttempt.billingObligationId !== null &&
          existingAttempt.billingObligationId !== fresh.id)
      ) {
        return done({
          kind: "failed",
          reason: "needs_review",
          detail: `fatura ${existingAttempt.id} não pertence a esta obrigação`,
          retryable: false,
          obligation: snapshot(fresh),
        });
      }

      const decision = decideOnExistingCharge(existingAttempt.status);
      if (decision.action === "already_paid") {
        const paga = await tx.billingObligation.update({
          where: { id: fresh.id },
          data: { state: "PAID", paidAt: now },
          select: SNAPSHOT_SELECT,
        });
        return done({ kind: "settled", obligation: paga, created: false });
      }
      if (decision.action === "needs_review") {
        // `CANCELED`/`REFUNDED`: houve intervenção humana. O motor NÃO reemite
        // sozinho por cima de um estorno ou de um cancelamento deliberado
        // (spec §4.2) — sinaliza e o operador decide.
        return done({
          kind: "failed",
          reason: "needs_review",
          detail: decision.reason,
          retryable: false,
          obligation: snapshot(fresh),
        });
      }
      // `PENDING`/`OVERDUE`: reusa a mesma tentativa. O retry no Asaas é
      // idempotente pela chave `invoice:<id>`.
      //
      // 🔑 O PREÇO TEM QUE BATER NOS DOIS LADOS. Atualizar só
      // `obligation.priceCents` deixaria a obrigação dizendo R$ 299,90 enquanto
      // `ensureInvoiceCharge` cobra `invoice.total`, ou seja R$ 189,90 — o
      // registro contábil afirmando um valor e o gateway cobrando outro.
      //
      // Se a tentativa JÁ foi ao gateway (`asaasPaymentId` presente), o valor
      // está fixado lá e mudar a Invoice local não muda a cobrança do cliente:
      // aí o preço é imutável por definição e uma mudança de plano exige anular
      // e refazer (Task 9), não reescrever por baixo de uma cobrança que o
      // cliente já recebeu.
      if (existingAttempt.total !== priceCents) {
        if (existingAttempt.asaasPaymentId) {
          return done({
            kind: "failed",
            reason: "needs_review",
            detail: `preço mudou de ${existingAttempt.total} para ${priceCents} depois de a cobrança ir ao gateway — anular e refazer`,
            retryable: false,
            obligation: snapshot(fresh),
          });
        }
        await tx.invoice.update({
          where: { id: existingAttempt.id },
          data: { subtotal: priceCents, total: priceCents },
        });
      }

      // 🔑 `dueDate` FORA do `if` do preço. Antes ele só era corrigido quando o
      // valor mudava — e a linha logo abaixo grava `dueAt` na obrigação SEMPRE.
      // Com o preço igual e a fatura carregando um `dueDate` errado (fallback de
      // "agora + 3 dias úteis" de uma reserva antiga, ou fatura importada), os
      // dois lados divergiam em silêncio: a obrigação afirmando um vencimento e o
      // gateway cobrando outro. Isso quebra dos dois lados — I1 restringe pelo
      // `dueAt` da obrigação, e o dunning/Asaas usa o `dueDate` da fatura
      // (`ensureInvoiceCharge` manda esse campo para o Asaas). Um cliente podia
      // ser restringido numa data que a cobrança dele nunca teve.
      //
      // Só reescreve `dueDate` enquanto a tentativa NÃO foi ao gateway: depois de
      // `asaasPaymentId` o vencimento está fixado lá e mudar o local só criaria a
      // divergência oposta. Nesse caso a obrigação segue o que a FATURA diz.
      const naoFoiAoGateway = existingAttempt.asaasPaymentId === null;
      if (naoFoiAoGateway && existingAttempt.dueDate?.getTime() !== dueAt.getTime()) {
        await tx.invoice.update({
          where: { id: existingAttempt.id },
          data: { dueDate: dueAt },
        });
      }

      const refreshed = await tx.billingObligation.update({
        where: { id: fresh.id },
        data: {
          priceCents,
          planId: sub.plan.id,
          dueAt: naoFoiAoGateway ? dueAt : (existingAttempt.dueDate ?? dueAt),
        },
        select: SNAPSHOT_SELECT,
      });
      return {
        kind: "reserved" as const,
        obligation: refreshed,
        invoiceId: existingAttempt.id,
      };
    }

    // 🔑 PONTEIRO PENDURADO — barra ANTES de gastar número de fatura.
    //
    // Se `invoiceId` está ocupado mas a fatura não existe mais (apagada à mão,
    // restore parcial, migração), `existingAttempt` é `null` e o fluxo cairia no
    // `create` abaixo. O CAS seguinte exige `invoiceId: null`, então ele NUNCA
    // casa: a rodada devolve `attempt_race` e a fatura recém-criada fica órfã e
    // `PENDING`, para sempre. E como o cron repete todo dia, cada rodada queima
    // um número de `INV-` do contador GLOBAL e deixa mais uma órfã — provado por
    // teste: quatro rodadas, quatro faturas.
    //
    // `attempt_race` também mentiria: ele diz `retryable: true` ("é fila"), e o
    // operador esperaria a contenção passar sozinha em vez de consertar o
    // ponteiro. Isto é revisão humana, e nunca é corrida.
    if (fresh.invoiceId) {
      return done({
        kind: "failed",
        reason: "needs_review",
        detail: `obrigação aponta para a fatura ${fresh.invoiceId}, que não existe`,
        retryable: false,
        obligation: snapshot(fresh),
      });
    }

    const invoice = await tx.invoice.create({
      data: {
        subscriptionId: sub.id,
        billingObligationId: fresh.id,
        number: await nextSaasInvoiceNumber(tx),
        subtotal: priceCents,
        total: priceCents,
        discount: 0,
        status: "PENDING",
        // UNDEFINED = o cliente escolhe; o Asaas gera PIX **e** boleto na mesma
        // cobrança. Fixar "PIX" deixaria quem paga por boleto sem opção.
        billingType: "UNDEFINED",
        periodStart: fresh.periodStart,
        periodEnd: fresh.periodEnd,
        dueDate: dueAt,
        description: `Assinatura ${sub.plan.name}`,
        // isManual FALSE: esta é a mensalidade. É o que autoriza o webhook a
        // ativar a assinatura quando ela for paga.
        isManual: false,
        source: obligationInvoiceSource(fresh.id),
      },
      select: { id: true },
    });

    // CAS na reserva: só ocupa `invoiceId` se ainda estiver livre. Se outra
    // rodada ganhou a corrida (mesmo sob o lock — o lock protege este processo,
    // não um deploy antigo sem ele), a Invoice recém-criada fica órfã e
    // `PENDING`, sem nunca ir ao gateway; melhor uma fatura local sem cobrança
    // do que duas cobranças reais.
    const claimed = await tx.billingObligation.updateMany({
      where: { id: fresh.id, invoiceId: null, state: "PLANNED" },
      data: {
        invoiceId: invoice.id,
        priceCents,
        planId: sub.plan.id,
        cycle: sub.billingCycle,
        dueAt,
      },
    });
    if (claimed.count === 0) {
      return done({
        kind: "failed",
        reason: "attempt_race",
        detail: "outra execução reservou a tentativa desta obrigação",
        retryable: true,
        obligation: snapshot(fresh),
      });
    }

    const updated = await tx.billingObligation.findUniqueOrThrow({
      where: { id: fresh.id },
      select: SNAPSHOT_SELECT,
    });
    return { kind: "reserved" as const, obligation: updated, invoiceId: invoice.id };
  }, TX_OPTIONS);
}

// ─────────────────────────────────────────────────────────────────────────────
// Fase 3
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fala com o gateway e só então promove a obrigação a `ISSUED`.
 *
 * 🔑 A ORDEM É A GARANTIA. `ISSUED` é escrito **depois** de o Asaas responder,
 * nunca antes: I1 diz que o gatilho de restrição é obrigação *emitida e
 * vencida*, então marcar `ISSUED` antes do gateway criaria uma dívida que
 * ninguém foi cobrado por — e no vencimento o cliente seria restringido por uma
 * cobrança que nunca existiu. Se o gateway falhar, a obrigação permanece
 * `PLANNED`: a próxima rodada retoma a MESMA obrigação e a MESMA Invoice.
 */
async function issueAttempt(
  companyId: string,
  obligation: ObligationSnapshot,
  invoiceId: string,
  ctx: Ctx,
): Promise<ObligationOutcome> {
  const { prisma, deps, now } = ctx;
  const ensureCustomerFn = deps.ensureCustomerFn ?? ensureAsaasCustomer;
  const ensureChargeFn = deps.ensureChargeFn ?? ensureInvoiceCharge;
  const sendChargeEmailFn = deps.sendChargeEmailFn ?? sendInvoiceCharge;

  // ── Última verificação antes de gastar dinheiro do cliente ─────────────────
  //
  // 🔑 A fase 2 solta o advisory lock ao commitar, e o gateway é chamado aqui,
  // DEPOIS. Nessa janela o checkout pode criar a assinatura nativa no Asaas (e
  // então `ensureInvoiceCharge` cairia no sync nativo e possivelmente no
  // standalone, gerando DUAS cobranças) ou o dono pode conceder uma cortesia (e
  // o cliente seria cobrado mesmo isento).
  //
  // Não há como fechar a janela por completo sem segurar o lock durante a
  // chamada de rede — o que prenderia conexão pinada no pooler, exatamente o
  // que o padrão de duas fases existe para evitar. Então: relê no último
  // instante possível e recusa. A janela residual cai de "toda a fase 2" para
  // "o intervalo entre esta leitura e a chamada", e o modo de falha é não
  // cobrar, nunca cobrar duas vezes.
  const guard = await prisma.billingObligation.findUnique({
    where: { id: obligation.id },
    select: {
      state: true,
      periodStart: true,
      subscription: {
        select: {
          id: true,
          asaasSubscriptionId: true,
          courtesies: { select: { startsAt: true, endsAt: true, revokedAt: true } },
        },
      },
    },
  });

  if (!guard || guard.state !== "PLANNED") {
    return { kind: "skipped", reason: "already_settled", obligation };
  }
  if (guard.subscription.asaasSubscriptionId) {
    log.warn("Assinatura nativa apareceu antes do gateway — emissão abortada", {
      companyId,
      obligationId: obligation.id,
    });
    return { kind: "skipped", reason: "native_asaas_subscription", obligation };
  }
  if (
    resolveObligationDisposition({
      periodStart: guard.periodStart,
      // Só a cortesia interessa nesta releitura: preço zero (INTERNAL) não muda
      // sem troca de plano, que já é barrada pela guarda de ciclo/preço da
      // fase 2. Passar 1 aqui força a função a decidir apenas por cortesia.
      planPriceMonthly: 1,
      courtesies: guard.subscription.courtesies,
    }) !== "CHARGE"
  ) {
    log.warn("Cortesia concedida antes do gateway — emissão abortada", {
      companyId,
      obligationId: obligation.id,
    });
    return { kind: "skipped", reason: "courtesy", obligation };
  }

  try {
    await ensureCustomerFn(companyId);
    await ensureChargeFn(invoiceId);
  } catch (error) {
    log.error("Gateway recusou a cobrança — obrigação permanece PLANNED", {
      companyId,
      obligationId: obligation.id,
      invoiceId,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      kind: "failed",
      reason: "gateway_error",
      detail: error instanceof Error ? error.message : String(error),
      // Retomável: a próxima rodada reusa esta obrigação e esta Invoice, e o
      // Asaas deduplica pela chave `invoice:<id>`.
      retryable: true,
      obligation,
    };
  }

  // Promoção por CAS: `PLANNED → ISSUED` **só se ainda estiver PLANNED**.
  //
  // 🔑 O webhook do Asaas pode confirmar o pagamento antes desta linha rodar —
  // a corrida está documentada em `webhooks/asaas/route.ts` (o
  // `externalReference: invoice:<id>` resolve a fatura mesmo antes de
  // `asaasPaymentId` ser persistido). Um `update` cego regrediria `PAID` para
  // `ISSUED`, e no vencimento quem PAGOU apareceria inadimplente.
  const promoted = await prisma.billingObligation.updateMany({
    where: { id: obligation.id, state: "PLANNED" },
    data: { state: "ISSUED", issuedAt: now, invoiceId },
  });

  const current = await prisma.billingObligation.findUniqueOrThrow({
    where: { id: obligation.id },
    select: SNAPSHOT_SELECT,
  });

  if (promoted.count === 0) {
    // Já saiu de `PLANNED` durante a chamada ao gateway. A cobrança existe e é
    // válida; o estado atual (provavelmente `PAID`) é mais recente que o nosso.
    log.info("Obrigação mudou de estado durante a emissão — não regride", {
      obligationId: obligation.id,
      state: current.state,
    });
    return { kind: "skipped", reason: "already_settled", obligation: current };
  }

  // O CAS ganhou, mas a leitura seguinte não é atômica com ele: o webhook pode
  // ter confirmado o pagamento no intervalo. Mandar "nova cobrança" a quem
  // acabou de pagar é contraditório para o cliente e faria o outcome afirmar
  // `issued` sobre uma linha `PAID`. Nesse caso a cobrança está criada e paga —
  // não há nada a avisar.
  if (current.state !== "ISSUED") {
    log.info("Pagamento confirmado entre o CAS e a leitura — não avisa", {
      obligationId: obligation.id,
      state: current.state,
    });
    return { kind: "skipped", reason: "already_settled", obligation: current };
  }

  // AVISA O CLIENTE. Best-effort DE PROPÓSITO: a cobrança já existe e é válida;
  // falhar o envio não pode desfazê-la. `sendInvoiceCharge` é idempotente por
  // dia, então reenviar não duplica e-mail.
  //
  // ⚠️ Isto NÃO é a trilha de I3: o gate de restrição exige `DunningEvent`
  // despachado (`hasDispatchedNotice`), e o resultado do e-mail vai no outcome
  // justamente para que "emitido" não esconda "ninguém recebeu".
  let emailStatus = "NOT_SENT";
  try {
    const sent = await sendChargeEmailFn(invoiceId, "system");
    emailStatus = sent.status;
  } catch (error) {
    log.warn("cobrança emitida mas e-mail falhou (cliente vê pela tela)", {
      companyId,
      invoiceId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return {
    kind: "issued",
    obligation: current,
    invoiceId,
    dueAt: current.periodStart,
    emailStatus,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Auxiliares
// ─────────────────────────────────────────────────────────────────────────────

const SNAPSHOT_SELECT = {
  id: true,
  sequence: true,
  state: true,
  disposition: true,
  periodStart: true,
  periodEnd: true,
  priceCents: true,
} as const;

/** Identidade da fatura de uma obrigação, no mesmo estilo de `Invoice.source`. */
export function obligationInvoiceSource(obligationId: string): string {
  return `billing-obligation:${obligationId}`;
}

function snapshot(row: ObligationSnapshot): ObligationSnapshot {
  return {
    id: row.id,
    sequence: row.sequence,
    state: row.state,
    disposition: row.disposition,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    priceCents: row.priceCents,
  };
}

function done(outcome: ObligationOutcome): { kind: "done"; outcome: ObligationOutcome } {
  return { kind: "done", outcome };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
  );
}

/**
 * Traduz a exceção num outcome — o coração do isolamento por empresa.
 *
 * Os módulos puros lançam `Error` com mensagem prefixada (`billing-clock:`,
 * `billing-courtesy:`, `billing-obligation:`) diante de data inválida ou ciclo
 * desconhecido. Isso é dado corrompido de UMA empresa, e virar
 * `invalid_calendar` mantém o lote andando com o defeito visível e atribuído.
 *
 * O preço inválido tem motivo próprio porque a ação do operador é diferente:
 * `invalid_calendar` é dado corrompido; `invalid_price` é plano mal cadastrado.
 */
function classifyError(error: unknown, companyId: string): ObligationOutcome {
  const detail = error instanceof Error ? error.message : String(error);

  if (/Preço do plano inválido|zeraria a cobrança|preço cheio inválido/.test(detail)) {
    log.warn("Preço inválido — assinatura isolada, lote segue", { companyId, detail });
    return { kind: "failed", reason: "invalid_price", detail, retryable: false };
  }

  if (/^billing-(clock|courtesy|obligation):/.test(detail)) {
    log.warn("Dado de calendário inválido — assinatura isolada, lote segue", {
      companyId,
      detail,
    });
    return { kind: "failed", reason: "invalid_calendar", detail, retryable: false };
  }

  // Contenção de lock: o checkout segura a mesma chave durante uma chamada real
  // ao Asaas. Retomável — não é defeito, é fila.
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2028" || error.code === "P2024")
  ) {
    log.warn("Transação/lock estourou o tempo — retomável", { companyId, detail });
    return { kind: "failed", reason: "lock_timeout", detail, retryable: true };
  }

  log.error("Falha inesperada no motor de obrigação", { companyId, detail });
  return { kind: "failed", reason: "unexpected", detail, retryable: false };
}

export type { BillingCycle };
