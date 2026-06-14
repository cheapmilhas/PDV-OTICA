import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/admin-session", () => ({ getAdminSession: vi.fn() }));
vi.mock("@/services/invoice-send.service", () => ({ sendInvoiceCharge: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { invoice: { findUnique: vi.fn() } } }));
import { POST } from "./route";
import { getAdminSession } from "@/lib/admin-session";
import { sendInvoiceCharge } from "@/services/invoice-send.service";
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
    expect(sendInvoiceCharge).not.toHaveBeenCalled();
  });
  it("404 fatura inexistente (não chama sendInvoiceCharge)", async () => {
    (getAdminSession as any).mockResolvedValue({ id: "a", role: "ADMIN" });
    (prisma.invoice.findUnique as any).mockResolvedValue(null);
    const res = await POST(new Request("http://x", { method: "POST" }), ctx);
    expect(res.status).toBe(404);
    expect(sendInvoiceCharge).not.toHaveBeenCalled();
  });
  it("ADMIN → envia via sendInvoiceCharge e retorna status/alreadySentToday", async () => {
    (getAdminSession as any).mockResolvedValue({ id: "a", role: "ADMIN" });
    (prisma.invoice.findUnique as any).mockResolvedValue({ id: "inv_1" });
    (sendInvoiceCharge as any).mockResolvedValue({ status: "SENT", alreadySentToday: false });
    const res = await POST(new Request("http://x", { method: "POST" }), ctx);
    expect(res.status).toBe(200);
    expect(sendInvoiceCharge).toHaveBeenCalledWith("inv_1", "a");
    const body = await res.json();
    expect(body).toEqual({ success: true, status: "SENT", alreadySentToday: false });
  });
  it("sem paymentUrl → gera e envia (status SENT)", async () => {
    (getAdminSession as any).mockResolvedValue({ id: "a", role: "ADMIN" });
    (prisma.invoice.findUnique as any).mockResolvedValue({ id: "inv_1", paymentUrl: null });
    (sendInvoiceCharge as any).mockResolvedValue({ status: "SENT", alreadySentToday: false });
    const res = await POST(new Request("http://x", { method: "POST" }), ctx);
    expect(res.status).toBe(200);
    expect(sendInvoiceCharge).toHaveBeenCalledWith("inv_1", "a");
  });
});
