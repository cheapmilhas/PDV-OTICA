import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }) },
}));

const nextSaasInvoiceNumber = vi.fn().mockResolvedValue("INV-000100");
vi.mock("@/lib/saas-invoice-number", () => ({
  nextSaasInvoiceNumber: (...a: unknown[]) => nextSaasInvoiceNumber(...a),
}));

import { createTrialConversionCharge } from "@/services/trial-conversion-charge.service";

const NOW = new Date("2026-08-01T12:00:00Z");
const COMPANY_ID = "co-medical";
const SUB_ID = "sub-med";

const companyFindUnique = vi.fn();
const subscriptionFindMany = vi.fn();
const invoiceFindFirst = vi.fn();
const invoiceCreate = vi.fn();
const invoiceUpdate = vi.fn();
const executeRaw = vi.fn();

/** Prisma falso: $transaction executa o callback com o mesmo `tx`. */
function makePrisma() {
  const tx = {
    $executeRaw: (...a: unknown[]) => executeRaw(...a),
    $queryRaw: vi.fn(),
    company: { findUnique: (...a: unknown[]) => companyFindUnique(...a) },
    subscription: { findMany: (...a: unknown[]) => subscriptionFindMany(...a) },
    invoice: {
      findFirst: (...a: unknown[]) => invoiceFindFirst(...a),
      create: (...a: unknown[]) => invoiceCreate(...a),
      update: (...a: unknown[]) => invoiceUpdate(...a),
    },
  };
  return { $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx) } as never;
}

const ensureCustomerFn = vi.fn();
const ensureChargeFn = vi.fn();
const sendChargeEmailFn = vi.fn();

