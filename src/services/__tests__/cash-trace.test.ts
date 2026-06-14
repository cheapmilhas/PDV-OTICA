import { describe, it, expect, vi, beforeEach } from "vitest";

const findFirst = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { sale: { findFirst: (...a: any) => findFirst(...a) } } }));

import { saleService } from "@/services/sale.service";

beforeEach(() => vi.clearAllMocks());

function saleWith(payments: any[]) {
  return { id: "sale_1", companyId: "co_1", payments };
}

describe("getCashTrace", () => {
  it("pagamento CASH com movimento IN → entrou no caixa, com shift", async () => {
    findFirst.mockResolvedValue(saleWith([{
      id: "p1", method: "CASH", amount: 100, status: "RECEIVED",
      cashMovements: [{ type: "SALE_PAYMENT", direction: "IN", amount: 100, cashShift: {
        id: "sh1", status: "CLOSED", openedAt: new Date(), branch: { name: "Loja 1" }, openedByUser: { name: "Ana" },
      }}],
    }]));
    const trace = await saleService.getCashTrace("sale_1", "co_1");
    expect(trace[0]).toMatchObject({
      method: "CASH", enteredCashRegister: true, reversed: false, destino: "cash_register",
      shift: { branchName: "Loja 1", operador: "Ana", status: "CLOSED" },
    });
  });

  it("pagamento CASH cancelado (REFUND/OUT em outro turno) → reversed, netCashAmount 0, shift do IN original", async () => {
    findFirst.mockResolvedValue(saleWith([{
      id: "p1", method: "CASH", amount: 100, status: "VOIDED",
      cashMovements: [
        { type: "SALE_PAYMENT", direction: "IN", amount: 100, cashShift: { id: "sh1", status: "CLOSED", openedAt: new Date(), branch: { name: "Loja 1" }, openedByUser: { name: "Ana" } } },
        { type: "REFUND", direction: "OUT", amount: 100, cashShift: { id: "sh2", status: "OPEN", openedAt: new Date(), branch: { name: "Loja 1" }, openedByUser: { name: "Bia" } } },
      ],
    }]));
    const trace = await saleService.getCashTrace("sale_1", "co_1");
    expect(trace[0]).toMatchObject({ reversed: true, netCashAmount: 0, shift: { shiftId: "sh1" } });
  });

  it("crédito → destino card_receivable, sem shift", async () => {
    findFirst.mockResolvedValue(saleWith([{ id: "p1", method: "CREDIT_CARD", amount: 200, status: "RECEIVED", cashMovements: [] }]));
    const trace = await saleService.getCashTrace("sale_1", "co_1");
    expect(trace[0]).toMatchObject({ method: "CREDIT_CARD", enteredCashRegister: false, destino: "card_receivable" });
    expect(trace[0].shift).toBeUndefined();
  });

  it("boleto → destino accounts_receivable, sem shift", async () => {
    findFirst.mockResolvedValue(saleWith([{ id: "p1", method: "BOLETO", amount: 150, status: "RECEIVED", cashMovements: [] }]));
    const trace = await saleService.getCashTrace("sale_1", "co_1");
    expect(trace[0]).toMatchObject({ method: "BOLETO", enteredCashRegister: false, destino: "accounts_receivable" });
  });

  it("venda inexistente / outra company → lança", async () => {
    findFirst.mockResolvedValue(null);
    await expect(saleService.getCashTrace("x", "co_1")).rejects.toBeTruthy();
  });
});
