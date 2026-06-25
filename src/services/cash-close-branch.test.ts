import { describe, it, expect, vi, beforeEach } from "vitest";

// Bloco 1 segurança: closeShift só fecha o caixa da filial do próprio usuário.
// Prova dupla: turno de outra filial → 403; turno da própria filial → fecha.

// Mock do prisma: $transaction executa o callback com um tx controlado.
const lockedShift = { id: "shift_1", status: "OPEN", notes: null, branchId: "branch_A" };

const txMock = {
  $queryRaw: vi.fn(async () => [lockedShift]),
  cashMovement: { findMany: vi.fn(async () => []) },
  cashShift: {
    update: vi.fn(async () => ({})),
    findUniqueOrThrow: vi.fn(async () => ({
      id: "shift_1",
      openingFloatAmount: 0,
      closingDeclaredCash: 0,
      closingExpectedCash: 0,
      differenceCash: 0,
      movements: [],
    })),
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
});

const closeData = { closingDeclaredCash: 0 } as any;

describe("closeShift — isolamento por filial", () => {
  it("furo fechado: usuário da branch_B tenta fechar caixa da branch_A → 403, não fecha", async () => {
    await expect(
      cashService.closeShift("shift_1", closeData, "co_1", "u1", "branch_B")
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(txMock.cashShift.update).not.toHaveBeenCalled();
  });

  it("uso normal: usuário da branch_A fecha o caixa da branch_A → fecha", async () => {
    await cashService.closeShift("shift_1", closeData, "co_1", "u1", "branch_A");
    expect(txMock.cashShift.update).toHaveBeenCalledTimes(1);
    const call = (txMock.cashShift.update.mock.calls as any[])[0][0];
    expect(call.data.status).toBe("CLOSED");
  });

  it("compatibilidade: sem expectedBranchId (chamada interna) → não bloqueia por filial", async () => {
    await cashService.closeShift("shift_1", closeData, "co_1", "u1");
    expect(txMock.cashShift.update).toHaveBeenCalledTimes(1);
  });
});
