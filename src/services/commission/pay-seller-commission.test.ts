import { describe, it, expect, vi, beforeEach } from "vitest";

// tx mock: create do CommissionPayment + ledger (helper). O $transaction roda a fn.
function makeTxClient() {
  return {
    commissionPayment: { create: vi.fn(async ({ data }: any) => ({ id: "cp_new", ...data })) },
    chartOfAccounts: { findUnique: vi.fn(async ({ where }: any) => ({ id: `acc-${where.companyId_code.code}` })) },
    financeEntry: { findUnique: vi.fn(async () => null), create: vi.fn(async () => ({ id: "fe-1" })) },
    financeAccount: { findFirst: vi.fn(async () => ({ id: "fa-CASH" })), update: vi.fn(async () => ({})) },
  };
}
vi.mock("@/lib/prisma", () => ({
  prisma: {
    commissionPayment: { findUnique: vi.fn() },
    branch: { findFirst: vi.fn() },
    user: { findFirst: vi.fn() },
    $transaction: vi.fn(async (fn: any) => fn(makeTxClient())),
  },
}));
vi.mock("./commission-engine", () => ({
  computeSellerCommission: vi.fn(),
}));

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { computeSellerCommission } from "./commission-engine";
import { paySellerCommission } from "./pay-seller-commission";

beforeEach(() => {
  vi.clearAllMocks();
  (prisma.branch.findFirst as any).mockResolvedValue({ id: "br_1" });
  (prisma.user.findFirst as any).mockResolvedValue({ name: "João" });
  (computeSellerCommission as any).mockResolvedValue({
    netSales: "10000", metaCommission: "500", campaignBonus: "100", total: "600",
    meta: { appliedPercent: "5" },
  });
});

const base = { companyId: "co_1", userId: "u_1", year: 2026, month: 2, paidByUserId: "admin_1" };

describe("paySellerCommission — pagamento do motor novo (Bloco 4)", () => {
  it("materializa o snapshot do motor numa única transação (pagamento+ledger)", async () => {
    (prisma.commissionPayment.findUnique as any).mockResolvedValue(null);

    const r = await paySellerCommission(base);
    expect(r.alreadyPaid).toBe(false);
    // o create acontece DENTRO do $transaction (atomicidade pagamento+ledger).
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(r.payment.companyId).toBe("co_1");
    expect(r.payment.userId).toBe("u_1");
    expect(Number(r.payment.totalCommission)).toBe(600);
  });

  it("é IDEMPOTENTE: se já pago, não recalcula nem abre transação (alreadyPaid=true)", async () => {
    (prisma.commissionPayment.findUnique as any).mockResolvedValue({ id: "cp_existente" });

    const r = await paySellerCommission(base);
    expect(r.alreadyPaid).toBe(true);
    expect(computeSellerCommission).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("trata corrida (P2002): 2ª chamada concorrente vira alreadyPaid", async () => {
    (prisma.commissionPayment.findUnique as any)
      .mockResolvedValueOnce(null) // 1º check: não existe
      .mockResolvedValueOnce({ id: "cp_corrida" }); // após P2002: existe
    const p2002 = Object.assign(new Error("unique"), { code: "P2002" });
    Object.setPrototypeOf(p2002, (Prisma as any).PrismaClientKnownRequestError.prototype);
    (prisma.$transaction as any).mockRejectedValueOnce(p2002);

    const r = await paySellerCommission(base);
    expect(r.alreadyPaid).toBe(true);
    expect(r.payment.id).toBe("cp_corrida");
  });

  it("rejeita vendedor de outra empresa (cross-tenant) ANTES de pagar", async () => {
    (prisma.commissionPayment.findUnique as any).mockResolvedValue(null);
    (prisma.user.findFirst as any).mockResolvedValue(null); // não é da empresa

    await expect(paySellerCommission(base)).rejects.toThrow(/vendedor/i);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("se o ledger falhar, REVERTE o pagamento (propaga erro — não marca pago com DRE=R$0)", async () => {
    (prisma.commissionPayment.findUnique as any).mockResolvedValue(null);
    (prisma.$transaction as any).mockRejectedValueOnce(new Error("conta 5.1.02 ausente"));

    await expect(paySellerCommission(base)).rejects.toThrow(/5.1.02/);
  });
});
