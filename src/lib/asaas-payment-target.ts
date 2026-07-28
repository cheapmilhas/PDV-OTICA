/**
 * Quem é o alvo de um evento de pagamento do Asaas — e se ele tem AUTORIDADE
 * para mexer no acesso do cliente.
 *
 * 🔥 O defeito que isto conserta: o webhook só resolvia a empresa por
 * `asaasSubscriptionId` (assinatura recorrente) ou pelo prefixo `company:`.
 * A cobrança AVULSA sai com `externalReference = "invoice:<id>"`
 * (invoice-charge.service.ts), então ela caía fora: a fatura virava PAID, a
 * Subscription NUNCA virava ACTIVE e o entitlement nunca era publicado — o
 * cliente pagava e continuava bloqueado.
 *
 * Duas regras de projeto, ambas vindas de defeito real:
 *
 * 1. **Este módulo devolve EVIDÊNCIA, não decisão de cobrança.** Ele diz
 *    "aponta para esta Invoice/Subscription" e "as referências concordam ou
 *    não". Se o pagamento ATIVA acesso é política do ramo do webhook — porque
 *    `createManualCharge` aceita valor e descrição arbitrários (taxa de
 *    implantação, hardware...). Tratar toda cobrança avulsa paga como "comprou
 *    mensalidade" faria pagar uma taxa ATIVAR a assinatura, e deixar essa taxa
 *    vencer BLOQUEAR a clínica.
 *
 * 2. **Referência ambígua ou contraditória FALHA FECHADA.** Precedência entre
 *    identificadores não é validação: se o `externalReference` aponta para uma
 *    Invoice e o `payment.subscription` para OUTRA assinatura, o certo é não
 *    decidir (o webhook devolve 500 e o Asaas reenvia) em vez de escolher a
 *    primeira que casar e mexer no acesso da empresa errada.
 */

/** Referência do tipo `invoice:<id>`, emitida pela cobrança avulsa. */
export const INVOICE_REF_PREFIX = "invoice:";
/** Referência do tipo `company:<id>` (e variantes com sufixo, ex.: `:plan:X`). */
export const COMPANY_REF_PREFIX = "company:";

/** Invoice como o resolvedor precisa vê-la (subconjunto do model Prisma). */
export interface InvoiceEvidence {
  id: string;
  subscriptionId: string;
  asaasPaymentId: string | null;
  status: string;
  /** Fim do período coberto por ESTA fatura — fonte do período, se ativar. */
  periodEnd: Date | null;
  /**
   * `true` = cobrança AVULSA criada à mão (`createManualCharge`), com valor e
   * descrição arbitrários: taxa de implantação, hardware, acerto.
   * `false` = fatura do ciclo da assinatura.
   *
   * É o discriminador de FINALIDADE. Sem ele, "pagou algo" viraria "pagou a
   * mensalidade" e uma taxa quitada estenderia acesso que ninguém comprou.
   */
  isManual: boolean;
}

/** Subscription como o resolvedor precisa vê-la. */
export interface SubscriptionEvidence {
  id: string;
  companyId: string;
  status: string;
  asaasCustomerId: string | null;
  asaasSubscriptionId: string | null;
}

export interface PaymentEventRefs {
  /** `event.payment.id` */
  paymentId: string | null;
  /** `event.payment.customer` — customer Asaas do pagador. */
  customerId: string | null;
  /** `event.payment.subscription` — assinatura recorrente Asaas, se houver. */
  subscriptionRef: string | null;
  /** `event.payment.externalReference` */
  externalRef: string | null;
}

export type TargetResolution =
  | {
      kind: "resolved";
      companyId: string;
      subscriptionDbId: string;
      invoiceId: string | null;
      /**
       * Fim do período coberto pela fatura resolvida, quando há uma.
       *
       * A fonte é a PRÓPRIA fatura, nunca `billingCycle` + "agora": derivar a
       * data no webhook criaria uma segunda verdade, divergindo do período que
       * a Invoice já carrega e deslocando o período do checkout para a data do
       * pagamento.
       */
      invoicePeriodEnd: Date | null;
      /**
       * Esta cobrança tem AUTORIDADE sobre o acesso do cliente?
       *
       * `false` para cobrança avulsa (`Invoice.isManual`): pagar uma taxa de
       * implantação não compra mensalidade, e deixá-la vencer não pode trancar
       * a clínica. A fatura ainda é marcada (PAID/OVERDUE) — o financeiro
       * precisa vê-la —, mas assinatura e entitlement não se mexem.
       *
       * 🔑 Isto NÃO é o mesmo que "o evento traz assinatura recorrente": o
       * `ensureInvoiceCharge` cai no caminho standalone (sem
       * `payment.subscription`) quando o sync não produz URL, e essa cobrança
       * de MENSALIDADE é legítima e precisa manter o enforcement. Quem decide é
       * a finalidade PERSISTIDA na fatura, não o formato do evento do Asaas.
       */
      controlsAccess: boolean;
    }
  | { kind: "unresolved" }
  | { kind: "conflict"; reason: string };

