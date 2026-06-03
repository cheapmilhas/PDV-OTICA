import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateARReversalEntry } from "../finance-entry.service";

/**
 * Mock de TransactionClient cobrindo só o que generateARReversalEntry usa:
 * - chartOfAccounts.findUnique (busca 1.1.03 e o pai 3.2)
 * - chartOfAccounts.upsert (garante 3.2.01)
 * - financeEntry.upsert (cria/atualiza o lançamento idempotente)
 */
function makeTx() {
  // Mocks de teste: params tipados como `any` de propósito (espelham só o que a
  // função usa, não o tipo completo do Prisma delegate).
  const findUnique = vi.fn(async ({ where }: any) => {
    const code = where.companyId_code.code;
    if (code === "1.1.03") return { id: "acc-ar", code };
    if (code === "3.2") return { id: "acc-32", code };
    return null;
  });
  const chartUpsert = vi.fn(async () => ({ id: "acc-devolucoes", code: "3.2.01" }));
  const financeUpsert = vi.fn(async ({ create }: any) => ({
    id: "fe-1",
    amount: create.amount,
  }));
  return {
    tx: {
      chartOfAccounts: { findUnique, upsert: chartUpsert },
      financeEntry: { upsert: financeUpsert },
    } as never,
    findUnique,
    chartUpsert,
    financeUpsert,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("generateARReversalEntry", () => {
  it("amount <= 0 → não lança nada e retorna null", async () => {
    const { tx, financeUpsert } = makeTx();
    expect(await generateARReversalEntry(tx, { accountReceivableId: "ar1", amount: 0 }, "co1")).toBeNull();
    expect(await generateARReversalEntry(tx, { accountReceivableId: "ar1", amount: -5 }, "co1")).toBeNull();
    expect(financeUpsert).not.toHaveBeenCalled();
  });

  it("lança Débito Devoluções / Crédito Contas a Receber com o valor estornado", async () => {
    const { tx, financeUpsert } = makeTx();
    const id = await generateARReversalEntry(
      tx,
      { accountReceivableId: "ar1", amount: 100, branchId: "b1" },
      "co1",
    );
    expect(id).toBe("fe-1");
    const call = financeUpsert.mock.calls[0][0] as any;
    expect(call.create.type).toBe("REFUND");
    expect(call.create.side).toBe("DEBIT");
    expect(call.create.amount).toBe(100);
    expect(call.create.debitAccountId).toBe("acc-devolucoes"); // 3.2.01
    expect(call.create.creditAccountId).toBe("acc-ar"); // 1.1.03
    expect(call.create.sourceType).toBe("ARReversal");
    expect(call.create.sourceId).toBe("ar1");
    expect(call.create.branchId).toBe("b1");
  });

  it("é idempotente: usa upsert pela chave (companyId,sourceType,sourceId,type,side)", async () => {
    const { tx, financeUpsert } = makeTx();
    await generateARReversalEntry(tx, { accountReceivableId: "ar1", amount: 50 }, "co1");
    const where = (financeUpsert.mock.calls[0][0] as any).where.companyId_sourceType_sourceId_type_side;
    expect(where).toEqual({
      companyId: "co1",
      sourceType: "ARReversal",
      sourceId: "ar1",
      type: "REFUND",
      side: "DEBIT",
    });
  });

  it("arredonda o valor para 2 casas", async () => {
    const { tx, financeUpsert } = makeTx();
    await generateARReversalEntry(tx, { accountReceivableId: "ar1", amount: 99.999 }, "co1");
    expect((financeUpsert.mock.calls[0][0] as any).create.amount).toBe(100);
  });

  it("garante a conta 3.2.01 sob demanda (upsert)", async () => {
    const { tx, chartUpsert } = makeTx();
    await generateARReversalEntry(tx, { accountReceivableId: "ar1", amount: 10 }, "co1");
    expect(chartUpsert).toHaveBeenCalledOnce();
    const upsertArg = (chartUpsert.mock.calls as any[])[0][0];
    expect(upsertArg.where.companyId_code.code).toBe("3.2.01");
  });
});
