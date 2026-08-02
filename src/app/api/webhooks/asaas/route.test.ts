import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for POST /api/webhooks/asaas
 *
 * Focus: Task 8 — PAYMENT_CONFIRMED fires notifyCompany; PAYMENT_OVERDUE does NOT.
 *
 * Strategy: mock all heavy I/O (prisma, asaas, rate-limit, posthog, sentry,
 * logger, saas-notification) so the handler runs without side-effects.
 * HMAC verification and token checks are stubbed to always pass (no secret set →
 * dev bypass; token mock returns true).
 */

// ─── mocks declared BEFORE vi.mock (hoisting) ────────────────────────────────

const notifyCompany = vi.fn();
vi.mock("@/services/saas-notification.service", () => ({
  notifyCompany: (...a: unknown[]) => notifyCompany(...a),
}));

// vis-domus-publisher — no-op stub (evita I/O real do publisher no webhook)
const publishEntitlementForCompany = vi.fn();
vi.mock("@/lib/vis-domus-publisher", () => ({
  publishEntitlementForCompany: (...a: unknown[]) => publishEntitlementForCompany(...a),
}));

// prisma
const billingEventFindUnique = vi.fn();
const billingEventUpsert = vi.fn();
const billingEventUpdate = vi.fn();
const subscriptionFindFirst = vi.fn();
const subscriptionFindUnique = vi.fn();
const subscriptionUpdate = vi.fn();
const subscriptionUpdateMany = vi.fn();
const invoiceUpdate = vi.fn();
const invoiceUpdateMany = vi.fn();
const invoiceFindUnique = vi.fn();
const invoiceFindMany = vi.fn();
const companyFindUnique = vi.fn();
const billingObligationUpdateMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    billingEvent: {
      findUnique: (...a: unknown[]) => billingEventFindUnique(...a),
      upsert: (...a: unknown[]) => billingEventUpsert(...a),
      update: (...a: unknown[]) => billingEventUpdate(...a),
    },
    subscription: {
      findFirst: (...a: unknown[]) => subscriptionFindFirst(...a),
      findUnique: (...a: unknown[]) => subscriptionFindUnique(...a),
      update: (...a: unknown[]) => subscriptionUpdate(...a),
      updateMany: (...a: unknown[]) => subscriptionUpdateMany(...a),
    },
    invoice: {
      update: (...a: unknown[]) => invoiceUpdate(...a),
      updateMany: (...a: unknown[]) => invoiceUpdateMany(...a),
      findUnique: (...a: unknown[]) => invoiceFindUnique(...a),
      findMany: (...a: unknown[]) => invoiceFindMany(...a),
    },
    company: {
      findUnique: (...a: unknown[]) => companyFindUnique(...a),
    },
    billingObligation: {
      updateMany: (...a: unknown[]) => billingObligationUpdateMany(...a),
    },
  },
}));

// asaas — verifyWebhookToken always passes
const verifyWebhookToken = vi.fn().mockReturnValue(true);
vi.mock("@/lib/asaas", () => ({
  asaas: { verifyWebhookToken: (...a: unknown[]) => verifyWebhookToken(...a) },
}));

// rate-limit — never limit in tests
vi.mock("@/lib/rate-limit", () => ({
  rateLimitResponse: () => null,
}));

// posthog — no-op
const trackServer = vi.fn();
vi.mock("@/lib/posthog-server", () => ({
  trackServer: (...a: unknown[]) => trackServer(...a),
}));

// sentry — spy COMPARTILHADO (hoistado), não `vi.fn()` anônimo dentro da
// factory. Os três ramos de ALERTA da Task 8 (`paid_but_unresolved`,
// `needs_review`, estorno sobre obrigação quitada) não escrevem nada no banco:
// o alerta É o efeito observável. Com a fn presa dentro da factory nenhum teste
// conseguia afirmar sobre ela, e desligar o ramo `paid_but_unresolved` inteiro
// mantinha a suíte VERDE — o alarme mais crítico da task sem um único teste.
const { captureMessage } = vi.hoisted(() => ({ captureMessage: vi.fn() }));
vi.mock("@/lib/sentry", () => ({ captureMessage }));

// logger — no-op
vi.mock("@/lib/logger", () => ({
  logger: {
    child: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
  },
}));

// ─── import route AFTER all vi.mock calls ─────────────────────────────────────
import { POST } from "./route";

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Build a Request with an Asaas-like payload.
 *  HMAC_SECRET is not set in test env → dev bypass (always ok).
 */
function makeRequest(eventPayload: object) {
  const body = JSON.stringify(eventPayload);
  return new Request("http://localhost/api/webhooks/asaas", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "asaas-access-token": "valid-token", // verifyWebhookToken is mocked → passes
    },
    body,
  });
}

const COMPANY_ID = "company-abc";
const SUBSCRIPTION_DB_ID = "sub-db-1";
const PAYMENT_ID = "pay_test_123";

const confirmEvent = {
  id: "evt-pay-confirmed-1",
  event: "PAYMENT_CONFIRMED",
  payment: {
    id: PAYMENT_ID,
    customer: "cust-1",
    subscription: "asaas-sub-1",
    value: 149.9,
    status: "CONFIRMED",
  },
};

