import { describe, it, expect, vi, beforeEach } from "vitest";
const findMany = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { salePayment: { findMany: (...a: any) => findMany(...a) } } }));
import { cashService } from "@/services/cash.service";
beforeEach(() => vi.clearAllMocks());

function row(method: string, amount: number, n: number, seller = "Ana") {
  return { id: `p_${n}`, method, amount, sale: { id: `s_${n}`, number: n,
    createdAt: new Date("2026-06-12T09:00:00Z"), sellerUser: { name: seller } } };
}

describe("getShiftSalePayments (a prazo ativas)", () => {
  it("filtra notIn METHODS_IN_CASH + COMPLETED + not VOIDED; normaliza", async () => {
    findMany.mockResolvedValue([row("CREDIT_CARD", 1850, 580), row("AGREEMENT", 300, 581)]);
    const shift = { id: "sh1", branchId: "br1", openedAt: new Date("2026-06-12T08:00:00Z"), closedAt: null };
    const res = await cashService.getShiftSalePayments(shift, "co1");
    const arg = findMany.mock.calls[0][0];
    expect(arg.where.status).toEqual({ not: "VOIDED" });
    expect(arg.where.method).toEqual({ notIn: ["CASH", "PIX", "DEBIT_CARD"] });
    expect(arg.where.sale).toMatchObject({ companyId: "co1", branchId: "br1", status: "COMPLETED" });
    expect(arg.where.sale.createdAt).toMatchObject({ gte: shift.openedAt });
    expect(res[0]).toMatchObject({ kind: "RECEIVABLE", method: "CREDIT_CARD", amount: 1850, saleNumber: 580, sellerName: "Ana" });
    expect(typeof res[0].createdAt).toBe("string");
  });
  it("convênio e outro aparecem (C1)", async () => {
    findMany.mockResolvedValue([row("AGREEMENT", 100, 1), row("OTHER", 50, 2)]);
    const res = await cashService.getShiftSalePayments({ id: "s", branchId: "b", openedAt: new Date(), closedAt: null }, "co1");
    expect(res.map((r: any) => r.method).sort()).toEqual(["AGREEMENT", "OTHER"]);
  });
  it("turno fechado aplica lte closedAt", async () => {
    findMany.mockResolvedValue([]);
    const closedAt = new Date("2026-06-12T18:00:00Z");
    await cashService.getShiftSalePayments({ id: "s", branchId: "b", openedAt: new Date("2026-06-12T08:00:00Z"), closedAt }, "co1");
    expect(findMany.mock.calls[0][0].where.sale.createdAt).toMatchObject({ lte: closedAt });
  });
});

describe("getShiftVoidedReceivables (a prazo canceladas)", () => {
  it("filtra status VOIDED + sale CANCELED/REFUNDED + notIn METHODS_IN_CASH; flag voided", async () => {
    findMany.mockResolvedValue([row("CREDIT_CARD", 1850, 590)]);
    const res = await cashService.getShiftVoidedReceivables({ id: "s", branchId: "b", openedAt: new Date(), closedAt: null }, "co1");
    const arg = findMany.mock.calls[0][0];
    expect(arg.where.status).toEqual("VOIDED");
    expect(arg.where.method).toEqual({ notIn: ["CASH", "PIX", "DEBIT_CARD"] });
    expect(arg.where.sale.status).toEqual({ in: ["CANCELED", "REFUNDED"] });
    expect(res[0]).toMatchObject({ kind: "VOIDED", voided: true, method: "CREDIT_CARD", saleNumber: 590 });
  });
});