/**
 * Extrai o id de uma referência com prefixo.
 *
 * 🔥 Bug pré-existente que isto conserta: `externalRef.slice("company:".length)`
 * sobre `"company:X:plan:Y"` devolvia `"X:plan:Y"` — um companyId inválido que
 * nunca casaria com nada. O id vai até o PRÓXIMO ":", não até o fim da string.
 */
export function parseRefId(ref: string | null, prefix: string): string | null {
  if (!ref || !ref.startsWith(prefix)) return null;
  const id = ref.slice(prefix.length).split(":")[0]?.trim();
  return id ? id : null;
}

/**
 * Decide o alvo a partir da evidência já carregada do banco.
 *
 * PURA de propósito: as regras de concordância são o coração da segurança desta
 * correção e precisam ser testáveis sem banco, sem Asaas e sem rede.
 */
export function resolvePaymentTarget(
  refs: PaymentEventRefs,
  evidence: {
    /** Invoice achada por `invoice:<id>` (PK — imune à corrida do asaasPaymentId). */
    byExternalRef?: InvoiceEvidence | null;
    /** Subscription achada por `asaasSubscriptionId` (caminho recorrente). */
    bySubscriptionRef?: SubscriptionEvidence | null;
    /** Subscription dona da Invoice de `byExternalRef`. */
    invoiceSubscription?: SubscriptionEvidence | null;
    /**
     * Invoices achadas por `asaasPaymentId` (fallback). MAIS DE UMA = ambíguo:
     * o banco só garante `@@unique([subscriptionId, asaasPaymentId])`, não
     * unicidade global do payment id.
     */
    byPaymentId?: InvoiceEvidence[];
    /** Subscription dona da Invoice única de `byPaymentId`. */
    paymentIdSubscription?: SubscriptionEvidence | null;
  },
): TargetResolution {
  const {
    byExternalRef,
    bySubscriptionRef,
    invoiceSubscription,
    byPaymentId = [],
    paymentIdSubscription,
  } = evidence;

  // 1) Caminho mais forte: externalReference `invoice:<id>` → PK da Invoice.
  if (byExternalRef) {
    const sub = invoiceSubscription;
    if (!sub || sub.id !== byExternalRef.subscriptionId) {
      return { kind: "conflict", reason: "invoice_sem_subscription_carregada" };
    }

    // O evento traz assinatura recorrente que aponta para OUTRA subscription?
    // Não é caso de escolher — é caso de não decidir.
    if (bySubscriptionRef && bySubscriptionRef.id !== sub.id) {
      return { kind: "conflict", reason: "external_ref_e_subscription_ref_divergem" };
    }

    // Pagador diferente do customer da assinatura dona da fatura.
    if (
      refs.customerId &&
      sub.asaasCustomerId &&
      refs.customerId !== sub.asaasCustomerId
    ) {
      return { kind: "conflict", reason: "customer_do_evento_diverge_da_assinatura" };
    }

    // A fatura já está amarrada a OUTRO pagamento do Asaas.
    if (
      refs.paymentId &&
      byExternalRef.asaasPaymentId &&
      byExternalRef.asaasPaymentId !== refs.paymentId
    ) {
      return { kind: "conflict", reason: "invoice_amarrada_a_outro_payment" };
    }

    // O MESMO pagamento já está registrado em OUTRA fatura.
    //
    // 🔑 Não basta checar o lado da fatura apontada: se `byExternalRef` está com
    // `asaasPaymentId` nulo mas este pagamento já pertence a outra Invoice, sem
    // esta checagem marcaríamos a fatura errada como paga (e ativaríamos a
    // assinatura dela). O `@@unique([subscriptionId, asaasPaymentId])` não
    // protege entre assinaturas diferentes.
    if (byPaymentId.length > 1) {
      return { kind: "conflict", reason: "asaas_payment_id_ambiguo" };
    }
    if (byPaymentId.length === 1 && byPaymentId[0].id !== byExternalRef.id) {
      return { kind: "conflict", reason: "payment_ja_registrado_em_outra_fatura" };
    }

    return {
      kind: "resolved",
      companyId: sub.companyId,
      subscriptionDbId: sub.id,
      invoiceId: byExternalRef.id,
      invoicePeriodEnd: byExternalRef.periodEnd,
      controlsAccess: !byExternalRef.isManual,
    };
  }

  // 2) Caminho legado/recorrente: asaasSubscriptionId.
  if (bySubscriptionRef) {
    // Pagador diverge do customer da assinatura → não decidir (mesma checagem
    // do caminho `invoice:`; sem ela o caminho recorrente ficaria menos
    // protegido que o novo).
    if (
      refs.customerId &&
      bySubscriptionRef.asaasCustomerId &&
      refs.customerId !== bySubscriptionRef.asaasCustomerId
    ) {
      return { kind: "conflict", reason: "customer_do_evento_diverge_da_assinatura" };
    }

    // Ambiguidade do payment id vale aqui também.
    if (byPaymentId.length > 1) {
      return { kind: "conflict", reason: "asaas_payment_id_ambiguo" };
    }

    const single = byPaymentId.length === 1 ? byPaymentId[0] : null;
    // 🔑 Fatura de OUTRA assinatura não pode ser apenas IGNORADA: devolver
    // `invoiceId: null` faria o webhook cair no update por `asaasPaymentId`, que
    // atingiria justamente a fatura divergente. Isso violaria a promessa deste
    // módulo ("conflito → não escolher"), então é conflito de verdade.
    if (single && single.subscriptionId !== bySubscriptionRef.id) {
      return { kind: "conflict", reason: "payment_id_aponta_para_outra_assinatura" };
    }

    return {
      kind: "resolved",
      companyId: bySubscriptionRef.companyId,
      subscriptionDbId: bySubscriptionRef.id,
      invoiceId: single?.id ?? null,
      invoicePeriodEnd: single?.periodEnd ?? null,
      // Sem fatura identificada, a assinatura recorrente do evento é a própria
      // evidência de mensalidade — mantém o enforcement de hoje.
      controlsAccess: single ? !single.isManual : true,
    };
  }

  // 3) Fallback por asaasPaymentId — só se for INEQUÍVOCO.
  if (byPaymentId.length > 1) {
    return { kind: "conflict", reason: "asaas_payment_id_ambiguo" };
  }
  if (byPaymentId.length === 1) {
    const invoice = byPaymentId[0];
    const sub = paymentIdSubscription;
    if (!sub || sub.id !== invoice.subscriptionId) {
      return { kind: "conflict", reason: "invoice_sem_subscription_carregada" };
    }
    // O customer do EVENTO é autoritativo (vem do Asaas); o vínculo
    // payment↔Invoice é local e pode estar errado. Divergiu, não decide.
    if (refs.customerId && sub.asaasCustomerId && refs.customerId !== sub.asaasCustomerId) {
      return { kind: "conflict", reason: "customer_do_evento_diverge_da_assinatura" };
    }
    return {
      kind: "resolved",
      companyId: sub.companyId,
      subscriptionDbId: sub.id,
      invoiceId: invoice.id,
      invoicePeriodEnd: invoice.periodEnd,
      controlsAccess: !invoice.isManual,
    };
  }

  // 4) Nada resolveu. NÃO devolvemos "só companyId" a partir de `company:<id>`:
  //    empresa sem subscription resolvida faria o webhook marcar o evento como
  //    processado sem ativar nada — o pagamento sumiria em silêncio.
  return { kind: "unresolved" };
}

