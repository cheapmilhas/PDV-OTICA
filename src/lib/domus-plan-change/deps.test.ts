import { describe, it, expect, vi, beforeEach } from "vitest";

// Mocks de I/O. O $transaction interativo executa o callback com um `tx` que
// espelha os métodos usados dentro de applyLocal.
const txMock = {
  domusPlanChangeOp: { updateMany: vi.fn() },
  $queryRaw: vi.fn(),
  subscription: { update: vi.fn() },
  company: { update: vi.fn() },
  subscriptionHistory: { create: vi.fn() },
  globalAudit: { create: vi.fn() },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    domusPlanChangeOp: { findUnique: vi.fn(), updateMany: vi.fn() },
    subscription: { findUnique: vi.fn() },
    plan: { findUnique: vi.fn() },
    $transaction: vi.fn(async (cb: (tx: typeof txMock) => Promise<unknown>) => cb(txMock)),
  },
}));
vi.mock("@/lib/asaas", () => ({
  asaas: { subscriptions: { update: vi.fn() } },
}));
vi.mock("@/lib/vis-domus-publisher", () => ({ schedulePublishEntitlement: vi.fn() }));
vi.mock("@/lib/plan-features-cache", () => ({ invalidatePlanFeaturesCache: vi.fn() }));

import { buildSagaDeps } from "./deps";
import type { SagaOp } from "./executor";
import { prisma } from "@/lib/prisma";
import { asaas } from "@/lib/asaas";
import { invalidatePlanFeaturesCache } from "@/lib/plan-features-cache";

const opFindUnique = prisma.domusPlanChangeOp.findUnique as unknown as ReturnType<typeof vi.fn>;
const subFindUnique = prisma.subscription.findUnique as unknown as ReturnType<typeof vi.fn>;
const planFindUnique = prisma.plan.findUnique as unknown as ReturnType<typeof vi.fn>;
const asaasUpdate = asaas.subscriptions.update as unknown as ReturnType<typeof vi.fn>;

function makeOp(over: Partial<SagaOp> = {}): SagaOp {
  return {
    id: "op1",
    eventId: "ev1",
    visCompanyId: "co1",
    requestedTier: "clinic_full",
    targetPlanId: "plan_x",
    state: "BILLING_CONFIRMED",
    asaasRef: null,
    expiresAt: new Date(4102444800000), // 2100
    ...over,
  };
}

