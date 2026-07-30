/**
 * Arbitragem de um evento de pagamento do Asaas PELO ESTADO DA OBRIGAÇÃO.
 *
 * 🔥 O defeito que isto conserta (Task 8 do Plano B): o webhook marcava a
 * `Invoice` como `PAID` e nunca tocava na `BillingObligation`. O bootstrap da
 * etapa 2 cria obrigações `ISSUED` amarradas a faturas com PIX vivo, então o
 * cliente pagava, a fatura virava `PAID` e a obrigação ficava `ISSUED` com
 * `dueAt` no passado — o gatilho EXATO de I1, ou seja, restringir o acesso de
 * quem acabou de pagar.
 *
 * E o inverso: com várias TENTATIVAS por obrigação (spec §4.2 — reemitir aponta
 * outra fatura para a mesma obrigação), um `PAYMENT_OVERDUE` atrasado de uma
 * tentativa superada/cancelada pode chegar DEPOIS de a obrigação estar quitada.
 * Hoje ele rebaixaria a assinatura por ser "fatura não manual vencida"
 * (`webhooks/asaas/route.ts`, ramo `PAYMENT_OVERDUE`). Quem paga não pode ser
 * rebaixado por um evento velho.
 *
 * Duas regras de projeto, herdadas de `asaas-payment-target.ts`:
 *
 * 1. **Função PURA.** A ordem dos eventos do Asaas é o coração desta correção e
 *    precisa ser exercitável sem banco, sem rede e sem gateway.
 * 2. **Divergência FALHA FECHADA.** `Invoice.billingObligationId` e
 *    `BillingObligation.invoiceId` são dois ponteiros sem FK que os mantenha em
 *    sincronia (é a mesma armadilha que a fase 2 do motor já trata —
 *    `billing-obligation.service.ts`). Ponteiro torto NÃO promove nem rebaixa:
 *    ele sinaliza revisão humana.
 */

/**
 * Estados possíveis de `BillingObligation.state` (enum `ObligationState`).
 *
 * String larga de propósito: esta função recebe o valor lido do banco e a
 * anotação `ObligationState` do Prisma obrigaria o webhook a importar o enum
 * gerado só para chamar uma função pura. O `switch` exaustivo abaixo cobre o
 * risco — estado desconhecido cai no ramo conservador.
 */
export type ObligationStateName = "PLANNED" | "ISSUED" | "PAID" | "VOID";

/** A obrigação como a arbitragem precisa vê-la. */
export interface ObligationEvidence {
  id: string;
  state: string;
  /**
   * Tentativa VIGENTE da obrigação (`BillingObligation.invoiceId`). É o ponteiro
   * inverso de `Invoice.billingObligationId`; quando ele aponta para OUTRA
   * fatura, a fatura deste evento é tentativa SUPERADA.
   */
  invoiceId: string | null;
  /** `disposition` — só entra no log/diagnóstico, não muda a decisão. */
  disposition: string;
}

export type PromotionDecision =
  /** Promover `PLANNED|ISSUED → PAID` (por CAS no chamador). */
  | { action: "promote" }
  /** Nada a fazer: já quitada, ou não há obrigação vinculada. */
  | { action: "noop"; reason: PromotionNoopReason }
  /** Ponteiro/estado incoerente: não escreve, chama humano. */
  | { action: "needs_review"; reason: string }
  /**
   * Não promove, mas o cliente PAGOU e pode ser restringido por isso.
   *
   * 🔥 Separado de `needs_review` de propósito. Recusar a escrita é fail-closed
   * para o BANCO, mas fail-OPEN para a restrição: a obrigação continua `ISSUED`
   * com `dueAt` no passado, e é exatamente esse par que I1 usa para restringir.
   * Ou seja, o silêncio aqui restringe quem pagou — o defeito que esta task
   * existe para consertar, reaparecendo por outra porta. Este ramo obriga o
   * chamador a ALERTAR alto (Sentry `error`), não a logar e seguir.
   */
  | { action: "paid_but_unresolved"; reason: string };

export type PromotionNoopReason =
  /** Fatura sem `billingObligationId` — fluxo legado/avulso, intacto. */
  | "no_obligation"
  /** Já `PAID`: reenvio do mesmo evento, ou a fase 3 do motor chegou antes. */
  | "already_paid";

export type AccessArbitration =
  /** A obrigação está em aberto e vencível: o evento pode mexer no acesso. */
  | { controls: true }
  /** O evento NÃO pode mexer no acesso, e por quê. */
  | { controls: false; reason: AccessBlockReason };

export type AccessBlockReason =
  /** Obrigação quitada (paga, ou cortesia/interna que nasce quitada). */
  | "obligation_paid"
  /** Obrigação anulada (`voidReason`): o período foi refeito ou perdoado. */
  | "obligation_void"
  /** Esta fatura não é mais a tentativa vigente da obrigação. */
  | "superseded_attempt";

