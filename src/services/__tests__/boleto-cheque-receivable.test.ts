import { describe, it, expect, vi, beforeEach } from "vitest";
import { applyPaymentsInTx } from "@/services/sale-side-effects.service";

/**
 * Mock de TransactionClient cobrindo só o que applyPaymentsInTx usa no caminho
 * de BOLETO/CHEQUE: cria SalePayment, (não) cria CashMovement, cria AccountReceivable.
 */
function makeTx() {
  const arCreate = vi.fn(async (_args: any) => ({ id: "ar-1" }));
  const cmCreate = vi.fn(async (_args: any) => ({ id: "cm-1" }));
  const spCreate = vi.fn(async (args: any) => ({ id: "sp-1", ...args.data }));
  return {
    tx: {
      accountReceivable: { create: arCreate },
      cashMovement: { create: cmCreate },
      salePayment: { create: spCreate },
    } as never,
    arCreate,
    cmCreate,
    spCreate,
  };
}

const baseSale = {
  id: "sale_1",
  companyId: "co_1",
  branchId: "br_1",
  number: 1234,
};

beforeEach(() => vi.clearAllMocks());

describe("applyPaymentsInTx — boleto/cheque geram AccountReceivable", () => {
  it("BOLETO com cliente cria 1 AccountReceivable +30d e NENHUM CashMovement", async () => {
    const { tx, arCreate, cmCreate } = makeTx();
    await applyPaymentsInTx(tx, {
      sale: baseSale,
      payments: [{ method: "BOLETO", amount: 500 }],
      customerId: "cust_1",
      userId: "user_1",
      openShiftId: "shift_1",
      companySettings: null,
    });
    expect(arCreate).toHaveBeenCalledTimes(1);
    expect((arCreate.mock.calls[0][0] as any).data).toMatchObject({
      companyId: "co_1",
      customerId: "cust_1",
      saleId: "sale_1",
      amount: 500,
      installmentNumber: 1,
      totalInstallments: 1,
      status: "PENDING",
      createdByUserId: "user_1",
    });
    const data = arCreate.mock.calls[0][0].data as any;
    const dueDate = new Date(data.dueDate);
    const expectedMin = new Date(); expectedMin.setDate(expectedMin.getDate() + 29);
    const expectedMax = new Date(); expectedMax.setDate(expectedMax.getDate() + 31);
    expect(dueDate.getTime()).toBeGreaterThanOrEqual(expectedMin.getTime());
    expect(dueDate.getTime()).toBeLessThanOrEqual(expectedMax.getTime());
    expect(cmCreate).not.toHaveBeenCalled();
  });

  it("CHEQUE com cliente cria 1 AccountReceivable e nenhum CashMovement", async () => {
    const { tx, arCreate, cmCreate } = makeTx();
    await applyPaymentsInTx(tx, {
      sale: baseSale,
      payments: [{ method: "CHEQUE", amount: 300 }],
      customerId: "cust_1",
      userId: "user_1",
      openShiftId: "shift_1",
      companySettings: null,
    });
    expect(arCreate).toHaveBeenCalledTimes(1);
    expect(cmCreate).not.toHaveBeenCalled();
  });
});
