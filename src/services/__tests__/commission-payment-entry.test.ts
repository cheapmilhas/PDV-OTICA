import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateCommissionPaymentEntry } from "../finance-entry.service";

/**
 * Bloco 4 — a comissão paga vira despesa no ledger (COMMISSION_EXPENSE), senão
 * o DRE lê R$0 e o lucro fica inflado. Regime de CAIXA: lança ao pagar.
 * DÉBITO 5.1.02 (Comissões de Vendedores) / CRÉDITO 1.1.01 (Caixa).
 */

function makeTx(opts: { existingEntry?: boolean; cashAccount?: boolean } = {}) {
  const findUnique = vi.fn(async ({ where }: any) => {
    const code = where.companyId_code.code;
    return { id: `acc-${code}`, code };
  });
  // financeEntry.findUnique: idempotência (existe = não relança).
  const entryFindUnique = vi.fn(async () => (opts.existingEntry ? { id: "fe-existente" } : null));
  const create = vi.fn(async ({ data }: any) => ({ id: "fe-com-1", amount: data?.amount }));
  // financeAccount (saldo operacional do Caixa).
  const faFindFirst = vi.fn(async () => (opts.cashAccount === false ? null : { id: "fa-CASH", type: "CASH" }));
  const faUpdate = vi.fn(async () => ({}));
  return {
    tx: {
      chartOfAccounts: { findUnique },
      financeEntry: { findUnique: entryFindUnique, create },
      financeAccount: { findFirst: faFindFirst, update: faUpdate },
    } as never,
    findUnique,
    entryFindUnique,
    create,
    faFindFirst,
    faUpdate,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("generateCommissionPaymentEntry — despesa de comissão no ledger (Bloco 4)", () => {
  const base = {
    companyId: "co_1",
    branchId: "br_1",
    commissionId: "sc_1",
    amount: 300,
    paidAt: new Date("2026-02-10T12:00:00Z"),
    sellerName: "João",
  };

  it("cria COMMISSION_EXPENSE/DEBIT: débito 5.1.02, crédito 1.1.01, valor pago", async () => {
    const { tx, create } = makeTx();
    await generateCommissionPaymentEntry(tx, base);
    expect(create).toHaveBeenCalledTimes(1);
    const arg = create.mock.calls[0][0] as any;
    expect(arg.data.type).toBe("COMMISSION_EXPENSE");
    expect(arg.data.side).toBe("DEBIT");
    expect(arg.data.amount).toBe(300);
    expect(arg.data.debitAccountId).toBe("acc-5.1.02"); // despesa comissão
    expect(arg.data.creditAccountId).toBe("acc-1.1.01"); // caixa
    expect(arg.data.sourceType).toBe("CommissionPayment"); // motor novo (default)
  });

  it("DECREMENTA o saldo do Caixa (FinanceAccount) — saída real de dinheiro", async () => {
    const { tx, faUpdate } = makeTx();
    await generateCommissionPaymentEntry(tx, base);
    expect(faUpdate).toHaveBeenCalledTimes(1);
    const arg = (faUpdate.mock.calls[0] as any[])[0];
    expect(arg.data.balance).toEqual({ decrement: 300 });
  });

  it("é IDEMPOTENTE: se a despesa já existe, NÃO recria nem re-decrementa o caixa", async () => {
    const { tx, create, faUpdate } = makeTx({ existingEntry: true });
    await generateCommissionPaymentEntry(tx, base);
    expect(create).not.toHaveBeenCalled();
    expect(faUpdate).not.toHaveBeenCalled();
  });

  it("usa sourceType=SellerCommission quando passado (legado)", async () => {
    const { tx, create } = makeTx();
    await generateCommissionPaymentEntry(tx, { ...base, sourceType: "SellerCommission" });
    expect((create.mock.calls[0][0] as any).data.sourceType).toBe("SellerCommission");
  });

  it("usa paidAt como entryDate E cashDate (regime de caixa)", async () => {
    const { tx, create } = makeTx();
    await generateCommissionPaymentEntry(tx, base);
    const arg = create.mock.calls[0][0] as any;
    expect(arg.data.entryDate).toEqual(base.paidAt);
    expect(arg.data.cashDate).toEqual(base.paidAt);
  });

  it("NÃO lança nada se o valor é zero ou negativo", async () => {
    const { tx, create } = makeTx();
    await generateCommissionPaymentEntry(tx, { ...base, amount: 0 });
    await generateCommissionPaymentEntry(tx, { ...base, amount: -5 });
    expect(create).not.toHaveBeenCalled();
  });
});
