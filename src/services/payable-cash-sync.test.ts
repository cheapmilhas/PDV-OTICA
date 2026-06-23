import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  postPayableCashWithdrawal,
  reversePayableCashWithdrawal,
} from "./payable-cash-sync";

// Rotina 21/06: baixa de despesa em dinheiro precisa refletir no Caixa do PDV.

function makeTx(opts: {
  openShift?: { id: string } | null;
  withdrawals?: any[];
  shiftStatusById?: Record<string, "OPEN" | "CLOSED">;
  alreadyReversedCount?: number;
}) {
  const shiftLookup = async ({ where }: any) => {
    const status = opts.shiftStatusById?.[where.id];
    return status ? { status } : null;
  };
  const cashShiftFindFirst = vi.fn(async ({ where }: any) => {
    // Quando consultado por id (estorno) usa o status mapeado; senão, o openShift.
    if (where?.id) return shiftLookup({ where });
    return opts.openShift ?? null;
  });
  const cashShiftFindUnique = vi.fn(shiftLookup);
  const cashMovementCreate = vi.fn(async () => ({ id: "mov-new" }));
  const cashMovementFindMany = vi.fn(async () => opts.withdrawals ?? []);
  const cashMovementCount = vi.fn(async () => opts.alreadyReversedCount ?? 0);

  return {
    tx: {
      cashShift: { findFirst: cashShiftFindFirst, findUnique: cashShiftFindUnique },
      cashMovement: {
        create: cashMovementCreate,
        findMany: cashMovementFindMany,
        count: cashMovementCount,
      },
    } as never,
    cashShiftFindFirst,
    cashMovementCreate,
    cashMovementCount,
  };
}

const BASE = {
  companyId: "co_1",
  payableId: "ap_1",
  amount: 15,
  description: "água loja",
  userId: "u1",
};

beforeEach(() => vi.clearAllMocks());

describe("postPayableCashWithdrawal", () => {
  it("conta CASH + caixa aberto → cria sangria WITHDRAWAL/OUT", async () => {
    const { tx, cashMovementCreate } = makeTx({ openShift: { id: "shift_1" } });
    const id = await postPayableCashWithdrawal(tx, {
      ...BASE,
      branchId: "b1",
      accountType: "CASH" as any,
    });
    expect(id).toBe("mov-new");
    const call = (cashMovementCreate.mock.calls as any[])[0][0];
    expect(call.data.type).toBe("WITHDRAWAL");
    expect(call.data.direction).toBe("OUT");
    expect(call.data.method).toBe("CASH");
    expect(call.data.amount).toBe(15);
    expect(call.data.originType).toBe("AccountPayable");
    expect(call.data.cashShiftId).toBe("shift_1");
  });

  it("conta não-CASH (BANK) → no-op", async () => {
    const { tx, cashMovementCreate } = makeTx({ openShift: { id: "shift_1" } });
    const id = await postPayableCashWithdrawal(tx, {
      ...BASE,
      branchId: "b1",
      accountType: "BANK" as any,
    });
    expect(id).toBeNull();
    expect(cashMovementCreate).not.toHaveBeenCalled();
  });

  it("conta sem filial → no-op", async () => {
    const { tx, cashMovementCreate } = makeTx({ openShift: { id: "shift_1" } });
    const id = await postPayableCashWithdrawal(tx, {
      ...BASE,
      branchId: null,
      accountType: "CASH" as any,
    });
    expect(id).toBeNull();
    expect(cashMovementCreate).not.toHaveBeenCalled();
  });

  it("sem caixa aberto na filial → no-op (não bloqueia pagamento)", async () => {
    const { tx, cashMovementCreate } = makeTx({ openShift: null });
    const id = await postPayableCashWithdrawal(tx, {
      ...BASE,
      branchId: "b1",
      accountType: "CASH" as any,
    });
    expect(id).toBeNull();
    expect(cashMovementCreate).not.toHaveBeenCalled();
  });

  it("valor zero/negativo → no-op", async () => {
    const { tx, cashMovementCreate } = makeTx({ openShift: { id: "shift_1" } });
    expect(
      await postPayableCashWithdrawal(tx, { ...BASE, amount: 0, branchId: "b1", accountType: "CASH" as any })
    ).toBeNull();
    expect(cashMovementCreate).not.toHaveBeenCalled();
  });
});

describe("reversePayableCashWithdrawal", () => {
  it("compensa sangria de turno aberto com SUPPLY/IN", async () => {
    const { tx, cashMovementCreate } = makeTx({
      withdrawals: [
        { id: "w1", cashShiftId: "shift_1", branchId: "b1", amount: 15, method: "CASH" },
      ],
      shiftStatusById: { shift_1: "OPEN" },
      alreadyReversedCount: 0,
    });
    const n = await reversePayableCashWithdrawal(tx, BASE);
    expect(n).toBe(1);
    const call = (cashMovementCreate.mock.calls as any[])[0][0];
    expect(call.data.type).toBe("SUPPLY");
    expect(call.data.direction).toBe("IN");
    expect(call.data.amount).toBe(15);
  });

  it("turno FECHADO → não compensa (fechamento já contabilizou)", async () => {
    const { tx, cashMovementCreate } = makeTx({
      withdrawals: [
        { id: "w1", cashShiftId: "shift_1", branchId: "b1", amount: 15, method: "CASH" },
      ],
      shiftStatusById: { shift_1: "CLOSED" },
    });
    const n = await reversePayableCashWithdrawal(tx, BASE);
    expect(n).toBe(0);
    expect(cashMovementCreate).not.toHaveBeenCalled();
  });

  it("idempotente: já compensado → não duplica", async () => {
    const { tx, cashMovementCreate } = makeTx({
      withdrawals: [
        { id: "w1", cashShiftId: "shift_1", branchId: "b1", amount: 15, method: "CASH" },
      ],
      shiftStatusById: { shift_1: "OPEN" },
      alreadyReversedCount: 1,
    });
    const n = await reversePayableCashWithdrawal(tx, BASE);
    expect(n).toBe(0);
    expect(cashMovementCreate).not.toHaveBeenCalled();
  });

  it("sem sangrias registradas → no-op", async () => {
    const { tx, cashMovementCreate } = makeTx({ withdrawals: [] });
    const n = await reversePayableCashWithdrawal(tx, BASE);
    expect(n).toBe(0);
    expect(cashMovementCreate).not.toHaveBeenCalled();
  });

  it("isolamento: shift de outra empresa (findFirst com companyId retorna null) → não compensa", async () => {
    const { tx, cashMovementCreate } = makeTx({
      withdrawals: [
        { id: "w1", cashShiftId: "shift_outra_empresa", branchId: "b1", amount: 15, method: "CASH" },
      ],
      // shiftStatusById não mapeia esse id → o findFirst com companyId devolve null.
      shiftStatusById: {},
    });
    const n = await reversePayableCashWithdrawal(tx, BASE);
    expect(n).toBe(0);
    expect(cashMovementCreate).not.toHaveBeenCalled();
  });
});
