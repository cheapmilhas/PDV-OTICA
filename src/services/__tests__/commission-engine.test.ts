import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * MOTOR DE COMISSÃO — Fase 1 (fundação).
 *
 * Regra: Comissão do mês = Comissão de meta (maior nível mini/meta/mega
 * atingido, % retroativo sobre o líquido) + Bônus de campanha (somatório dos
 * CampaignBonusEntry já gravados pelo motor de campanha existente).
 *
 * Metas dos exemplos do PRD:
 *   mini  R$ 10.000 / 1%
 *   meta  R$ 20.000 / 2%
 *   mega  R$ 30.000 / 3%
 *
 * Provas:
 *  - Exemplo A: 22.000 (5.000 em campanha +1%) → meta 2%×22.000 + camp 50 = 490.
 *  - Exemplo B: 8.000 (4 unid. FIXED R$50) → meta 0 (não bate mini) + 200 = 200.
 *  - Exemplo C: 22.000 com 3.000 devolvidos → líquido 19.000 → mini 1% = 190
 *    (a devolução derruba o nível).
 *  - OQ-1: o valor dos produtos em campanha TAMBÉM entra no total da meta.
 *  - Fallback: vendedor sem níveis → comissão de meta 0 (nada de % escondido).
 *  - RED→GREEN: sem o motor (% chapado tipo defaultCommissionPercent) o número
 *    sai errado; com o motor (nível retroativo) sai certo.
 */

import {
  computeCommissionFromValues,
  resolveSellerTiers,
  computeSellerCommission,
} from "@/services/commission/commission-engine";

// Níveis do PRD, reusados nos cenários.
const PRD_TIERS = [
  { targetAmount: "10000", percent: "1" }, // mini
  { targetAmount: "20000", percent: "2" }, // meta
  { targetAmount: "30000", percent: "3" }, // mega
];

