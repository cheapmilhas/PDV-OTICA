import { describe, it, expect, vi, beforeEach } from "vitest";

const getAdminSession = vi.fn();
const requireCompanyScope = vi.fn();
vi.mock("@/lib/admin-session", () => ({
  getAdminSession: () => getAdminSession(),
  requireCompanyScope: (...a: unknown[]) => requireCompanyScope(...a),
}));

const subscriptionFindUnique = vi.fn();
const invoiceCreate = vi.fn();
const auditCreate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    subscription: { findUnique: (...a: unknown[]) => subscriptionFindUnique(...a) },
    invoice: { create: (...a: unknown[]) => invoiceCreate(...a) },
    globalAudit: { create: (...a: unknown[]) => auditCreate(...a) },
  },
}));

const nextSaasInvoiceNumber = vi.fn();
vi.mock("@/lib/saas-invoice-number", () => ({
  nextSaasInvoiceNumber: () => nextSaasInvoiceNumber(),
}));
vi.mock("@/lib/logger", () => ({ logger: { child: () => ({ error: vi.fn() }) } }));

import { POST } from "./route";

function req(body: unknown) {
  return new Request("http://x/api/admin/faturas/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST faturas/create (F2/F3/F6)", () => {
  beforeEach(() => {
    getAdminSession.mockReset().mockResolvedValue({ id: "a1", name: "Admin", role: "ADMIN" });
    requireCompanyScope.mockReset().mockResolvedValue({ id: "a1", role: "ADMIN" });
    subscriptionFindUnique.mockReset().mockResolvedValue({
      id: "sub1",
      companyId: "co1",
      plan: { priceMonthly: 14990 },
    });
    invoiceCreate.mockReset().mockResolvedValue({ id: "inv1", number: "INV-000042", total: 14990 });
    auditCreate.mockReset().mockResolvedValue({});
    nextSaasInvoiceNumber.mockReset().mockResolvedValue("INV-000042");
  });

  it("F3: usa o gerador atômico de número (não count()+1)", async () => {
    const res = await POST(req({ subscriptionId: "sub1" }));
    expect(res.status).toBe(200);
    expect(nextSaasInvoiceNumber).toHaveBeenCalledTimes(1);
    expect(invoiceCreate.mock.calls[0][0].data.number).toBe("INV-000042");
  });

  it("F3: rejeita customValue negativo (400, não cria)", async () => {
    const res = await POST(req({ subscriptionId: "sub1", customValue: -100 }));
    expect(res.status).toBe(400);
    expect(invoiceCreate).not.toHaveBeenCalled();
  });

  it("F3: rejeita customValue fracionário (400)", async () => {
    const res = await POST(req({ subscriptionId: "sub1", customValue: 149.9 }));
    expect(res.status).toBe(400);
    expect(invoiceCreate).not.toHaveBeenCalled();
  });

  it("usa preço do plano quando customValue ausente", async () => {
    await POST(req({ subscriptionId: "sub1" }));
    expect(invoiceCreate.mock.calls[0][0].data.total).toBe(14990);
  });

  it("F6: mapeia CARTAO → CREDIT_CARD (Asaas)", async () => {
    await POST(req({ subscriptionId: "sub1", billingType: "CARTAO" }));
    expect(invoiceCreate.mock.calls[0][0].data.billingType).toBe("CREDIT_CARD");
  });

  it("F6: mapeia TRANSFERENCIA → UNDEFINED (Asaas não tem transferência)", async () => {
    await POST(req({ subscriptionId: "sub1", billingType: "TRANSFERENCIA" }));
    expect(invoiceCreate.mock.calls[0][0].data.billingType).toBe("UNDEFINED");
  });

  it("403 quando admin escopado não acessa a empresa", async () => {
    requireCompanyScope.mockResolvedValue(null);
    const res = await POST(req({ subscriptionId: "sub1" }));
    expect(res.status).toBe(403);
    expect(invoiceCreate).not.toHaveBeenCalled();
  });
});
