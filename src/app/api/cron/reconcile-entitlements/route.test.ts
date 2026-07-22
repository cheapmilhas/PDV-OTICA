import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/vis-domus-publisher", () => ({
  publishEntitlementForCompany: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { company: { findMany: vi.fn() } },
}));
// O molde plan-change-retry importa withHeartbeat: mockamos como pass-through.
vi.mock("@/lib/cron-instrument", () => ({
  withHeartbeat: (_name: string, fn: () => any) => fn(),
}));

import { GET } from "./route";
import { prisma } from "@/lib/prisma";
import { publishEntitlementForCompany } from "@/lib/vis-domus-publisher";

const CRON_SECRET = "test-cron-secret";
beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = CRON_SECRET;
});

function req(auth?: string) {
  return new Request("http://x/api/cron/reconcile-entitlements", {
    headers: auth ? { authorization: auth } : {},
  });
}

describe("reconcile-entitlements cron", () => {
  it("sem Bearer → 401", async () => {
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(publishEntitlementForCompany).not.toHaveBeenCalled();
  });
  it("Bearer errado → 401", async () => {
    const res = await GET(req("Bearer wrong"));
    expect(res.status).toBe(401);
  });
  it("Bearer certo → publica só as medical vinculadas", async () => {
    (prisma.company.findMany as any).mockResolvedValue([{ id: "c1" }, { id: "c2" }]);
    const res = await GET(req(`Bearer ${CRON_SECRET}`));
    expect(res.status).toBe(200);
    expect(publishEntitlementForCompany).toHaveBeenCalledWith("c1");
    expect(publishEntitlementForCompany).toHaveBeenCalledWith("c2");
    expect(prisma.company.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { platformProduct: "VIS_MEDICAL", domusClinicId: { not: null } },
      }),
    );
    // Telemetria honesta: reporta attempted (não published) — publish é best-effort/void.
    const body = await res.json();
    expect(body.attempted).toBe(2);
    expect(body.reconciled).toBe(2);
    expect(body).not.toHaveProperty("published");
  });
  it("falha de publish não derruba o handler (best-effort)", async () => {
    (prisma.company.findMany as any).mockResolvedValue([{ id: "c1" }]);
    (publishEntitlementForCompany as any).mockRejectedValueOnce(new Error("boom"));
    const res = await GET(req(`Bearer ${CRON_SECRET}`));
    expect(res.status).toBe(200);
  });
});