function run() {
  return createTrialConversionCharge(COMPANY_ID, {
    prismaClient: makePrisma(),
    ensureCustomerFn,
    ensureChargeFn,
    sendChargeEmailFn,
    adminId: "admin-1",
    now: NOW,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  nextSaasInvoiceNumber.mockResolvedValue("INV-000100");
  companyFindUnique.mockResolvedValue({
    id: COMPANY_ID,
    platformProduct: "VIS_MEDICAL",
    cnpj: "20606235000131",
    blockedReason: null,
  });
  subscriptionFindMany.mockResolvedValue([
    {
      id: SUB_ID,
      status: "TRIAL",
      trialEndsAt: new Date("2026-08-07T11:01:20Z"),
      billingCycle: "MONTHLY",
      discountPercent: null,
      discountExpiresAt: null,
      plan: { priceMonthly: 18990, priceYearly: 189900, name: "Clinica" },
    },
  ]);
  invoiceFindFirst.mockResolvedValue(null);
  invoiceCreate.mockResolvedValue({ id: "inv-new" });
  invoiceUpdate.mockResolvedValue({});
  ensureCustomerFn.mockResolvedValue({ asaasCustomerId: "cus_1", created: false });
  sendChargeEmailFn.mockResolvedValue({ status: "SENT", alreadySentToday: false });
  ensureChargeFn.mockResolvedValue({
    id: "inv-new",
    total: 18990,
    paymentUrl: "https://www.asaas.com/i/abc",
    pixCode: "0002012636...",
    dueDate: new Date("2026-08-06T12:00:00Z"),
  });
});

describe("createTrialConversionCharge — caminho feliz", () => {
  it("cria a fatura da MENSALIDADE (isManual false) e gera a cobrança", async () => {
    const r = await run();

    expect(r).toMatchObject({ kind: "ok", invoiceId: "inv-new", reused: false });
    const data = invoiceCreate.mock.calls[0][0].data;
    // 🔑 isManual false = tem autoridade sobre o acesso. É o que faz o webhook
    // ATIVAR a assinatura quando o cliente pagar.
    expect(data.isManual).toBe(false);
    expect(data.total).toBe(18990);
    expect(data.source).toBe(`medical-trial-conversion:${SUB_ID}`);
  });

  it("serializa por empresa com advisory lock ANTES de ler qualquer coisa", async () => {
    await run();
    expect(executeRaw).toHaveBeenCalled();
  });

  it("período começa no fim do trial (não cobra dias de teste já pagos pelo cliente)", async () => {
    await run();
    const data = invoiceCreate.mock.calls[0][0].data;
    expect(data.periodStart).toEqual(new Date("2026-08-07T11:01:20Z"));
  });

  it("chama o Asaas FORA da transação, depois de reservar a fatura", async () => {
    await run();
    expect(ensureCustomerFn).toHaveBeenCalledWith(COMPANY_ID);
    expect(ensureChargeFn).toHaveBeenCalledWith("inv-new");
  });

  it("AVISA o cliente por e-mail", async () => {
    // Sem isto a cobrança existia só dentro do sistema: a clínica só
    // descobriria abrindo a tela de Assinatura por conta própria.
    const r = await run();

    expect(sendChargeEmailFn).toHaveBeenCalledWith("inv-new", "admin-1");
    expect(r).toMatchObject({ kind: "ok", emailStatus: "SENT" });
  });

  it("falha no e-mail NÃO desfaz a cobrança nem propaga erro", async () => {
    // A cobrança já existe e é válida. Propagar o erro faria o operador ver
    // "falhou" e clicar de novo, achando que nada aconteceu.
    sendChargeEmailFn.mockRejectedValue(new Error("provedor fora"));

    const r = await run();

    expect(r).toMatchObject({ kind: "ok", invoiceId: "inv-new" });
    expect((r as { emailStatus: string }).emailStatus).toBe("NOT_SENT");
  });
});

describe("createTrialConversionCharge — idempotência", () => {
  it("REUSA cobrança PENDING existente (dois cliques não geram duas cobranças)", async () => {
    invoiceFindFirst.mockResolvedValue({ id: "inv-ja", status: "PENDING" });

    const r = await run();

    expect(r).toMatchObject({ kind: "ok", invoiceId: "inv-ja", reused: true });
    expect(invoiceCreate).not.toHaveBeenCalled();
  });

  it("cobrança já PAGA não cobra de novo", async () => {
    invoiceFindFirst.mockResolvedValue({ id: "inv-paga", status: "PAID" });

    const r = await run();

    expect(r).toEqual({ kind: "already_paid", invoiceId: "inv-paga" });
    expect(ensureChargeFn).not.toHaveBeenCalled();
  });

  it("cobrança CANCELADA exige revisão — não emite por cima de um estorno", async () => {
    invoiceFindFirst.mockResolvedValue({ id: "inv-cancel", status: "CANCELED" });

    const r = await run();

    expect(r).toMatchObject({ kind: "error", code: "needs_review" });
    expect(invoiceCreate).not.toHaveBeenCalled();
  });
});

describe("createTrialConversionCharge — guardas (falha fechada)", () => {
  it("recusa empresa que não é medical", async () => {
    companyFindUnique.mockResolvedValue({
      id: COMPANY_ID,
      platformProduct: "VIS_APP",
      cnpj: "20606235000131",
      blockedReason: null,
    });

    const r = await run();

    expect(r).toMatchObject({ kind: "error", code: "not_medical" });
    expect(invoiceCreate).not.toHaveBeenCalled();
  });

  it("recusa clínica SEM documento com mensagem acionável", async () => {
    // Caso real: MedFacil entrou sem CNPJ pelo funil público. Sem esta guarda,
    // o erro só apareceria lá dentro do gateway.
    companyFindUnique.mockResolvedValue({
      id: COMPANY_ID,
      platformProduct: "VIS_MEDICAL",
      cnpj: null,
      blockedReason: null,
    });

    const r = await run();

    expect(r).toMatchObject({ kind: "error", code: "missing_document" });
    expect(ensureCustomerFn).not.toHaveBeenCalled();
  });

  it("recusa quando NÃO há assinatura em trial", async () => {
    subscriptionFindMany.mockResolvedValue([]);
    const r = await run();
    expect(r).toMatchObject({ kind: "error", code: "no_eligible_subscription" });
  });

  it("recusa quando há MAIS DE UMA assinatura elegível (não escolhe sozinho)", async () => {
    // companyId tem índice, não unicidade: escolher "a mais recente" cobraria
    // a assinatura errada.
    subscriptionFindMany.mockResolvedValue([{ id: "a" }, { id: "b" }]);

    const r = await run();

    expect(r).toMatchObject({ kind: "error", code: "ambiguous_subscription" });
    expect(invoiceCreate).not.toHaveBeenCalled();
  });

  it("recusa plano de preço zero em vez de emitir cobrança de R$ 0", async () => {
    subscriptionFindMany.mockResolvedValue([
      {
        id: SUB_ID,
        status: "TRIAL",
        trialEndsAt: null,
        billingCycle: "MONTHLY",
        discountPercent: null,
        discountExpiresAt: null,
        plan: { priceMonthly: 0, priceYearly: 0, name: "Interno — Domus" },
      },
    ]);

    const r = await run();

    expect(r).toMatchObject({ kind: "error", code: "invalid_price" });
    expect(invoiceCreate).not.toHaveBeenCalled();
  });
});
