import { describe, expect, it } from "vitest";

import {
  canActivateFrom,
  parseRefId,
  resolvePaymentTarget,
  type InvoiceEvidence,
  type PaymentEventRefs,
  type SubscriptionEvidence,
} from "@/lib/asaas-payment-target";

const noRefs: PaymentEventRefs = {
  paymentId: null,
  customerId: null,
  subscriptionRef: null,
  externalRef: null,
};

function invoice(over: Partial<InvoiceEvidence> = {}): InvoiceEvidence {
  return {
    id: "inv-1",
    subscriptionId: "sub-1",
    asaasPaymentId: null,
    status: "PENDING",
    periodEnd: new Date("2026-09-01T00:00:00Z"),
    isManual: false,
    ...over,
  };
}

function subscription(over: Partial<SubscriptionEvidence> = {}): SubscriptionEvidence {
  return {
    id: "sub-1",
    companyId: "co-1",
    status: "TRIAL",
    asaasCustomerId: "cus_1",
    asaasSubscriptionId: null,
    ...over,
  };
}

describe("parseRefId", () => {
  it("lê o id de invoice:<id>", () => {
    expect(parseRefId("invoice:inv-abc", "invoice:")).toBe("inv-abc");
  });

  it("corta no próximo ':' — o bug de company:X:plan:Y", () => {
    // Antes: slice("company:".length) devolvia "X:plan:Y", companyId inválido
    // que nunca casava com nada.
    expect(parseRefId("company:X:plan:Y", "company:")).toBe("X");
  });

  it("devolve null para prefixo errado, vazio ou ausente", () => {
    expect(parseRefId("company:X", "invoice:")).toBeNull();
    expect(parseRefId("invoice:", "invoice:")).toBeNull();
    expect(parseRefId(null, "invoice:")).toBeNull();
  });
});

describe("resolvePaymentTarget — cobrança avulsa (o furo que motivou a correção)", () => {
  it("resolve por invoice:<id> mesmo com asaasPaymentId ainda NULO no banco", () => {
    // A corrida real: o payment id só é persistido depois de criar a cobrança e
    // buscar o QR PIX. Um webhook que chegue no meio não acharia nada.
    const result = resolvePaymentTarget(
      { ...noRefs, paymentId: "pay_1", externalRef: "invoice:inv-1" },
      { byExternalRef: invoice({ asaasPaymentId: null }), invoiceSubscription: subscription() },
    );

    expect(result).toEqual({
      kind: "resolved",
      companyId: "co-1",
      subscriptionDbId: "sub-1",
      invoiceId: "inv-1",
      // período vem da PRÓPRIA fatura, nunca de billingCycle + "agora"
      invoicePeriodEnd: new Date("2026-09-01T00:00:00Z"),
      controlsAccess: true,
    });
  });

  it("não decide quando o externalReference e a assinatura do evento divergem", () => {
    const result = resolvePaymentTarget(
      { ...noRefs, externalRef: "invoice:inv-1", subscriptionRef: "asaas_sub_outra" },
      {
        byExternalRef: invoice(),
        invoiceSubscription: subscription(),
        bySubscriptionRef: subscription({ id: "sub-OUTRA", companyId: "co-OUTRA" }),
      },
    );

    expect(result).toMatchObject({ kind: "conflict" });
  });

  it("não decide quando o pagador diverge do customer da assinatura", () => {
    const result = resolvePaymentTarget(
      { ...noRefs, customerId: "cus_INTRUSO", externalRef: "invoice:inv-1" },
      { byExternalRef: invoice(), invoiceSubscription: subscription({ asaasCustomerId: "cus_1" }) },
    );

    expect(result).toMatchObject({ kind: "conflict" });
  });

  it("não decide quando o pagamento já está registrado em OUTRA fatura", () => {
    // A fatura apontada está com asaasPaymentId nulo, mas o pagamento pertence
    // a outra Invoice. Sem esta checagem marcaríamos a fatura errada como paga
    // e ativaríamos a assinatura dela.
    const result = resolvePaymentTarget(
      { ...noRefs, paymentId: "pay_1", externalRef: "invoice:inv-1" },
      {
        byExternalRef: invoice({ id: "inv-1", asaasPaymentId: null }),
        invoiceSubscription: subscription(),
        byPaymentId: [invoice({ id: "inv-OUTRA", subscriptionId: "sub-OUTRA" })],
      },
    );

    expect(result).toEqual({
      kind: "conflict",
      reason: "payment_ja_registrado_em_outra_fatura",
    });
  });

  it("não decide quando o pagador diverge, também no fallback por paymentId", () => {
    const result = resolvePaymentTarget(
      { ...noRefs, paymentId: "pay_1", customerId: "cus_INTRUSO" },
      {
        byPaymentId: [invoice({ asaasPaymentId: "pay_1" })],
        paymentIdSubscription: subscription({ asaasCustomerId: "cus_1" }),
      },
    );

    expect(result).toMatchObject({ kind: "conflict" });
  });

  it("não decide quando a fatura já está amarrada a outro pagamento", () => {
    const result = resolvePaymentTarget(
      { ...noRefs, paymentId: "pay_NOVO", externalRef: "invoice:inv-1" },
      {
        byExternalRef: invoice({ asaasPaymentId: "pay_ANTIGO" }),
        invoiceSubscription: subscription(),
      },
    );

    expect(result).toMatchObject({ kind: "conflict" });
  });
});