const overdueEvent = {
  id: "evt-pay-overdue-1",
  event: "PAYMENT_OVERDUE",
  payment: {
    id: "pay_overdue_456",
    customer: "cust-1",
    subscription: "asaas-sub-1",
    value: 149.9,
    status: "OVERDUE",
  },
};

// ─── setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  // Efeitos de ACESSO ligados por padrão nesta suíte: ela foi escrita para
  // exercitar o comportamento COMPLETO do webhook (ativar, rebaixar, publicar
  // entitlement). O modo observação — flag AUSENTE, que é o default de produção
  // — tem bloco próprio no fim do arquivo. Sem este stub, 10 testes passariam a
  // afirmar apenas "nada aconteceu", o que esconderia regressão real.
  vi.stubEnv("BILLING_WEBHOOK_ACCESS_ENABLED", "true");

  // default: token passes
  verifyWebhookToken.mockReturnValue(true);

  // BillingEvent: not a duplicate
  billingEventFindUnique.mockResolvedValue(null);
  billingEventUpsert.mockResolvedValue({ id: "be-1", retryCount: 0 });
  billingEventUpdate.mockResolvedValue({});

  // Subscription resolves to our company. `status: PAST_DUE` = elegível para
  // ativação (o webhook não ressuscita assinatura CANCELED/SUSPENDED).
  subscriptionFindFirst.mockResolvedValue({
    id: SUBSCRIPTION_DB_ID,
    companyId: COMPANY_ID,
    status: "PAST_DUE",
    asaasCustomerId: "cust-1",
    asaasSubscriptionId: "asaas-sub-1",
  });
  subscriptionFindUnique.mockResolvedValue({
    id: SUBSCRIPTION_DB_ID,
    companyId: COMPANY_ID,
    status: "PAST_DUE",
    asaasCustomerId: "cust-1",
    asaasSubscriptionId: "asaas-sub-1",
  });
  subscriptionUpdate.mockResolvedValue({});
  subscriptionUpdateMany.mockResolvedValue({ count: 1 });

  // Invoice: por padrão nenhuma fatura é achada pelas novas consultas de
  // evidência — os testes legados exercitam o caminho RECORRENTE.
  invoiceUpdate.mockResolvedValue({});
  invoiceUpdateMany.mockResolvedValue({ count: 1 });
  invoiceFindUnique.mockResolvedValue(null);
  invoiceFindMany.mockResolvedValue([]);

  // Task 8: por padrão a fatura NÃO tem obrigação vinculada — é o estado das 8
  // faturas legadas de produção e de toda cobrança manual. Os testes de
  // obrigação sobrescrevem via `comObrigacao()`.
  billingObligationUpdateMany.mockResolvedValue({ count: 1 });

  // Company findUnique (for name lookup inside the new block)
  companyFindUnique.mockResolvedValue({ name: "Óticas Teste" });

  // notifyCompany — fail-silent mock
  notifyCompany.mockResolvedValue({ status: "SENT" });

  // trackServer no-op
  trackServer.mockResolvedValue(undefined);
});

// ─── tests ────────────────────────────────────────────────────────────────────

