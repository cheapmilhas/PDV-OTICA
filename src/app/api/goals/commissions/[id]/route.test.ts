import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Comissão Fase 2 — reconciliar a tela de Metas.
 *
 * Kill-switch COMMISSION_ENGINE (global, fail-safe legacy). PUT /api/goals/commissions/[id]
 * = "Pagar" marca a comissão LEGADA (SellerCommission) como paga. Em modo "new" o backend
 * deve RECUSAR (403) — esconder o botão na UI não basta (ninguém pode pagar via API direto).
 * Em "legacy" funciona como hoje.
 */

const requireAuth = vi.fn();
const getCompanyId = vi.fn();
const requirePermission = vi.fn();
vi.mock("@/lib/auth-helpers", () => ({
  requireAuth: () => requireAuth(),
  getCompanyId: () => getCompanyId(),
  requirePermission: (...a: unknown[]) => requirePermission(...a),
}));

const requirePlanFeature = vi.fn();
vi.mock("@/lib/plan-features", () => ({
  requirePlanFeature: (...a: unknown[]) => requirePlanFeature(...a),
}));

const markCommissionAsPaid = vi.fn();
vi.mock("@/services/goals.service", () => ({
  goalsService: {
    markCommissionAsPaid: (...a: unknown[]) => markCommissionAsPaid(...a),
  },
}));

import { PUT } from "./route";

const ORIGINAL_ENGINE = process.env.COMMISSION_ENGINE;
const ORIGINAL_LIST = process.env.COMMISSION_ENGINE_NEW_COMPANIES;

function req() {
  return new Request("http://x/api/goals/commissions/c1", { method: "PUT" }) as never;
}
const ctx = { params: Promise.resolve({ id: "c1" }) };

describe("PUT /api/goals/commissions/[id] (Pagar) — respeita o kill-switch POR ÓTICA", () => {
  beforeEach(() => {
    requireAuth.mockReset().mockResolvedValue({ user: { id: "u1" } });
    getCompanyId.mockReset().mockResolvedValue("company-1");
    requirePermission.mockReset().mockResolvedValue({ user: { id: "u1", role: "GERENTE" } });
    requirePlanFeature.mockReset().mockResolvedValue(undefined);
    markCommissionAsPaid.mockReset().mockResolvedValue({ id: "c1", status: "PAID" });
    delete process.env.COMMISSION_ENGINE;
    delete process.env.COMMISSION_ENGINE_NEW_COMPANIES;
  });

  afterEach(() => {
    if (ORIGINAL_ENGINE === undefined) delete process.env.COMMISSION_ENGINE;
    else process.env.COMMISSION_ENGINE = ORIGINAL_ENGINE;
    if (ORIGINAL_LIST === undefined) delete process.env.COMMISSION_ENGINE_NEW_COMPANIES;
    else process.env.COMMISSION_ENGINE_NEW_COMPANIES = ORIGINAL_LIST;
  });

  it("ótica NA lista (new) → 403 e NÃO marca comissão legada como paga", async () => {
    process.env.COMMISSION_ENGINE_NEW_COMPANIES = "company-1";
    const res = await PUT(req(), ctx);
    expect(res.status).toBe(403);
    expect(markCommissionAsPaid).not.toHaveBeenCalled();
  });

  it("ótica FORA da lista (legacy) → marca como paga normalmente", async () => {
    process.env.COMMISSION_ENGINE_NEW_COMPANIES = "outra-company";
    const res = await PUT(req(), ctx);
    expect(res.status).toBe(200);
    expect(markCommissionAsPaid).toHaveBeenCalledWith("c1", "company-1");
  });

  it("default fail-safe (sem lista = legacy) → marca como paga", async () => {
    const res = await PUT(req(), ctx);
    expect(res.status).toBe(200);
    expect(markCommissionAsPaid).toHaveBeenCalledWith("c1", "company-1");
  });
});
