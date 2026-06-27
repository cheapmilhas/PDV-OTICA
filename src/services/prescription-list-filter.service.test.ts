import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    prescription: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import { prescriptionService } from "./prescription.service";

beforeEach(() => vi.clearAllMocks());

describe("prescriptionService.list — filtros do Livro", () => {
  it("filtra por status quando informado (multi-tenant preservado)", async () => {
    await prescriptionService.list("co-1", 1, 10, undefined, undefined, "COMPLETA");
    const whereArg = (prisma.prescription.findMany as any).mock.calls[0][0].where;
    expect(whereArg).toEqual(expect.objectContaining({ companyId: "co-1", status: "COMPLETA" }));
  });

  it("sem status → where não inclui status", async () => {
    await prescriptionService.list("co-1", 1, 10);
    const whereArg = (prisma.prescription.findMany as any).mock.calls[0][0].where;
    expect(whereArg.status).toBeUndefined();
    expect(whereArg.companyId).toBe("co-1");
  });
});
