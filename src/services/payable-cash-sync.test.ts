import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  postPayableCashWithdrawal,
  reversePayableCashWithdrawal,
} from "./payable-cash-sync";

// Rotina 21/06: baixa de despesa em dinheiro precisa refletir no Caixa do PDV.

function makeTx(opts: {
  openShift?: { id: string } | null;
  /** Movimentos desta conta (WITHDRAWAL/OUT e SUPPLY/IN) — usados pelo estorno. */
  movements?: any[];
  shiftStatusById?: Record<string, "OPEN" | "CLOSED">;
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
  const cashMovementFindMany = vi.fn(async () => opts.movements ?? []);

  return {
    tx: {
      cashShift: { findFirst: cashShiftFindFirst, findUnique: cashShiftFindUnique },
      cashMovement: {
        create: cashMovementCreate,
        findMany: cashMovementFindMany,
      },
    } as never,
    cashShiftFindFirst,
    cashMovementCreate,
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

const OUT = (over: any = {}) => ({
  cashShiftId: "shift_1",
  branchId: "b1",
  amount: 15,
  method: "CASH",
  direction: "OUT",
  ...over,
});
const IN = (over: any = {}) => ({ ...OUT(), direction: "IN", ...over });

describe("reversePayableCashWithdrawal", () => {
  it("compensa sangria de turno aberto com SUPPLY/IN", async () => {
    const { tx, cashMovementCreate } = makeTx({
      movements: [OUT()],
      shiftStatusById: { shift_1: "OPEN" },
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
      movements: [OUT()],
      shiftStatusById: { shift_1: "CLOSED" },
    });
    const n = await reversePayableCashWithdrawal(tx, BASE);
    expect(n).toBe(0);
    expect(cashMovementCreate).not.toHaveBeenCalled();
  });

  it("idempotente: já compensado (OUT+IN net 0) → não duplica", async () => {
    const { tx, cashMovementCreate } = makeTx({
      movements: [OUT(), IN()], // sangria 15 + estorno 15 = net 0
      shiftStatusById: { shift_1: "OPEN" },
    });
    const n = await reversePayableCashWithdrawal(tx, BASE);
    expect(n).toBe(0);
    expect(cashMovementCreate).not.toHaveBeenCalled();
  });

  it("CRÍTICO: ciclo pagar→estornar→pagar→estornar compensa a 2ª sangria", async () => {
    // Estado após pagar#1 (OUT), estornar#1 (IN), pagar#2 (OUT): net = +15.
    // O 2º estorno DEVE criar um SUPPLY de 15 (antes deixava sem compensação).
    const { tx, cashMovementCreate } = makeTx({
      movements: [OUT(), IN(), OUT()],
      shiftStatusById: { shift_1: "OPEN" },
    });
    const n = await reversePayableCashWithdrawal(tx, BASE);
    expect(n).toBe(1);
    const call = (cashMovementCreate.mock.calls as any[])[0][0];
    expect(call.data.amount).toBe(15);
    expect(call.data.direction).toBe("IN");
  });

  it("net por método: CASH e PIX são compensados separadamente", async () => {
    const { tx, cashMovementCreate } = makeTx({
      movements: [OUT({ method: "CASH", amount: 10 }), OUT({ method: "PIX", amount: 5 })],
      shiftStatusById: { shift_1: "OPEN" },
    });
    const n = await reversePayableCashWithdrawal(tx, BASE);
    expect(n).toBe(2);
  });

  it("sem sangrias registradas → no-op", async () => {
    const { tx, cashMovementCreate } = makeTx({ movements: [] });
    const n = await reversePayableCashWithdrawal(tx, BASE);
    expect(n).toBe(0);
    expect(cashMovementCreate).not.toHaveBeenCalled();
  });

  it("isolamento: shift de outra empresa (findFirst com companyId retorna null) → não compensa", async () => {
    const { tx, cashMovementCreate } = makeTx({
      movements: [OUT({ cashShiftId: "shift_outra_empresa" })],
      shiftStatusById: {}, // findFirst com companyId devolve null
    });
    const n = await reversePayableCashWithdrawal(tx, BASE);
    expect(n).toBe(0);
    expect(cashMovementCreate).not.toHaveBeenCalled();
  });
});
