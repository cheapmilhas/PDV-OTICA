import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Comissão mensal pela REGRA NOVA (fonte oficial) — Comissão Fase 2.
 *
 * Prova a apuração read-only por vendedor/mês (motor: níveis + campanha) que a
 * tela passou a exibir depois de virar a chave. Mock do Prisma. Nada é gravado.
 */

const mock = vi.hoisted(() => {
  const state = {
    sales: [] as any[], // {sellerUserId, sellerName, status, total, createdAt}
    bonus: [] as any[], // {sellerUserId, totalBonus, status, saleStatus, saleCreatedAt}
    tiers: [] as any[],
  };
  const inWin = (d: Date, w: any) => {
    if (w?.gte && d < w.gte) return false;
    if (w?.lte && d > w.lte) return false;
    return true;
  };
  const prisma = {
    sale: {
      findMany: vi.fn(async ({ where, distinct }: any) => {
        let rows = state.sales.filter(
          (s) => s.status === where.status && inWin(s.createdAt, where.createdAt)
        );
        if (where.branchId) rows = rows.filter((s) => s.branchId === where.branchId);
        if (distinct?.includes("sellerUserId")) {
          const seen = new Set();
          rows = rows.filter((s) => (seen.has(s.sellerUserId) ? false : (seen.add(s.sellerUserId), true)));
        }
        return rows.map((s) => ({ sellerUserId: s.sellerUserId, sellerUser: { name: s.sellerName } }));
      }),
      aggregate: vi.fn(async ({ where }: any) => {
        const sum = state.sales
          .filter((s) => s.sellerUserId === where.sellerUserId && s.status === where.status && inWin(s.createdAt, where.createdAt))
          .reduce((a, s) => a + s.total, 0);
        return { _sum: { total: sum } };
      }),
    },
    refund: { aggregate: vi.fn(async () => ({ _sum: { totalRefund: 0 } })) },
    campaignBonusEntry: {
      aggregate: vi.fn(async ({ where }: any) => {
        const sum = state.bonus
          .filter((b) => b.sellerUserId === where.sellerUserId && b.status !== where.status.not && b.saleStatus === where.sale.status && inWin(b.saleCreatedAt, where.sale.createdAt))
          .reduce((a, b) => a + b.totalBonus, 0);
        return { _sum: { totalBonus: sum } };
      }),
    },
    sellerCommissionTier: {
      findMany: vi.fn(async ({ where }: any) =>
        state.tiers.filter((t) => t.userId === where.OR[0].userId || t.userId === null)
      ),
    },
  };
  return { state, prisma };
});

vi.mock("@/lib/prisma", () => ({ prisma: mock.prisma }));

import { generateMonthlyCommission } from "@/services/reports/commission-monthly.service";

const JUL = new Date("2026-07-15T12:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  mock.state.sales = [];
  mock.state.bonus = [];
  mock.state.tiers = [
    { userId: null, level: "MINI", targetAmount: "10000", percent: "1" },
    { userId: null, level: "META", targetAmount: "20000", percent: "2" },
    { userId: null, level: "MEGA", targetAmount: "30000", percent: "3" },
  ];
});

describe("generateMonthlyCommission (regra nova, read-only)", () => {
  it("comissão por vendedor + total do mês", async () => {
    mock.state.sales = [
      { sellerUserId: "U1", sellerName: "Ana", status: "COMPLETED", total: 22000, createdAt: JUL },
      { sellerUserId: "U2", sellerName: "Bia", status: "COMPLETED", total: 15000, createdAt: JUL },
    ];

    const r = await generateMonthlyCommission("co1", 2026, 7);

    expect(r.rows).toHaveLength(2);
    // ordenado por maior comissão: Ana (meta 2% de 22.000 = 440) antes de Bia (mini 1% de 15.000 = 150)
    expect(r.rows[0]).toMatchObject({ userName: "Ana", total: "440.00", appliedPercent: "2.00" });
    expect(r.rows[1]).toMatchObject({ userName: "Bia", total: "150.00", appliedPercent: "1.00" });
    expect(r.total).toBe("590.00");
  });

  it("inclui campanha no total e no detalhe", async () => {
    mock.state.sales = [
      { sellerUserId: "U1", sellerName: "Ana", status: "COMPLETED", total: 12000, createdAt: JUL },
    ];
    mock.state.bonus = [
      { sellerUserId: "U1", totalBonus: 80, status: "PENDING", saleStatus: "COMPLETED", saleCreatedAt: JUL },
    ];

    const r = await generateMonthlyCommission("co1", 2026, 7);
    // mini 1% de 12.000 = 120 + campanha 80 = 200
    expect(r.rows[0].total).toBe("200.00");
    expect(r.rows[0].metaCommission).toBe("120.00");
    expect(r.rows[0].campaignBonus).toBe("80.00");
  });

  it("mês sem vendas → vazio, total zero", async () => {
    const r = await generateMonthlyCommission("co1", 2026, 7);
    expect(r.rows).toHaveLength(0);
    expect(r.total).toBe("0.00");
  });

  it("vendedor sem nível configurado → comissão de meta 0 (só campanha conta)", async () => {
    mock.state.tiers = [];
    mock.state.sales = [
      { sellerUserId: "U1", sellerName: "Ana", status: "COMPLETED", total: 50000, createdAt: JUL },
    ];
    mock.state.bonus = [
      { sellerUserId: "U1", totalBonus: 30, status: "APPROVED", saleStatus: "COMPLETED", saleCreatedAt: JUL },
    ];
    const r = await generateMonthlyCommission("co1", 2026, 7);
    expect(r.rows[0].metaCommission).toBe("0.00");
    expect(r.rows[0].total).toBe("30.00");
  });
});
