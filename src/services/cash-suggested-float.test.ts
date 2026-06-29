import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { cashShift: { findFirst: vi.fn() } },
}));

import { prisma } from "@/lib/prisma";
import { getSuggestedOpeningFloat } from "./cash.service";

beforeEach(() => vi.clearAllMocks());

describe("getSuggestedOpeningFloat", () => {
  it("retorna o closingDeclaredCash do último caixa fechado", async () => {
    (prisma.cashShift.findFirst as any).mockResolvedValue({ closingDeclaredCash: 150 });
    const r = await getSuggestedOpeningFloat("co-1", "br-1");
    expect(r).toBe(150);
    const where = (prisma.cashShift.findFirst as any).mock.calls[0][0].where;
    expect(where).toEqual(
      expect.objectContaining({ companyId: "co-1", branchId: "br-1", status: "CLOSED" })
    );
  });

  it("sem caixa anterior → 0", async () => {
    (prisma.cashShift.findFirst as any).mockResolvedValue(null);
    expect(await getSuggestedOpeningFloat("co-1", "br-1")).toBe(0);
  });

  it("valor negativo declarado → 0", async () => {
    (prisma.cashShift.findFirst as any).mockResolvedValue({ closingDeclaredCash: -5 });
    expect(await getSuggestedOpeningFloat("co-1", "br-1")).toBe(0);
  });
});
