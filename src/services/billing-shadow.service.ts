import type { ObligationDisposition as PrismaObligationDisposition } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { resolveEffectiveSubscription } from "@/lib/effective-subscription";
import { resolveObligationDisposition } from "@/lib/billing-courtesy";
import {
  ISSUE_LEAD_DAYS,
  periodsOverlap,
  resolveNextObligationPlan,
  resolveObligationPriceCents,
} from "@/lib/billing-obligation";
import { isShadowModeEnabled } from "@/lib/billing-engine-flags";
import { hasDispatchedNotice } from "@/services/dunning-event.service";
import { WRITE_RESTRICTION_DAY } from "@/lib/subscription-grace";
import { formatInTimeZone } from "date-fns-tz";
import { TIMEZONE } from "@/lib/date-utils";

const log = logger.child({ service: "billing-shadow" });

/**
 * Modo sombra do motor de recorrência (rollout etapa 3, spec §7).
 *
 * Roda a MESMA decisão do motor sem emitir e sem bloquear, e grava o que TERIA
 * feito em `BillingShadowDecision` — artefato descartável, NUNCA
 * `BillingObligation`. Escrever na tabela real congelaria preço, plano e
 * sequência dias antes da emissão, e ao ligar a etapa 4 o sistema cobraria
 * decisões tomadas num outro dia, com outro plano.
 *
 * ## 🚨 A garantia de que isto NUNCA cobra ninguém é ESTRUTURAL
 *
 * Este módulo **não importa o cliente do Asaas, nem `ensureInvoiceCharge`, nem
 * `sendInvoiceCharge`, nem `ensureAsaasCustomer`** — direta ou indiretamente.
 * Não há função no grafo de importação daqui que saiba falar com o gateway. Não
 * é uma flag que alguém possa inverter nem um `if` que uma refatoração possa
 * pular: o código de cobrar dinheiro simplesmente não está acessível a partir
 * deste arquivo. Um teste guarda essa fronteira lendo o grafo de imports.
 *
 * Pelo mesmo motivo este serviço **não chama `runObligationForCompany`**. Um
 * "modo dry-run" dentro do motor deixaria o caminho do gateway a um booleano de
 * distância, e cada escrita nova acrescentada ao motor teria de lembrar de
 * respeitar a flag. Aqui a separação é física.
 *
 * ## Por que reimplementa a leitura em vez de reusar o motor
 *
 * A alternativa avaliada (e recusada) era chamar `runObligationForCompany` com
 * um Prisma somente-leitura e a emissão desligada. Ela mente por omissão:
 *
 * 1. Com `isIssuanceEnabledFor` falsa, o motor devolve `issuance_not_enabled`
 *    ANTES da fase 2 (`billing-obligation.service.ts`), e é a fase 2 que aplica
 *    as guardas que decidem se a cobrança realmente sairia — documento ausente,
 *    fatura histórica sobreposta, fatura cancelada/estornada, cortesia
 *    concedida depois. O relatório diria "cobraria" para quem o motor real
 *    recusaria.
 * 2. Um proxy que lança na escrita interromperia a fase 1 exatamente no
 *    `create`, e o motor engoliria a exceção como `failed/unexpected`
 *    (`classifyError`). Toda empresa com período novo apareceria como FALHA, e
 *    a decisão (período, preço, disposição) morreria numa variável local sem
 *    nunca chegar ao relatório.
 *
 * Então o custo aceito é o oposto: este módulo é uma SEGUNDA implementação da
 * leitura, e PODE DIVERGIR DO MOTOR.
 *
 * ⚠️ Não subestime esse custo — ele já se materializou três vezes nesta task:
 * `DRAFT` tratada como cobrável, a disposição GRAVADA ignorada, e a obrigação
 * pendente lida sem recálculo. Nenhuma das três foi diferença de "ordem" ou de
 * "aritmética": foram GUARDAS INTEIRAS que existiam só no motor. E como o motor
 * vai continuar ganhando guardas, haverá uma quarta.
 *
 * A defesa é em três camadas, e nenhuma delas sozinha basta:
 *
 * 1. A REGRA vive nos módulos puros compartilhados
 *    (`resolveEffectiveSubscription`, `resolveNextObligationPlan`,
 *    `resolveObligationDisposition`, `resolveObligationPriceCents`,
 *    `periodsOverlap`) — a aritmética do dinheiro é a MESMA função, não uma cópia.
 * 2. Um teste de PARIDADE extrai os `reason:` do motor e falha quando aparece um
 *    que este módulo não reproduz nem justificou como inaplicável. Ele pega
 *    guarda NOVA; não pega mudança de semântica numa guarda existente.
 * 3. Testes por caso para cada guarda reproduzida — é o que pega semântica.
 *
 * O teste de paridade explica no próprio corpo por que não se comparou motor e
 * sombra lado a lado sobre o mesmo estado (exigiria deixar o motor alcançar a
 * fase 3 dentro da suíte do sombra, ou seja, o gateway).
 *
 * ## O que este modo NÃO prova (spec §7, etapa 3)
 *
 * Gateway, e-mail, webhook e concorrência só são exercitados na emissão real
 * (etapa 4). Este modo responde a quem, quanto, quando e quem seria restrito —
 * e nada além disso. Ver `SHADOW_NAO_PROVA`.
 */

