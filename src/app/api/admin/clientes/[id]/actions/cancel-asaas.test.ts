import { describe, it, expect, vi, beforeEach } from "vitest";

const getAdminSession = vi.fn();
const requireCompanyScope = vi.fn();
vi.mock("@/lib/admin-session", () => ({
  getAdminSession: () => getAdminSession(),
  requireCompanyScope: (...a: unknown[]) => requireCompanyScope(...a),
}));

const subscriptionFindFirst = vi.fn();
const subscriptionUpdate = vi.fn();
const auditCreate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    subscription: {
      findFirst: (...a: unknown[]) => subscriptionFindFirst(...a),
      update: (...a: unknown[]) => subscriptionUpdate(...a),
    },
    subscriptionHistory: { create: vi.fn() },
    globalAudit: { create: (...a: unknown[]) => auditCreate(...a) },
    $transaction: (ops: unknown[]) => Promise.all(ops),
  },
}));

const asaasCancel = vi.fn();
vi.mock("@/lib/asaas", () => ({
  asaas: { subscriptions: { cancel: (...a: unknown[]) => asaasCancel(...a) } },
}));
vi.mock("@/services/activity-log.service", () => ({ logActivity: vi.fn() }));
vi.mock("@/lib/plan-features-cache", () => ({ invalidatePlanFeaturesCache: vi.fn() }));
vi.mock("@/lib/plan-pricing", () => ({ planValueForCycle: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { child: () => ({ info: vi.fn(), error: vi.fn() }) } }));

import { POST } from "./route";

function req(body: unknown) {
  return new Request("http://x/api/admin/clientes/co1/actions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
const params = Promise.resolve({ id: "co1" });

describe("cancel_subscription — cancela no Asaas (F1)", () => {
  beforeEach(() => {
    getAdminSession.mockReset().mockResolvedValue({ id: "a1", name: "Admin", role: "ADMIN" });
    requireCompanyScope.mockReset().mockResolvedValue({ id: "a1", role: "ADMIN" });
    subscriptionUpdate.mockReset().mockResolvedValue({});
    auditCreate.mockReset().mockResolvedValue({});
    asaasCancel.mockReset().mockResolvedValue({ deleted: true, id: "asaas_1" });
  });

  it("com asaasSubscriptionId → chama asaas.subscriptions.cancel", async () => {
    subscriptionFindFirst.mockResolvedValue({
      id: "sub1", status: "ACTIVE", asaasSubscriptionId: "asaas_1",
    });
    const res = await POST(req({ action: "cancel_subscription", reason: "inadimplência" }), { params });
    expect(res.status).toBe(200);
    expect(asaasCancel).toHaveBeenCalledWith("asaas_1");
  });

  it("sem asaasSubscriptionId → não chama o Asaas (cancelamento só local)", async () => {
    subscriptionFindFirst.mockResolvedValue({
      id: "sub1", status: "ACTIVE", asaasSubscriptionId: null,
    });
    const res = await POST(req({ action: "cancel_subscription", reason: "teste" }), { params });
    expect(res.status).toBe(200);
    expect(asaasCancel).not.toHaveBeenCalled();
  });

  it("falha no Asaas → NÃO derruba o cancelamento local, marca billingSyncPending", async () => {
    subscriptionFindFirst.mockResolvedValue({
      id: "sub1", status: "ACTIVE", asaasSubscriptionId: "asaas_1",
    });
    asaasCancel.mockRejectedValue(new Error("asaas fora do ar"));
    const res = await POST(req({ action: "cancel_subscription", reason: "teste" }), { params });
    expect(res.status).toBe(200); // fail-soft
    const pendingCall = subscriptionUpdate.mock.calls.find(
      (c) => c[0]?.data?.billingSyncPending === true
    );
    expect(pendingCall).toBeTruthy();
    const failAudit = auditCreate.mock.calls.find((c) => c[0]?.data?.action === "BILLING_SYNC_FAILED");
    expect(failAudit).toBeTruthy();
  });
});
