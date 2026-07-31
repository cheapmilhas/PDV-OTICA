import type { ObligationDisposition, ObligationState } from "@prisma/client";

/**
 * Regras PURAS de "o contrato mudou — o que fazer com a obrigação já
 * materializada?" (spec §4.1.2 e §4.1.3, Task 9 do Plano B).
 *
 * O problema que isto fecha: a emissão é ANTECIPADA (`ISSUE_LEAD_DAYS`), então
 * existe uma janela em que a obrigação do período seguinte já está gravada — com
 * plano, ciclo e preço congelados — e o contrato muda por baixo dela. A troca de
 * plano escreve `Subscription.planId` no ato (`admin/clientes/[id]/actions`,
 * `domus-plan-change/deps.ts`) e a extensão de trial escreve `trialEndsAt`, e
 * nenhuma das duas olhava para `billing_obligations`. Resultado: a obrigação
 * cobra o plano A enquanto o entitlement publica o plano B, ou cobra dias que
 * voltaram a ser gratuitos.
 *
 * Módulo PURO pelo mesmo motivo de `billing-obligation.ts` e
 * `billing-courtesy.ts`: errar esta decisão mexe em dinheiro de cliente real num
 * gateway que NÃO tem sandbox. Aqui não há Prisma, não há rede e não há
 * `new Date()` sem argumento — toda entrada vem do chamador.
 *
 * 🔑 ESTA FUNÇÃO NÃO CALCULA PREÇO. Ela decide *se* o preço pode ser recalculado
 * e por quem. O preço em si continua saindo de `resolveObligationPriceCents`, e
 * quem o aplica de fato é a fase 2 do motor (`reserveAttempt`), sob advisory
 * lock. Ver `RECALC_IS_A_HANDOFF` abaixo — a duplicação da conta aqui seria a
 * quarta divergência desta branch.
 */

/**
 * 🔑 O RECÁLCULO É UM *HANDOFF*, NÃO UMA SEGUNDA IMPLEMENTAÇÃO.
 *
 * A fase 2 do motor (`billing-obligation.service.ts`, `reserveAttempt`) já faz,
 * sob o MESMO advisory lock da empresa e no MESMO commit da reserva da fatura:
 * relê a obrigação, recalcula `disposition` a partir das cortesias, recalcula
 * `priceCents` a partir do plano de AGORA, regrava `planId`, e ainda mantém
 * `invoice.total` e `invoice.dueDate` em sincronia. Ela é a única escritora do
 * preço de uma obrigação `PLANNED`.
 *
 * Se a Task 9 recalculasse o preço por conta própria a partir da rota do admin,
 * teríamos DOIS escritores da mesma coluna, com leituras diferentes, fora do
 * mesmo lock — e a rota admin nem segura o lock da empresa. Duas contas do mesmo
 * número divergem no primeiro reajuste; três já divergiram nesta branch.
 *
 * Então a decisão desta task para o caso recalculável é: **invalidar o
 * congelamento e deixar a fase 2 refazer a conta**. Concretamente, apagar da
 * obrigação `PLANNED` os carimbos de emissão (`dueAt`) que possam ter ficado de
 * uma reserva anterior e registrar a mudança — e NÃO reescrever `priceCents`
 * aqui. O motor emite ANTES do período começar, e enquanto a obrigação estiver
 * `PLANNED` ele a retoma em toda rodada (precedência "trabalho pendente antes de
 * trabalho novo"), então a próxima rodada aplica o plano novo sozinha.
 */
export const RECALC_IS_A_HANDOFF = true;

/** A obrigação como esta decisão precisa vê-la. */
export interface ObligationForRecalc {
  id: string;
  state: ObligationState;
  disposition: ObligationDisposition;
  /** Plano congelado na obrigação — comparado com o plano novo do contrato. */
  planId: string;
  periodStart: Date;
  periodEnd: Date;
}

