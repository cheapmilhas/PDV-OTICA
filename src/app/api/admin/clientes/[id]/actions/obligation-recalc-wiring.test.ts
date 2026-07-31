import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Testes de LIGAÇÃO da Task 9 na rota do painel.
 *
 * A decisão e a escrita já são cobertas por `src/lib/obligation-recalc.test.ts` e
 * `src/services/obligation-recalc.service.test.ts`. O que SÓ pode ser provado
 * aqui é que a rota chama o serviço, e que ela passa os argumentos CERTOS — em
 * particular o fim ANTIGO do trial, lido antes de a coluna ser sobrescrita.
 *
 * 🔥 Por que este arquivo existe: numa revisão por mutação, trocar
 * `oldTrialEndsAt: oldTrialEnd` por `oldTrialEndsAt: newEnd` no `extend_trial`
 * transformava a reavaliação inteira num no-op (a faixa "que voltou a ser
 * gratuita" ficava vazia) e NENHUM teste percebia. O bug seria invisível: a
 * extensão funcionaria, a tela diria sucesso, e a obrigação seguiria cobrando os
 * dias que o dono acabou de dar de graça — exatamente o defeito da §4.1.3.
 */

const getAdminSession = vi.fn();
const requireCompanyScope = vi.fn();
vi.mock("@/lib/admin-session", () => ({
  getAdminSession: () => getAdminSession(),
  requireCompanyScope: (...a: unknown[]) => requireCompanyScope(...a),
}));

const subscriptionFindFirst = vi.fn();
const subscriptionUpdate = vi.fn();
const planFindUnique = vi.fn();
const companyFindUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    subscription: {
      findFirst: (...a: unknown[]) => subscriptionFindFirst(...a),
      update: (...a: unknown[]) => subscriptionUpdate(...a),
    },
    plan: { findUnique: (...a: unknown[]) => planFindUnique(...a) },
    company: {
      findUnique: (...a: unknown[]) => companyFindUnique(...a),
      update: vi.fn(),
    },
    subscriptionHistory: { create: vi.fn() },
    globalAudit: { create: vi.fn().mockResolvedValue({}) },
    $transaction: (ops: unknown[]) => Promise.all(ops),
  },
}));

const applyContractChange = vi.fn();
vi.mock("@/services/obligation-recalc.service", () => ({
  applyContractChangeToObligations: (...a: unknown[]) => applyContractChange(...a),
}));

vi.mock("@/lib/asaas", () => ({
  asaas: { subscriptions: { update: vi.fn(), cancel: vi.fn() } },
}));
vi.mock("@/services/activity-log.service", () => ({ logActivity: vi.fn() }));
vi.mock("@/lib/plan-features-cache", () => ({ invalidatePlanFeaturesCache: vi.fn() }));
vi.mock("@/lib/plan-pricing", () => ({ planValueForCycle: vi.fn().mockReturnValue(189.9) }));
vi.mock("@/lib/vis-domus-publisher", () => ({ schedulePublishEntitlement: vi.fn() }));
vi.mock("@/services/trial-conversion-charge.service", () => ({
  createTrialConversionCharge: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}));

import { POST } from "./route";

const COMPANY_ID = "co1";
const SUB_ID = "sub1";