/**
 * A subscription pode ser ATIVADA por um pagamento?
 *
 * 🔥 Aqui eu errei primeiro copiando a política do `mark_paid` manual
 * (`admin/faturas/[id]/workflow`), que só reativa de TRIAL/PAST_DUE. Aquele
 * caminho é um HUMANO marcando uma fatura à mão; este é o CLIENTE PAGANDO de
 * verdade — não são a mesma decisão.
 *
 * Com a lista curta, quem o cron de dunning suspendeu automaticamente aos 14
 * dias (`cron/dunning` → status SUSPENDED) pagaria e continuaria bloqueado:
 * exatamente o defeito que esta correção existe para consertar, só que num
 * lugar novo. O mesmo vale para `TRIAL_EXPIRED`, que o `subscription-watch`
 * carimba sozinho. O e-mail de suspensão inclusive PROMETE a volta do acesso
 * após regularizar, e a ação `reactivate` do admin já faz SUSPENDED → ACTIVE.
 *
 * `CANCELED` fica de fora e é o único estado terminal: é decisão deliberada
 * (dono cancelou, ou o dunning cancelou aos 30 dias após avisos). Um webhook
 * atrasado — "fatura antiga chegando depois" — não pode ressuscitá-lo.
 */
export const ACTIVATABLE_FROM = [
  "TRIAL",
  "PAST_DUE",
  "SUSPENDED",
  "TRIAL_EXPIRED",
] as const;

export type ActivatableStatus = (typeof ACTIVATABLE_FROM)[number];

export function canActivateFrom(status: string): boolean {
  return (ACTIVATABLE_FROM as readonly string[]).includes(status);
}
