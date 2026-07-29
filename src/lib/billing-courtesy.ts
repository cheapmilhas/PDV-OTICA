/**
 * Resolve a DISPOSIÇÃO de uma obrigação de cobrança — o que se pretende
 * fazer com o período: `CHARGE` (cobrar), `COURTESY` (isentar por concessão
 * comercial) ou `INTERNAL` (plano de preço zero, conta interna do dono).
 *
 * Módulo PURO: sem I/O, sem Prisma, sem `new Date()` sem argumento. Recebe
 * os dados já carregados pelo chamador (§4.3 da spec de recorrência) e só
 * decide. `LEGACY_WAIVED` (passado regularizado) não é produzida aqui — é
 * escrita direta de bootstrap (Task 4), fora do escopo desta função.
 *
 * A tabela `SubscriptionCourtesy` ainda não existe (criada na Task 4); por
 * isso `CourtesyCandidate` é declarada aqui, não importada do
 * `@prisma/client` — mesmo padrão de `SubscriptionCandidate` em
 * effective-subscription.ts.
 */

/**
 * Concessão de cortesia vinculada a uma assinatura. `endsAt` nulo = cortesia
 * permanente (ex.: a ótica do próprio dono). `revokedAt` não nulo = a
 * concessão foi desfeita e não vale mais, independente das datas de
 * vigência — é o mecanismo pelo qual o dono desfaz uma cortesia dada por
 * engano sem precisar apagar o histórico.
 */
export interface CourtesyCandidate {
  startsAt: Date;
  endsAt: Date | null;
  revokedAt: Date | null;
}

export interface ObligationDispositionInput {
  /** Início do período da obrigação em avaliação. Cortesia é decidida contra
   * este valor, nunca contra `periodEnd` nem "agora" — spec §4.3: uma
   * cortesia vale para o período INTEIRO ou não vale nada, sem meio-termo. */
  periodStart: Date;
  /** Preço cheio do plano no momento da emissão, em centavos (`Plan.priceMonthly`
   * no schema — confirmado `Int`, não `Decimal`; comparação com `0` é direta). */
  planPriceMonthly: number;
  /** Todas as cortesias da assinatura, revogadas ou não, passadas ou futuras —
   * esta função filtra. */
  courtesies: CourtesyCandidate[];
}

export type ObligationDisposition = "CHARGE" | "COURTESY" | "INTERNAL";

/**
 * Decide a disposição de uma obrigação a partir do preço do plano e das
 * cortesias da assinatura.
 *
 * Precedência: `INTERNAL` sempre vence sobre `COURTESY`. Um plano de preço
 * zero não tem "valor cheio" a perder — a pergunta "está de cortesia?" não
 * se aplica a um plano que não cobra ninguém. Se `COURTESY` vencesse aqui,
 * uma cortesia concedida (ou esquecida) sobre o plano interno do dono
 * inflaria a métrica de receita não faturada com um valor que nunca
 * existiu — exatamente o que a spec (§4.3, "Cortesia ≠ plano interno")
 * proíbe misturar.
 */
export function resolveObligationDisposition(
  input: ObligationDispositionInput,
): ObligationDisposition {
  const { periodStart, planPriceMonthly, courtesies } = input;

  assertValidDate(periodStart, "periodStart");

  if (planPriceMonthly === 0) return "INTERNAL";

  const hasActiveCourtesy = courtesies.some((courtesy) =>
    isCourtesyActiveAt(courtesy, periodStart),
  );

  return hasActiveCourtesy ? "COURTESY" : "CHARGE";
}

/**
 * Rejeita `Invalid Date` em vez de deixá-la virar isenção silenciosa.
 *
 * Este módulo decide se alguém é COBRADO. Com uma data inválida, todo
 * `getTime()` vira `NaN`, e em JS toda comparação com `NaN` é `false`: as três
 * checagens de `isCourtesyActiveAt` retornariam `false` e a função cairia no
 * `return true` final — concedendo cortesia PERMANENTE por acidente, sem erro,
 * sem log, sem teste vermelho. O modo de falha do dado ruim seria "para de
 * cobrar", o pior default possível para um motor de receita.
 *
 * Mesma guarda de `previousEnd` em billing-clock.ts (Task 2): o motor inteiro é
 * fail-closed, e um módulo fail-open no meio da cadeia anula a garantia dos
 * outros. Falha alto, na origem, em vez de propagar NaN até a fatura.
 */
function assertValidDate(value: Date, field: string): void {
  if (Number.isNaN(value.getTime())) {
    throw new Error(`billing-courtesy: ${field} é uma data inválida`);
  }
}

/**
 * Uma cortesia vale para `periodStart` quando: não foi revogada, já começou
 * (`startsAt <= periodStart`, fronteira INCLUSIVA — se a concessão começa no
 * mesmo instante em que o período começa, o período inteiro já está coberto)
 * e ainda não terminou (`endsAt === null` ou `periodStart < endsAt`,
 * fronteira EXCLUSIVA — mesma semântica semiaberta `[periodStart, periodEnd)`
 * de billing-clock.ts: se `endsAt` cai exatamente no início do período, esse
 * período já é o primeiro NÃO coberto).
 *
 * Múltiplas cortesias na mesma assinatura resolvem por OR: basta UMA vigente
 * e não revogada para o período inteiro ficar em cortesia — não importa se
 * há outras expiradas ou revogadas na mesma lista.
 */
function isCourtesyActiveAt(courtesy: CourtesyCandidate, periodStart: Date): boolean {
  // `revokedAt` primeiro: uma cortesia revogada não vale, mesmo que suas datas
  // estejam corrompidas — não faz sentido barrar o motor inteiro por causa de
  // uma concessão que já foi desfeita.
  if (courtesy.revokedAt !== null) return false;

  // Datas da PRÓPRIA cortesia também são validadas, e não só `periodStart`.
  // Estas são as mais expostas: `periodStart` é calculado pelo billing-clock,
  // mas `startsAt`/`endsAt` vêm do formulário em que o dono digita a concessão.
  // Sem esta guarda, uma cortesia gravada com data inválida isentaria a empresa
  // para sempre — exatamente o improviso silencioso que a tabela
  // `SubscriptionCourtesy` existe para substituir.
  assertValidDate(courtesy.startsAt, "courtesy.startsAt");
  if (courtesy.endsAt !== null) assertValidDate(courtesy.endsAt, "courtesy.endsAt");

  if (courtesy.startsAt.getTime() > periodStart.getTime()) return false;
  if (courtesy.endsAt !== null && courtesy.endsAt.getTime() <= periodStart.getTime()) {
    return false;
  }
  return true;
}
