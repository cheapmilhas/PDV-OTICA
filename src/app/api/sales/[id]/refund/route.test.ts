import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * SEC-001 (Fase 1): POST /api/sales/[id]/refund deve exigir a permissão
 * sales.refund. Sem ela → 403 (antes qualquer logado devolvia venda).
 */

const requirePermission = vi.fn();
vi.mock("@/lib/auth-permissions", () => ({
  requirePermission: (...a: unknown[]) => requirePermission(...a),
}));

const getCompanyId = vi.fn();
vi.mock("@/lib/auth-helpers", () => ({
  getCompanyId: () => getCompanyId(),
}));

const refundFull = vi.fn();
vi.mock("@/services/sale.service", () => ({
  saleService: { refundFull: (...a: unknown[]) => refundFull(...a) },
}));

// withPlanFeatureGuard é passthrough no teste (não exercita plano).
vi.mock("@/lib/with-plan-feature", () => ({
  withPlanFeatureGuard: (handler: unknown) => handler,
}));

import { POST } from "./route";
import { forbiddenError } from "@/lib/error-handler";

function req(body: unknown = { reason: "teste" }) {
  return new Request("http://x/api/sales/abc/refund", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
const ctx = { params: Promise.resolve({ id: "sale-1" }) };

describe("POST /api/sales/[id]/refund — SEC-001", () => {
  beforeEach(() => {
    requirePermission.mockReset();
    getCompanyId.mockReset();
    refundFull.mockReset();
  });

  it("retorna 403 quando o usuário não tem sales.refund", async () => {
    // requirePermission lança AppError 403 (forbidden) — simula VENDEDOR/CAIXA.
    // Usa o helper real do projeto para que handleApiError reconheça via instanceof.
    requirePermission.mockRejectedValue(forbiddenError("Sem permissão: sales.refund"));

    const res = await POST(req(), ctx);
    expect(res.status).toBe(403);
    // não chegou a executar a devolução
    expect(refundFull).not.toHaveBeenCalled();
  });

  it("executa a devolução quando o usuário tem sales.refund (GERENTE/ADMIN)", async () => {
    requirePermission.mockResolvedValue({ user: { id: "u1", role: "GERENTE" } });
    getCompanyId.mockResolvedValue("company-1");
    refundFull.mockResolvedValue({ id: "sale-1", status: "REFUNDED" });

    const res = await POST(req(), ctx);
    expect(res.status).toBe(201);
    expect(requirePermission).toHaveBeenCalledWith("sales.refund");
    expect(refundFull).toHaveBeenCalledOnce();
  });
});