describe("commission-engine — núcleo puro (computeCommissionFromValues)", () => {
  it("Exemplo A: 22.000 + campanha 50 → meta 2%×22.000=440 + 50 = 490", () => {
    const r = computeCommissionFromValues({
      netSales: "22000",
      tiers: PRD_TIERS,
      campaignBonus: "50",
    });
    expect(r.metaCommission).toBe("440.00");
    expect(r.campaignBonus).toBe("50.00");
    expect(r.total).toBe("490.00");
    // O nível aplicado é o "meta" (2%), não o "mega" (não bateu 30.000).
    expect(r.meta.appliedPercent).toBe("2.00");
    expect(r.meta.appliedTarget).toBe("20000.00");
  });

  it("Exemplo B: 8.000 não bate a mini → meta 0; campanha FIXED 4×50=200 → total 200", () => {
    const r = computeCommissionFromValues({
      netSales: "8000",
      tiers: PRD_TIERS,
      campaignBonus: "200",
    });
    expect(r.metaCommission).toBe("0.00");
    expect(r.campaignBonus).toBe("200.00");
    expect(r.total).toBe("200.00");
    expect(r.meta.appliedPercent).toBe("0.00");
    expect(r.meta.appliedTarget).toBeNull();
  });

  it("Exemplo C: 22.000 com 3.000 devolvidos → líquido 19.000 → só mini 1% = 190 (devolução derruba o nível)", () => {
    // O líquido (19.000) já chega calculado a este núcleo; aqui provamos que
    // 19.000 cai para a MINI (1%), não fica na META (2%).
    const r = computeCommissionFromValues({
      netSales: "19000",
      tiers: PRD_TIERS,
      campaignBonus: "0",
    });
    expect(r.metaCommission).toBe("190.00");
    expect(r.total).toBe("190.00");
    expect(r.meta.appliedPercent).toBe("1.00"); // mini, não meta
    expect(r.meta.appliedTarget).toBe("10000.00");
  });

  it("retroatividade: bateu a mega → 3% sobre TUDO (35.000 × 3% = 1.050)", () => {
    const r = computeCommissionFromValues({
      netSales: "35000",
      tiers: PRD_TIERS,
      campaignBonus: "0",
    });
    expect(r.meta.appliedPercent).toBe("3.00");
    expect(r.metaCommission).toBe("1050.00");
  });

  it("fallback: vendedor sem níveis configurados → comissão de meta 0 (nenhum % escondido)", () => {
    const r = computeCommissionFromValues({
      netSales: "50000",
      tiers: [], // nada configurado
      campaignBonus: "0",
    });
    expect(r.metaCommission).toBe("0.00");
    expect(r.total).toBe("0.00");
    expect(r.meta.appliedPercent).toBe("0.00");
    expect(r.meta.appliedTarget).toBeNull();
    // a campanha continua valendo mesmo sem meta:
    const r2 = computeCommissionFromValues({
      netSales: "50000",
      tiers: [],
      campaignBonus: "123.45",
    });
    expect(r2.total).toBe("123.45");
  });

  it("precisão (decimal.js): 33.333,33 × 1% = 333,33 sem drift de centavo", () => {
    const r = computeCommissionFromValues({
      netSales: "33333.33",
      tiers: PRD_TIERS,
      campaignBonus: "0",
    });
    // 33333.33 bate mega (≥30.000) → 3% = 999.9999 → 1000.00 arredondado HALF_UP
    expect(r.metaCommission).toBe("1000.00");
  });

  /**
   * RED→GREEN: o jeito ANTIGO (um % chapado sobre a venda, como
   * User.defaultCommissionPercent) dá um número DIFERENTE do motor de níveis.
   * Para o Exemplo C (19.000 líquido), um % fixo de 2% (a "meta") daria 380,
   * mas a regra correta é 1% (a venda caiu para a mini) = 190.
   */
  it("RED→GREEN: % chapado (jeito antigo) erra; motor de níveis acerta o Exemplo C", () => {
    const netSales = 19000;

    // RED — jeito antigo: aplicaria o % da meta (2%) chapado, ignorando que o
    // líquido derrubou o vendedor para a mini.
    const oldWay = netSales * 0.02; // 380
    expect(oldWay).toBe(380);

    // GREEN — motor: identifica que 19.000 só atinge a mini (1%) → 190.
    const r = computeCommissionFromValues({
      netSales: String(netSales),
      tiers: PRD_TIERS,
      campaignBonus: "0",
    });
    expect(r.metaCommission).toBe("190.00");
    expect(Number(r.metaCommission)).not.toBe(oldWay);
  });
});

