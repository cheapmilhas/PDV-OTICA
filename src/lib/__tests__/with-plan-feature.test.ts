import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/plan-features-cache", () => ({
  getCachedPlanFeatures: vi.fn(),
}));

import { withPlanFeatureGuard } from "@/lib/with-plan-feature";
import { auth } from "@/auth";
import { getCachedPlanFeatures } from "@/lib/plan-features-cache";

const makeRequest = (path: string) =>
  new Request(`http://localhost${path}`);

const makeCtx = (params: Record<string, string> = {}) => ({
  params: Promise.resolve(params),
});

describe("withPlanFeatureGuard", () => {
  const originalEnv = process.env.DISABLE_PLAN_FEATURE_GATING;

  beforeEach(() => {
    vi.resetAllMocks();
    delete process.env.DISABLE_PLAN_FEATURE_GATING;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.DISABLE_PLAN_FEATURE_GATING;
    } else {
      process.env.DISABLE_PLAN_FEATURE_GATING = originalEnv;
    }
  });

  it("kill switch DISABLE_PLAN_FEATURE_GATING=true bypassa tudo", async () => {
    process.env.DISABLE_PLAN_FEATURE_GATING = "true";
    const handler = vi.fn(async () => new Response("ok"));
    const wrapped = withPlanFeatureGuard(handler);

    const res = await wrapped(makeRequest("/api/lens-treatments"), makeCtx());

    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalled();
    expect(auth).not.toHaveBeenCalled();
  });

  it("allow-list: /api/auth/* bypassa sem auth check", async () => {
    const handler = vi.fn(async () => new Response("ok"));
    const wrapped = withPlanFeatureGuard(handler);

    const res = await wrapped(makeRequest("/api/auth/session"), makeCtx());

    expect(res.status).toBe(200);
    expect(auth).not.toHaveBeenCalled();
  });

  it("allow-list: /api/admin-auth, /api/plan-features, /api/admin, /api/health também bypassam", async () => {
    const handler = vi.fn(async () => new Response("ok"));
    const wrapped = withPlanFeatureGuard(handler);

    for (const p of [
      "/api/admin-auth/login",
      "/api/plan-features",
      "/api/admin/companies",
      "/api/health",
    ]) {
      vi.resetAllMocks();
      await wrapped(makeRequest(p), makeCtx());
      expect(handler).toHaveBeenCalled();
      expect(auth).not.toHaveBeenCalled();
    }
  });

  it("sem session → delega ao handler (handler trata 401)", async () => {
    (auth as any).mockResolvedValue(null);
    const handler = vi.fn(async () => new Response("ok"));
    const wrapped = withPlanFeatureGuard(handler);

    await wrapped(makeRequest("/api/finance/entries"), makeCtx());

    expect(handler).toHaveBeenCalled();
  });

  it("session sem companyId → delega ao handler", async () => {
    (auth as any).mockResolvedValue({ user: {} });
    const handler = vi.fn(async () => new Response("ok"));
    const wrapped = withPlanFeatureGuard(handler);

    await wrapped(makeRequest("/api/finance/entries"), makeCtx());

    expect(handler).toHaveBeenCalled();
  });

  it("feature=false → 403 com code PLAN_FEATURE_REQUIRED", async () => {
    (auth as any).mockResolvedValue({ user: { companyId: "co1" } });
    (getCachedPlanFeatures as any).mockResolvedValue({
      features: { finance_entries: false },
      hasSubscription: true,
    });
    const handler = vi.fn(async () => new Response("ok"));
    const wrapped = withPlanFeatureGuard(handler);

    const res = await wrapped(makeRequest("/api/finance/entries"), makeCtx());

    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string; feature: string } };
    expect(body.error.code).toBe("PLAN_FEATURE_REQUIRED");
    expect(body.error.feature).toBe("finance_entries");
    expect(handler).not.toHaveBeenCalled();
  });

  it("feature=true → handler é chamado", async () => {
    (auth as any).mockResolvedValue({ user: { companyId: "co1" } });
    (getCachedPlanFeatures as any).mockResolvedValue({
      features: { finance_entries: true },
      hasSubscription: true,
    });
    const handler = vi.fn(async () => new Response("ok"));
    const wrapped = withPlanFeatureGuard(handler);

    const res = await wrapped(makeRequest("/api/finance/entries"), makeCtx());

    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalled();
  });

  it("fail-open: erro de DB não bloqueia (segue pra handler)", async () => {
    (auth as any).mockResolvedValue({ user: { companyId: "co1" } });
    (getCachedPlanFeatures as any).mockRejectedValue(new Error("db down"));
    const handler = vi.fn(async () => new Response("ok"));
    const wrapped = withPlanFeatureGuard(handler);

    const res = await wrapped(makeRequest("/api/finance/entries"), makeCtx());

    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalled();
  });

  it("preserva ctx (params) para handlers com dynamic segment", async () => {
    (auth as any).mockResolvedValue({ user: { companyId: "co1" } });
    (getCachedPlanFeatures as any).mockResolvedValue({
      features: { sales_refunds: true },
      hasSubscription: true,
    });
    const ctx = makeCtx({ id: "abc123" });
    const handler = vi.fn(async () => new Response("ok"));
    const wrapped = withPlanFeatureGuard(handler);

    await wrapped(makeRequest("/api/sales/abc123/refund"), ctx);

    expect(handler).toHaveBeenCalledWith(expect.any(Request), ctx);
  });

  it("path fora do catálogo: passa direto", async () => {
    (auth as any).mockResolvedValue({ user: { companyId: "co1" } });
    (getCachedPlanFeatures as any).mockResolvedValue({
      features: {}, // nada bloqueado especificamente
      hasSubscription: true,
    });
    const handler = vi.fn(async () => new Response("ok"));
    const wrapped = withPlanFeatureGuard(handler);

    const res = await wrapped(makeRequest("/api/customers"), makeCtx());

    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalled();
  });
});