describe("POST /api/webhooks/asaas — Task 8: notifyCompany on PAYMENT_CONFIRMED", () => {
  it("PAYMENT_CONFIRMED → notifyCompany chamado com companyId, 'PAYMENT_CONFIRMED', payload name+amountLabel, e periodKey contendo o paymentId", async () => {
    const res = await POST(makeRequest(confirmEvent));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    // notifyCompany deve ter sido chamado exatamente uma vez
    expect(notifyCompany).toHaveBeenCalledOnce();

    // primeiro argumento: companyId
    expect(notifyCompany).toHaveBeenCalledWith(
      COMPANY_ID,
      "PAYMENT_CONFIRMED",
      expect.objectContaining({
        name: expect.any(String),
        amountLabel: expect.stringContaining("149"), // formatted BRL value
      }),
      expect.objectContaining({
        periodKey: expect.stringContaining(PAYMENT_ID),
        channels: expect.arrayContaining(["email", "inapp"]),
      }),
    );

    // Cadeado: pagamento confirmado propaga writeAllowed=true ao Domus na hora.
    expect(publishEntitlementForCompany).toHaveBeenCalledWith(COMPANY_ID);
  });

  it("PAYMENT_RECEIVED também dispara notifyCompany", async () => {
    const receivedEvent = { ...confirmEvent, id: "evt-pay-received-1", event: "PAYMENT_RECEIVED" };
    const res = await POST(makeRequest(receivedEvent));

    expect(res.status).toBe(200);
    expect(notifyCompany).toHaveBeenCalledOnce();
    expect(notifyCompany).toHaveBeenCalledWith(
      COMPANY_ID,
      "PAYMENT_CONFIRMED",
      expect.objectContaining({ amountLabel: expect.any(String) }),
      expect.objectContaining({ periodKey: expect.stringContaining("pay:") }),
    );
  });

  it("PAYMENT_OVERDUE → notifyCompany NÃO é chamado (dunning cron responsável)", async () => {
    const res = await POST(makeRequest(overdueEvent));

    expect(res.status).toBe(200);
    expect(notifyCompany).not.toHaveBeenCalled();
  });

  it("PAYMENT_OVERDUE → propaga writeAllowed=false ao Domus na hora (Cadeado, entrada no read-only)", async () => {
    // subscriptionFindFirst resolve para COMPANY_ID (setup do beforeEach) → a
    // transição para PAST_DUE deve publicar o entitlement na hora, não só no pull.
    const res = await POST(makeRequest(overdueEvent));

    expect(res.status).toBe(200);
    expect(publishEntitlementForCompany).toHaveBeenCalledWith(COMPANY_ID);
  });

  it("PAYMENT_OVERDUE → NÃO regride estado terminal: todo updateMany carrega guard status notIn [SUSPENDED, CANCELED]", async () => {
    // Uma assinatura CANCELED com pastDueSince:null NÃO pode voltar a PAST_DUE.
    // O mock não simula o banco, então provamos que o where-clause EXCLUI os
    // estados terminais — o banco real não tocaria uma linha CANCELED.
    const res = await POST(makeRequest(overdueEvent));
    expect(res.status).toBe(200);

    // ambos os updateMany de subscription no ramo OVERDUE devem excluir terminais
    const subCalls = subscriptionUpdateMany.mock.calls.filter(
      (c) => (c[0] as { data?: { status?: string } })?.data?.status === "PAST_DUE",
    );
    expect(subCalls.length).toBeGreaterThan(0);
    for (const [arg] of subCalls) {
      const where = (arg as { where: { status?: { notIn?: string[] } } }).where;
      expect(where.status?.notIn).toEqual(["SUSPENDED", "CANCELED"]);
    }
  });

  it("PAYMENT_CHARGEBACK_REQUESTED → updateMany com guard status notIn [SUSPENDED, CANCELED] (não regride terminal)", async () => {
    const chargebackEvent = {
      id: "evt-chargeback-1",
      event: "PAYMENT_CHARGEBACK_REQUESTED",
      payment: { id: "pay_cb_1", customer: "cust-1", subscription: "asaas-sub-1", value: 149.9, status: "CHARGEBACK_REQUESTED" },
    };
    const res = await POST(makeRequest(chargebackEvent));
    expect(res.status).toBe(200);

    // o ramo de chargeback deve usar updateMany (não update) com guard de status
    const cbCall = subscriptionUpdateMany.mock.calls.find(
      (c) => (c[0] as { data?: { status?: string } })?.data?.status === "PAST_DUE",
    );
    expect(cbCall).toBeDefined();
    const where = (cbCall![0] as { where: { status?: { notIn?: string[] } } }).where;
    expect(where.status?.notIn).toEqual(["SUSPENDED", "CANCELED"]);
    // update() unconditional NÃO deve ter sido usado para o chargeback
    expect(subscriptionUpdate).not.toHaveBeenCalled();
  });

  it("amountLabel formata o valor em BRL corretamente", async () => {
    const res = await POST(makeRequest(confirmEvent));
    expect(res.status).toBe(200);

    const [, , payload] = notifyCompany.mock.calls[0] as [string, string, Record<string, string>];
    // Deve conter "R$" e o valor formatado em locale pt-BR
    expect(payload.amountLabel).toMatch(/R\$|R \$|149/);
  });

  it("evento de pagamento COM referência que não resolve → 500 (Asaas reenvia)", async () => {
    // 🔥 A corrida do checkout: a cobrança nasce no Asaas ANTES do commit local,
    // então um webhook muito rápido não acha a Subscription. Responder 200 aqui
    // arquivaria o pagamento PARA SEMPRE e o cliente ficaria em TRIAL tendo pago.
    subscriptionFindFirst.mockResolvedValue(null);
    invoiceFindUnique.mockResolvedValue(null);
    invoiceFindMany.mockResolvedValue([]);

    const res = await POST(makeRequest(confirmEvent));

    expect(res.status).toBe(500);
    expect(billingEventUpdate).not.toHaveBeenCalled(); // não marca processedAt
  });

  it("sem companyId → notifyCompany não é chamado", async () => {
    // subscriptionFindFirst retorna nulo → companyId fica null
    subscriptionFindFirst.mockResolvedValue(null);

    // Sem NENHUMA referência: segue arquivado com 200 (não é a corrida do
    // checkout; devolver 500 para ruído viraria reentrega infinita).
    const eventWithoutRef = {
      ...confirmEvent,
      id: "evt-no-company",
      payment: { ...confirmEvent.payment, subscription: undefined, externalReference: undefined },
    };

    const res = await POST(makeRequest(eventWithoutRef));
    expect(res.status).toBe(200);
    expect(notifyCompany).not.toHaveBeenCalled();
  });

  it("evento duplicado (processedAt setado) → 200 sem chamar notifyCompany", async () => {
    billingEventFindUnique.mockResolvedValue({ processedAt: new Date() });

    const res = await POST(makeRequest(confirmEvent));
    const body = await res.json();
    expect(body.duplicate).toBe(true);
    expect(notifyCompany).not.toHaveBeenCalled();
  });
});