/** O que mudou no contrato. */
export type ContractChange =
  /** Troca de plano: `Subscription.planId` mudou (§4.1.2). */
  | { kind: "plan_change"; fromPlanId: string; toPlanId: string }
  /**
   * Extensão de trial: `trialEndsAt` foi empurrado para frente (§4.1.3). O
   * período que voltou a ser gratuito é `[oldTrialEndsAt, newTrialEndsAt)`.
   */
  | { kind: "trial_extension"; oldTrialEndsAt: Date | null; newTrialEndsAt: Date };

export type RecalcAction =
  /**
   * A obrigação ainda não foi emitida: invalidar o congelamento e deixar a
   * fase 2 do motor refazer a conta com o contrato de agora. Nenhum dinheiro
   * mudou de mãos, nenhuma cobrança existe no gateway.
   */
  | { action: "recalculate"; reason: string }
  /**
   * 🚨 A cobrança JÁ EXISTE no gateway. Preço mantido, decisão registrada em
   * `voidReason` e ALERTA para o operador (spec §4.1.2: "mantida com o preço
   * antigo por decisão explícita registrada").
   *
   * Ver `WHY_ISSUED_IS_NEVER_TOUCHED_AUTOMATICALLY`.
   */
  | { action: "keep_and_alert"; reason: string; voidReason: string }
  /** Nada a fazer — e por quê (não é erro; é o caso normal). */
  | { action: "noop"; reason: RecalcNoopReason };

export type RecalcNoopReason =
  /** Obrigação já quitada ou já anulada: período encerrado. */
  | "settled"
  /** Isenta (cortesia/interna/passado regularizado): não há preço a recalcular. */
  | "not_chargeable"
  /** A obrigação já é do plano novo — a troca não a afeta. */
  | "same_plan"
  /** O período da obrigação não intersecta os dias que voltaram a ser grátis. */
  | "period_not_affected";

/**
 * 🚨 POR QUE UMA OBRIGAÇÃO `ISSUED` NUNCA É ANULADA NEM REEMITIDA AQUI.
 *
 * A spec §4.1.2 oferece duas saídas para a obrigação já emitida — "cancelada e
 * reemitida, **ou** mantida com o preço antigo por decisão explícita
 * registrada". Esta task escolhe a SEGUNDA, e a escolha não é preferência de
 * estilo:
 *
 * 1. **Anular local não cancela no gateway.** `ISSUED` significa que a fase 3 do
 *    motor já chamou o Asaas: existe uma cobrança com PIX e boleto VIVOS na mão
 *    do cliente. Marcar a linha `VOID` aqui não toca no gateway — foi exatamente
 *    esse descasamento que barrou o bootstrap. O cliente continuaria podendo
 *    pagar um período "anulado", e `decideObligationPromotion` manda pagamento
 *    sobre `VOID` para revisão humana (`asaas-obligation-arbitration.ts`): a
 *    anulação automática FABRICA o caso que aquele módulo trata como incidente.
 *
 * 2. **Reemitir gera cobrança dupla REAL.** A substituta nasceria `PLANNED`, o
 *    motor a emitiria na rodada seguinte com chave de idempotência nova
 *    (`invoice:<id>` de outra fatura, logo o Asaas NÃO deduplica) e o cliente
 *    receberia duas cobranças do mesmo mês. O gateway é produção sem sandbox: o
 *    modo de falha aceitável desta cadeia inteira é "não cobrou e avisou", nunca
 *    "cobrou duas vezes".
 *
 * 3. **Cancelar no gateway é decisão de dinheiro, não de rota de CRUD.** Existe
 *    `asaas.payments.delete`, mas chamá-lo a partir de uma troca de plano no
 *    painel do admin faria um clique de configuração apagar uma cobrança que o
 *    cliente pode estar pagando neste segundo (o webhook chega depois). O
 *    caminho honesto é o mesmo que o repo já usa para
 *    `CANCELED`/`REFUNDED` (`decideOnExistingCharge`): sinaliza e o humano
 *    decide.
 *
 * O custo aceito, dito sem maquiagem: entre a emissão e o fim do período, um
 * upgrade cobra o plano ANTIGO por um período em que o cliente já tem o plano
 * NOVO — a diferença fica a favor do cliente até o período seguinte. É um mês de
 * defasagem, visível e registrado, contra o risco de cobrar duas vezes. Se o
 * dono quiser cobrar a diferença, a ferramenta é a cobrança avulsa que já
 * existe, com um humano olhando.
 */
