import type { BillingCycle, ObligationDisposition } from "@prisma/client";
import { nextPeriod, type Period } from "@/lib/billing-clock";
import { resolveConversionPriceCents } from "@/lib/trial-conversion-charge";

/**
 * Regras PURAS da obrigação de cobrança — a peça que a tabela de componentes da
 * spec (§5) prevê como `src/lib/billing-obligation.ts`.
 *
 * Só decide: qual é a próxima obrigação, quanto ela vale, se dois períodos se
 * sobrepõem e o que a emissão pode fazer com o estado atual. Nada de Prisma,
 * nada de gateway, nada de `new Date()` sem argumento — tudo vem de fora, para
 * que cada regra comercial seja exercitável sem banco e sem rede.
 *
 * Existe separado do serviço pelo mesmo motivo de `trial-conversion-charge.ts`:
 * errar qualquer uma destas contas cobra o valor errado de um cliente real, num
 * gateway que NÃO tem sandbox.
 */

/** Obrigação já existente que serve de âncora para a próxima. */
export interface ObligationAnchor {
  sequence: number;
  periodEnd: Date;
}

export interface NextObligationInput {
  /**
   * Última obrigação NÃO anulada da assinatura (a que define onde a linha do
   * tempo parou). `null` quando a assinatura ainda não tem histórico.
   */
  lastObligation: ObligationAnchor | null;
  /**
   * Maior `sequence` já usada na assinatura, **contando as anuladas**. Ver a
   * nota de `nextSequence` abaixo — é uma entrada separada de propósito.
   */
  maxSequence: number | null;
  /**
   * Início do primeiro período, quando a assinatura não tem histórico. É
   * EXPLÍCITO e obrigatório: este módulo se recusa a inferi-lo (ver
   * `needs_bootstrap`).
   */
  firstPeriodStart: Date | null;
  cycle: BillingCycle;
  now: Date;
  /**
   * Quantos dias antes do início do período a obrigação pode ser materializada.
   * É o HORIZONTE de geração — ver `outside_horizon`.
   */
  issueLeadDays: number;
}

export type NextObligationPlan =
  | { kind: "plan"; sequence: number; periodStart: Date; periodEnd: Date }
  /**
   * Não há como saber onde a linha do tempo desta assinatura começa sem
   * decisão humana. NÃO é erro de programação: é o estado normal de toda
   * assinatura legada antes do bootstrap (etapa 2 do rollout).
   */
  | { kind: "needs_bootstrap" }
  /**
   * O próximo período começa longe demais para ser materializado agora.
   */
  | { kind: "outside_horizon"; periodStart: Date };

/**
 * Qual obrigação criar em seguida — ou por que não criar nenhuma.
 *
 * 🔑 HORIZONTE DE GERAÇÃO (a regra que impede a avalanche). Encadear
 * cegamente "o período seguinte ao último" faz o cron criar UMA obrigação POR
 * DIA: no dia 1 nasce a `sequence` 1, no dia 2 a 2 (porque agora existe uma
 * anterior), no dia 3 a 3 — e em um mês a assinatura tem anos de períodos
 * futuros materializados, cada um com preço e plano congelados numa data
 * arbitrária. A spec §4.5 pede "a obrigação do período **seguinte**", no
 * singular. Então só se materializa o período que já está a menos de
 * `issueLeadDays` de começar; qualquer coisa além disso é `outside_horizon`, e
 * a rodada de amanhã reavalia.
 *
 * 🔑 `needs_bootstrap` em vez de inferir a âncora inicial. A tentação é usar
 * `Subscription.currentPeriodEnd` (ou `trialEndsAt`) como "pagou até aqui" —
 * mas esse campo é escrito por sete caminhos diferentes (checkout, webhook,
 * seed, cadastro público, ações do admin, canal do Domus) e nenhum deles
 * significa isso de forma confiável: `mark_paid` confirma pagamento à mão e
 * **não** o avança
 * (`src/app/api/admin/faturas/[id]/workflow/route.ts`). Inferir cobraria
 * de novo um período já pago. A spec (§7, etapa 2) exige bootstrap linha a
 * linha aprovado pelo dono, e é isso que `firstPeriodStart` representa: uma
 * âncora DADA, nunca adivinhada.
 */
