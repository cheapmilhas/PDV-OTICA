import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/vis-domus-publisher", () => ({
  tryPublishEntitlementForCompany: vi.fn(),
  tryRevokeEntitlementForClinic: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { $queryRaw: vi.fn(), $executeRaw: vi.fn() },
}));

import { runOutboxDrainBatch, runRevocationDrainBatch } from "@/lib/entitlement-outbox-worker";
import { prisma } from "@/lib/prisma";
import {
  tryPublishEntitlementForCompany,
  tryRevokeEntitlementForClinic,
} from "@/lib/vis-domus-publisher";

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

describe("runRevocationDrainBatch", () => {
  const CLINIC = "00000000-0000-4000-8000-000000000abc";
  const row = { domusClinicId: CLINIC, visCompanyId: "visco-1", reason: "UNLINKED", seq: BigInt(20) };
  it("published → deleta por (domusClinicId, seq) e passa os 4 args", async () => {
    (prisma.$queryRaw as any).mockResolvedValue([row]);
    (tryRevokeEntitlementForClinic as any).mockResolvedValue({ kind: "published" });
    (prisma.$executeRaw as any).mockResolvedValue(1);
    const r = await runRevocationDrainBatch();
    expect(tryRevokeEntitlementForClinic).toHaveBeenCalledWith("visco-1", CLINIC, "20", "UNLINKED");
    expect(prisma.$executeRaw).toHaveBeenCalledOnce();
    expect(r.revoked).toBe(1);
  });
  it("failed → NAO deleta", async () => {
    (prisma.$queryRaw as any).mockResolvedValue([row]);
    (tryRevokeEntitlementForClinic as any).mockResolvedValue({ kind: "failed", reason: "http 500" });
    const r = await runRevocationDrainBatch();
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
    expect(r.failed).toBe(1);
  });
  it("re-enqueue (seq mudou) → delete condicional nao casa, linha fica", async () => {
    (prisma.$queryRaw as any).mockResolvedValue([row]);
    (tryRevokeEntitlementForClinic as any).mockResolvedValue({ kind: "published" });
    (prisma.$executeRaw as any).mockResolvedValue(0);
    const r = await runRevocationDrainBatch();
    expect(r.revoked).toBe(1);
  });
});