describe("commission-engine — resolveSellerTiers (default da ótica + override do vendedor)", () => {
  it("usa o override do vendedor quando existe; senão o default da ótica", () => {
    const rows = [
      // default da ótica (userId null)
      { userId: null, level: "MINI" as const, targetAmount: "10000", percent: "1" },
      { userId: null, level: "META" as const, targetAmount: "20000", percent: "2" },
      { userId: null, level: "MEGA" as const, targetAmount: "30000", percent: "3" },
      // override só da MEGA para o vendedor U1
      { userId: "U1", level: "MEGA" as const, targetAmount: "40000", percent: "5" },
    ];
    const tiers = resolveSellerTiers(rows, "U1");
    expect(tiers).toEqual([
      { targetAmount: "10000", percent: "1" }, // default
      { targetAmount: "20000", percent: "2" }, // default
      { targetAmount: "40000", percent: "5" }, // override
    ]);
  });

  it("sem default e sem override → lista vazia (fallback 0 no cálculo)", () => {
    expect(resolveSellerTiers([], "U1")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Integração com Prisma mockado: prova o computeSellerCommission ponta a ponta,
// incluindo o OQ-1 (produto de campanha conta no total da meta) e a devolução.
// ---------------------------------------------------------------------------

interface FakeSale {
  total: number;
  sellerUserId: string;
  status: string;
  createdAt: Date;
}
interface FakeRefund {
  totalRefund: number;
  status: string;
  saleStatus: string; // status da venda-mãe (para o filtro sale.status)
  sellerUserId: string;
  saleCreatedAt: Date;
}
interface FakeBonus {
  totalBonus: number;
  sellerUserId: string;
  status: string;
  saleStatus: string;
  saleCreatedAt: Date;
}

let salesData: FakeSale[] = [];
let refundsData: FakeRefund[] = [];
let bonusData: FakeBonus[] = [];
let tierRows: Array<{
  userId: string | null;
  level: "MINI" | "META" | "MEGA";
  targetAmount: string;
  percent: string;
}> = [];

function inWindow(d: Date, where: any): boolean {
  const c = where?.createdAt;
  if (c?.gte && d < c.gte) return false;
  if (c?.lte && d > c.lte) return false;
  return true;
}

const mockClient = {
  sale: {
    aggregate: async ({ where }: any) => {
      const sum = salesData
        .filter(
          (s) =>
            s.sellerUserId === where.sellerUserId &&
            s.status === where.status &&
            inWindow(s.createdAt, where)
        )
        .reduce((a, s) => a + s.total, 0);
      return { _sum: { total: sum } };
    },
  },
  refund: {
    aggregate: async ({ where }: any) => {
      const sum = refundsData
        .filter(
          (r) =>
            r.status === where.status &&
            r.sellerUserId === where.sale.sellerUserId &&
            r.saleStatus === where.sale.status &&
            inWindow(r.saleCreatedAt, where.sale)
        )
        .reduce((a, r) => a + r.totalRefund, 0);
      return { _sum: { totalRefund: sum } };
    },
  },
  campaignBonusEntry: {
    aggregate: async ({ where }: any) => {
      const sum = bonusData
        .filter(
          (b) =>
            b.sellerUserId === where.sellerUserId &&
            // status: { not: "REVERSED" }
            b.status !== where.status.not &&
            b.saleStatus === where.sale.status &&
            inWindow(b.saleCreatedAt, where.sale)
        )
        .reduce((a, b) => a + b.totalBonus, 0);
      return { _sum: { totalBonus: sum } };
    },
  },
  sellerCommissionTier: {
    findMany: async ({ where }: any) =>
      tierRows.filter(
        (t) => t.userId === where.OR[0].userId || t.userId === null
      ),
  },
} as any;

const JUN = new Date("2026-06-15T12:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  salesData = [];
  refundsData = [];
  bonusData = [];
  tierRows = [
    { userId: null, level: "MINI", targetAmount: "10000", percent: "1" },
    { userId: null, level: "META", targetAmount: "20000", percent: "2" },
    { userId: null, level: "MEGA", targetAmount: "30000", percent: "3" },
  ];
});

describe("computeSellerCommission — ponta a ponta com Prisma mockado", () => {
  it("Exemplo A (OQ-1): venda 22.000 com 5.000 em produtos de campanha → meta 2%×22.000=440 + campanha 50 = 490", async () => {
    // OQ-1: a venda de 22.000 JÁ inclui os 5.000 de produtos de campanha; o
    // total da meta é 22.000 (não 17.000). A campanha é um EXTRA por cima.
    salesData = [
      { total: 22000, sellerUserId: "U1", status: "COMPLETED", createdAt: JUN },
    ];
    bonusData = [
      {
        totalBonus: 50, // 1% de 5.000
        sellerUserId: "U1",
        status: "PENDING",
        saleStatus: "COMPLETED",
        saleCreatedAt: JUN,
      },
    ];

    const r = await computeSellerCommission("co1", "U1", 2026, 6, mockClient);
    expect(r.netSales).toBe("22000.00");
    expect(r.metaCommission).toBe("440.00"); // 2% sobre os 22.000 cheios (OQ-1)
    expect(r.campaignBonus).toBe("50.00");
    expect(r.total).toBe("490.00");
  });

  it("Exemplo B: 8.000 (campanha FIXED 4×50) → meta 0 + campanha 200 = 200", async () => {
    salesData = [
      { total: 8000, sellerUserId: "U1", status: "COMPLETED", createdAt: JUN },
    ];
    bonusData = [
      {
        totalBonus: 200,
        sellerUserId: "U1",
        status: "PENDING",
        saleStatus: "COMPLETED",
        saleCreatedAt: JUN,
      },
    ];

    const r = await computeSellerCommission("co1", "U1", 2026, 6, mockClient);
    expect(r.netSales).toBe("8000.00");
    expect(r.metaCommission).toBe("0.00");
    expect(r.total).toBe("200.00");
  });

  it("Exemplo C: 22.000 com 3.000 devolvidos (parcial, venda segue COMPLETED) → líquido 19.000 → mini 1% = 190", async () => {
    salesData = [
      { total: 22000, sellerUserId: "U1", status: "COMPLETED", createdAt: JUN },
    ];
    refundsData = [
      {
        totalRefund: 3000,
        status: "COMPLETED",
        saleStatus: "COMPLETED", // devolução PARCIAL: venda continua COMPLETED
        sellerUserId: "U1",
        saleCreatedAt: JUN,
      },
    ];

    const r = await computeSellerCommission("co1", "U1", 2026, 6, mockClient);
    expect(r.netSales).toBe("19000.00"); // 22.000 - 3.000
    expect(r.metaCommission).toBe("190.00"); // caiu para a mini (1%)
    expect(r.meta.appliedPercent).toBe("1.00");
  });

  it("devolução TOTAL não é subtraída duas vezes: venda vira REFUNDED e já sai do COMPLETED", async () => {
    // A venda total devolvida tem status REFUNDED (não entra no gross). O refund
    // dela tem saleStatus REFUNDED → o filtro (sale.status COMPLETED) o ignora,
    // então NÃO há dupla subtração.
    salesData = [
      { total: 5000, sellerUserId: "U1", status: "REFUNDED", createdAt: JUN },
      { total: 15000, sellerUserId: "U1", status: "COMPLETED", createdAt: JUN },
    ];
    refundsData = [
      {
        totalRefund: 5000,
        status: "COMPLETED",
        saleStatus: "REFUNDED", // devolução TOTAL
        sellerUserId: "U1",
        saleCreatedAt: JUN,
      },
    ];

    const r = await computeSellerCommission("co1", "U1", 2026, 6, mockClient);
    // gross = 15.000 (só a COMPLETED); refund total ignorado → líquido 15.000.
    expect(r.netSales).toBe("15000.00");
    expect(r.metaCommission).toBe("150.00"); // mini 1% de 15.000
  });

  it("fallback ponta a ponta: sem níveis no banco → meta 0, mas campanha conta", async () => {
    tierRows = []; // ótica sem nenhuma config de nível
    salesData = [
      { total: 40000, sellerUserId: "U1", status: "COMPLETED", createdAt: JUN },
    ];
    bonusData = [
      {
        totalBonus: 75,
        sellerUserId: "U1",
        status: "APPROVED",
        saleStatus: "COMPLETED",
        saleCreatedAt: JUN,
      },
    ];

    const r = await computeSellerCommission("co1", "U1", 2026, 6, mockClient);
    expect(r.metaCommission).toBe("0.00");
    expect(r.campaignBonus).toBe("75.00");
    expect(r.total).toBe("75.00");
  });

  it("bônus REVERSED é ignorado na soma de campanha", async () => {
    salesData = [
      { total: 12000, sellerUserId: "U1", status: "COMPLETED", createdAt: JUN },
    ];
    bonusData = [
      {
        totalBonus: 100,
        sellerUserId: "U1",
        status: "REVERSED", // não conta
        saleStatus: "COMPLETED",
        saleCreatedAt: JUN,
      },
      {
        totalBonus: 30,
        sellerUserId: "U1",
        status: "PENDING", // conta
        saleStatus: "COMPLETED",
        saleCreatedAt: JUN,
      },
    ];

    const r = await computeSellerCommission("co1", "U1", 2026, 6, mockClient);
    expect(r.campaignBonus).toBe("30.00"); // só o PENDING
    expect(r.metaCommission).toBe("120.00"); // mini 1% de 12.000
    expect(r.total).toBe("150.00");
  });
});
