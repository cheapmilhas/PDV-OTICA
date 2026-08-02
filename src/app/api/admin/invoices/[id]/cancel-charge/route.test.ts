/**
 * Testes do gate de `POST /api/admin/invoices/[id]/cancel-charge`.
 *
 * 🚨 O SERVIÇO É MOCKADO — nada aqui chega perto do Asaas. Todo teste de recusa
 * assere `expect(cancelInvoiceCharge).not.toHaveBeenCalled()`: a invariante é
 * que a rota barra ANTES de qualquer coisa que fale com o gateway.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/admin-session", () => ({
  getAdminSession: vi.fn(),
  requireCompanyScope: vi.fn(),
}));
vi.mock("@/services/invoice-cancel-charge.service", () => ({
  cancelInvoiceCharge: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: { invoice: { findUnique: vi.fn() } } }));

import { POST } from "./route";
import { getAdminSession, requireCompanyScope } from "@/lib/admin-session";
import { cancelInvoiceCharge } from "@/services/invoice-cancel-charge.service";
import { prisma } from "@/lib/prisma";

const ctx = { params: Promise.resolve({ id: "inv_1" }) };
const INVOICE = { id: "inv_1", subscription: { companyId: "co_1" } };
const req = () => new Request("http://x", { method: "POST" });

beforeEach(() => {
  vi.clearAllMocks();
  (prisma.invoice.findUnique as any).mockResolvedValue(INVOICE);
  (requireCompanyScope as any).mockResolvedValue({ id: "adm_1", role: "SUPER_ADMIN" });
  (cancelInvoiceCharge as any).mockResolvedValue({
    ok: true,
    outcome: "canceled",
    gateway: "deleted",
    asaasPaymentId: "pay_x",
  });
});

describe("gate de papel", () => {
  it("401 sem sessão", async () => {
    (getAdminSession as any).mockResolvedValue(null);
    const res = await POST(req(), ctx);
    expect(res.status).toBe(401);
    expect(cancelInvoiceCharge).not.toHaveBeenCalled();
  });

  it("🔥 403 para ADMIN — cancelar cobrança é SUPER_ADMIN only", async () => {
    (getAdminSession as any).mockResolvedValue({ id: "adm_1", role: "ADMIN" });
    const res = await POST(req(), ctx);
    expect(res.status).toBe(403);
    expect(cancelInvoiceCharge).not.toHaveBeenCalled();
  });

  it("403 para BILLING (está em FINANCE_ROLES, mas não aqui)", async () => {
    (getAdminSession as any).mockResolvedValue({ id: "adm_1", role: "BILLING" });
    const res = await POST(req(), ctx);
    expect(res.status).toBe(403);
    expect(cancelInvoiceCharge).not.toHaveBeenCalled();
  });

  it("403 para SUPPORT", async () => {
    (getAdminSession as any).mockResolvedValue({ id: "adm_1", role: "SUPPORT" });
    const res = await POST(req(), ctx);
    expect(res.status).toBe(403);
    expect(cancelInvoiceCharge).not.toHaveBeenCalled();
  });

  it("🔥 403 quando o JWT diz SUPER_ADMIN mas o BANCO diz ADMIN", async () => {
    // Cookie velho de quem foi rebaixado. `requireCompanyScope` aceita ADMIN,
    // então sem a 2ª checagem sobre o valor lido do banco isto passaria.
    (getAdminSession as any).mockResolvedValue({ id: "adm_1", role: "SUPER_ADMIN" });
    (requireCompanyScope as any).mockResolvedValue({ id: "adm_1", role: "ADMIN" });
    const res = await POST(req(), ctx);
    expect(res.status).toBe(403);
    expect(cancelInvoiceCharge).not.toHaveBeenCalled();
  });

  it("403 quando o admin está fora do escopo da empresa", async () => {
    (getAdminSession as any).mockResolvedValue({ id: "adm_1", role: "SUPER_ADMIN" });
    (requireCompanyScope as any).mockResolvedValue(null);
    const res = await POST(req(), ctx);
    expect(res.status).toBe(403);
    expect(cancelInvoiceCharge).not.toHaveBeenCalled();
    expect(requireCompanyScope).toHaveBeenCalledWith("adm_1", "co_1");
  });

  it("404 fatura inexistente — sem chamar o serviço", async () => {
    (getAdminSession as any).mockResolvedValue({ id: "adm_1", role: "SUPER_ADMIN" });
    (prisma.invoice.findUnique as any).mockResolvedValue(null);
    const res = await POST(req(), ctx);
    expect(res.status).toBe(404);
    expect(cancelInvoiceCharge).not.toHaveBeenCalled();
  });
});

describe("caminho autorizado", () => {
  beforeEach(() => {
    (getAdminSession as any).mockResolvedValue({ id: "adm_1", role: "SUPER_ADMIN" });
  });

  it("SUPER_ADMIN → 200 e delega ao serviço com invoiceId + adminId", async () => {
    const res = await POST(req(), ctx);
    expect(res.status).toBe(200);
    expect(cancelInvoiceCharge).toHaveBeenCalledWith("inv_1", "adm_1");
    expect(await res.json()).toEqual({
      success: true,
      outcome: "canceled",
      gateway: "deleted",
      asaasPaymentId: "pay_x",
    });
  });

  it("já cancelada → 200 idempotente", async () => {
    (cancelInvoiceCharge as any).mockResolvedValue({
      ok: true,
      outcome: "already_canceled",
      gateway: "skipped",
      asaasPaymentId: "pay_x",
    });
    const res = await POST(req(), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).outcome).toBe("already_canceled");
  });

  it("🔥 recusa por fatura PAGA → 409 com a mensagem do serviço", async () => {
    (cancelInvoiceCharge as any).mockResolvedValue({
      ok: false,
      reason: "paid",
      message: "Fatura PAGA não é cancelada por aqui — o caminho é ESTORNO.",
    });
    const res = await POST(req(), ctx);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.reason).toBe("paid");
    expect(body.error).toContain("ESTORNO");
  });

  it("recusa por obrigação vinculada → 409", async () => {
    (cancelInvoiceCharge as any).mockResolvedValue({
      ok: false,
      reason: "has_obligation",
      message: "Esta fatura cobra uma obrigação do motor de cobrança.",
    });
    const res = await POST(req(), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).reason).toBe("has_obligation");
  });

  it("🔥 erro do gateway → 502, e a resposta NÃO é sucesso", async () => {
    (cancelInvoiceCharge as any).mockResolvedValue({
      ok: false,
      reason: "gateway_error",
      message: "O Asaas recusou o cancelamento (500). Nada foi alterado.",
    });
    const res = await POST(req(), ctx);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.success).toBeUndefined();
    expect(body.error).toContain("Nada foi alterado");
  });

  it("exceção inesperada → 500 sem vazar detalhe", async () => {
    (cancelInvoiceCharge as any).mockRejectedValue(new Error("boom secreto"));
    const res = await POST(req(), ctx);
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("Erro interno");
  });
});
