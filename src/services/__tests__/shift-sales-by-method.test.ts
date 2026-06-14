import { describe, it, expect, vi, beforeEach } from "vitest";

const groupBy = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { salePayment: { groupBy: (...a: any) => groupBy(...a) } } }));

import { cashService } from "@/services/cash.service";

beforeEach(() => vi.clearAllMocks());

describe("getShiftSalesByMethod", () => {
  it("agrupa por método via SalePayment com filtros corretos", async () => {
    groupBy.mockResolvedValue([
      { method: "CREDIT_CARD", _sum: { amount: 5000 }, _count: 3 },
      { method: "CASH", _sum: { amount: 200 }, _count: 2 },
    ]);
    const shift = { id: "sh1", branchId: "br1", openedAt: new Date("2026-06-12T08:00:00Z"), closedAt: null };
    const result = await cashService.getShiftSalesByMethod(shift, "co1");

    const arg = groupBy.mock.calls[0][0];
    expect(arg.by).toEqual(["method"]);
    expect(arg.where.status).toEqual({ not: "VOIDED" });
    expect(arg.where.sale).toMatchObject({ companyId: "co1", branchId: "br1", status: "COMPLETED" });
    expect(arg.where.sale.createdAt).toMatchObject({ gte: shift.openedAt });

    const credito = result.find((r: any) => r.method === "CREDIT_CARD");
    expect(credito).toMatchObject({ amount: 5000, count: 3 });
  });

  it("turno fechado aplica limite superior closedAt", async () => {
    groupBy.mockResolvedValue([]);
    const closedAt = new Date("2026-06-12T18:00:00Z");
    await cashService.getShiftSalesByMethod({ id: "sh1", branchId: "br1", openedAt: new Date("2026-06-12T08:00:00Z"), closedAt }, "co1");
    expect(groupBy.mock.calls[0][0].where.sale.createdAt).toMatchObject({ lte: closedAt });
  });

  it("normaliza _sum.amount null para 0", async () => {
    groupBy.mockResolvedValue([{ method: "PIX", _sum: { amount: null }, _count: 0 }]);
    const result = await cashService.getShiftSalesByMethod({ id: "sh1", branchId: "br1", openedAt: new Date(), closedAt: null }, "co1");
    expect(result[0]).toMatchObject({ method: "PIX", amount: 0, count: 0 });
  });
});