// ─── cobrança AVULSA (o furo que motivou a correção) ─────────────────────────
//
// A cobrança avulsa sai com externalReference "invoice:<id>" e SEM assinatura
// recorrente. Antes, ela não resolvia subscription nenhuma: a fatura virava
// PAID, a Subscription nunca virava ACTIVE e o entitlement nunca era publicado
// — o cliente pagava e continuava bloqueado no Domus.
describe("POST /api/webhooks/asaas — cobrança avulsa por externalReference", () => {
  const INVOICE_ID = "inv-avulsa-1";

  const avulsaEvent = {
    id: "evt-avulsa-1",
    event: "PAYMENT_CONFIRMED",
    payment: {
      id: "pay_avulsa_1",
      customer: "cust-1",
      value: 89.9,
      status: "CONFIRMED",
      externalReference: `invoice:${INVOICE_ID}`,
    },
  };

  /**
   * Fatura resolvida por `invoice:<id>`. `isManual: false` = fatura do CICLO
   * (mensalidade) cobrada pelo caminho standalone — é ela que controla acesso.
   * Passe `isManual: true` para simular taxa avulsa (implantação/hardware).
   */
  function invoiceResolvida(over: Record<string, unknown> = {}) {
    invoiceFindUnique.mockResolvedValue({
      id: INVOICE_ID,
      subscriptionId: SUBSCRIPTION_DB_ID,
      asaasPaymentId: null,
      status: "PENDING",
      periodEnd: new Date("2026-09-01T00:00:00Z"),
      isManual: false,
      ...over,
    });
    // sem assinatura recorrente no evento
    subscriptionFindFirst.mockResolvedValue(null);
  }

  it("ATIVA a assinatura e publica o entitlement (antes, nada acontecia)", async () => {
    invoiceResolvida();

    const res = await POST(makeRequest(avulsaEvent));
    expect(res.status).toBe(200);

    expect(subscriptionUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: SUBSCRIPTION_DB_ID }),
        data: expect.objectContaining({ status: "ACTIVE" }),
      })
    );
    expect(publishEntitlementForCompany).toHaveBeenCalledWith(COMPANY_ID);
  });

  it("usa o periodEnd DA FATURA como currentPeriodEnd (não recalcula por ciclo)", async () => {
    invoiceResolvida();

    await POST(makeRequest(avulsaEvent));

    const call = subscriptionUpdateMany.mock.calls.find(
      ([arg]) => (arg as any)?.data?.status === "ACTIVE"
    );
    expect((call![0] as any).data.currentPeriodEnd).toEqual(
      new Date("2026-09-01T00:00:00Z")
    );
  });

  it("marca a fatura pelo PK (asaasPaymentId não é unique sozinho)", async () => {
    invoiceResolvida({ asaasPaymentId: null });

    await POST(makeRequest(avulsaEvent));

    expect(invoiceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: INVOICE_ID },
        data: expect.objectContaining({ status: "PAID", paymentConfirmed: true }),
      })
    );
  });

  it("NÃO ressuscita assinatura CANCELED — espelha a política do mark_paid manual", async () => {
    invoiceResolvida();
    subscriptionFindUnique.mockResolvedValue({
      id: SUBSCRIPTION_DB_ID,
      companyId: COMPANY_ID,
      status: "CANCELED",
      asaasCustomerId: "cust-1",
      asaasSubscriptionId: null,
    });
    // o guard de status faz o updateMany não atingir nenhuma linha
    subscriptionUpdateMany.mockResolvedValue({ count: 0 });

    const res = await POST(makeRequest(avulsaEvent));
    expect(res.status).toBe(200);

    // fatura paga sim; acesso NÃO devolvido
    expect(invoiceUpdate).toHaveBeenCalled();
    expect(publishEntitlementForCompany).not.toHaveBeenCalled();
  });

  it("recusa (500) quando o pagador diverge do customer da assinatura", async () => {
    invoiceResolvida();
    subscriptionFindUnique.mockResolvedValue({
      id: SUBSCRIPTION_DB_ID,
      companyId: COMPANY_ID,
      status: "PAST_DUE",
      asaasCustomerId: "cust-OUTRO",
      asaasSubscriptionId: null,
    });

    const res = await POST(makeRequest(avulsaEvent));

    // Não decidir > escolher errado: 500 faz o Asaas reenviar.
    expect(res.status).toBe(500);
    expect(subscriptionUpdateMany).not.toHaveBeenCalled();
    expect(publishEntitlementForCompany).not.toHaveBeenCalled();
  });

  it("taxa avulsa VENCIDA não rebaixa a assinatura nem bloqueia a clínica", async () => {
    // Regressão que esta correção precisa EVITAR: createManualCharge cobra
    // qualquer coisa (taxa de implantação, hardware). Deixá-la vencer não pode
    // trancar o cliente.
    invoiceResolvida({ isManual: true });

    const res = await POST(
      makeRequest({
        id: "evt-avulsa-overdue",
        event: "PAYMENT_OVERDUE",
        payment: {
          id: "pay_avulsa_1",
          customer: "cust-1",
          value: 89.9,
          status: "OVERDUE",
          externalReference: `invoice:${INVOICE_ID}`,
        },
      })
    );

    expect(res.status).toBe(200);
    expect(subscriptionUpdateMany).not.toHaveBeenCalled();
    expect(publishEntitlementForCompany).not.toHaveBeenCalled();
    // mas a fatura É marcada em atraso — o financeiro precisa enxergar isso
    expect(invoiceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: INVOICE_ID }, data: { status: "OVERDUE" } })
    );
  });

  it("taxa avulsa PAGA não ativa a assinatura (pagar hardware não compra mês)", async () => {
    invoiceResolvida({ isManual: true });
    subscriptionFindUnique.mockResolvedValue({
      id: SUBSCRIPTION_DB_ID,
      companyId: COMPANY_ID,
      status: "PAST_DUE",
      asaasCustomerId: "cust-1",
      asaasSubscriptionId: null,
    });

    const res = await POST(makeRequest(avulsaEvent));
    expect(res.status).toBe(200);

    // fatura quitada sim; acesso NÃO comprado
    expect(invoiceUpdate).toHaveBeenCalled();
    expect(subscriptionUpdateMany).not.toHaveBeenCalled();
    expect(publishEntitlementForCompany).not.toHaveBeenCalled();
  });

  it("cliente SUSPENSO pelo dunning paga a mensalidade e RECUPERA o acesso", async () => {
    // 🔥 O dunning suspende AUTOMATICAMENTE aos 14 dias de atraso e o e-mail
    // promete a volta ao regularizar. Tratar SUSPENDED como terminal faria o
    // cliente pagar e continuar bloqueado — o próprio bug que estamos consertando.
    invoiceResolvida({ isManual: false });
    subscriptionFindUnique.mockResolvedValue({
      id: SUBSCRIPTION_DB_ID,
      companyId: COMPANY_ID,
      status: "SUSPENDED",
      asaasCustomerId: "cust-1",
      asaasSubscriptionId: null,
    });

    const res = await POST(makeRequest(avulsaEvent));
    expect(res.status).toBe(200);

    expect(subscriptionUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: SUBSCRIPTION_DB_ID,
          status: { in: expect.arrayContaining(["SUSPENDED"]) },
        }),
        data: expect.objectContaining({ status: "ACTIVE" }),
      })
    );
    expect(publishEntitlementForCompany).toHaveBeenCalledWith(COMPANY_ID);
  });

  it("backfill do asaasPaymentId é atômico (só quando ainda está nulo)", async () => {
    invoiceResolvida({ asaasPaymentId: null });

    await POST(makeRequest(avulsaEvent));

    // A guarda vai no WHERE: entre ler a evidência e escrever, o
    // ensureInvoiceCharge pode ter gravado outro id.
    expect(invoiceUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: INVOICE_ID, asaasPaymentId: null },
        data: { asaasPaymentId: "pay_avulsa_1" },
      })
    );
  });
});

