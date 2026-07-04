import { describe, it, expect, vi, beforeEach } from "vitest";

const getAdminSession = vi.fn();
const requireCompanyScope = vi.fn();
vi.mock("@/lib/admin-session", () => ({
  getAdminSession: () => getAdminSession(),
  requireCompanyScope: (...a: unknown[]) => requireCompanyScope(...a),
}));

const invoiceFindUnique = vi.fn();
const invoiceUpdate = vi.fn();
const subscriptionUpdate = vi.fn();
const auditCreate = vi.fn();
const txMock = {
  invoice: { update: (...a: unknown[]) => invoiceUpdate(...a) },
  subscription: { update: (...a: unknown[]) => subscriptionUpdate(...a) },
  globalAudit: { create: (...a: unknown[]) => auditCreate(...a) },
};
vi.mock("@/lib/prisma", () => ({
  prisma: {
    invoice: { findUnique: (...a: unknown[]) => invoiceFindUnique(...a), update: (...a: unknown[]) => invoiceUpdate(...a) },
    $transaction: (fn: (tx: unknown) => unknown) => fn(txMock),
  },
}));
vi.mock("@/lib/logger", () => ({ logger: { child: () => ({ info: vi.fn(), error: vi.fn() }) } }));

import { POST } from "./route";

function req(body: unknown) {
  return new Request("http://x/api/admin/faturas/inv1/workflow", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
const params = Promise.resolve({ id: "inv1" });

function setInvoice(subStatus: string) {
  invoiceFindUnique.mockResolvedValue({
    id: "inv1",
    subscriptionId: "sub1",
    subscription: { companyId: "co1", status: subStatus },
  });
}

describe("POST faturas/[id]/workflow — mark_paid (F4)", () => {
  beforeEach(() => {
    getAdminSession.mockReset().mockResolvedValue({ id: "a1", name: "Admin", role: "ADMIN" });
    requireCompanyScope.mockReset().mockResolvedValue({ id: "a1", role: "ADMIN" });
    invoiceFindUnique.mockReset();
    invoiceUpdate.mockReset().mockResolvedValue({});
    subscriptionUpdate.mockReset().mockResolvedValue({});
    auditCreate.mockReset().mockResolvedValue({});
  });

  it("PAST_DUE → marca paga E reativa a assinatura", async () => {
    setInvoice("PAST_DUE");
    const res = await POST(req({ action: "mark_paid", method: "PIX" }), { params });
    expect(res.status).toBe(200);
    expect(subscriptionUpdate).toHaveBeenCalledTimes(1);
    expect(subscriptionUpdate.mock.calls[0][0].data.status).toBe("ACTIVE");
    // F8: grava o método declarado
    expect(invoiceUpdate.mock.calls[0][0].data.paymentMethod).toBe("PIX");
  });

  it("CANCELED → marca paga mas NÃO ressuscita a assinatura (F4)", async () => {
    setInvoice("CANCELED");
    const res = await POST(req({ action: "mark_paid" }), { params });
    expect(res.status).toBe(200);
    expect(invoiceUpdate).toHaveBeenCalledTimes(1); // fatura vira PAID
    expect(subscriptionUpdate).not.toHaveBeenCalled(); // assinatura intocada
    expect(auditCreate.mock.calls[0][0].data.metadata.reactivatedSubscription).toBe(false);
  });

  it("SUSPENDED → também não reativa", async () => {
    setInvoice("SUSPENDED");
    await POST(req({ action: "mark_paid" }), { params });
    expect(subscriptionUpdate).not.toHaveBeenCalled();
  });
});

describe("POST faturas/[id]/workflow — add_note (F7)", () => {
  beforeEach(() => {
    getAdminSession.mockReset().mockResolvedValue({ id: "a1", name: "Admin", role: "ADMIN" });
    requireCompanyScope.mockReset().mockResolvedValue({ id: "a1", role: "ADMIN" });
    invoiceUpdate.mockReset().mockResolvedValue({});
    setInvoice("ACTIVE");
  });

  it("400 quando note ausente/vazio (não apaga a nota existente)", async () => {
    const res = await POST(req({ action: "add_note" }), { params });
    expect(res.status).toBe(400);
    expect(invoiceUpdate).not.toHaveBeenCalled();
  });

  it("salva nota válida (trim)", async () => {
    const res = await POST(req({ action: "add_note", note: "  cobrança manual  " }), { params });
    expect(res.status).toBe(200);
    expect(invoiceUpdate.mock.calls[0][0].data.adminNotes).toBe("cobrança manual");
  });
});
