import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * PREVIEW de comissão — Comissão Fase 2 / Passo 3a.
 *
 * Prova que a comparação exibe os três valores corretamente: ATUAL (Commission),
 * NOVA (motor: níveis + campanha) e a DIFERENÇA. Mock do Prisma alimenta os dois
 * lados de forma consistente. READ-ONLY: o serviço nunca grava.
 */

const mock = vi.hoisted(() => {
  const state = {
    sales: [] as any[], // {sellerUserId, status, total, createdAt}
    commissions: [] as any[], // {userId, userName, commissionAmount, baseAmount, percentage, status, saleStatus, saleCreatedAt}
    refunds: [] as any[],
    bonus: [] as any[], // {sellerUserId, totalBonus, status, saleStatus, saleCreatedAt}
    tiers: [] as any[], // {userId, level, targetAmount, percent}
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
        if (where.sellerUserId) rows = rows.filter((s) => s.sellerUserId === where.sellerUserId);
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
    commission: {
      findMany: vi.fn(async ({ where }: any) => {
        // where.sale.{status,createdAt}; agrupa por user no serviço.
        return state.commissions
          .filter((c) => c.saleStatus === where.sale.status && inWin(c.saleCreatedAt, where.sale.createdAt))
          .map((c) => ({
            userId: c.userId,
            commissionAmount: c.commissionAmount,
            baseAmount: c.baseAmount,
            percentage: c.percentage,
            status: c.status,
            user: { name: c.userName },
            sale: { id: "s", createdAt: c.saleCreatedAt, customer: { name: null } },
          }));
      }),
    },
    refund: {
      aggregate: vi.fn(async () => ({ _sum: { totalRefund: 0 } })),
    },
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

import { generateCommissionPreview } from "@/services/reports/commission-preview.service";

const JUN = new Date("2026-06-15T12:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  mock.state.sales = [];
  mock.state.commissions = [];
  mock.state.refunds = [];
  mock.state.bonus = [];
  mock.state.tiers = [
    { userId: null, level: "MINI", targetAmount: "10000", percent: "1" },
    { userId: null, level: "META", targetAmount: "20000", percent: "2" },
    { userId: null, level: "MEGA", targetAmount: "30000", percent: "3" },
  ];
});

describe("generateCommissionPreview", () => {
  it("compara atual × nova × diferença por vendedor", async () => {
    // Vendedor U1 vendeu 22.000 (bate a meta 2% → nova = 440).
    mock.state.sales = [
      { sellerUserId: "U1", sellerName: "Ana", status: "COMPLETED", total: 22000, createdAt: JUN },
    ];
    // Atual (pago): uma Commission de 660 (ex.: 3% chapado) — só pra divergir do novo.
    mock.state.commissions = [
      { userId: "U1", userName: "Ana", commissionAmount: 660, baseAmount: 22000, percentage: 3, status: "PENDING", saleStatus: "COMPLETED", saleCreatedAt: JUN },
    ];

    const r = await generateCommissionPreview("co1", 2026, 6);

    expect(r.rows).toHaveLength(1);
    const row = r.rows[0];
    expect(row.userName).toBe("Ana");
    expect(row.current).toBe("660.00");
    expect(row.proposed).toBe("440.00"); // meta 2% × 22.000
    expect(row.diff).toBe("-220.00"); // 440 − 660
    expect(r.totals.current).toBe("660.00");
    expect(r.totals.proposed).toBe("440.00");
    expect(r.totals.diff).toBe("-220.00");
  });

  it("inclui vendedor SEM Commission atual mas com venda no mês (nova > 0)", async () => {
    // U2 vendeu 15.000 (mini 1% → 150), mas não tem nenhuma Commission gravada.
    mock.state.sales = [
      { sellerUserId: "U2", sellerName: "Bia", status: "COMPLETED", total: 15000, createdAt: JUN },
    ];
    mock.state.commissions = []; // nada pago hoje

    const r = await generateCommissionPreview("co1", 2026, 6);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].current).toBe("0.00");
    expect(r.rows[0].proposed).toBe("150.00");
    expect(r.rows[0].diff).toBe("150.00");
    expect(r.rows[0].diffPercent).toBeNull(); // atual 0 → sem %
  });

  it("soma o bônus de campanha no lado novo", async () => {
    mock.state.sales = [
      { sellerUserId: "U1", sellerName: "Ana", status: "COMPLETED", total: 12000, createdAt: JUN },
    ];
    mock.state.bonus = [
      { sellerUserId: "U1", totalBonus: 50, status: "PENDING", saleStatus: "COMPLETED", saleCreatedAt: JUN },
    ];
    const r = await generateCommissionPreview("co1", 2026, 6);
    // mini 1% de 12.000 = 120 + campanha 50 = 170
    expect(r.rows[0].proposed).toBe("170.00");
    expect(r.rows[0].proposedDetail.metaCommission).toBe("120.00");
    expect(r.rows[0].proposedDetail.campaignBonus).toBe("50.00");
  });

  it("mês sem vendas → lista vazia, totais zero", async () => {
    const r = await generateCommissionPreview("co1", 2026, 6);
    expect(r.rows).toHaveLength(0);
    expect(r.totals).toEqual({ current: "0.00", proposed: "0.00", diff: "0.00" });
  });
});
