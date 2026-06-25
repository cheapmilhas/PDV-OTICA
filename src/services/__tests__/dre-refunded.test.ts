import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * C1 (Bloco 3): o DRE GERENCIAL (Sales) inflava o lucro porque contava vendas
 * REFUNDED (devolvidas) como receita + CMV. Só excluía CANCELED.
 *
 * Provas deste arquivo:
 *  - Bug fechado: um mês COM uma venda devolvida não infla o lucro.
 *  - Devolução parcial: tratada corretamente (venda parcial continua COMPLETED
 *    e o estorno da parte devolvida vem do ledger — DRE dinâmico).
 *  - Uso normal: mês só com vendas concluídas dá o MESMO número de antes.
 *  - Consistência: para os mesmos dados, DRE gerencial e DRE dinâmico batem.
 *
 * Estratégia: mockamos `@/lib/prisma`. O `sale.findMany` honra o filtro
 * `where.status` sobre um dataset em memória — assim o teste prova que o filtro
 * efetivamente exclui REFUNDED (e não só CANCELED). O DRE dinâmico é alimentado
 * pelo ledger correspondente (FinanceEntry), espelhando o que o sistema grava.
 */

// --- Dataset em memória (1 mês: junho/2026) -------------------------------

interface FakeSale {
  id: string;
  companyId: string;
  status: "OPEN" | "COMPLETED" | "CANCELED" | "REFUNDED";
  total: number;
  discountTotal: number;
  createdAt: Date;
  items: { costPrice: number; qty: number }[];
}

const JUN = new Date("2026-06-15T12:00:00Z");

/**
 * Cenário base:
 *  - Venda A: COMPLETED, total 1000, desconto 0, custo 400 → receita realizada.
 *  - Venda B: REFUNDED, total 500, desconto 0, custo 200 → devolvida (NÃO conta).
 *
 * Esperado (só A): receita 1000, CMV 400, lucro bruto 600.
 * Se o bug existisse (B contado): receita 1500, CMV 600 → lucro inflado.
 */
const SALES_BASE: FakeSale[] = [
  {
    id: "A",
    companyId: "co1",
    status: "COMPLETED",
    total: 1000,
    discountTotal: 0,
    createdAt: JUN,
    items: [{ costPrice: 400, qty: 1 }],
  },
  {
    id: "B",
    companyId: "co1",
    status: "REFUNDED",
    total: 500,
    discountTotal: 0,
    createdAt: JUN,
    items: [{ costPrice: 200, qty: 1 }],
  },
];

// Estado mutável usado pelos mocks (trocado por teste).
let salesData: FakeSale[] = [];
let payablesData: { amount: number }[] = [];
// Entradas do ledger para o DRE dinâmico (type/side/amount).
let ledgerData: { type: string; side: string; amount: number }[] = [];

const saleFindMany = vi.fn(async ({ where }: any) => {
  return salesData.filter((s) => {
    if (s.companyId !== where.companyId) return false;
    // Honra o filtro de status (string exata OU { not: ... }).
    const sf = where.status;
    if (typeof sf === "string" && s.status !== sf) return false;
    if (sf && typeof sf === "object" && "not" in sf && s.status === sf.not) return false;
    // Honra a janela createdAt (DREService itera mês a mês — sem isto a mesma
    // venda seria contada em cada mês do intervalo).
    const c = where.createdAt;
    if (c?.gte && s.createdAt < c.gte) return false;
    if (c?.lte && s.createdAt > c.lte) return false;
    return true;
  });
});

const accountPayableFindMany = vi.fn(async (_arg?: any) => payablesData);

const financeEntryAggregate = vi.fn(async ({ where }: any) => {
  const sum = ledgerData
    .filter((e) => e.type === where.type && e.side === where.side)
    .reduce((acc, e) => acc + e.amount, 0);
  return { _sum: { amount: sum } };
});

const financeEntryGroupBy = vi.fn(async (_arg?: any) => {
  // groupBy(["type","side"]) com _sum.amount — agrega o ledgerData.
  const map = new Map<string, { type: string; side: string; amount: number }>();
  for (const e of ledgerData) {
    const k = `${e.type}|${e.side}`;
    const cur = map.get(k) || { type: e.type, side: e.side, amount: 0 };
    cur.amount += e.amount;
    map.set(k, cur);
  }
  return [...map.values()].map((v) => ({
    type: v.type,
    side: v.side,
    _sum: { amount: v.amount },
  }));
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    sale: { findMany: (arg: any) => saleFindMany(arg) },
    accountPayable: { findMany: (arg: any) => accountPayableFindMany(arg) },
    financeEntry: {
      aggregate: (arg: any) => financeEntryAggregate(arg),
      // groupBy do DRE dinâmico devolve por debitAccountId quando filtra COGS;
      // o segundo groupBy (CMV detalhe) não é usado nas asserções de lucro, então
      // devolvemos [] nesse caso.
      groupBy: (arg: any) => {
        if (arg?.by?.includes("debitAccountId")) return Promise.resolve([]);
        return financeEntryGroupBy(arg);
      },
    },
    chartOfAccounts: { findMany: async () => [] },
  },
}));

import { DREService } from "@/services/reports/dre.service";
import { getDynamicDRE } from "@/services/finance-report.service";

const START = new Date("2026-06-01T00:00:00Z");
const END = new Date("2026-06-30T23:59:59Z");

