import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Comissão Fase 2 — reconciliar a tela de Metas.
 *
 * Kill-switch COMMISSION_ENGINE (global, fail-safe legacy). POST /api/goals/commissions
 * = "Fechar Mês" calcula/grava a comissão LEGADA (SellerCommission). Em modo "new" o
 * backend deve RECUSAR (403) — esconder o botão na UI não basta. Em "legacy" funciona.
 */

const requireAuth = vi.fn();
const getBranchId = vi.fn();
const getCompanyId = vi.fn();
const requirePermission = vi.fn();
vi.mock("@/lib/auth-helpers", () => ({
  requireAuth: () => requireAuth(),
  getBranchId: () => getBranchId(),
  getCompanyId: () => getCompanyId(),
  requirePermission: (...a: unknown[]) => requirePermission(...a),
}));

const requirePlanFeature = vi.fn();
vi.mock("@/lib/plan-features", () => ({
  requirePlanFeature: (...a: unknown[]) => requirePlanFeature(...a),
}));

const closeMonth = vi.fn();
const getCommissions = vi.fn();
vi.mock("@/services/goals.service", () => ({
  goalsService: {
    closeMonth: (...a: unknown[]) => closeMonth(...a),
    getCommissions: (...a: unknown[]) => getCommissions(...a),
  },
}));

import { POST } from "./route";

const ORIGINAL_ENGINE = process.env.COMMISSION_ENGINE;
const ORIGINAL_LIST = process.env.COMMISSION_ENGINE_NEW_COMPANIES;

function req(body: unknown = { year: 2026, month: 6 }) {
  return new Request("http://x/api/goals/commissions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

describe("POST /api/goals/commissions (Fechar Mês) — respeita o kill-switch POR ÓTICA", () => {
  beforeEach(() => {
    requireAuth.mockReset().mockResolvedValue({ user: { id: "u1" } });
    getBranchId.mockReset().mockResolvedValue("branch-1");
    getCompanyId.mockReset().mockResolvedValue("company-1");
    requirePermission.mockReset().mockResolvedValue({ user: { id: "u1", role: "GERENTE" } });
    requirePlanFeature.mockReset().mockResolvedValue(undefined);
    closeMonth.mockReset().mockResolvedValue({ message: "Mês fechado" });
    delete process.env.COMMISSION_ENGINE;
    delete process.env.COMMISSION_ENGINE_NEW_COMPANIES;
  });

  afterEach(() => {
    if (ORIGINAL_ENGINE === undefined) delete process.env.COMMISSION_ENGINE;
    else process.env.COMMISSION_ENGINE = ORIGINAL_ENGINE;
    if (ORIGINAL_LIST === undefined) delete process.env.COMMISSION_ENGINE_NEW_COMPANIES;
    else process.env.COMMISSION_ENGINE_NEW_COMPANIES = ORIGINAL_LIST;
  });

  it("ótica NA lista (new) → 403 e NÃO calcula/grava comissão legada", async () => {
    process.env.COMMISSION_ENGINE_NEW_COMPANIES = "company-1";
    const res = await POST(req());
    expect(res.status).toBe(403);
    expect(closeMonth).not.toHaveBeenCalled();
  });

  it("ótica FORA da lista (legacy) → fecha o mês normalmente", async () => {
    process.env.COMMISSION_ENGINE_NEW_COMPANIES = "outra-company";
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(closeMonth).toHaveBeenCalledOnce();
  });

  it("default fail-safe (sem lista = legacy) → fecha o mês", async () => {
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(closeMonth).toHaveBeenCalledOnce();
  });
});