const PERSISTED = {
  subscriptionId: "sub1",
  asaasSubscriptionId: "asaas_1",
  priceApplied: 18990,
  billingCycle: "MONTHLY",
  targetPlanId: "plan_x",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("confirmBilling — identidade persistida + preflight (Fase B)", () => {
  it("cobra na assinatura PERSISTIDA (não busca por companyId) e retorna asaasRef real", async () => {
    opFindUnique.mockResolvedValue(PERSISTED);
    subFindUnique.mockResolvedValue({ companyId: "co1", status: "ACTIVE", asaasSubscriptionId: "asaas_1", billingCycle: "MONTHLY" });
    asaasUpdate.mockResolvedValue({ id: "asaas_1" });

    const deps = buildSagaDeps();
    const res = await deps.confirmBilling(makeOp());

    // cobrou o ID persistido, valor = priceApplied/100 (reais), idempotencyKey por eventId
    expect(asaasUpdate).toHaveBeenCalledWith("asaas_1", { value: 189.9 }, "plan-change:ev1");
    expect(res.asaasRef).toBe("asaas_1"); // resposta real do Asaas, não a chave
  });

  it("PREFLIGHT: asaasSubscriptionId mudou desde o congelamento → LANÇA, NÃO cobra", async () => {
    opFindUnique.mockResolvedValue(PERSISTED);
    // a subscription real agora aponta para OUTRO asaas id
    subFindUnique.mockResolvedValue({ companyId: "co1", status: "ACTIVE", asaasSubscriptionId: "asaas_OUTRO", billingCycle: "MONTHLY" });

    const deps = buildSagaDeps();
    await expect(deps.confirmBilling(makeOp())).rejects.toThrow(/asaasSubscriptionId mudou/);
    expect(asaasUpdate).not.toHaveBeenCalled();
  });

  it("PREFLIGHT: subscription de outra company → LANÇA, NÃO cobra", async () => {
    opFindUnique.mockResolvedValue(PERSISTED);
    subFindUnique.mockResolvedValue({ companyId: "OUTRA", status: "ACTIVE", asaasSubscriptionId: "asaas_1", billingCycle: "MONTHLY" });

    const deps = buildSagaDeps();
    await expect(deps.confirmBilling(makeOp())).rejects.toThrow(/não pertence/);
    expect(asaasUpdate).not.toHaveBeenCalled();
  });

  it("PREFLIGHT: billingCycle mudou (MONTHLY→YEARLY) → LANÇA, NÃO cobra (2ª rodada Codex)", async () => {
    opFindUnique.mockResolvedValue(PERSISTED); // congelou MONTHLY
    subFindUnique.mockResolvedValue({ companyId: "co1", status: "ACTIVE", asaasSubscriptionId: "asaas_1", billingCycle: "YEARLY" });

    const deps = buildSagaDeps();
    await expect(deps.confirmBilling(makeOp())).rejects.toThrow(/billingCycle mudou/);
    expect(asaasUpdate).not.toHaveBeenCalled();
  });

  it("identidade não persistida (op antiga) → LANÇA antes de tocar o Asaas", async () => {
    opFindUnique.mockResolvedValue({ ...PERSISTED, asaasSubscriptionId: null });
    const deps = buildSagaDeps();
    await expect(deps.confirmBilling(makeOp())).rejects.toThrow(/não persistida/);
    expect(asaasUpdate).not.toHaveBeenCalled();
  });

  // Achado Codex #1: preço congelado inválido (0/negativo) NÃO pode ir ao Asaas —
  // cobraria R$0 e o applyLocal liberaria o tier caro. Defesa dupla (endpoint+aqui).
  it("priceApplied <= 0 → LANÇA, NÃO cobra", async () => {
    opFindUnique.mockResolvedValue({ ...PERSISTED, priceApplied: 0 });
    subFindUnique.mockResolvedValue({ companyId: "co1", status: "ACTIVE", asaasSubscriptionId: "asaas_1", billingCycle: "MONTHLY" });
    const deps = buildSagaDeps();
    await expect(deps.confirmBilling(makeOp())).rejects.toThrow(/priceApplied inválido/);
    expect(asaasUpdate).not.toHaveBeenCalled();
  });
});

describe("applyLocal — atômico com CAS (Fase B)", () => {
  beforeEach(() => {
    opFindUnique.mockResolvedValue({ subscriptionId: "sub1", asaasSubscriptionId: "asaas_1", billingCycle: "MONTHLY", targetPlanId: "plan_x" });
    planFindUnique.mockResolvedValue({ id: "plan_x", name: "Clínica", maxUsers: 10, maxProducts: 100, maxBranches: 5 });
    // FOR UPDATE traz companyId/asaasSubscriptionId/billingCycle para revalidar.
    txMock.$queryRaw.mockResolvedValue([{ id: "sub1", planId: "plan_old", status: "ACTIVE", companyId: "co1", asaasSubscriptionId: "asaas_1", billingCycle: "MONTHLY" }]);
  });

  it("CAS pega (count 1) → aplica todos os efeitos no mesmo commit, applied=true", async () => {
    txMock.domusPlanChangeOp.updateMany.mockResolvedValue({ count: 1 });

    const deps = buildSagaDeps();
    const res = await deps.applyLocal(makeOp());

    expect(res.applied).toBe(true);
    // CAS foi a PRIMEIRA escrita (WHERE state=BILLING_CONFIRMED → LOCAL_APPLIED)
    expect(txMock.domusPlanChangeOp.updateMany).toHaveBeenCalledWith({
      where: { id: "op1", state: "BILLING_CONFIRMED" },
      data: { state: "LOCAL_APPLIED" },
    });
    expect(txMock.subscription.update).toHaveBeenCalledOnce();
    expect(txMock.company.update).toHaveBeenCalledOnce();
    // history e audit carregam planChangeOpId (trava anti-duplicata)
    expect(txMock.subscriptionHistory.create.mock.calls[0][0].data.planChangeOpId).toBe("op1");
    expect(txMock.globalAudit.create.mock.calls[0][0].data.planChangeOpId).toBe("op1");
    // cache invalidado FORA da tx, só após aplicar
    expect(invalidatePlanFeaturesCache).toHaveBeenCalledWith("co1");
  });

  it("CAS NÃO pega (count 0: op já avançou) → NENHUM efeito, applied=false", async () => {
    txMock.domusPlanChangeOp.updateMany.mockResolvedValue({ count: 0 });

    const deps = buildSagaDeps();
    const res = await deps.applyLocal(makeOp());

    expect(res.applied).toBe(false);
    expect(txMock.subscription.update).not.toHaveBeenCalled();
    expect(txMock.company.update).not.toHaveBeenCalled();
    expect(txMock.subscriptionHistory.create).not.toHaveBeenCalled();
    expect(txMock.globalAudit.create).not.toHaveBeenCalled();
    expect(invalidatePlanFeaturesCache).not.toHaveBeenCalled(); // não aplicou → sem cache bust
  });

  // Achado Codex #5: entre o CAS e o FOR UPDATE, a assinatura pode ter sido
  // substituída (admin/checkout). applyLocal REVALIDA a identidade DENTRO da tx.
  it("identidade divergiu dentro da tx (asaasSubscriptionId trocou) → LANÇA, aborta (rollback)", async () => {
    txMock.domusPlanChangeOp.updateMany.mockResolvedValue({ count: 1 });
    txMock.$queryRaw.mockResolvedValue([{ id: "sub1", planId: "plan_old", status: "ACTIVE", companyId: "co1", asaasSubscriptionId: "asaas_OUTRO", billingCycle: "MONTHLY" }]);

    const deps = buildSagaDeps();
    await expect(deps.applyLocal(makeOp())).rejects.toThrow(/asaasSubscriptionId divergiu/);
    // a exceção aborta a tx → o CAS é revertido; nenhum efeito de negócio confirma
    expect(txMock.subscription.update).not.toHaveBeenCalled();
    expect(invalidatePlanFeaturesCache).not.toHaveBeenCalled();
  });

  it("assinatura mudou de company dentro da tx → LANÇA, aborta", async () => {
    txMock.domusPlanChangeOp.updateMany.mockResolvedValue({ count: 1 });
    txMock.$queryRaw.mockResolvedValue([{ id: "sub1", planId: "plan_old", status: "ACTIVE", companyId: "OUTRA", asaasSubscriptionId: "asaas_1", billingCycle: "MONTHLY" }]);

    const deps = buildSagaDeps();
    await expect(deps.applyLocal(makeOp())).rejects.toThrow(/mudou de company/);
    expect(txMock.subscription.update).not.toHaveBeenCalled();
  });

  it("billingCycle divergiu dentro da tx (MONTHLY→YEARLY) → LANÇA, aborta (2ª rodada Codex)", async () => {
    txMock.domusPlanChangeOp.updateMany.mockResolvedValue({ count: 1 });
    // op congelou MONTHLY (opFindUnique do beforeEach); a sub virou YEARLY.
    txMock.$queryRaw.mockResolvedValue([{ id: "sub1", planId: "plan_old", status: "ACTIVE", companyId: "co1", asaasSubscriptionId: "asaas_1", billingCycle: "YEARLY" }]);

    const deps = buildSagaDeps();
    await expect(deps.applyLocal(makeOp())).rejects.toThrow(/billingCycle divergiu/);
    expect(txMock.subscription.update).not.toHaveBeenCalled();
  });
});

describe("transition / recordError — CAS monotônico (Fase B)", () => {
  it("transition faz updateMany com WHERE state=from (não regride)", async () => {
    (prisma.domusPlanChangeOp.updateMany as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });
    const deps = buildSagaDeps();
    const res = await deps.transition(makeOp({ state: "RECEIVED" }), "RECEIVED", "BILLING_REQUESTED");
    expect(res.applied).toBe(true);
    const call = (prisma.domusPlanChangeOp.updateMany as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.where).toMatchObject({ id: "op1", state: "RECEIVED" });
    expect(call.data.state).toBe("BILLING_REQUESTED");
  });

  it("transition applied=false quando o CAS não pega (count 0)", async () => {
    (prisma.domusPlanChangeOp.updateMany as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0 });
    const deps = buildSagaDeps();
    const res = await deps.transition(makeOp(), "LOCAL_APPLIED", "COMPLETED");
    expect(res.applied).toBe(false);
  });

  it("recordError nunca altera state (só lastError, com CAS no estado atual)", async () => {
    (prisma.domusPlanChangeOp.updateMany as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });
    const deps = buildSagaDeps();
    await deps.recordError(makeOp({ state: "BILLING_REQUESTED" }), "BILLING_REQUESTED", "asaas down");
    const call = (prisma.domusPlanChangeOp.updateMany as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.where).toMatchObject({ id: "op1", state: "BILLING_REQUESTED" });
    expect(call.data).not.toHaveProperty("state"); // NUNCA muda state
    expect(call.data.lastError).toBe("asaas down");
  });
});