describe("resolvePaymentTarget — caminhos legado e fallback", () => {
  it("resolve pela assinatura recorrente (comportamento atual da ótica)", () => {
    const result = resolvePaymentTarget(
      { ...noRefs, subscriptionRef: "asaas_sub_1" },
      { bySubscriptionRef: subscription({ asaasSubscriptionId: "asaas_sub_1" }) },
    );

    expect(result).toMatchObject({ kind: "resolved", companyId: "co-1", subscriptionDbId: "sub-1" });
  });

  it("conflita quando o paymentId aponta para fatura de OUTRA assinatura", () => {
    // Ignorar a divergência (devolvendo invoiceId null) faria o webhook cair no
    // update por asaasPaymentId e marcar como paga justamente a fatura errada.
    const result = resolvePaymentTarget(
      { ...noRefs, paymentId: "pay_1", subscriptionRef: "asaas_sub_1" },
      {
        bySubscriptionRef: subscription({ asaasSubscriptionId: "asaas_sub_1" }),
        byPaymentId: [invoice({ id: "inv-outra", subscriptionId: "sub-OUTRA" })],
      },
    );

    expect(result).toEqual({
      kind: "conflict",
      reason: "payment_id_aponta_para_outra_assinatura",
    });
  });

  it("conflita quando o pagador diverge, também no caminho recorrente", () => {
    const result = resolvePaymentTarget(
      { ...noRefs, customerId: "cus_INTRUSO", subscriptionRef: "asaas_sub_1" },
      {
        bySubscriptionRef: subscription({
          asaasSubscriptionId: "asaas_sub_1",
          asaasCustomerId: "cus_1",
        }),
      },
    );

    expect(result).toMatchObject({ kind: "conflict" });
  });

  it("falha fechada quando o asaasPaymentId casa em mais de uma fatura", () => {
    // O banco só garante @@unique([subscriptionId, asaasPaymentId]) — o payment
    // id sozinho NÃO é único globalmente.
    const result = resolvePaymentTarget(
      { ...noRefs, paymentId: "pay_1" },
      {
        byPaymentId: [
          invoice({ id: "inv-a", subscriptionId: "sub-a" }),
          invoice({ id: "inv-b", subscriptionId: "sub-b" }),
        ],
      },
    );

    expect(result).toEqual({ kind: "conflict", reason: "asaas_payment_id_ambiguo" });
  });

  it("resolve pelo asaasPaymentId quando é inequívoco", () => {
    const result = resolvePaymentTarget(
      { ...noRefs, paymentId: "pay_1" },
      {
        byPaymentId: [invoice({ asaasPaymentId: "pay_1" })],
        paymentIdSubscription: subscription(),
      },
    );

    expect(result).toMatchObject({ kind: "resolved", invoiceId: "inv-1" });
  });

  it("company:<id> sozinho NÃO resolve — pagamento não pode sumir como processado", () => {
    // Se devolvêssemos só companyId, o webhook marcaria processedAt sem ativar
    // nada e o Asaas nunca reenviaria: o pagamento sumiria em silêncio.
    const result = resolvePaymentTarget(
      { ...noRefs, externalRef: "company:co-1:plan:p1" },
      {},
    );

    expect(result).toEqual({ kind: "unresolved" });
  });

  it("sem nenhuma referência utilizável → unresolved", () => {
    expect(resolvePaymentTarget(noRefs, {})).toEqual({ kind: "unresolved" });
  });
});

describe("controlsAccess — finalidade da cobrança", () => {
  it("cobrança AVULSA (isManual) não controla acesso", () => {
    // Pagar taxa de implantação/hardware não compra mensalidade; e deixá-la
    // vencer não pode trancar a clínica.
    const result = resolvePaymentTarget(
      { ...noRefs, externalRef: "invoice:inv-1" },
      {
        byExternalRef: invoice({ isManual: true }),
        invoiceSubscription: subscription(),
      },
    );

    expect(result).toMatchObject({ kind: "resolved", controlsAccess: false });
  });

  it("fatura do ciclo da assinatura controla acesso", () => {
    const result = resolvePaymentTarget(
      { ...noRefs, externalRef: "invoice:inv-1" },
      {
        byExternalRef: invoice({ isManual: false }),
        invoiceSubscription: subscription(),
      },
    );

    expect(result).toMatchObject({ kind: "resolved", controlsAccess: true });
  });

  it("mensalidade standalone (sem subRef no evento) MANTÉM o enforcement", () => {
    // ensureInvoiceCharge cai no caminho standalone quando o sync não produz
    // URL. Essa cobrança de mensalidade é legítima e não traz
    // payment.subscription — decidir por "tem subRef?" perderia enforcement.
    const result = resolvePaymentTarget(
      { ...noRefs, externalRef: "invoice:inv-1" },
      {
        byExternalRef: invoice({ isManual: false }),
        invoiceSubscription: subscription(),
      },
    );

    expect(result).toMatchObject({ controlsAccess: true });
  });
});

describe("canActivateFrom — pagamento recupera estado AUTOMÁTICO", () => {
  it("ativa a partir de TRIAL e PAST_DUE", () => {
    expect(canActivateFrom("TRIAL")).toBe(true);
    expect(canActivateFrom("PAST_DUE")).toBe(true);
  });

  it("ativa a partir de SUSPENDED e TRIAL_EXPIRED (estados automáticos)", () => {
    // 🔥 O dunning SUSPENDE sozinho aos 14 dias e o subscription-watch carimba
    // TRIAL_EXPIRED sozinho. Excluí-los faria o cliente pagar e continuar
    // bloqueado — o mesmo defeito que esta correção existe para consertar.
    expect(canActivateFrom("SUSPENDED")).toBe(true);
    expect(canActivateFrom("TRIAL_EXPIRED")).toBe(true);
  });

  it("NÃO ressuscita assinatura CANCELED (único terminal, decisão deliberada)", () => {
    expect(canActivateFrom("CANCELED")).toBe(false);
  });
});
