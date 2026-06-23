import { describe, it, expect } from "vitest";
import { buildPrintHtml, type PrintableCashRegister } from "./cash-print";
import type { MovRow } from "./movimentacoes-table";
import type { SalesByMethodEntry } from "./conferencia-formas";

// Rotina 21/06: relatório de impressão do caixa não pode depender do Tailwind.

const CAIXA_FECHADO: PrintableCashRegister = {
  id: "cs_1",
  openedAt: "2026-06-03T08:22:00.000Z",
  closedAt: "2026-06-10T16:09:00.000Z",
  status: "CLOSED",
  openingBalance: 200,
  closingBalance: 200,
  expectedBalance: 200,
  difference: 0,
  totalSales: 0,
  totalExpenses: 0,
  openedByUser: { name: "mirabou" },
  closedByUser: { name: "mirabou" },
  branch: { name: "Óticas Ultra - Matriz" },
};

describe("buildPrintHtml", () => {
  it("não contém classes do Tailwind (gera CSS próprio)", () => {
    const html = buildPrintHtml(CAIXA_FECHADO, [], []);
    // Classes utilitárias típicas do Tailwind que QUEBRAVAM o print antigo.
    expect(html).not.toMatch(/class="[^"]*\bgrid-cols-2\b/);
    expect(html).not.toMatch(/class="[^"]*\bspace-y-6\b/);
    expect(html).not.toMatch(/text-muted-foreground/);
    // Tem o próprio <style> embutido.
    expect(html).toContain("<style>");
    expect(html).toContain("font-family");
  });

  it("renderiza os dados do turno (nomes, saldos, datas)", () => {
    const html = buildPrintHtml(CAIXA_FECHADO, [], []);
    expect(html).toContain("Óticas Ultra - Matriz");
    expect(html).toContain("mirabou");
    expect(html).toContain("Relatório de Caixa");
    // Saldo inicial R$ 200 formatado (pt-BR usa NBSP, então checa o número).
    expect(html).toMatch(/200,00/);
    expect(html).toContain("Fechado");
  });

  it("caixa aberto: mostra 'Caixa aberto' e NÃO mostra diferença", () => {
    const aberto: PrintableCashRegister = {
      ...CAIXA_FECHADO,
      status: "OPEN",
      closedAt: null,
      closedByUser: null,
      closingBalance: null,
      difference: null,
    };
    const html = buildPrintHtml(aberto, [], []);
    expect(html).toContain("Caixa aberto");
    expect(html).not.toContain("Saldo Final (contado)");
  });

  it("renderiza movimentações na tabela", () => {
    const movs: MovRow[] = [
      {
        kind: "MOVEMENT",
        id: "m1",
        type: "OPENING_FLOAT",
        direction: "IN",
        method: "CASH",
        amount: 200,
        note: "Fundo de troco - abertura de caixa",
        createdAt: "2026-06-03T08:22:00.000Z",
      },
    ];
    const html = buildPrintHtml(CAIXA_FECHADO, movs, []);
    expect(html).toContain("Fundo de troco - abertura de caixa");
    expect(html).toContain("<table>");
  });

  it("escapa HTML nas notas (evita injeção)", () => {
    const movs: MovRow[] = [
      {
        kind: "MOVEMENT",
        id: "m1",
        type: "WITHDRAWAL",
        direction: "OUT",
        method: "CASH",
        amount: 10,
        note: "<script>alert(1)</script>",
        createdAt: "2026-06-03T09:00:00.000Z",
      },
    ];
    const html = buildPrintHtml(CAIXA_FECHADO, movs, []);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("conferência por forma de pagamento aparece quando há dados", () => {
    const sbm: SalesByMethodEntry[] = [{ method: "CASH", amount: 539.9, count: 1 }];
    const html = buildPrintHtml(CAIXA_FECHADO, [], sbm);
    expect(html).toContain("Conferência por forma de pagamento");
    expect(html).toMatch(/539,90/);
  });
});