/** O que o modo sombra declaradamente NÃO valida — vai no relatório. */
export const SHADOW_NAO_PROVA = [
  "gateway (Asaas): nenhuma chamada é feita; recusa, timeout e duplicidade no lado do Asaas continuam desconhecidos",
  "e-mail de cobrança: nada é enviado; entrega e caixa de spam continuam desconhecidas",
  "webhook de pagamento: nenhuma confirmação é exercitada",
  "concorrência: sem advisory lock e sem transação — corridas entre cron e checkout não são simuladas",
] as const;

/**
 * Por que a cobrança NÃO sairia. Espelha os motivos do motor, e acrescenta os
 * que só o modo sombra enxerga.
 */
export type ShadowReason =
  /** Etapa 3 do rollout desligada. */
  | "shadow_disabled"
  | "no_effective_subscription"
  | "ambiguous_subscription"
  | "company_not_found"
  | "native_asaas_subscription"
  /** 🔑 O estado de HOJE, pré-bootstrap: a linha do tempo não tem âncora. */
  | "needs_bootstrap"
  | "outside_horizon"
  | "courtesy"
  | "internal"
  | "legacy_waived"
  /** Obrigação já emitida/paga/anulada — nada a cobrar nesta rodada. */
  | "already_settled"
  | "missing_document"
  | "unmapped_invoice_overlap"
  | "needs_review"
  | "invalid_data";

export interface ShadowDecision {
  companyId: string;
  subscriptionId: string | null;
  /** Cobraria de verdade se a etapa 4 estivesse ligada para esta empresa? */
  wouldCharge: boolean;
  /** Restringiria a escrita AGORA, por I1 + I3? Ver `resolveWouldRestrict`. */
  wouldRestrict: boolean;
  periodStart: Date | null;
  periodEnd: Date | null;
  priceCents: number;
  disposition: PrismaObligationDisposition | null;
  /** `null` quando cobraria; o motivo do não, caso contrário. */
  reason: ShadowReason | null;
  /** Frase legível para o dono — é isto que vai para a coluna `note`. */
  note: string;
}

