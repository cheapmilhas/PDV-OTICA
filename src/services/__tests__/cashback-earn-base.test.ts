import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * H2 (Auditoria 2026-07-02): o cashback GANHO deve ser calculado sobre o valor
 * efetivamente PAGO do próprio bolso (total − cashbackUsed), não sobre o total
 * bruto. Sem o fix, uma compra quitada 100% com saldo de cashback ainda gerava
 * cashback novo ("cashback sobre cashback") — dinheiro que a ótica nunca recebeu.
 *
 * Prova: applyPostCommitSideEffects deve chamar earnCashback com a base
 * `cashbackEarnBase` (o valor pago), e cair no `total` só quando a base é omitida.
 */

const { earnCashback } = vi.hoisted(() => ({
  earnCashback: vi.fn(
    async (
      _customerId: string,
      _saleId: string,
      _saleTotal: number,
      _branchId: string,
      _companyId: string
    ) => ({ id: "mv1" })
  ),
}));
vi.mock("@/services/cashback.service", () => ({
  cashbackService: { earnCashback },
}));
vi.mock("@/services/product-campaign.service", () => ({
  processaSaleForCampaigns: vi.fn(async () => {}),
  reverseBonusForSale: vi.fn(async () => {}),
  reactivateBonusForSale: vi.fn(async () => {}),
}));
// applyPostSaleReminder usa prisma; mockamos para não tocar no banco.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    customerReminder: { findFirst: vi.fn(async () => null), create: vi.fn(async () => ({})) },
    company: { findUnique: vi.fn(async () => null) },
  },
}));
vi.mock("@/lib/logger", () => {
  const l: any = { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() };
  l.child = () => l;
  return { logger: l };
});

import { applyPostCommitSideEffects } from "@/services/sale-side-effects.service";

beforeEach(() => {
  earnCashback.mockClear();
});

describe("applyPostCommitSideEffects — H2: base do cashback ganho", () => {
  it("usa cashbackEarnBase (valor pago) e NÃO o total bruto", async () => {
    // Venda total 100, cliente pagou 40 do bolso e 60 com cashback usado.
    await applyPostCommitSideEffects({
      saleId: "s1",
      customerId: "c1",
      branchId: "b1",
      companyId: "co1",
      total: 100,
      cashbackEarnBase: 40, // total − cashbackUsed(60)
      skipCashbackEarn: false,
    });

    expect(earnCashback).toHaveBeenCalledOnce();
    // 3º argumento de earnCashback = saleTotal usado no cálculo.
    const [, , base] = earnCashback.mock.calls[0];
    expect(base).toBe(40);
    expect(base).not.toBe(100); // não cai no bruto
  });

  it("compra quitada 100% com cashback (base 0) não deve creditar sobre o bruto", async () => {
    await applyPostCommitSideEffects({
      saleId: "s2",
      customerId: "c1",
      branchId: "b1",
      companyId: "co1",
      total: 100,
      cashbackEarnBase: 0, // pagou tudo com cashback
      skipCashbackEarn: false,
    });

    const [, , base] = earnCashback.mock.calls[0];
    expect(base).toBe(0);
  });

  it("retrocompat: sem cashbackEarnBase, cai no total (comportamento antigo)", async () => {
    await applyPostCommitSideEffects({
      saleId: "s3",
      customerId: "c1",
      branchId: "b1",
      companyId: "co1",
      total: 250,
      skipCashbackEarn: false,
    });

    const [, , base] = earnCashback.mock.calls[0];
    expect(base).toBe(250);
  });

  it("skipCashbackEarn=true não chama earnCashback", async () => {
    await applyPostCommitSideEffects({
      saleId: "s4",
      customerId: "c1",
      branchId: "b1",
      companyId: "co1",
      total: 100,
      cashbackEarnBase: 40,
      skipCashbackEarn: true,
    });

    expect(earnCashback).not.toHaveBeenCalled();
  });
});
