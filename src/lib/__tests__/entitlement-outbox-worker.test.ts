import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/vis-domus-publisher", () => ({
  tryPublishEntitlementForCompany: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { $queryRaw: vi.fn(), $executeRaw: vi.fn() },
}));

import { runOutboxDrainBatch } from "@/lib/entitlement-outbox-worker";
import { prisma } from "@/lib/prisma";
import { tryPublishEntitlementForCompany } from "@/lib/vis-domus-publisher";

beforeEach(() => vi.clearAllMocks());

describe("runOutboxDrainBatch", () => {
  it("published → deleta a linha por (companyId, seq)", async () => {
    (prisma.$queryRaw as any).mockResolvedValue([{ companyId: "c1", seq: BigInt(10) }]);
    (tryPublishEntitlementForCompany as any).mockResolvedValue({ kind: "published" });
    (prisma.$executeRaw as any).mockResolvedValue(1);
    const r = await runOutboxDrainBatch();
    expect(tryPublishEntitlementForCompany).toHaveBeenCalledWith("c1");
    expect(prisma.$executeRaw).toHaveBeenCalledOnce();
    expect(r.drained).toBe(1);
  });
  it("noop → tambem deleta (company deixou de ser medical)", async () => {
    (prisma.$queryRaw as any).mockResolvedValue([{ companyId: "c1", seq: BigInt(10) }]);
    (tryPublishEntitlementForCompany as any).mockResolvedValue({ kind: "noop" });
    (prisma.$executeRaw as any).mockResolvedValue(1);
    const r = await runOutboxDrainBatch();
    expect(prisma.$executeRaw).toHaveBeenCalledOnce();
    expect(r.drained).toBe(1);
  });
  it("failed → NAO deleta, reprocessa no proximo tick", async () => {
    (prisma.$queryRaw as any).mockResolvedValue([{ companyId: "c1", seq: BigInt(10) }]);
    (tryPublishEntitlementForCompany as any).mockResolvedValue({ kind: "failed", reason: "http 500" });
    const r = await runOutboxDrainBatch();
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
    expect(r.failed).toBe(1);
  });
  it("re-enqueue durante publish (seq avancou) → delete condicional nao casa, linha fica", async () => {
    (prisma.$queryRaw as any).mockResolvedValue([{ companyId: "c1", seq: BigInt(10) }]);
    (tryPublishEntitlementForCompany as any).mockResolvedValue({ kind: "published" });
    (prisma.$executeRaw as any).mockResolvedValue(0); // 0 linhas: seq mudou
    const r = await runOutboxDrainBatch();
    expect(r.drained).toBe(1); // publicou o estado que leu; o novo seq drena no proximo tick
  });
});
