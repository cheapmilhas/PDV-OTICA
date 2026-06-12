import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateSaleEntries } from "../finance-entry.service";

/**
 * Anti double-count no DRE: BOLETO e CHEQUE devem ser tratados como
 * "Contas a Receber" (1.1.03), NÃO como dinheiro no banco D+0.
 *
 * Antes deste fix, boleto/cheque caíam no `default` dos helpers e:
 *   - debitAccountCode = "1.1.02" (Bancos)
 *   - financeAccountType = "BANK" → incrementava saldo da conta bancária
 *   - cashDate = D+0 (dinheiro disponível na hora)
 * Como o pagamento também vira AccountReceivable, o dinheiro era contado 2x.
 *
 * O comportamento correto é idêntico ao BALANCE_DUE:
 *   - debitAccountCode = "1.1.03" (Contas a Receber)
 *   - financeAccountType = null → NÃO entra em conta financeira (sem incremento)
 *   - cashDate = null (recebido depois)
 *
 * Testamos através da função pública generateSaleEntries (os 3 helpers são
 * privados ao módulo), com um tx mockado modelado em ar-reversal-entry.test.ts.
 */

interface MockPayment {
  id: string;
  method: string;
  amount: number;
  status: string;
  feeAmount?: number | null;
  receivedAt?: Date | null;
  settlementDate?: Date | null;
}

function makeTx(payment: MockPayment) {
  // chartOfAccounts.findUnique: devolve uma conta por código.
  const findUnique = vi.fn(async ({ where }: any) => {
    const code = where.companyId_code.code;
    return { id: `acc-${code}`, code };
  });

  // financeAccount.findFirst: devolve a conta financeira do tipo pedido.
  const financeAccountFindFirst = vi.fn(async ({ where }: any) => ({
    id: `fa-${where.type}`,
    type: where.type,
  }));
  const financeAccountUpdate = vi.fn(async () => ({}));

  // sale.findUniqueOrThrow: venda mínima com 1 pagamento, sem itens.
  const saleFindUniqueOrThrow = vi.fn(async () => ({
    id: "sale-1",
    branchId: "branch-1",
    total: 200,
    discountTotal: 0,
    completedAt: new Date("2026-01-10T12:00:00Z"),
    createdAt: new Date("2026-01-10T12:00:00Z"),
    items: [],
    payments: [
      {
        id: payment.id,
        method: payment.method,
        amount: payment.amount,
        status: payment.status,
        feeAmount: payment.feeAmount ?? null,
        receivedAt: payment.receivedAt ?? null,
        settlementDate: payment.settlementDate ?? null,
      },
    ],
  }));

  const financeUpsert = vi.fn(async ({ create }: any) => ({
    id: "fe-1",
    amount: create.amount,
  }));

  return {
    tx: {
      sale: { findUniqueOrThrow: saleFindUniqueOrThrow },
      chartOfAccounts: { findUnique },
      financeAccount: {
        findFirst: financeAccountFindFirst,
        update: financeAccountUpdate,
      },
      financeEntry: { upsert: financeUpsert },
    } as never,
    findUnique,
    financeAccountFindFirst,
    financeAccountUpdate,
    financeUpsert,
  };
}

/** Extrai o lançamento PAYMENT_RECEIVED (lado DEBIT) dos upserts. */
function getPaymentReceivedCreate(financeUpsert: ReturnType<typeof vi.fn>) {
  const call = financeUpsert.mock.calls.find((c: any) => {
    const arg = c[0];
    return arg.create?.type === "PAYMENT_RECEIVED" && arg.create?.side === "DEBIT";
  });
  if (!call) throw new Error("PAYMENT_RECEIVED/DEBIT entry não encontrado");
  return (call[0] as any).create;
}

beforeEach(() => vi.clearAllMocks());

describe("generateSaleEntries — boleto/cheque tratados como Contas a Receber (anti double-count)", () => {
  for (const method of ["BOLETO", "CHEQUE"] as const) {
    describe(method, () => {
      it("debita Contas a Receber (1.1.03), NÃO Bancos (1.1.02)", async () => {
        const { tx, financeUpsert } = makeTx({
          id: "pay-1",
          method,
          amount: 200,
          status: "RECEIVED",
        });
        await generateSaleEntries(tx, "sale-1", "co1");
        const create = getPaymentReceivedCreate(financeUpsert);
        expect(create.debitAccountId).toBe("acc-1.1.03"); // Contas a Receber
        expect(create.debitAccountId).not.toBe("acc-1.1.02"); // não Bancos
      });

      it("não vincula conta financeira (financeAccountType = null) e não incrementa saldo bancário", async () => {
        const { tx, financeUpsert, financeAccountFindFirst, financeAccountUpdate } =
          makeTx({
            id: "pay-1",
            method,
            amount: 200,
            status: "RECEIVED",
          });
        await generateSaleEntries(tx, "sale-1", "co1");
        const create = getPaymentReceivedCreate(financeUpsert);
        // financeAccountId fica undefined → não entra em conta financeira
        expect(create.financeAccountId).toBeUndefined();
        // nunca busca conta financeira tipo BANK para boleto/cheque
        const bankLookups = financeAccountFindFirst.mock.calls.filter(
          (c: any) => c[0]?.where?.type === "BANK",
        );
        expect(bankLookups.length).toBe(0);
        // nenhum incremento de saldo de conta bancária
        expect(financeAccountUpdate).not.toHaveBeenCalled();
      });

      it("cashDate = null (a prazo, não entra no caixa D+0)", async () => {
        const { tx, financeUpsert } = makeTx({
          id: "pay-1",
          method,
          amount: 200,
          status: "RECEIVED",
        });
        await generateSaleEntries(tx, "sale-1", "co1");
        const create = getPaymentReceivedCreate(financeUpsert);
        expect(create.cashDate).toBeNull();
      });
    });
  }
});