// ─── Task 8: o webhook marca a OBRIGAÇÃO como paga ───────────────────────────
//
// 🔥 O defeito: o webhook não mencionava `billingObligation` em lugar nenhum.
// O bootstrap cria obrigações `ISSUED` amarradas a faturas com PIX vivo, então
// o cliente pagava, a fatura virava PAID e a obrigação ficava ISSUED com `dueAt`
// no passado — o gatilho EXATO de I1: restringir quem acabou de pagar.
describe("POST /api/webhooks/asaas — Task 8: obrigação de cobrança", () => {
  const INVOICE_ID = "inv-com-obrigacao";
  const OBLIGATION_ID = "obl-1";

  /**
   * Fatura resolvida por `invoice:<id>` COM obrigação vinculada.
   *
   * O webhook faz DUAS leituras de `invoice.findUnique`: a evidência do alvo
   * (com `subscriptionId`, `isManual`...) e o vínculo da obrigação (`select:
   * { billingObligation: ... }`). O mock despacha pelo `select` porque as duas
   * consultas usam a MESMA função.
   */
  function comObrigacao(
    obl: { state: string; invoiceId?: string | null; disposition?: string } | null,
    invoiceOver: Record<string, unknown> = {},
  ) {
    const evidencia = {
      id: INVOICE_ID,
      subscriptionId: SUBSCRIPTION_DB_ID,
      asaasPaymentId: null,
      status: "PENDING",
      periodEnd: new Date("2026-09-07T00:00:00Z"),
      isManual: false,
      ...invoiceOver,
    };
    const vinculo = {
      billingObligation: obl
        ? {
            id: OBLIGATION_ID,
            state: obl.state,
            invoiceId: obl.invoiceId === undefined ? INVOICE_ID : obl.invoiceId,
            disposition: obl.disposition ?? "CHARGE",
          }
        : null,
    };
    invoiceFindUnique.mockImplementation((args: unknown) => {
      const select = (args as { select?: Record<string, unknown> })?.select ?? {};
      if ("billingObligation" in select) return Promise.resolve(vinculo);
      return Promise.resolve(evidencia);
    });
    subscriptionFindFirst.mockResolvedValue(null);
    subscriptionFindUnique.mockResolvedValue({
      id: SUBSCRIPTION_DB_ID,
      companyId: COMPANY_ID,
      status: "TRIAL",
      asaasCustomerId: "cust-1",
      asaasSubscriptionId: null,
    });
  }

  const pagoEvent = {
    id: "evt-obl-pago",
    event: "PAYMENT_CONFIRMED",
    payment: {
      id: "pay_pix_vivo",
      customer: "cust-1",
      value: 189.9,
      status: "CONFIRMED",
      externalReference: `invoice:${INVOICE_ID}`,
    },
  };

  const overdueEvent = {
    id: "evt-obl-overdue",
    event: "PAYMENT_OVERDUE",
    payment: {
      id: "pay_pix_vivo",
      customer: "cust-1",
      value: 189.9,
      status: "OVERDUE",
      externalReference: `invoice:${INVOICE_ID}`,
    },
  };

  it("🔥 PAYMENT_CONFIRMED promove a obrigação ISSUED para PAID com paidAt", async () => {
    comObrigacao({ state: "ISSUED" });

    const res = await POST(makeRequest(pagoEvent));
    expect(res.status).toBe(200);

    expect(billingObligationUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: OBLIGATION_ID }),
        data: expect.objectContaining({ state: "PAID", paidAt: expect.any(Date) }),
      }),
    );
  });

  it("PAYMENT_RECEIVED (boleto compensado) também promove — os dois caminhos do dinheiro", async () => {
    comObrigacao({ state: "ISSUED" });

    const res = await POST(
      makeRequest({ ...pagoEvent, id: "evt-obl-recebido", event: "PAYMENT_RECEIVED" }),
    );
    expect(res.status).toBe(200);

    expect(billingObligationUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ state: "PAID" }),
      }),
    );
  });

  it("🔑 o CAS guarda estado E invoiceId (reemissão entre a leitura e a escrita)", async () => {
    comObrigacao({ state: "ISSUED" });

    await POST(makeRequest(pagoEvent));

    const [arg] = billingObligationUpdateMany.mock.calls[0] as [
      { where: { state?: { in?: string[] }; invoiceId?: string } },
    ];
    // Sem `invoiceId` no WHERE, uma troca de tentativa no intervalo faria o CAS
    // quitar o período pela fatura ERRADA.
    expect(arg.where.invoiceId).toBe(INVOICE_ID);
    // VOID não pode entrar na lista.
    expect(arg.where.state?.in).toEqual(["PLANNED", "ISSUED"]);
    expect(arg.where.state?.in).not.toContain("VOID");
  });

  it("obrigação PLANNED também é promovida (o gateway responde antes do ISSUED)", async () => {
    comObrigacao({ state: "PLANNED" });

    await POST(makeRequest(pagoEvent));

    expect(billingObligationUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ state: "PAID" }) }),
    );
  });

  it("🔥 obrigação VOID NÃO é promovida (período anulado, refeito por outra)", async () => {
    comObrigacao({ state: "VOID" });

    const res = await POST(makeRequest(pagoEvent));
    expect(res.status).toBe(200);

    // a fatura é marcada paga (dinheiro entrou), a obrigação anulada NÃO
    expect(invoiceUpdate).toHaveBeenCalled();
    expect(billingObligationUpdateMany).not.toHaveBeenCalled();

    // `needs_review` → alerta em `warning`: dinheiro entrou sobre um período
    // anulado e alguém precisa dizer a que acerto ele pertence. Menos grave que
    // `paid_but_unresolved` (a obrigação VOID não dispara I1), por isso
    // `warning` e não `error` — mas silêncio aqui perderia o pagamento órfão.
    expect(captureMessage).toHaveBeenCalledWith(
      expect.stringContaining("pagamento não quitou a obrigação"),
      expect.objectContaining({
        level: "warning",
        extra: expect.objectContaining({ invoiceId: INVOICE_ID, companyId: COMPANY_ID }),
      }),
    );
    const [msg] = captureMessage.mock.calls.at(-1) as [string, unknown];
    expect(msg).toContain("VOID");
  });

  it("obrigação já PAID → não reescreve (idempotente em reenvio)", async () => {
    comObrigacao({ state: "PAID" });

    const res = await POST(makeRequest(pagoEvent));
    expect(res.status).toBe(200);
    expect(billingObligationUpdateMany).not.toHaveBeenCalled();
  });

  it("🔥 fatura paga SEM obrigação vinculada → fluxo antigo INTACTO, nada quebra", async () => {
    // Todas as 8 faturas legadas de produção e todas as manuais/avulsas são
    // assim, para sempre.
    comObrigacao(null);

    const res = await POST(makeRequest(pagoEvent));
    expect(res.status).toBe(200);

    // fatura paga, assinatura ativada, entitlement publicado — como antes
    expect(invoiceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: INVOICE_ID },
        data: expect.objectContaining({ status: "PAID" }),
      }),
    );
    expect(subscriptionUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "ACTIVE" }) }),
    );
    expect(publishEntitlementForCompany).toHaveBeenCalledWith(COMPANY_ID);
    // e nenhuma escrita de obrigação foi tentada
    expect(billingObligationUpdateMany).not.toHaveBeenCalled();
  });

  it("🔥 tentativa SUPERADA paga → não promove, mas ALERTA em nível `error` (não é noop silencioso)", async () => {
    // A obrigação foi reemitida: a tentativa vigente é outra fatura. O cliente
    // pagou a antiga — se ficar em silêncio, I1 restringe quem pagou E a
    // tentativa vigente segue cobrável.
    //
    // ⚠️ Não basta afirmar que o banco NÃO foi escrito: recusar a escrita é
    // fail-closed para o BANCO e fail-OPEN para a restrição. O alerta alto é o
    // contrato explícito do módulo puro
    // (`asaas-obligation-arbitration.ts` → `paid_but_unresolved`) e é o ÚNICO
    // efeito observável deste ramo. Sem esta asserção, apagar o ramo inteiro
    // deixa a suíte verde.
    comObrigacao({ state: "ISSUED", invoiceId: "inv-outra-tentativa" });

    const res = await POST(makeRequest(pagoEvent));
    expect(res.status).toBe(200);
    expect(billingObligationUpdateMany).not.toHaveBeenCalled();

    // `error`, não `warning`: é o cenário em que o cliente pode ser bloqueado E
    // cobrado de novo pelo mesmo período. Rebaixar o nível some com o alarme na
    // triagem do Sentry.
    expect(captureMessage).toHaveBeenCalledWith(
      expect.stringContaining("PAGOU e a obrigação seguiu em aberto"),
      expect.objectContaining({
        level: "error",
        extra: expect.objectContaining({ invoiceId: INVOICE_ID, companyId: COMPANY_ID }),
      }),
    );
    // e o motivo carrega a tentativa vigente, que é o que o operador precisa
    // para reconciliar
    const [msg] = captureMessage.mock.calls.at(-1) as [string, unknown];
    expect(msg).toContain("inv-outra-tentativa");
  });

  // ── Evento FORA DE ORDEM: o cenário central da task ────────────────────────

  it("🔥 PAYMENT_OVERDUE atrasado sobre obrigação PAID NÃO rebaixa a assinatura", async () => {
    // O caso que a task existe para arbitrar: várias tentativas por obrigação,
    // um OVERDUE de tentativa cancelada chegando depois do pagamento.
    comObrigacao({ state: "PAID" });

    const res = await POST(makeRequest(overdueEvent));
    expect(res.status).toBe(200);

    expect(subscriptionUpdateMany).not.toHaveBeenCalled();
    expect(publishEntitlementForCompany).not.toHaveBeenCalled();
    // a fatura ainda é marcada OVERDUE — o financeiro precisa ver o atraso
    expect(invoiceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: INVOICE_ID }, data: { status: "OVERDUE" } }),
    );
  });

  it("🔥 PAYMENT_OVERDUE de tentativa SUPERADA não rebaixa (mesmo com obrigação ISSUED)", async () => {
    comObrigacao({ state: "ISSUED", invoiceId: "inv-outra-tentativa" });

    const res = await POST(makeRequest(overdueEvent));
    expect(res.status).toBe(200);

    expect(subscriptionUpdateMany).not.toHaveBeenCalled();
    expect(publishEntitlementForCompany).not.toHaveBeenCalled();
  });

  it("PAYMENT_OVERDUE sobre obrigação ISSUED VIGENTE ainda rebaixa (não afrouxou o enforcement)", async () => {
    comObrigacao({ state: "ISSUED" });

    const res = await POST(makeRequest(overdueEvent));
    expect(res.status).toBe(200);

    expect(subscriptionUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "PAST_DUE" }) }),
    );
    expect(publishEntitlementForCompany).toHaveBeenCalledWith(COMPANY_ID);
  });

  it("PAYMENT_OVERDUE de fatura SEM obrigação continua rebaixando (caminho legado)", async () => {
    comObrigacao(null);

    const res = await POST(makeRequest(overdueEvent));
    expect(res.status).toBe(200);

    expect(subscriptionUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "PAST_DUE" }) }),
    );
  });

  it("🔥 chargeback sobre obrigação PAID NÃO bloqueia a clínica (I1 + I3)", async () => {
    // Este ramo JÁ publica o entitlement, então sem a arbitragem ele bloqueia a
    // escrita clínica na hora, sem aviso despachado — atropelando I1 e I3.
    comObrigacao({ state: "PAID" });

    const res = await POST(
      makeRequest({
        id: "evt-obl-chargeback",
        event: "PAYMENT_CHARGEBACK_REQUESTED",
        payment: {
          id: "pay_pix_vivo",
          customer: "cust-1",
          value: 189.9,
          status: "CHARGEBACK_REQUESTED",
          externalReference: `invoice:${INVOICE_ID}`,
        },
      }),
    );
    expect(res.status).toBe(200);

    expect(subscriptionUpdateMany).not.toHaveBeenCalled();
    expect(publishEntitlementForCompany).not.toHaveBeenCalled();
    // a fatura ainda registra o chargeback
    expect(invoiceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ adminNotes: "Chargeback solicitado" }),
      }),
    );
  });

  it("estorno sobre obrigação PAID mantém a obrigação PAID (não restringe por I1)", async () => {
    comObrigacao({ state: "PAID" });

    const res = await POST(
      makeRequest({
        id: "evt-obl-refund",
        event: "PAYMENT_REFUNDED",
        payment: {
          id: "pay_pix_vivo",
          customer: "cust-1",
          value: 189.9,
          status: "REFUNDED",
          externalReference: `invoice:${INVOICE_ID}`,
        },
      }),
    );
    expect(res.status).toBe(200);

    // a fatura vira REFUNDED; a obrigação NÃO é revertida para ISSUED (isso
    // casaria o gatilho de I1 e restringiria sem decisão humana nem aviso)
    expect(invoiceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: INVOICE_ID }, data: { status: "REFUNDED" } }),
    );
    expect(billingObligationUpdateMany).not.toHaveBeenCalled();

    // 🔴 O alerta é a ÚNICA mitigação da dívida assumida em
    // `REFUND_KEEPS_OBLIGATION_PAID`: manter a obrigação `PAID` faz `PAID`
    // significar "houve pagamento", não "está quitada", e quem estorna todo mês
    // fica com acesso de graça sem nenhum relatório enxergar. Sem este alerta a
    // divergência (`obligation PAID` × `Invoice REFUNDED`) morre silenciosa.
    // `warning`: não há restrição indevida em curso, só receita revertida a
    // revisar.
    expect(captureMessage).toHaveBeenCalledWith(
      expect.stringContaining("estorno sobre obrigação quitada"),
      expect.objectContaining({
        level: "warning",
        extra: expect.objectContaining({ invoiceId: INVOICE_ID, companyId: COMPANY_ID }),
      }),
    );
    const [msg] = captureMessage.mock.calls.at(-1) as [string, unknown];
    expect(msg).toContain(OBLIGATION_ID);
  });
});

