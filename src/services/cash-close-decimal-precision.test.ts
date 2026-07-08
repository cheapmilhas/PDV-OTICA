import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

// Fase 3.7: o cálculo de closingExpectedCash soma valores monetários vindos do
// banco como Prisma.Decimal. Somar via Number(...) acumula erro de ponto
// flutuante (0.1 + 0.2 = 0.30000000000000004) que ia direto para o campo
// Decimal(12,2). Este teste prova que a soma é EXATA.

const lockedShift = { id: "shift_1", status: "OPEN", notes: null, branchId: "branch_A" };

// Movimentos escolhidos para expor o erro clássico de float:
// IN: 0.10 + 0.20 + 100.05 = 100.35 ; OUT: 0.05  ⇒ esperado = 100.30
const movements = [
  { method: "CASH", direction: "IN", amount: new Prisma.Decimal("0.10") },
  { method: "CASH", direction: "IN", amount: new Prisma.Decimal("0.20") },
  { method: "CASH", direction: "IN", amount: new Prisma.Decimal("100.05") },
  { method: "CASH", direction: "OUT", amount: new Prisma.Decimal("0.05") },
  // não-CASH deve ser ignorado
  { method: "PIX", direction: "IN", amount: new Prisma.Decimal("999.99") },
];

const txMock = {
  $queryRaw: vi.fn(async () => [lockedShift]),
  cashMovement: { findMany: vi.fn(async () => movements) },
  cashShift: {
    update: vi.fn(async () => ({})),
    findUniqueOrThrow: vi.fn(async () => ({ id: "shift_1" })),
  },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(async (cb: any) => cb(txMock)),
  },
}));

import { cashService } from "./cash.service";

beforeEach(() => {
  vi.clearAllMocks();
  txMock.$queryRaw.mockResolvedValue([lockedShift]);
  txMock.cashMovement.findMany.mockResolvedValue(movements);
});

describe("closeShift — precisão decimal do expected cash", () => {
  it("soma CASH IN-OUT com precisão decimal (100.30 exato, PIX ignorado)", async () => {
    await cashService.closeShift(
      "shift_1",
      { closingDeclaredCash: 100.3, differenceJustification: undefined } as any,
      "co_1",
      "u1",
      "branch_A",
    );

    expect(txMock.cashShift.update).toHaveBeenCalledTimes(1);
    const data = (txMock.cashShift.update.mock.calls as any[])[0][0].data;

    // closingExpectedCash deve ser exatamente 100.30 (não 100.30000000000001)
    expect(Number(data.closingExpectedCash)).toBe(100.3);
    // diferença declarada(100.30) - esperado(100.30) = 0 exato → sem justificativa exigida
    expect(Number(data.differenceCash)).toBe(0);
    expect(data.status).toBe("CLOSED");
  });

  it("resultado bate com a soma Decimal de referência (prova o uso de Decimal)", async () => {
    // Soma Decimal de referência do mesmo conjunto de movimentos CASH.
    const refIn = movements
      .filter((m) => m.method === "CASH" && m.direction === "IN")
      .reduce((a, m) => a.plus(m.amount), new Prisma.Decimal(0));
    const refOut = movements
      .filter((m) => m.method === "CASH" && m.direction === "OUT")
      .reduce((a, m) => a.plus(m.amount), new Prisma.Decimal(0));
    const refExpected = refIn.minus(refOut);

    await cashService.closeShift(
      "shift_1",
      { closingDeclaredCash: refExpected.toNumber(), differenceJustification: undefined } as any,
      "co_1",
      "u1",
      "branch_A",
    );

    const data = (txMock.cashShift.update.mock.calls as any[])[0][0].data;
    expect(new Prisma.Decimal(data.closingExpectedCash).equals(refExpected)).toBe(true);
  });
});