export const WHY_ISSUED_IS_NEVER_TOUCHED_AUTOMATICALLY = true;

export interface RecalcInput {
  obligation: ObligationForRecalc;
  change: ContractChange;
}

/**
 * O que fazer com uma obrigação já materializada quando o contrato muda.
 *
 * A ordem das guardas importa e é fail-closed:
 *
 * 1. `PAID`/`VOID` → `noop`. Período encerrado; mexer nele reabriria dívida
 *    quitada ou ressuscitaria linha morta. Lembrando que `PAID` significa "houve
 *    pagamento", não "está economicamente quitada"
 *    (`asaas-obligation-arbitration.ts`, dívida registrada) — mais um motivo
 *    para não tocar: a decisão sobre um período pago-e-estornado é humana.
 *
 * 2. Disposição ≠ `CHARGE` → `noop`. Cortesia, conta interna e passado
 *    regularizado não têm preço a recalcular, e essas linhas nascem `PAID`. Um
 *    "recálculo" sobre elas só poderia produzir uma isenta em estado errado — e
 *    isenta `PLANNED` TRAVA a assinatura para sempre (o motor devolve `settled`
 *    a cada rodada, sem cobrar e sem alertar ninguém: achado real da revisão da
 *    Task 5). Esta guarda existe para que este módulo nunca reintroduza aquilo.
 *
 * 3. Mudança que não afeta ESTA obrigação → `noop`. Troca para o mesmo plano;
 *    extensão de trial que não alcança o período.
 *
 * 4. `ISSUED` → `keep_and_alert`. Só depois de saber que a mudança de fato
 *    afetaria a obrigação — alertar sobre uma emitida que a mudança não toca
 *    seria ruído, e ruído treina o operador a ignorar o alerta que importa.
 *
 * 5. `PLANNED` → `recalculate`.
 */