beforeEach(() => {
  vi.clearAllMocks();
  salesData = [];
  payablesData = [];
  ledgerData = [];
});

describe("DRE gerencial — C1: vendas REFUNDED não inflam o lucro", () => {
  it("bug fechado: mês com 1 venda devolvida NÃO conta a devolução como receita/custo", async () => {
    salesData = SALES_BASE; // A (completed) + B (refunded)

    const report = await new DREService().generateReport("co1", {
      startDate: START,
      endDate: END,
    });

    // Só a venda A entra: receita 1000, CMV 400, lucro bruto 600.
    expect(report.consolidated.grossRevenue).toBe(1000);
    expect(report.consolidated.cogs).toBe(400);
    expect(report.consolidated.grossProfit).toBe(600);

    // Prova dupla: a venda devolvida (B) NÃO inflou os números.
    expect(report.consolidated.grossRevenue).not.toBe(1500);
    expect(report.consolidated.cogs).not.toBe(600);

    // Prova de que o filtro aplicado foi de receita realizada (COMPLETED),
    // e não o antigo `{ not: "CANCELED" }`.
    const whereArg = saleFindMany.mock.calls[0][0].where;
    expect(whereArg.status).toBe("COMPLETED");
    expect(whereArg.status).not.toEqual({ not: "CANCELED" });
  });

  it("devolução parcial: venda parcialmente devolvida segue COMPLETED e conta; o estorno vem do ledger", async () => {
    // Venda C: COMPLETED total 1000 custo 400. Cliente devolveu 1 item de 300
    // (custo 120). No sistema o Sale.status permanece COMPLETED; o estorno
    // parcial vive no ledger (REFUND/DEBIT 300 + COGS/CREDIT 120).
    salesData = [
      {
        id: "C",
        companyId: "co1",
        status: "COMPLETED",
        total: 1000,
        discountTotal: 0,
        createdAt: JUN,
        items: [{ costPrice: 400, qty: 1 }],
      },
    ];
    // DRE gerencial (Sales): a venda parcial conta cheia — é a limitação
    // conhecida da fonte Sales; o dinâmico é a fonte fiel para parcial.
    const ger = await new DREService().generateReport("co1", { startDate: START, endDate: END });
    expect(ger.consolidated.grossRevenue).toBe(1000);

    // DRE dinâmico (ledger): o estorno parcial é descontado corretamente.
    ledgerData = [
      { type: "SALE_REVENUE", side: "DEBIT", amount: 1000 },
      { type: "COGS", side: "DEBIT", amount: 400 },
      // estorno parcial:
      { type: "REFUND", side: "DEBIT", amount: 300 }, // abate receita
      { type: "COGS", side: "CREDIT", amount: 120 }, // estorna custo
    ];
    const din = await getDynamicDRE("co1", START, END);
    // Receita líquida = 1000 - 300 (refund) = 700.
    expect(din.summary.netRevenue).toBe(700);
    // CMV = 400 - 120 = 280.
    expect(din.summary.cogs).toBe(280);
    // Margem bruta = 700 - 280 = 420.
    expect(din.summary.grossMargin).toBe(420);
  });

  it("uso normal: mês só com venda concluída dá o MESMO lucro de antes (sem regressão)", async () => {
    salesData = [SALES_BASE[0]]; // só a venda A (COMPLETED)

    const report = await new DREService().generateReport("co1", { startDate: START, endDate: END });

    // Sem devolução, o resultado é o mesmo que sempre foi: receita 1000, CMV 400.
    expect(report.consolidated.grossRevenue).toBe(1000);
    expect(report.consolidated.cogs).toBe(400);
    expect(report.consolidated.grossProfit).toBe(600);
  });
});

describe("DRE gerencial × DRE dinâmico — consistência (mesmos dados → mesmo número)", () => {
  it("um mês com venda concluída + venda devolvida: os dois DREs batem no lucro bruto", async () => {
    // Sales: A (completed 1000/400) + B (refunded 500/200).
    salesData = SALES_BASE;

    // Ledger correspondente: a venda A gera receita/custo; a devolução de B
    // gera o estorno integral (REFUND 500 + COGS CREDIT 200), de modo que o
    // ledger reflete exatamente o mesmo resultado realizado.
    ledgerData = [
      { type: "SALE_REVENUE", side: "DEBIT", amount: 1500 }, // A + B geraram receita ao serem fechadas
      { type: "COGS", side: "DEBIT", amount: 600 }, // A + B geraram CMV
      { type: "REFUND", side: "DEBIT", amount: 500 }, // devolução de B abate receita
      { type: "COGS", side: "CREDIT", amount: 200 }, // devolução de B estorna custo
    ];

    const ger = await new DREService().generateReport("co1", { startDate: START, endDate: END });
    const din = await getDynamicDRE("co1", START, END);

    // Gerencial (pós-fix): só A → receita líquida 1000, CMV 400, margem 600.
    // Dinâmico: 1500 - 500 = 1000 líquida; 600 - 200 = 400 CMV; margem 600.
    expect(ger.consolidated.netRevenue).toBe(din.summary.netRevenue);
    expect(ger.consolidated.cogs).toBe(din.summary.cogs);
    expect(ger.consolidated.grossProfit).toBe(din.summary.grossMargin);

    // valores absolutos, para deixar explícito
    expect(ger.consolidated.grossProfit).toBe(600);
    expect(din.summary.grossMargin).toBe(600);
  });
});