function req(body: unknown) {
  return new Request("http://x/api/admin/clientes/co1/actions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
const params = Promise.resolve({ id: COMPANY_ID });

beforeEach(() => {
  getAdminSession.mockReset().mockResolvedValue({ id: "a1", name: "Admin", role: "ADMIN" });
  requireCompanyScope.mockReset().mockResolvedValue({ id: "a1", role: "ADMIN" });
  subscriptionUpdate.mockReset().mockResolvedValue({});
  subscriptionFindFirst.mockReset();
  planFindUnique.mockReset();
  companyFindUnique.mockReset();
  applyContractChange.mockReset().mockResolvedValue({
    kind: "applied",
    recalculadas: [],
    mantidas: [],
    inalteradas: 0,
  });
});

describe("extend_trial liga a reavaliação de obrigações (§4.1.3)", () => {
  const FIM_ANTIGO = new Date("2026-10-04T00:00:00Z");

  it("🔑 passa o fim ANTIGO do trial, não o novo", async () => {
    // Com o fim NOVO nos dois campos, a faixa "voltou a ser gratuita" fica vazia
    // e a reavaliação inteira vira no-op silencioso.
    subscriptionFindFirst.mockResolvedValue({
      id: SUB_ID,
      status: "TRIAL",
      trialEndsAt: FIM_ANTIGO,
    });

    const res = await POST(req({ action: "extend_trial" }), { params });

    expect(res.status).toBe(200);
    expect(applyContractChange).toHaveBeenCalledTimes(1);
    const [subId, companyId, change] = applyContractChange.mock.calls[0];
    expect(subId).toBe(SUB_ID);
    expect(companyId).toBe(COMPANY_ID);
    expect(change.kind).toBe("trial_extension");
    expect(change.oldTrialEndsAt).toEqual(FIM_ANTIGO);
    // E o novo é 7 dias depois — a faixa gratuita tem que ter largura.
    expect(change.newTrialEndsAt.getTime()).toBeGreaterThan(FIM_ANTIGO.getTime());
  });

  it("trial sem data anterior passa oldTrialEndsAt nulo (fail-closed no módulo puro)", async () => {
    subscriptionFindFirst.mockResolvedValue({ id: SUB_ID, status: "TRIAL", trialEndsAt: null });

    await POST(req({ action: "extend_trial" }), { params });

    expect(applyContractChange.mock.calls[0][2].oldTrialEndsAt).toBeNull();
  });

  it("falha da reavaliação NÃO derruba a extensão (o contrato já está commitado)", async () => {
    subscriptionFindFirst.mockResolvedValue({
      id: SUB_ID,
      status: "TRIAL",
      trialEndsAt: FIM_ANTIGO,
    });
    applyContractChange.mockResolvedValue({ kind: "failed", detail: "banco fora" });

    const res = await POST(req({ action: "extend_trial" }), { params });

    expect(res.status).toBe(200);
  });
});

describe("change_plan liga a reavaliação de obrigações (§4.1.2)", () => {
  function armarTroca() {
    planFindUnique.mockResolvedValue({
      id: "plan-pro",
      name: "Pro",
      platformProduct: "MEDICAL",
      priceMonthly: 29990,
      priceYearly: 299900,
      maxUsers: 10,
      maxProducts: 100,
      maxBranches: 2,
    });
    companyFindUnique.mockResolvedValue({ platformProduct: "MEDICAL" });
    subscriptionFindFirst.mockResolvedValue({
      id: SUB_ID,
      status: "ACTIVE",
      billingCycle: "MONTHLY",
      asaasSubscriptionId: null,
      plan: { id: "plan-basico", name: "Básico", priceMonthly: 18990 },
    });
  }

  it("🔑 passa o plano de ORIGEM e o de DESTINO", async () => {
    armarTroca();

    const res = await POST(req({ action: "change_plan", planId: "plan-pro" }), { params });

    expect(res.status).toBe(200);
    expect(applyContractChange).toHaveBeenCalledTimes(1);
    const [subId, companyId, change] = applyContractChange.mock.calls[0];
    expect(subId).toBe(SUB_ID);
    expect(companyId).toBe(COMPANY_ID);
    expect(change).toEqual({
      kind: "plan_change",
      fromPlanId: "plan-basico",
      toPlanId: "plan-pro",
    });
  });

  it("falha da reavaliação NÃO derruba a troca de plano", async () => {
    armarTroca();
    applyContractChange.mockResolvedValue({ kind: "failed", detail: "banco fora" });

    const res = await POST(req({ action: "change_plan", planId: "plan-pro" }), { params });

    expect(res.status).toBe(200);
  });

  it("troca RECUSADA (plano de outro produto) não chama a reavaliação", async () => {
    // Nada mudou no contrato: reavaliar aqui invalidaria obrigação por uma troca
    // que não aconteceu.
    planFindUnique.mockResolvedValue({ id: "plan-otica", platformProduct: "OPTICS" });
    companyFindUnique.mockResolvedValue({ platformProduct: "MEDICAL" });

    const res = await POST(req({ action: "change_plan", planId: "plan-otica" }), { params });

    expect(res.status).toBe(400);
    expect(applyContractChange).not.toHaveBeenCalled();
  });
});