export function resolveNextObligationPlan(
  input: NextObligationInput,
): NextObligationPlan {
  const { lastObligation, maxSequence, firstPeriodStart, cycle, now, issueLeadDays } =
    input;

  let period: Period;
  if (lastObligation) {
    // Encadeia do FIM do anterior — nunca de "agora" (anti-drift, billing-clock).
    period = nextPeriod({ previousEnd: lastObligation.periodEnd, cycle });
  } else {
    if (firstPeriodStart === null) return { kind: "needs_bootstrap" };
    assertValidDate(firstPeriodStart, "firstPeriodStart");
    // O primeiro período COMEÇA na âncora dada; o fim sai da mesma aritmética
    // de calendário do encadeamento, para que sequence 1 e sequence 2 usem
    // exatamente a mesma regra de fim de mês.
    period = {
      periodStart: firstPeriodStart,
      periodEnd: nextPeriod({ previousEnd: firstPeriodStart, cycle }).periodEnd,
    };
  }

  assertValidDate(now, "now");
  const horizon = new Date(now.getTime() + issueLeadDays * 86_400_000);
  if (period.periodStart.getTime() > horizon.getTime()) {
    return { kind: "outside_horizon", periodStart: period.periodStart };
  }

  return {
    kind: "plan",
    sequence: nextSequence(maxSequence),
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
  };
}

/**
 * Próximo número contábil.
 *
 * 🔑 Conta a partir do MAIOR `sequence` já gravado, **incluindo as anuladas**.
 * Se a maior for 4 e estiver `VOID`, a próxima é 5, não 4: a unique
 * `(subscriptionId, sequence)` continua valendo para a linha anulada, então
 * "reusar" o número 4 colidiria em P2002 a cada rodada, para sempre. Número
 * contábil não se recicla — obrigação anulada permanece ocupando o seu.
 */
function nextSequence(maxSequence: number | null): number {
  if (maxSequence === null) return 1;
  return maxSequence + 1;
}

export interface ObligationPriceInput {
  /**
   * Enum do PRISMA, não a união estreita de `billing-courtesy.ts`. Inclui
   * `LEGACY_WAIVED`, que o bootstrap grava e que esta função tem que RECUSAR
   * explicitamente — se o tipo a excluísse, o chamador precisaria de um `as`
   * para sequer perguntar, e o caso ficaria sem guarda.
   */
  disposition: ObligationDisposition;
  cycle: BillingCycle;
  priceMonthly: number;
  priceYearly: number;
  discountPercent: number | null;
  discountExpiresAt: Date | null;
  now: Date;
}

/**
 * Valor a gravar em `BillingObligation.priceCents`, em CENTAVOS (mesma unidade
 * de `Plan.priceMonthly` — cópia direta, sem `* 100` nem `/ 100`).
 *
 * Três respostas diferentes para três perguntas diferentes:
 *
 * - `INTERNAL` → **0**. É a conta interna do dono (plano de preço zero); o
 *   schema diz que aqui `priceCents` é sempre 0 e não entra na conta de receita
 *   não faturada. Chamar `resolveConversionPriceCents` aqui LANÇARIA (ela
 *   recusa preço zero de propósito), e por isso o desvio vem antes.
 *
 * - `COURTESY` → **preço CHEIO do ciclo, SEM desconto**. Este número é a
 *   *receita não faturada* (schema, docstring de `priceCents`): o que se deixou
 *   de faturar ao conceder a cortesia. Aplicar o desconto contratado aqui
 *   registraria o valor líquido e subdeclararia a concessão — a métrica que a
 *   tela da Task 10 soma para responder "quanto de cortesia eu dei este mês"
 *   ficaria menor que a realidade.
 *
 * - `CHARGE` → `resolveConversionPriceCents`, **com** desconto vigente. Aqui o
 *   número vira dinheiro cobrado, então tem que ser exatamente o que o cliente
 *   paga. Reusa a função do repo em vez de reimplementar a regra de desconto —
 *   duas cópias divergiriam no primeiro reajuste.
 *
 * `LEGACY_WAIVED` é disposição de bootstrap (escrita direta pelo dono) e nunca
 * chega aqui; o `default` do switch a trata como o caso fechado que é.
 */
