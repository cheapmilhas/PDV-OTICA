import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/admin-session", () => ({
  getAdminSession: vi.fn(),
  requireCompanyScope: vi.fn(),
}));
vi.mock("@/services/manual-charge.service", () => ({
  createManualCharge: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }) },
}));

import { POST } from "./route";
import { getAdminSession, requireCompanyScope } from "@/lib/admin-session";
import { createManualCharge } from "@/services/manual-charge.service";

const mockGetAdminSession = vi.mocked(getAdminSession);
const mockRequireCompanyScope = vi.mocked(requireCompanyScope);
const mockCreateManualCharge = vi.mocked(createManualCharge);

function req(body: unknown) {
  return new Request("http://x", { method: "POST", body: JSON.stringify(body) });
}

const validBody = { companyId: "c1", amount: 5000, description: "Mensalidade" };

describe("POST /api/admin/charges", () => {
  beforeEach(() => {
    mockGetAdminSession.mockReset();
    mockRequireCompanyScope.mockReset();
    mockCreateManualCharge.mockReset();
  });

  it("401 sem sessão — não chama createManualCharge", async () => {
    mockGetAdminSession.mockResolvedValue(null);
    const res = await POST(req(validBody));
    expect(res.status).toBe(401);
    expect(mockCreateManualCharge).not.toHaveBeenCalled();
  });

  it("400 Zod quando amount não é positivo", async () => {
    mockGetAdminSession.mockResolvedValue({ id: "a", role: "ADMIN", isAdmin: true } as never);
    const res = await POST(req({ companyId: "c1", amount: 0, description: "x" }));
    expect(res.status).toBe(400);
    expect(mockCreateManualCharge).not.toHaveBeenCalled();
  });

  it("403 quando requireCompanyScope retorna null — não chama createManualCharge", async () => {
    mockGetAdminSession.mockResolvedValue({ id: "a", role: "ADMIN", isAdmin: true } as never);
    mockRequireCompanyScope.mockResolvedValue(null);
    const res = await POST(req(validBody));
    expect(res.status).toBe(403);
    expect(mockCreateManualCharge).not.toHaveBeenCalled();
  });

  it("400 com mensagem amigável quando CPF/CNPJ inválido", async () => {
    mockGetAdminSession.mockResolvedValue({ id: "a", role: "ADMIN", isAdmin: true } as never);
    mockRequireCompanyScope.mockResolvedValue({ id: "a", role: "ADMIN" });
    mockCreateManualCharge.mockRejectedValue(new Error("CPF/CNPJ inválido ou ausente"));
    const res = await POST(req(validBody));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("Cadastre o CNPJ/CPF");
  });

  it("400 quando empresa sem assinatura ativa", async () => {
    mockGetAdminSession.mockResolvedValue({ id: "a", role: "ADMIN", isAdmin: true } as never);
    mockRequireCompanyScope.mockResolvedValue({ id: "a", role: "ADMIN" });
    mockCreateManualCharge.mockRejectedValue(
      new Error("Empresa sem assinatura ativa para cobrar")
    );
    const res = await POST(req(validBody));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("assinatura");
  });

  it("200 caminho feliz — chama createManualCharge com adminId e dueDate null", async () => {
    mockGetAdminSession.mockResolvedValue({ id: "a", role: "ADMIN", isAdmin: true } as never);
    mockRequireCompanyScope.mockResolvedValue({ id: "a", role: "ADMIN" });
    mockCreateManualCharge.mockResolvedValue({
      invoiceId: "inv1",
      asaasChargeCreated: true,
      emailStatus: "SENT",
    });
    const res = await POST(req(validBody));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      success: true,
      invoiceId: "inv1",
      asaasChargeCreated: true,
      emailStatus: "SENT",
    });
    expect(mockCreateManualCharge).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: "c1",
        amount: 5000,
        description: "Mensalidade",
        adminId: "a",
        dueDate: null,
      })
    );
  });

  it("200 converte dueDate string para Date", async () => {
    mockGetAdminSession.mockResolvedValue({ id: "a", role: "ADMIN", isAdmin: true } as never);
    mockRequireCompanyScope.mockResolvedValue({ id: "a", role: "ADMIN" });
    mockCreateManualCharge.mockResolvedValue({
      invoiceId: "inv2",
      asaasChargeCreated: false,
      emailStatus: "QUEUED",
    });
    const res = await POST(
      req({ ...validBody, dueDate: "2026-07-01T00:00:00.000Z" })
    );
    expect(res.status).toBe(200);
    const call = mockCreateManualCharge.mock.calls[0][0];
    expect(call.dueDate).toBeInstanceOf(Date);
    expect((call.dueDate as Date).toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });
});