/**
 * O pagamento desta fatura promove a obrigação vinculada?
 *
 * Chamado nos ramos `PAYMENT_CONFIRMED`/`PAYMENT_RECEIVED`.
 *
 * 🔑 **`PAYMENT_CONFIRMED` e `PAYMENT_RECEIVED` promovem OS DOIS.** Não é
 * simetria decorativa: `CONFIRMED` é PIX/cartão (o dinheiro está reconhecido) e
 * `RECEIVED` é boleto compensado. O webhook já marca a fatura `PAID` nos dois
 * (eles compartilham o mesmo `case`), e o Asaas não garante que os dois cheguem
 * nem em que ordem. Promover só num deles deixaria metade dos pagamentos com
 * `Invoice = PAID` e `obligation = ISSUED` — exatamente o defeito desta task,
 * sobrevivendo pela metade. A promoção é idempotente (CAS + `noop` em `PAID`),
 * então receber os dois não faz mal.
 *
 * ⚠️ **CONTRATO COM O CHAMADOR: o CAS tem que guardar `invoiceId` TAMBÉM, não só
 * o estado.** Esta decisão é tomada sobre um ponteiro LIDO antes da escrita.
 * Entre a leitura e o `updateMany`, uma reemissão pode trocar a tentativa
 * vigente; um CAS só por `state: { in: [PLANNED, ISSUED] }` promoveria a
 * obrigação com base num ponteiro que já não vale, quitando o período pela
 * fatura ERRADA. O `where` do chamador precisa repetir `invoiceId`.
 *
 * @param invoiceId       Fatura resolvida por este evento (PK).
 * @param obligation      Obrigação apontada por `Invoice.billingObligationId`,
 *                        ou `null` quando a fatura não tem vínculo.
 */
export function decideObligationPromotion(
  invoiceId: string,
  obligation: ObligationEvidence | null,
): PromotionDecision {
  // Fatura sem vínculo: as 8 faturas legadas de produção e TODA cobrança
  // manual/avulsa são assim, para sempre. O fluxo antigo segue intacto.
  if (!obligation) return { action: "noop", reason: "no_obligation" };

  // A obrigação continua apontando para ESTA fatura? Se ela aponta para outra,
  // esta é uma tentativa SUPERADA (spec §4.2: reemitir aponta outra fatura para
  // a mesma obrigação). Pagar a tentativa velha ainda é dinheiro que entrou — a
  // fatura vira `PAID` no chamador —, mas quitar a obrigação por ela deixaria a
  // tentativa VIGENTE (com PIX vivo no gateway) pendurada e cobrável.
  //
  // ⚠️ `invoiceId: null` é o caso da obrigação `PLANNED` que ainda não reservou
  // tentativa. Uma fatura apontando para ela é vínculo em construção (a fase 2
  // do motor cria a Invoice com `billingObligationId` e só DEPOIS ocupa
  // `obligation.invoiceId`, no mesmo commit) ou vínculo torto. Promover às cegas
  // aqui quitaria uma obrigação que ninguém emitiu — fail-closed.
  if (obligation.invoiceId !== invoiceId) {
    // ⚠️ NÃO é `needs_review` silencioso: dinheiro ENTROU por esta fatura e a
    // obrigação segue em aberto. Se ela estiver `ISSUED` com `dueAt` vencido,
    // I1 restringe justamente quem pagou, e a tentativa vigente continua
    // cobrável — o cliente pode ser bloqueado E cobrado de novo pelo mesmo
    // período. Quitar pela tentativa velha também não serve (deixaria o PIX
    // vigente vivo no gateway), então a saída honesta é ALERTAR ALTO e deixar a
    // reconciliação (cancelar a tentativa vigente, ou quitar à mão) para o
    // operador — ferramenta da Task 9/10.
    return {
      action: "paid_but_unresolved",
      reason:
        `fatura ${invoiceId} paga, mas a obrigação ${obligation.id} (${obligation.state}) ` +
        `tem como tentativa vigente ${obligation.invoiceId ?? "nenhuma"} — ` +
        `reconciliar: risco de restringir e cobrar de novo quem já pagou`,
    };
  }

  switch (obligation.state) {
    case "PAID":
      // Reenvio do mesmo evento, ou a fase 3 do motor já quitou. Idempotente.
      return { action: "noop", reason: "already_paid" };

    case "PLANNED":
    case "ISSUED":
      // `PLANNED` também promove: a fase 3 do motor chama o gateway ANTES de
      // escrever `ISSUED` (`billing-obligation.service.ts` — "a ordem é a
      // garantia"), então um PIX pago na hora pode confirmar enquanto a
      // obrigação ainda está `PLANNED`. Exigir `ISSUED` aqui deixaria esse
      // pagamento sem quitar, e a promoção posterior a `ISSUED` pelo motor já é
      // protegida por CAS `state: PLANNED` — ela perde a corrida e não regride.
      return { action: "promote" };

    case "VOID":
      // 🔑 Obrigação ANULADA não é promovida NUNCA. `VOID` é decisão humana
      // registrada (`voidReason`: duplicata do bootstrap, trial estendido, troca
      // de plano) e o período dela costuma ter sido REFEITO por uma obrigação
      // nova. Promover a anulada para `PAID` marcaria como quitado um período
      // cuja cobrança vigente é outra — e o dinheiro que entrou pertence ao
      // acerto que o operador fez, não a esta linha morta. A fatura vira `PAID`
      // (o financeiro precisa ver o dinheiro); a obrigação, não.
      return {
        action: "needs_review",
        reason: `obrigação ${obligation.id} está VOID — pagamento sobre período anulado`,
      };

    default:
      // Estado novo no enum sem passar por aqui: não inventa semântica.
      return {
        action: "needs_review",
        reason: `estado de obrigação desconhecido: ${obligation.state}`,
      };
  }
}