export function resolveObligationPriceCents(input: ObligationPriceInput): number {
  const { disposition, cycle, priceMonthly, priceYearly } = input;

  if (disposition === "INTERNAL") return 0;

  if (disposition === "COURTESY") {
    const full = cycle === "YEARLY" ? priceYearly : priceMonthly;
    if (!Number.isInteger(full) || full <= 0) {
      throw new Error(
        `billing-obligation: preço cheio inválido para cortesia: ${full}`,
      );
    }
    return full;
  }

  if (disposition === "CHARGE") {
    return resolveConversionPriceCents({
      billingCycle: cycle,
      priceMonthly,
      priceYearly,
      discountPercent: input.discountPercent,
      discountExpiresAt: input.discountExpiresAt,
      now: input.now,
    });
  }

  throw new Error(
    `billing-obligation: disposição não emissível pelo motor: ${String(disposition)}`,
  );
}

export interface PeriodRange {
  periodStart: Date;
  periodEnd: Date;
}

/**
 * Dois períodos semiabertos `[start, end)` se sobrepõem?
 *
 * Fronteira EXCLUSIVA nas duas pontas, coerente com `billing-clock`: o período
 * que TERMINA onde o outro começa NÃO se sobrepõe — é justamente o encadeamento
 * normal da sequência, e tratá-lo como conflito faria o motor recusar toda
 * obrigação legítima.
 *
 * Serve à guarda que impede cobrar duas vezes o mesmo mês: a cobrança de
 * conversão de trial que já existe grava `Invoice.periodStart/periodEnd` mas
 * **não** `billingObligationId` (`trial-conversion-charge.service.ts`), então o
 * motor não a reconhece por vínculo — só por interseção de datas.
 */
export function periodsOverlap(a: PeriodRange, b: PeriodRange): boolean {
  assertSaneRange(a, "a");
  assertSaneRange(b, "b");

  return (
    a.periodStart.getTime() < b.periodEnd.getTime() &&
    b.periodStart.getTime() < a.periodEnd.getTime()
  );
}

/**
 * Rejeita data inválida E intervalo INVERTIDO ou VAZIO.
 *
 * Validar só `Invalid Date` não basta: numa fatura legada com
 * `periodEnd <= periodStart` (dado corrompido, ou registro criado por um
 * caminho que trocou os campos), a comparação acima devolveria `false` — "não
 * se sobrepõe" — e a guarda de cobrança dupla liberaria uma segunda cobrança do
 * mesmo mês. O intervalo degenerado tem que falhar ALTO, como toda outra entrada
 * corrompida desta cadeia.
 */
function assertSaneRange(range: PeriodRange, label: string): void {
  assertValidDate(range.periodStart, `${label}.periodStart`);
  assertValidDate(range.periodEnd, `${label}.periodEnd`);
  if (range.periodEnd.getTime() <= range.periodStart.getTime()) {
    throw new Error(
      `billing-obligation: ${label} tem intervalo inválido (fim <= início)`,
    );
  }
}

/**
 * Rejeita `Invalid Date` em vez de deixar NaN virar decisão silenciosa —
 * mesma guarda de `billing-clock.ts` e `billing-courtesy.ts`. Um módulo
 * fail-open no meio da cadeia anula a garantia dos outros.
 */
function assertValidDate(value: Date, field: string): void {
  if (Number.isNaN(value.getTime())) {
    throw new Error(`billing-obligation: ${field} é uma data inválida`);
  }
}