/**
 * MODO OBSERVAÇÃO (`BILLING_WEBHOOK_ACCESS_ENABLED` ausente = default de produção).
 *
 * Contexto que justifica estes testes: medido em 2026-08-02, NUNCA houve webhook
 * cadastrado no painel do Asaas — `BillingEvent` tem zero linhas em todo o
 * histórico. Este caminho inteiro nunca rodou em produção, e um dos seus efeitos
 * é `publishEntitlementForCompany`, que libera ESCRITA DE PRONTUÁRIO MÉDICO.
 *
 * A invariante que estes testes travam: com a flag desligada, o evento é
 * REGISTRADO e a FATURA é marcada — mas NENHUM efeito de acesso acontece, em
 * NENHUM dos quatro ramos. Gatear só o ramo do pagamento seria pior que não
 * gatear: o canal poderia TIRAR acesso sem nunca ter provado que sabe DEVOLVER.
 */
describe("POST /api/webhooks/asaas — modo observação (flag de acesso DESLIGADA)", () => {
  beforeEach(() => {
    // Sobrescreve o stub do beforeEach global: aqui a flag NÃO está setada,
    // que é exatamente o estado de produção no primeiro deploy.
    vi.stubEnv("BILLING_WEBHOOK_ACCESS_ENABLED", "");
  });

  it("PAYMENT_CONFIRMED: marca a FATURA como paga (a verdade do dinheiro não é suprimida)", async () => {
    const res = await POST(makeRequest(confirmEvent));

    expect(res.status).toBe(200);
    // O pedido explícito do dono: "pago no Asaas = PAGO no super admin".
    // Isto continua valendo em modo observação — é a metade reversível.
    const marcouPago =
      invoiceUpdate.mock.calls.some(
        (c) => (c[0] as { data?: { status?: string } })?.data?.status === "PAID",
      ) ||
      invoiceUpdateMany.mock.calls.some(
        (c) => (c[0] as { data?: { status?: string } })?.data?.status === "PAID",
      );
    expect(marcouPago).toBe(true);
  });

  it("PAYMENT_CONFIRMED: NÃO ativa assinatura e NÃO publica entitlement", async () => {
    const res = await POST(makeRequest(confirmEvent));

    expect(res.status).toBe(200);
    expect(publishEntitlementForCompany).not.toHaveBeenCalled();
    const ativou = subscriptionUpdateMany.mock.calls.some(
      (c) => (c[0] as { data?: { status?: string } })?.data?.status === "ACTIVE",
    );
    expect(ativou).toBe(false);
  });

  it("PAYMENT_OVERDUE: NÃO rebaixa para PAST_DUE e NÃO bloqueia escrita clínica", async () => {
    const res = await POST(makeRequest(overdueEvent));

    expect(res.status).toBe(200);
    expect(publishEntitlementForCompany).not.toHaveBeenCalled();
    const rebaixou = subscriptionUpdateMany.mock.calls.some(
      (c) => (c[0] as { data?: { status?: string } })?.data?.status === "PAST_DUE",
    );
    expect(rebaixou).toBe(false);
  });

  it("PAYMENT_OVERDUE: ainda marca a FATURA como OVERDUE (o atraso é real)", async () => {
    const res = await POST(makeRequest(overdueEvent));

    expect(res.status).toBe(200);
    const marcou =
      invoiceUpdate.mock.calls.some(
        (c) => (c[0] as { data?: { status?: string } })?.data?.status === "OVERDUE",
      ) ||
      invoiceUpdateMany.mock.calls.some(
        (c) => (c[0] as { data?: { status?: string } })?.data?.status === "OVERDUE",
      );
    expect(marcou).toBe(true);
  });

  it("SUBSCRIPTION_DELETED: NÃO cancela a assinatura (CANCELED é terminal)", async () => {
    const res = await POST(
      makeRequest({
        id: "evt-sub-deleted-obs",
        event: "SUBSCRIPTION_DELETED",
        subscription: { id: "asaas-sub-1" },
      }),
    );

    expect(res.status).toBe(200);
    expect(subscriptionUpdate).not.toHaveBeenCalled();
    expect(publishEntitlementForCompany).not.toHaveBeenCalled();
  });

  it("o evento é REGISTRADO mesmo suprimido (auditoria não é gateada)", async () => {
    const res = await POST(makeRequest(confirmEvent));

    expect(res.status).toBe(200);
    // Sem isto o modo observação seria cego: é o BillingEvent que prova ao dono
    // que o webhook chegou e funcionou, antes de ele ligar a flag.
    expect(billingEventUpsert).toHaveBeenCalled();
  });
});
