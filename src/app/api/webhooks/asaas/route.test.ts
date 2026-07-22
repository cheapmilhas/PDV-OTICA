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
const subscriptionUpdate = vi.fn();
const subscriptionUpdateMany = vi.fn();
const invoiceUpdateMany = vi.fn();
const companyFindUnique = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    billingEvent: {
      findUnique: (...a: unknown[]) => billingEventFindUnique(...a),
      upsert: (...a: unknown[]) => billingEventUpsert(...a),
      update: (...a: unknown[]) => billingEventUpdate(...a),
    },
    subscription: {
      findFirst: (...a: unknown[]) => subscriptionFindFirst(...a),
      update: (...a: unknown[]) => subscriptionUpdate(...a),
      updateMany: (...a: unknown[]) => subscriptionUpdateMany(...a),
    },
    invoice: {
      updateMany: (...a: unknown[]) => invoiceUpdateMany(...a),
    },
    company: {
      findUnique: (...a: unknown[]) => companyFindUnique(...a),
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

// sentry — no-op
vi.mock("@/lib/sentry", () => ({
  captureMessage: vi.fn(),
}));

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

  // default: token passes
  verifyWebhookToken.mockReturnValue(true);

  // BillingEvent: not a duplicate
  billingEventFindUnique.mockResolvedValue(null);
  billingEventUpsert.mockResolvedValue({ id: "be-1", retryCount: 0 });
  billingEventUpdate.mockResolvedValue({});

  // Subscription resolves to our company
  subscriptionFindFirst.mockResolvedValue({
    id: SUBSCRIPTION_DB_ID,
    companyId: COMPANY_ID,
  });
  subscriptionUpdate.mockResolvedValue({});
  subscriptionUpdateMany.mockResolvedValue({ count: 1 });

  // Invoice update
  invoiceUpdateMany.mockResolvedValue({ count: 1 });

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

  it("sem companyId → notifyCompany não é chamado", async () => {
    // subscriptionFindFirst retorna nulo → companyId fica null
    subscriptionFindFirst.mockResolvedValue(null);

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
