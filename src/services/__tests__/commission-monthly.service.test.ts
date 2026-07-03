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
    payments: [] as any[], // {userId, totalCommission} — vendedores já pagos (Bloco 4)
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
    // Bloco 4: estado de pagamento. Default vazio = ninguém pago.
    // totalCommission precisa ter .toString() (Decimal no runtime real).
    commissionPayment: {
      findMany: vi.fn(async () =>
        (state.payments ?? []).map((p: any) => ({
          userId: p.userId,
          totalCommission: { toString: () => String(p.totalCommission ?? 0) },
        }))
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
  mock.state.payments = [];
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
    // Bloco 4: sem pagamento registrado → ambos paid=false.
    expect(r.rows.every((x) => x.paid === false)).toBe(true);
  });

  it("marca paid=true para quem já tem CommissionPayment no mês (Bloco 4)", async () => {
    mock.state.sales = [
      { sellerUserId: "U1", sellerName: "Ana", status: "COMPLETED", total: 22000, createdAt: JUL },
      { sellerUserId: "U2", sellerName: "Bia", status: "COMPLETED", total: 15000, createdAt: JUL },
    ];
    // Ana paga exatamente o devido (meta 2% de 22.000 = 440) → sem glosa.
    mock.state.payments = [{ userId: "U1", totalCommission: 440 }];

    const r = await generateMonthlyCommission("co1", 2026, 7);
    const ana = r.rows.find((x) => x.userName === "Ana");
    const bia = r.rows.find((x) => x.userName === "Bia");
    expect(ana?.paid).toBe(true);
    expect(ana?.paidAmount).toBe("440.00");
    expect(ana?.overpaid).toBe("0.00"); // pago == devido
    expect(bia?.paid).toBe(false);
    expect(bia?.paidAmount).toBe("0.00");
  });

  it("H1: venda devolvida após pagamento gera glosa (overpaid) do excedente pago", async () => {
    // Ana vendeu 22.000 e foi paga 440 (meta 2%). Depois uma venda de 12.000 foi
    // DEVOLVIDA — netSales cai para 10.000 (só mini 1% = 100). O pagamento de 440
    // continua no banco; o devido AGORA é 100 → glosa de 340.
    mock.state.sales = [
      { sellerUserId: "U1", sellerName: "Ana", status: "COMPLETED", total: 10000, createdAt: JUL },
    ];
    mock.state.payments = [{ userId: "U1", totalCommission: 440 }];

    const r = await generateMonthlyCommission("co1", 2026, 7);
    const ana = r.rows.find((x) => x.userName === "Ana");
    expect(ana?.paid).toBe(true);
    expect(ana?.total).toBe("100.00"); // devido recalculado (mini 1% de 10.000)
    expect(ana?.paidAmount).toBe("440.00"); // o que saiu do caixa
    expect(ana?.overpaid).toBe("340.00"); // glosa a cobrar/ajustar
  });

  it("H1: pago a MENOS que o devido não vira glosa (overpaid=0, extra sai no próximo)", async () => {
    // Ana devido 440, mas pagamento registrado foi só 100 (cenário incomum).
    // Não é glosa — o vendedor tem a receber; overpaid deve ser 0.
    mock.state.sales = [
      { sellerUserId: "U1", sellerName: "Ana", status: "COMPLETED", total: 22000, createdAt: JUL },
    ];
    mock.state.payments = [{ userId: "U1", totalCommission: 100 }];

    const r = await generateMonthlyCommission("co1", 2026, 7);
    const ana = r.rows.find((x) => x.userName === "Ana");
    expect(ana?.total).toBe("440.00");
    expect(ana?.paidAmount).toBe("100.00");
    expect(ana?.overpaid).toBe("0.00");
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