export interface ShadowDeps {
  prismaClient?: typeof defaultPrisma;
  isShadowEnabledFn?: typeof isShadowModeEnabled;
  hasDispatchedNoticeFn?: typeof hasDispatchedNotice;
  /** Mesma âncora do motor: vem do bootstrap, nunca de `currentPeriodEnd`. */
  firstPeriodStartBySubscription?: Record<string, Date>;
  now?: Date;
  /**
   * Grava as linhas em `BillingShadowDecision`. `false` = só calcula e devolve.
   * Default `true` — o artefato é o produto desta etapa.
   */
  persist?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Lote e relatório
// ─────────────────────────────────────────────────────────────────────────────

export interface ShadowReport {
  runAt: Date;
  /** Quantas empresas foram avaliadas nesta rodada. */
  avaliadas: number;
  /** As que seriam cobradas de verdade, com o total em centavos. */
  cobraria: { empresas: number; totalCents: number };
  /** As que seriam restringidas AGORA (I1 + I3). */
  restringiria: number;
  /** Contagem por motivo do não — a linha que impede a leitura otimista. */
  porMotivo: Record<string, number>;
  /**
   * Quantas decisões couberam em `BillingShadowDecision`. Menor que `avaliadas`
   * sempre que houver decisão sem período (ver `persistDecisions`): a tabela é
   * uma AMOSTRA, o relatório é o censo.
   */
  persistidas: number;
  decisions: ShadowDecision[];
  /** Texto pronto para o dono ler e decidir. */
  resumo: string;
}

/**
 * Roda o modo sombra para uma lista de empresas e devolve o relatório.
 *
 * Sequencial e sem transação de propósito: são leituras, e o modo sombra não
 * pode competir pelo advisory lock com o checkout real de um cliente pagando.
 *
 * 🔑 NUNCA LANÇA por causa de uma empresa. Mesmo contrato do motor: uma linha
 * com data corrompida vira `invalid_data` daquela empresa, não o fim da rodada.
 */
export async function runShadowForCompanies(
  companyIds: string[],
  deps: ShadowDeps = {},
): Promise<ShadowReport> {
  const now = deps.now ?? new Date();
  const isEnabled = deps.isShadowEnabledFn ?? isShadowModeEnabled;

  // Flag antes de qualquer I/O — nasce desligada, como as outras três.
  if (!isEnabled()) {
    return emptyReport(now, "Modo sombra DESLIGADO (BILLING_SHADOW_ENABLED != \"true\"). Nada foi avaliado.");
  }

  const decisions: ShadowDecision[] = [];
  for (const companyId of companyIds) {
    decisions.push(await shadowDecisionForCompany(companyId, { ...deps, now }));
  }

  const persistidas =
    deps.persist === false
      ? 0
      : await persistDecisions(decisions, {
          prisma: deps.prismaClient ?? defaultPrisma,
          now,
        });

  return buildReport(decisions, now, persistidas);
}

/**
 * Decide (sem escrever, sem cobrar) o que aconteceria com UMA empresa.
 *
 * 🔑 NUNCA LANÇA — toda falha vira uma decisão com `reason: "invalid_data"`.
 */
export async function shadowDecisionForCompany(
  companyId: string,
  deps: ShadowDeps = {},
): Promise<ShadowDecision> {
  const prisma = deps.prismaClient ?? defaultPrisma;
  const now = deps.now ?? new Date();

  try {
    return await decide(companyId, prisma, deps, now);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    log.warn("Modo sombra isolou uma empresa com dado inválido", { companyId, detail });
    return {
      companyId,
      subscriptionId: null,
      wouldCharge: false,
      wouldRestrict: false,
      periodStart: null,
      periodEnd: null,
      priceCents: 0,
      disposition: null,
      reason: "invalid_data",
      note: `Dado inválido impede decidir: ${detail}`,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// A decisão
// ─────────────────────────────────────────────────────────────────────────────

async function decide(
  companyId: string,
  prisma: typeof defaultPrisma,
  deps: ShadowDeps,
  now: Date,
): Promise<ShadowDecision> {
  const base = {
    companyId,
    subscriptionId: null,
    wouldCharge: false,
    periodStart: null,
    periodEnd: null,
    priceCents: 0,
    disposition: null,
  } as const;

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true, cnpj: true },
  });
  if (!company) {
    return {
      ...base,
      wouldRestrict: false,
      reason: "company_not_found",
      note: `Empresa ${companyId} não existe.`,
    };
  }

  const subs = await prisma.subscription.findMany({
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
    return {
      ...base,
      wouldRestrict: false,
      reason: "no_effective_subscription",
      note: `${company.name}: nenhuma assinatura viva — não seria cobrada.`,
    };
  }
  if (effective.kind === "ambiguous") {
    // Mesmo fail-closed do motor: com duas assinaturas vivas ele NÃO escolhe.
    return {
      ...base,
      wouldRestrict: false,
      reason: "ambiguous_subscription",
      note: `${company.name}: ${effective.ids.length} assinaturas vivas (${effective.ids.join(", ")}) — o motor recusa escolher e NÃO cobraria.`,
    };
  }

  const sub = effective.subscription;
  const comSub = { ...base, subscriptionId: sub.id };

  // A restrição é da EMPRESA e independe do período novo — resolve sempre.
  const wouldRestrict = await resolveWouldRestrict(companyId, prisma, deps, now);

  if (sub.asaasSubscriptionId) {
    return {
      ...comSub,
      wouldRestrict,
      reason: "native_asaas_subscription",
      note: `${company.name}: o Asaas gerencia o ciclo desta assinatura — o motor não opera nela.`,
    };
  }

  // ── Trabalho PENDENTE antes de trabalho novo (mesma precedência do motor) ──
  const pending = await prisma.billingObligation.findFirst({
    where: { subscriptionId: sub.id, state: "PLANNED" },
    orderBy: { sequence: "asc" },
    select: OBLIGATION_SELECT,
  });

  const alvo = pending
    ? await reavaliarPendente(pending, sub, prisma, now)
    : await planejarPeriodoNovo(sub, prisma, deps, now);

  if ("reason" in alvo) {
    return {
      ...comSub,
      wouldRestrict,
      reason: alvo.reason,
      note: `${company.name}: ${alvo.note}`,
    };
  }

  const { periodStart, periodEnd, disposition, priceCents } = alvo;
  const comPeriodo = {
    ...comSub,
    wouldRestrict,
    periodStart,
    periodEnd,
    disposition,
    priceCents,
  };

  // Isenta é isenta: nenhuma fatura, nenhum e-mail, nenhum PIX.
  if (disposition !== "CHARGE") {
    const rotulo =
      disposition === "COURTESY"
        ? "cortesia"
        : disposition === "INTERNAL"
          ? "conta interna (plano de preço zero)"
          : "passado regularizado (LEGACY_WAIVED)";
    return {
      ...comPeriodo,
      wouldCharge: false,
      reason:
        disposition === "COURTESY"
          ? "courtesy"
          : disposition === "INTERNAL"
            ? "internal"
            : "legacy_waived",
      note: `${company.name}: ${rotulo} — não seria cobrada. Receita não faturada: ${reais(priceCents)}.`,
    };
  }

  // ── As guardas da FASE 2 do motor, reproduzidas como LEITURA ───────────────
  //
  // 🔑 É isto que separa "a disposição é CHARGE" de "a cobrança sairia". Sem
  // reproduzi-las aqui, o relatório prometeria dinheiro que o motor real
  // recusaria emitir — e o dono ligaria a etapa 4 esperando N cobranças e
  // receberia bem menos, sem saber por quê.

  const doc = (company.cnpj ?? "").replace(/\D/g, "");
  if (doc.length !== 11 && doc.length !== 14) {
    return {
      ...comPeriodo,
      wouldCharge: false,
      reason: "missing_document",
      note: `${company.name}: CPF/CNPJ ausente ou inválido — o motor recusaria antes do gateway. Cadastre o documento.`,
    };
  }

  // Fatura viva SEM vínculo cobrindo o mesmo período = risco de cobrar duas
  // vezes o mesmo mês. Escopo por EMPRESA, não por assinatura — igual ao motor.
  const semVinculo = await prisma.invoice.findMany({
    where: {
      subscription: { companyId },
      billingObligationId: null,
      isManual: false,
      status: { in: ["PENDING", "OVERDUE", "PAID"] },
    },
    select: { id: true, number: true, periodStart: true, periodEnd: true },
  });
  const colidindo = semVinculo.find((inv) =>
    periodsOverlap({ periodStart, periodEnd }, {
      periodStart: inv.periodStart,
      periodEnd: inv.periodEnd,
    }),
  );
  if (colidindo) {
    return {
      ...comPeriodo,
      wouldCharge: false,
      reason: "unmapped_invoice_overlap",
      note: `${company.name}: a fatura ${colidindo.number} já cobre este período sem vínculo com a obrigação — o motor PARARIA para não cobrar duas vezes.`,
    };
  }

  // ── Tentativa já reservada por uma rodada anterior ─────────────────────────
  //
  // Reproduz `decideOnExistingCharge` + as guardas de ponteiro da fase 2. Só
  // `PENDING`/`OVERDUE` são reaproveitáveis; todo o resto para.
  if (pending?.invoiceId) {
    const tentativa = await prisma.invoice.findUnique({
      where: { id: pending.invoiceId },
      select: {
        id: true,
        number: true,
        status: true,
        subscriptionId: true,
        billingObligationId: true,
        total: true,
        asaasPaymentId: true,
      },
    });
    if (!tentativa) {
      return {
        ...comPeriodo,
        wouldCharge: false,
        reason: "needs_review",
        note: `${company.name}: a obrigação aponta para a fatura ${pending.invoiceId}, que não existe — o motor pararia para revisão humana.`,
      };
    }
    // Ponteiro torto: `Invoice.billingObligationId` e `BillingObligation.invoiceId`
    // são dois ponteiros sem nada no schema que os mantenha em sincronia. Um
    // ponteiro errado mandaria ao gateway a fatura de OUTRA assinatura.
    if (
      tentativa.subscriptionId !== sub.id ||
      (tentativa.billingObligationId !== null &&
        tentativa.billingObligationId !== pending.id)
    ) {
      return {
        ...comPeriodo,
        wouldCharge: false,
        reason: "needs_review",
        note: `${company.name}: a fatura ${tentativa.number} não pertence a esta obrigação — o motor pararia para revisão humana.`,
      };
    }
    if (tentativa.status === "PAID") {
      return {
        ...comPeriodo,
        wouldCharge: false,
        reason: "already_settled",
        note: `${company.name}: a fatura ${tentativa.number} deste período já está paga.`,
      };
    }
    // 🔑 Tudo que não é PENDING/OVERDUE para — inclusive `DRAFT`, que
    // `decideOnExistingCharge` classifica como revisão humana. Listar só
    // CANCELED/REFUNDED deixaria `DRAFT` passar como cobrável, e o relatório
    // prometeria uma cobrança que o motor real recusaria.
    if (tentativa.status !== "PENDING" && tentativa.status !== "OVERDUE") {
      return {
        ...comPeriodo,
        wouldCharge: false,
        reason: "needs_review",
        note: `${company.name}: a fatura ${tentativa.number} está ${tentativa.status} — o motor NÃO reemite por cima e pararia para revisão humana.`,
      };
    }
    // Preço mudou DEPOIS de a cobrança ir ao gateway: lá o valor está fixado e
    // mudar o local não muda o que o cliente recebeu. O motor exige anular e
    // refazer (Task 9) em vez de reescrever por baixo de uma cobrança emitida.
    if (tentativa.asaasPaymentId && tentativa.total !== priceCents) {
      return {
        ...comPeriodo,
        wouldCharge: false,
        reason: "needs_review",
        note: `${company.name}: o preço mudou de ${reais(tentativa.total)} para ${reais(priceCents)} depois de a cobrança ir ao gateway — anular e refazer.`,
      };
    }
  }

  return {
    ...comPeriodo,
    wouldCharge: true,
    reason: null,
    note: `${company.name}: COBRARIA ${reais(priceCents)} do plano ${sub.plan.name}, período ${dia(periodStart)} a ${dia(periodEnd)}, com vencimento em ${dia(periodStart)}.`,
  };
}

type PeriodoAlvo =
  | {
      periodStart: Date;
      periodEnd: Date;
      disposition: PrismaObligationDisposition;
      priceCents: number;
    }
  | { reason: ShadowReason; note: string };

/**
 * Reavalia uma obrigação já materializada (`PLANNED`) como o motor faria.
 *
 * 🔑 O motor faz DUAS coisas, e o sombra tem que fazer as duas:
 *
 * 1. **RESPEITA a disposição GRAVADA quando ela não é `CHARGE`.** A guarda de
 *    `runObligationForCompany` (`billing-obligation.service.ts`, "Só `CHARGE`
 *    chega ao gateway") lê a disposição como está no banco e, se for
 *    `COURTESY`, `INTERNAL` ou `LEGACY_WAIVED`, quita a linha e devolve
 *    `settled` — nunca cobra. Isso acontece ANTES de qualquer recálculo.
 *
 * 2. **RECALCULA disposição e preço quando a gravada é `CHARGE`.** O preço é
 *    congelado na EMISSÃO, não na criação, então `reserveAttempt` refaz a conta
 *    dentro do lock. Ler o valor gravado faria o relatório mentir com cortesia
 *    concedida depois da materialização, plano que virou interno, ou reajuste
 *    aplicado no intervalo.
 *
 * ⚠️ Fazer só (2) — como esta função fazia antes — inverte o erro em vez de
 * corrigi-lo: uma linha `LEGACY_WAIVED` seria recalculada como `CHARGE` e o
 * relatório afirmaria que o motor cobraria um período que o dono declarou
 * encerrado. Não é hipótese: o bootstrap escreve `LEGACY_WAIVED` em massa no
 * passado regularizado, e a ordem prevista é bootstrap → sombra → emissão — ou
 * seja, o relatório seria lido exatamente na janela em que estaria errado.
 *
 * O ciclo é comparado com o congelado: trocar mensal↔anual depois de o período
 * estar fechado cobraria um ano pelo período de um mês, e o motor exige
 * anulação manual em vez de recalcular em silêncio.
 */
async function reavaliarPendente(
  pending: {
    periodStart: Date;
    periodEnd: Date;
    cycle: "MONTHLY" | "YEARLY";
    disposition: PrismaObligationDisposition;
    priceCents: number;
  },
  sub: {
    id: string;
    billingCycle: "MONTHLY" | "YEARLY";
    discountPercent: number | null;
    discountExpiresAt: Date | null;
    plan: { id: string; name: string; priceMonthly: number; priceYearly: number };
  },
  prisma: typeof defaultPrisma,
  now: Date,
): Promise<PeriodoAlvo> {
  // 🔑 PRIMEIRO de todos, como no motor: disposição GRAVADA que não é `CHARGE`
  // encerra a decisão aqui. O motor quita a linha e devolve `settled` sem
  // recalcular nada — e `LEGACY_WAIVED` (passado que o dono declarou encerrado)
  // é justamente a que menos pode voltar a ser cobrada. Recalcular por cima dela
  // devolveria `CHARGE` e o relatório prometeria uma cobrança que não existe.
  //
  // Vem antes até da guarda de ciclo: numa linha isenta o ciclo é irrelevante,
  // porque não há preço a recalcular de jeito nenhum.
  if (pending.disposition !== "CHARGE") {
    return {
      periodStart: pending.periodStart,
      periodEnd: pending.periodEnd,
      disposition: pending.disposition,
      // O preço GRAVADO, não recalculado: numa linha isenta ele é o registro do
      // que se deixou de faturar, e refazer a conta com o plano de hoje
      // reescreveria um número histórico que o bootstrap já fechou.
      priceCents: pending.priceCents,
    };
  }

  if (sub.billingCycle !== pending.cycle) {
    return {
      reason: "needs_review",
      note: `o ciclo mudou de ${pending.cycle} para ${sub.billingCycle} depois de o período ser fechado — o motor exige ANULAR e refazer, não recalcula sozinho.`,
    };
  }

  const courtesies = await prisma.subscriptionCourtesy.findMany({
    where: { subscriptionId: sub.id },
    select: { startsAt: true, endsAt: true, revokedAt: true },
  });

  const disposition = resolveObligationDisposition({
    periodStart: pending.periodStart,
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

  return {
    periodStart: pending.periodStart,
    periodEnd: pending.periodEnd,
    disposition,
    priceCents,
  };
}

/**
 * O período que seria materializado, quando não há obrigação pendente.
 *
 * Reusa exatamente os módulos puros do motor — a aritmética do dinheiro e do
 * calendário é a MESMA função, não uma cópia.
 */
async function planejarPeriodoNovo(
  sub: {
    id: string;
    billingCycle: "MONTHLY" | "YEARLY";
    discountPercent: number | null;
    discountExpiresAt: Date | null;
    plan: { id: string; name: string; priceMonthly: number; priceYearly: number };
  },
  prisma: typeof defaultPrisma,
  deps: ShadowDeps,
  now: Date,
): Promise<PeriodoAlvo> {
  const [lastLive, highest] = await Promise.all([
    prisma.billingObligation.findFirst({
      where: { subscriptionId: sub.id, state: { not: "VOID" } },
      orderBy: { sequence: "desc" },
      select: { sequence: true, periodEnd: true },
    }),
    prisma.billingObligation.findFirst({
      where: { subscriptionId: sub.id },
      orderBy: { sequence: "desc" },
      select: { sequence: true },
    }),
  ]);

  const plano = resolveNextObligationPlan({
    lastObligation: lastLive,
    maxSequence: highest?.sequence ?? null,
    firstPeriodStart: deps.firstPeriodStartBySubscription?.[sub.id] ?? null,
    cycle: sub.billingCycle,
    now,
    issueLeadDays: ISSUE_LEAD_DAYS,
  });

  if (plano.kind === "needs_bootstrap") {
    // ⚠️ O ESTADO DE HOJE, antes da etapa 2 do rollout. É o motivo pelo qual o
    // relatório grita este caso: sem âncora, "0 cobranças" não significa "nada
    // a cobrar", significa "o motor não sabe onde a linha do tempo começa".
    return {
      reason: "needs_bootstrap",
      note: "SEM ÂNCORA de período (bootstrap não executado) — o motor se RECUSA a adivinhar onde a cobrança começa. Não é 'nada a cobrar'.",
    };
  }
  if (plano.kind === "outside_horizon") {
    return {
      reason: "outside_horizon",
      note: `o próximo período começa em ${dia(plano.periodStart)}, além do horizonte de ${ISSUE_LEAD_DAYS} dias — nada a fazer hoje.`,
    };
  }

  const courtesies = await prisma.subscriptionCourtesy.findMany({
    where: { subscriptionId: sub.id },
    select: { startsAt: true, endsAt: true, revokedAt: true },
  });

  const disposition = resolveObligationDisposition({
    periodStart: plano.periodStart,
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

  return {
    periodStart: plano.periodStart,
    periodEnd: plano.periodEnd,
    disposition,
    priceCents,
  };
}

/**
 * Restringiria a escrita desta empresa AGORA?
 *
 * 🔑 A pergunta é sobre o PRESENTE, não uma profecia. Responde exatamente às
 * invariantes I1 e I3 lidas do banco:
 *
 *   I1 — existe obrigação `ISSUED` com `dueAt` no passado; **e**
 *   I3 — o aviso do marco final (`WRITE_RESTRICTION_DAY`) foi DESPACHADO.
 *
 * ⚠️ Hoje, pré-bootstrap, não existe NENHUMA `BillingObligation`, então isto é
 * `false` para todo mundo — e é a resposta honesta: sem obrigação emitida não
 * há dívida provada, logo não há o que restringir. O relatório diz isso com
 * todas as letras em vez de deixar o zero parecer "ninguém está devendo".
 *
 * ⚠️ Não é uma previsão de "seria restringido se não pagasse". Essa pergunta
 * depende de um aviso que ainda não foi enviado e de um pagamento que ainda não
 * deixou de acontecer; qualquer booleano aqui seria invenção.
 *
 * ⚠️ Divergência conhecida e DELIBERADA: o gate de acesso em produção hoje
 * (`checkSubscription`, `src/lib/subscription.ts`) restringe por
 * `Subscription.status = PAST_DUE` + `pastDueSince` + aviso, e **não** lê
 * `BillingObligation` — I1 ainda não está aplicada em lugar nenhum. Este campo
 * mede a invariante PRETENDIDA (o que a etapa 5 vai aplicar), não o
 * comportamento atual do cadeado. Medir o cadeado atual responderia a pergunta
 * de outra entrega.
 *
 * ⚠️ **Fail-OPEN a favor do cliente** (não "fail-closed"): qualquer erro de
 * leitura devolve `false`, ou seja, NÃO restringe. Na dúvida, o lado seguro é
 * deixar o cliente escrever — mesma política de `hasDispatchedNotice`.
 *
 * A palavra importa porque no resto desta cadeia "fail-closed" significa "não
 * cobra". Aqui a direção segura é a oposta: erro de leitura não pode virar
 * bloqueio. Como esta função é exportada, alguém que a lesse rápido poderia
 * achá-la apta a embasar enforcement — **não é**: um banco instável faria todo
 * mundo parecer em dia.
 */
export async function resolveWouldRestrict(
  companyId: string,
  prisma: typeof defaultPrisma,
  deps: ShadowDeps,
  now: Date,
): Promise<boolean> {
  const noticeFn = deps.hasDispatchedNoticeFn ?? hasDispatchedNotice;

  try {
    // I1: obrigação EMITIDA e VENCIDA. `dueAt: { lt: now }` é a parte "vencida";
    // sem ela, uma cobrança emitida hoje com vencimento amanhã restringiria.
    const vencida = await prisma.billingObligation.findFirst({
      where: {
        subscription: { companyId },
        state: "ISSUED",
        dueAt: { lt: now },
      },
      select: { id: true },
    });
    if (!vencida) return false;

    // I3: e o aviso do marco final saiu mesmo?
    return await noticeFn(companyId, WRITE_RESTRICTION_DAY);
  } catch (error) {
    log.error("Falha ao avaliar restrição no modo sombra — assumindo NÃO restringe", {
      companyId,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Persistência — a ÚNICA escrita deste módulo
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Grava as decisões em `BillingShadowDecision`.
 *
 * 🔑 A única tabela que este arquivo escreve, e de propósito a mais descartável
 * do schema: sem FK, sem unique, truncável a qualquer momento.
 *
 * ## Idempotência: grava TODA rodada, de propósito
 *
 * Rodar duas vezes no mesmo dia grava duas linhas. É o comportamento desejado:
 * `runAt` é a coluna indexada e o artefato é um HISTÓRICO de decisões, não um
 * estado atual. Deduplicar por dia esconderia justamente o que mais interessa
 * observar antes de ligar a emissão — a decisão MUDANDO entre rodadas (um plano
 * trocado, uma cortesia concedida, um documento cadastrado). E como não há
 * unique na tabela, "deduplicar" exigiria um delete-and-insert, ou seja: o modo
 * sombra apagando a própria evidência.
 *
 * Best-effort: falhar ao gravar o diagnóstico não pode derrubar a rodada — o
 * relatório em memória continua válido e é devolvido de qualquer jeito.
 *
 * Só grava decisões que têm período: a tabela exige `periodStart`, `periodEnd`,
 * `priceCents` e `disposition` como NOT NULL, e inventar valores para caber
 * ("hoje", "0", "CHARGE") plantaria dado falso num artefato de diagnóstico. As
 * empresas sem período seguem no relatório — que é onde o dono lê — contadas em
 * `porMotivo`.
 *
 * ⚠️ VIÉS CONHECIDO DA TABELA. O filtro descarta justamente os estados que hoje
 * mais importam: `needs_bootstrap`, assinatura ambígua, dado inválido, empresa
 * inexistente, sem assinatura viva e `outside_horizon`. Numa rodada pré-bootstrap
 * a tabela fica VAZIA — indistinguível, olhando só o banco, de "o modo sombra
 * nunca rodou". Por isso o relatório devolve `persistidas`: quem consumir o
 * artefato pela tabela precisa saber que ela é uma amostra, não o censo. O censo
 * é o relatório.
 */
async function persistDecisions(
  decisions: ShadowDecision[],
  ctx: { prisma: typeof defaultPrisma; now: Date },
): Promise<number> {
  const graváveis = decisions.filter(éGravável);
  if (graváveis.length === 0) return 0;

  try {
    await ctx.prisma.billingShadowDecision.createMany({
      // Sem `as`: o type predicate acima já provou ao compilador que estes
      // quatro campos não são nulos. Um cast aqui desligaria justamente a
      // checagem que impediria um campo trocado de compilar.
      data: graváveis.map((d) => ({
        subscriptionId: d.subscriptionId,
        companyId: d.companyId,
        runAt: ctx.now,
        wouldCharge: d.wouldCharge,
        wouldRestrict: d.wouldRestrict,
        periodStart: d.periodStart,
        periodEnd: d.periodEnd,
        priceCents: d.priceCents,
        disposition: d.disposition,
        note: d.note,
      })),
    });
    return graváveis.length;
  } catch (error) {
    log.error("Falha ao gravar decisões do modo sombra (o relatório segue válido)", {
      error: error instanceof Error ? error.message : String(error),
    });
    return 0;
  }
}

/**
 * A decisão tem todos os campos que a tabela exige como NOT NULL?
 *
 * Type predicate em vez de `as`: é o compilador que passa a garantir que os
 * quatro campos não são nulos no `createMany`. Um `as string`/`as Date` diria a
 * mesma coisa sem provar nada — e neste repo um `as never` já desligou a
 * checagem do Prisma e deixou um typo compilar.
 */
function éGravável(
  d: ShadowDecision,
): d is ShadowDecision & {
  subscriptionId: string;
  periodStart: Date;
  periodEnd: Date;
  disposition: PrismaObligationDisposition;
} {
  return (
    d.subscriptionId !== null &&
    d.periodStart !== null &&
    d.periodEnd !== null &&
    d.disposition !== null
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Relatório para HUMANO
// ─────────────────────────────────────────────────────────────────────────────

/** Rótulo legível de cada motivo — o relatório é lido por gente, não por log. */
const ROTULO: Record<ShadowReason, string> = {
  shadow_disabled: "modo sombra desligado",
  no_effective_subscription: "sem assinatura viva",
  ambiguous_subscription: "AMBÍGUA: duas assinaturas vivas (motor recusa escolher)",
  company_not_found: "empresa não encontrada",
  native_asaas_subscription: "ciclo gerenciado pelo Asaas (motor não opera)",
  needs_bootstrap: "SEM ÂNCORA — bootstrap não executado",
  outside_horizon: "período seguinte ainda longe (nada a fazer hoje)",
  courtesy: "cortesia (isenta)",
  internal: "conta interna, plano de preço zero (isenta)",
  legacy_waived: "passado regularizado (isenta)",
  already_settled: "já emitida/paga nesta rodada",
  missing_document: "SEM CPF/CNPJ — motor recusaria antes do gateway",
  unmapped_invoice_overlap: "FATURA SOBREPOSTA sem vínculo (risco de cobrança dupla)",
  needs_review: "PRECISA DE REVISÃO HUMANA",
  invalid_data: "DADO INVÁLIDO",
};

function buildReport(
  decisions: ShadowDecision[],
  runAt: Date,
  persistidas: number,
): ShadowReport {
  const cobraria = decisions.filter((d) => d.wouldCharge);
  const totalCents = cobraria.reduce((soma, d) => soma + d.priceCents, 0);
  const restringiria = decisions.filter((d) => d.wouldRestrict).length;

  const porMotivo: Record<string, number> = {};
  for (const d of decisions) {
    if (d.reason === null) continue;
    porMotivo[d.reason] = (porMotivo[d.reason] ?? 0) + 1;
  }

  return {
    runAt,
    avaliadas: decisions.length,
    cobraria: { empresas: cobraria.length, totalCents },
    restringiria,
    porMotivo,
    persistidas,
    decisions,
    resumo: renderResumo({
      decisions,
      cobraria,
      totalCents,
      restringiria,
      porMotivo,
      runAt,
      persistidas,
    }),
  };
}

/**
 * O texto que o dono lê antes de decidir ligar a emissão.
 *
 * 🔑 O CASO `needs_bootstrap` VEM PRIMEIRO E EM DESTAQUE. Hoje, pré-bootstrap,
 * TODA assinatura cai nele — e um relatório que abrisse com "cobraria: 0
 * empresas" seria lido como "está tudo certo, ninguém deve nada", que é o
 * oposto da verdade. O que existe é um motor que não sabe onde a linha do tempo
 * de ninguém começa. Enquanto houver uma única empresa nesse estado, o relatório
 * começa avisando disso.
 */
function renderResumo(input: {
  decisions: ShadowDecision[];
  cobraria: ShadowDecision[];
  totalCents: number;
  restringiria: number;
  porMotivo: Record<string, number>;
  runAt: Date;
  persistidas: number;
}): string {
  const { decisions, cobraria, totalCents, restringiria, porMotivo, runAt, persistidas } =
    input;
  const linhas: string[] = [];

  linhas.push(`MODO SOMBRA — rodada de ${dataHora(runAt)}`);
  linhas.push(`Nada foi cobrado, nada foi enviado, ninguém foi restringido.`);
  linhas.push(
    `${decisions.length} decisão(ões) avaliada(s); ${persistidas} coube(ram) na tabela billing_shadow_decisions.`,
  );
  if (persistidas < decisions.length) {
    linhas.push(
      `   ⚠️ ${decisions.length - persistidas} não têm período e por isso NÃO foram gravadas — a tabela é`,
    );
    linhas.push(`      uma amostra parcial. Este relatório é o registro completo.`);
  }
  linhas.push("");

  const semAncora = porMotivo.needs_bootstrap ?? 0;
  if (semAncora > 0) {
    linhas.push(
      `🚨 ${semAncora} de ${decisions.length} assinaturas estão SEM ÂNCORA (bootstrap não executado).`,
    );
    linhas.push(
      `   Para elas o motor NÃO decidiu nada — ele se recusa a adivinhar onde a cobrança começa.`,
    );
    linhas.push(
      `   ⚠️ Isto NÃO quer dizer "nada a cobrar": quer dizer que a pergunta ainda não pôde ser feita.`,
    );
    if (semAncora === decisions.length) {
      linhas.push(
        `   Como TODAS estão neste estado, os números abaixo não medem nada ainda.`,
      );
    }
    linhas.push("");
  }

  linhas.push(`COBRARIA: ${cobraria.length} empresa(s), total ${reais(totalCents)}`);
  linhas.push(
    `   Leia como "chegaria à tentativa de emissão", não como "a cobrança sairia":`,
  );
  linhas.push(
    `   o Asaas ainda pode recusar, expirar ou duplicar, e isso só se descobre emitindo.`,
  );
  for (const d of cobraria) linhas.push(`   • ${d.note}`);
  if (cobraria.length === 0) linhas.push(`   (nenhuma)`);
  linhas.push("");

  linhas.push(`RESTRINGIRIA AGORA (obrigação emitida e vencida + aviso despachado): ${restringiria}`);
  linhas.push(
    `   ⚠️ Isto mede a regra PRETENDIDA da etapa 5, não o cadeado de hoje: o gate em`,
  );
  linhas.push(
    `      produção ainda restringe por status da assinatura, sem ler obrigação nenhuma.`,
  );
  if (restringiria === 0) {
    // ⚠️ Sem afirmar a CAUSA. Zero pode ser: nenhuma obrigação emitida, emitida
    // mas não vencida, vencida mas sem aviso despachado, falha de leitura da
    // trilha (fail-closed), ou empresa sem assinatura viva/ambígua — que nem
    // chega a ser avaliada. Dizer "não existe obrigação emitida" escolheria uma
    // dessas cinco e apresentaria o palpite como fato.
    linhas.push(
      `   Nenhuma empresa reúne HOJE as duas condições. Isso não distingue entre "não há`,
    );
    linhas.push(
      `   dívida", "a dívida ainda não venceu" e "venceu mas o aviso não saiu" — ver os motivos abaixo.`,
    );
  } else {
    for (const d of decisions.filter((x) => x.wouldRestrict)) {
      linhas.push(`   • ${d.companyId}`);
    }
  }
  linhas.push("");

  const motivos = Object.entries(porMotivo).sort((a, b) => b[1] - a[1]);
  if (motivos.length > 0) {
    linhas.push(`NÃO COBRARIA — por quê:`);
    for (const [reason, n] of motivos) {
      linhas.push(`   ${String(n).padStart(4)} × ${ROTULO[reason as ShadowReason] ?? reason}`);
    }
    linhas.push("");
  }

  const atencao = decisions.filter(
    (d) =>
      d.reason === "missing_document" ||
      d.reason === "unmapped_invoice_overlap" ||
      d.reason === "needs_review" ||
      d.reason === "ambiguous_subscription" ||
      d.reason === "invalid_data",
  );
  if (atencao.length > 0) {
    linhas.push(`PRECISA DE AÇÃO HUMANA ANTES DE LIGAR A EMISSÃO:`);
    for (const d of atencao) linhas.push(`   • ${d.note}`);
    linhas.push("");
  }

  linhas.push(`O QUE ESTA RODADA NÃO PROVA:`);
  for (const item of SHADOW_NAO_PROVA) linhas.push(`   • ${item}`);

  return linhas.join("\n");
}

function emptyReport(runAt: Date, resumo: string): ShadowReport {
  return {
    runAt,
    avaliadas: 0,
    cobraria: { empresas: 0, totalCents: 0 },
    restringiria: 0,
    porMotivo: {},
    persistidas: 0,
    decisions: [],
    resumo,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatação
// ─────────────────────────────────────────────────────────────────────────────

const OBLIGATION_SELECT = {
  id: true,
  sequence: true,
  state: true,
  disposition: true,
  periodStart: true,
  periodEnd: true,
  priceCents: true,
  invoiceId: true,
  // `cycle` congelado na materialização: é o que permite detectar troca de ciclo
  // depois de o período estar fechado — mesma guarda da fase 2 do motor.
  cycle: true,
} as const;

function reais(cents: number): string {
  return `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;
}

/**
 * Data no fuso do cliente, no formato que o dono lê — não UTC cru.
 *
 * O banco guarda UTC e a Vercel roda em UTC; imprimir `toISOString()` mostraria
 * "2026-09-04" para um período que, em `America/Sao_Paulo`, começa no dia 3. Num
 * documento cujo propósito é o dono conferir A QUEM e QUANDO se cobraria, um dia
 * de diferença é erro de leitura. `formatInTimeZone` + `TIMEZONE` é a fonte
 * única deste repo para isso.
 */
function dia(date: Date): string {
  return formatInTimeZone(date, TIMEZONE, "dd/MM/yyyy");
}

/** Data e hora da rodada, no mesmo fuso e com o mesmo motivo. */
function dataHora(date: Date): string {
  return formatInTimeZone(date, TIMEZONE, "dd/MM/yyyy 'às' HH:mm");
}