/**
 * Este evento de atraso/chargeback pode mexer no ACESSO do cliente?
 *
 * Chamado nos ramos `PAYMENT_OVERDUE` e `PAYMENT_CHARGEBACK_*`, e **somado** (não
 * substituindo) à decisão que já existe lá: `subscriptionDbId !== null &&
 * controlsAccess`. Aquela regra responde "esta cobrança é a MENSALIDADE?" pela
 * finalidade persistida em `Invoice.isManual` — uma taxa avulsa vencida não pode
 * trancar a clínica. Esta responde "a dívida deste período ainda está em
 * aberto?". As duas precisam valer ao mesmo tempo.
 *
 * 🔑 Fatura sem obrigação vinculada devolve `controls: true`: é o comportamento
 * de hoje, e o caminho recorrente/legado (as 8 faturas de produção) não pode
 * perder o enforcement porque uma coluna nova está nula. A arbitragem por
 * obrigação só ENDURECE o caso em que há evidência de que a dívida já morreu.
 */
export function arbitrateAccessEvent(
  invoiceId: string | null,
  obligation: ObligationEvidence | null,
): AccessArbitration {
  if (!obligation) return { controls: true };

  // Tentativa superada: o evento fala de uma cobrança que já foi substituída.
  // Sem esta guarda, um `PAYMENT_OVERDUE` atrasado da tentativa antiga
  // rebaixaria a assinatura mesmo com a tentativa vigente paga.
  if (invoiceId !== null && obligation.invoiceId !== invoiceId) {
    return { controls: false, reason: "superseded_attempt" };
  }

  if (obligation.state === "PAID") {
    return { controls: false, reason: "obligation_paid" };
  }
  if (obligation.state === "VOID") {
    return { controls: false, reason: "obligation_void" };
  }

  // `PLANNED`/`ISSUED`: a dívida existe. Quem decide se ela já venceu é I1, pelo
  // `dueAt` — não este módulo.
  return { controls: true };
}

/**
 * O que acontece com a OBRIGAÇÃO num estorno/chargeback de algo já quitado?
 *
 * 🔑 DECISÃO: a obrigação **permanece `PAID`**. O estorno marca a FATURA
 * (`REFUNDED`/`OVERDUE`, comportamento que já existe) e ALERTA; a obrigação não
 * é revertida por webhook.
 *
 * Por quê não reverter para `ISSUED`:
 *   - `dueAt` está no passado. Reverter para `ISSUED` casa o gatilho EXATO de I1
 *     e restringe o cliente AUTOMATICAMENTE, sem ninguém decidir e (pior) sem o
 *     aviso despachado que I3 exige. O webhook não consulta `DunningEvent`.
 *   - O webhook não sabe o MOTIVO do estorno: cortesia do dono, cobrança
 *     duplicada, ou disputa de má-fé. As três pedem ações opostas.
 *   - A política vigente do ramo `PAYMENT_REFUNDED` é explicitamente "marca a
 *     fatura, não mexe no acesso". Ampliá-la aqui seria regressão nova.
 *
 * Por quê não `VOID`: `VOID` significa "anulada por decisão humana registrada em
 * `voidReason`" e o período costuma ter sido REFEITO. Num chargeback a obrigação
 * continua economicamente DEVIDA — marcá-la anulada perdoaria a dívida.
 *
 * 🔴 CONSEQUÊNCIA ACEITA, E É DÍVIDA REAL: `PAID` passa a significar "houve
 * pagamento em algum momento", não "está economicamente quitada". Quem estorna
 * (ou abre chargeback) todo mês fica com acesso de graça, e nenhum relatório que
 * leia só `state = PAID` enxerga isso. O enum atual não tem como expressar
 * "pago e revertido, aguardando decisão" — o estado que falta é um `REVERSED`,
 * e criá-lo é MIGRAÇÃO, fora do escopo desta task. Mitigação de hoje: alerta
 * imediato + a divergência fica consultável cruzando `BillingObligation.state`
 * com `Invoice.status` (`PAID` × `REFUNDED`/`OVERDUE`), que é o par que a tela da
 * Task 10 tem que mostrar. Registrado para não ficar enterrado.
 */
export const REFUND_KEEPS_OBLIGATION_PAID = true;
