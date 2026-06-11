import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/admin-session", () => ({ getAdminSession: vi.fn() }));
vi.mock("@/services/saas-notification.service", () => ({ notifyCompany: vi.fn().mockResolvedValue({ status: "SENT" }) }));
vi.mock("@/lib/prisma", () => ({ prisma: { invoice: { findUnique: vi.fn() } } }));
import { POST } from "./route";
import { getAdminSession } from "@/lib/admin-session";
import { notifyCompany } from "@/services/saas-notification.service";
import { prisma } from "@/lib/prisma";

const ctx = { params: Promise.resolve({ id: "inv_1" }) };
beforeEach(() => vi.clearAllMocks());

describe("POST resend-charge", () => {
  it("401 sem sessão", async () => {
    (getAdminSession as any).mockResolvedValue(null);
    const res = await POST(new Request("http://x", { method: "POST" }), ctx);
    expect(res.status).toBe(401);
  });
  it("403 para role não autorizado (SUPPORT)", async () => {
    (getAdminSession as any).mockResolvedValue({ id: "a", role: "SUPPORT" });
    const res = await POST(new Request("http://x", { method: "POST" }), ctx);
    expect(res.status).toBe(403);
    expect(notifyCompany).not.toHaveBeenCalled();
  });
  it("404 fatura inexistente", async () => {
    (getAdminSession as any).mockResolvedValue({ id: "a", role: "ADMIN" });
    (prisma.invoice.findUnique as any).mockResolvedValue(null);
    const res = await POST(new Request("http://x", { method: "POST" }), ctx);
    expect(res.status).toBe(404);
  });
  it("ADMIN → reenfileira via notifyCompany com periodKey de resend datado", async () => {
    (getAdminSession as any).mockResolvedValue({ id: "a", role: "ADMIN" });
    (notifyCompany as any).mockResolvedValue({ status: "SENT" });
    (prisma.invoice.findUnique as any).mockResolvedValue({
      id: "inv_1", total: 14990, dueDate: new Date("2026-07-10"), paymentUrl: "https://asaas/i/1", boletoUrl: "https://asaas/b/1", pixCode: "PIX",
      subscription: { companyId: "c1", company: { name: "Ótica X" } },
    });
    const res = await POST(new Request("http://x", { method: "POST" }), ctx);
    expect(res.status).toBe(200);
    const [companyId, type, , opts] = (notifyCompany as any).mock.calls[0];
    expect(companyId).toBe("c1");
    expect(type).toBe("INVOICE_CREATED");
    expect(opts.channels).toEqual(["email"]);
    expect(opts.periodKey).toMatch(/^invoice:inv_1:resend:\d{8}$/);
  });
  it("400 quando a fatura não tem paymentUrl (nada a reenviar)", async () => {
    (getAdminSession as any).mockResolvedValue({ id: "a", role: "ADMIN" });
    (prisma.invoice.findUnique as any).mockResolvedValue({
      id: "inv_1", total: 14990, dueDate: new Date("2026-07-10"), paymentUrl: null, boletoUrl: null, pixCode: null,
      subscription: { companyId: "c1", company: { name: "Ótica X" } },
    });
    const res = await POST(new Request("http://x", { method: "POST" }), ctx);
    expect(res.status).toBe(400);
    expect(notifyCompany).not.toHaveBeenCalled();
  });
});