export function decideObligationRecalc(input: RecalcInput): RecalcAction {
  const { obligation, change } = input;

  if (obligation.state === "PAID" || obligation.state === "VOID") {
    return { action: "noop", reason: "settled" };
  }

  if (obligation.disposition !== "CHARGE") {
    return { action: "noop", reason: "not_chargeable" };
  }

  if (change.kind === "plan_change") {
    // A obrigação já está no plano-alvo. Acontece de verdade: dois cliques na
    // mesma troca, ou a obrigação materializada DEPOIS da escrita do `planId`.
    if (obligation.planId === change.toPlanId) {
      return { action: "noop", reason: "same_plan" };
    }

    if (obligation.state === "ISSUED") {
      return {
        action: "keep_and_alert",
        reason:
          `obrigação ${obligation.id} já emitida no plano ${obligation.planId}; ` +
          `troca para ${change.toPlanId} NÃO altera esta cobrança`,
        voidReason: keepDecision(
          `troca de plano ${change.fromPlanId} → ${change.toPlanId} após a emissão`,
        ),
      };
    }

    return {
      action: "recalculate",
      reason: `plano mudou de ${change.fromPlanId} para ${change.toPlanId} antes da emissão`,
    };
  }

  // ── Extensão de trial ────────────────────────────────────────────────────
  //
  // Os dias que voltaram a ser gratuitos são `[oldTrialEndsAt, newTrialEndsAt)`.
  // Só a obrigação cujo período INTERSECTA essa faixa é afetada.
  //
  // ⚠️ `oldTrialEndsAt` nulo é fail-CLOSED, e de propósito: sem saber onde o
  // trial terminava, não dá para saber quais dias viraram grátis. Tratar como
  // "não afetada" deixaria passar exatamente o caso que a §4.1.3 descreve, então
  // a faixa vira "tudo até o novo fim" — a leitura mais abrangente.
  const freeFrom = change.oldTrialEndsAt;
  const freeUntil = change.newTrialEndsAt;
  assertValidDate(freeUntil, "newTrialEndsAt");
  if (freeFrom !== null) assertValidDate(freeFrom, "oldTrialEndsAt");
  assertValidDate(obligation.periodStart, "obligation.periodStart");
  assertValidDate(obligation.periodEnd, "obligation.periodEnd");

  // Extensão que ANDA PARA TRÁS não é extensão: ninguém ganhou dia nenhum e o
  // período não voltou a ser gratuito. Sem esta guarda a faixa ficaria invertida
  // e a interseção abaixo daria sempre `false` em silêncio — o mesmo modo de
  // falha que `periodsOverlap` recusa em `billing-obligation.ts`.
  if (freeFrom !== null && freeUntil.getTime() <= freeFrom.getTime()) {
    return { action: "noop", reason: "period_not_affected" };
  }

  // Interseção semiaberta, coerente com `billing-clock` e `periodsOverlap`: a
  // obrigação que COMEÇA exatamente onde o trial novo termina não foi afetada —
  // ela é justamente o primeiro período pago depois da extensão.
  const afetada =
    obligation.periodStart.getTime() < freeUntil.getTime() &&
    (freeFrom === null || freeFrom.getTime() < obligation.periodEnd.getTime());

  if (!afetada) {
    return { action: "noop", reason: "period_not_affected" };
  }

  if (obligation.state === "ISSUED") {
    return {
      action: "keep_and_alert",
      reason:
        `obrigação ${obligation.id} já emitida cobre dias que voltaram a ser ` +
        `gratuitos (trial estendido até ${freeUntil.toISOString()})`,
      voidReason: keepDecision(
        `trial estendido até ${freeUntil.toISOString()} após a emissão`,
      ),
    };
  }

  return {
    action: "recalculate",
    reason: `trial estendido até ${freeUntil.toISOString()} antes da emissão`,
  };
}

/**
 * Texto gravado em `BillingObligation.voidReason` no caso `keep_and_alert`.
 *
 * ⚠️ O campo se chama `voidReason` e a obrigação **não** é anulada — a escolha
 * é deliberada e o prefixo existe para que ninguém leia a linha ao contrário. O
 * schema descreve `voidReason` como "motivo obrigatório em `VOID`"; aqui ele
 * carrega a DECISÃO EXPLÍCITA que a spec §4.1.2 exige registrar para manter o
 * preço antigo. Criar uma coluna nova só para esta frase seria migração, e o
 * prefixo `MANTIDA:` deixa as duas leituras distinguíveis por `LIKE` na tela da
 * Task 10 sem tocar no schema.
 */
export function keepDecision(detail: string): string {
  return `MANTIDA: ${detail}`;
}

/** Prefixo de `keepDecision`, para a tela/consulta distinguir de uma anulação real. */
export const KEEP_DECISION_PREFIX = "MANTIDA: ";

/**
 * Rejeita `Invalid Date` — mesma guarda de `billing-clock`, `billing-courtesy` e
 * `billing-obligation`. Com NaN toda comparação vira `false`, a interseção diria
 * "período não afetado" e a extensão de trial passaria batida em silêncio: o
 * defeito que esta task existe para fechar, reaparecendo por dentro dela.
 */
function assertValidDate(value: Date, field: string): void {
  if (Number.isNaN(value.getTime())) {
    throw new Error(`obligation-recalc: ${field} é uma data inválida`);
  }
}
