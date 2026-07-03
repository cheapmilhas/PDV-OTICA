import { describe, it, expect, beforeEach } from "vitest";
import { generateRefundEntries } from "@/services/finance-entry.service";

/**
 * C2 (Auditoria 2026-07-02): a devolução (refundFull) deve gerar lançamentos de
 * ESTORNO datados da devolução — não apagar os lançamentos da venda original.
 *
 * Bug anterior: refundFull → cancel() fazia financeEntry.deleteMany, apagando o
 * SALE_REVENUE/COGS/PAYMENT do mês da venda. Consequências:
 *  1. o DRE de um mês já fechado encolhia retroativamente ao consultar de novo;
 *  2. a linha "3.2.01 Devoluções e Estornos" (REFUND/DEBIT) ficava SEMPRE R$0
 *     porque generateRefundEntries era código morto (nunca chamado).
 *
 * Este teste prova o contrato que o fix restaura: dado um Refund, o ledger passa
 * a conter REFUND/DEBIT (abate receita, datado da devolução) + COGS/CREDIT
 * (estorna custo) + PAYMENT_RECEIVED/CREDIT (reembolso), com entryDate no mês da
 * DEVOLUÇÃO, não no mês da venda.
 *
 * Estratégia: `tx` em memória que serve as contas contábeis por código e captura
 * os financeEntry.upsert. O DRE dinâmico lê exatamente essas linhas por
 * (type, side) — então provar que elas existem prova que a linha "Devoluções"
 * deixa de ser zero.
 */

interface UpsertedEntry {
  type: string;
  side: string;
  amount: number;
  entryDate: Date;
  sourceType: string;
}

const CHART: Record<string, string> = {
  "3.2.01": "acc-devolucoes",
  "1.1.03": "acc-contas-receber",
  "1.1.04": "acc-estoque",
  "4.1.01": "acc-cmv-armacoes",
  "1.1.01": "acc-caixa",
};

const REFUND_DATE = new Date("2026-02-10T12:00:00Z"); // mês da devolução
const SALE_MONTH = new Date("2026-01-05T12:00:00Z"); // mês da venda original

let upserts: UpsertedEntry[] = [];
let financeAccountBalance = 1000;

function makeTx(refund: any) {
  return {
    refund: {
      findUniqueOrThrow: async () => refund,
    },
    chartOfAccounts: {
      findUnique: async ({ where }: any) => {
        const id = CHART[where.companyId_code.code];
        return id ? { id, code: where.companyId_code.code } : null;
      },
    },
    financeAccount: {
      findFirst: async () => ({ id: "fa-cash", type: "CASH" }),
      update: async ({ data }: any) => {
        if (data.balance?.decrement) financeAccountBalance -= data.balance.decrement;
      },
    },
    financeEntry: {
      upsert: async ({ create }: any) => {
        upserts.push({
          type: create.type,
          side: create.side,
          amount: Number(create.amount),
          entryDate: create.entryDate,
          sourceType: create.sourceType,
        });
        return create;
      },
    },
  } as any;
}

beforeEach(() => {
  upserts = [];
  financeAccountBalance = 1000;
});

describe("generateRefundEntries — C2: estorno datado no ledger", () => {
  const baseRefund = {
    id: "ref1",
    saleId: "sale1",
    branchId: "b1",
    totalRefund: 1000,
    totalCost: 400,
    completedAt: REFUND_DATE,
    refundMethod: "CASH",
    sale: { cashbackUsed: 0 }, // venda sem cashback usado → reembolso = bruto
    items: [
      {
        id: "ri1",
        costAmount: 400,
        saleItem: { product: { type: "FRAME" } },
      },
    ],
  };

  it("cria REFUND/DEBIT que abate a receita (linha Devoluções deixa de ser R$0)", async () => {
    await generateRefundEntries(makeTx(baseRefund), "ref1", "co1");

    const refundEntry = upserts.find((e) => e.type === "REFUND" && e.side === "DEBIT");
    expect(refundEntry).toBeDefined();
    expect(refundEntry!.amount).toBe(1000);
  });

  it("data o estorno no mês da DEVOLUÇÃO, não no mês da venda", async () => {
    await generateRefundEntries(makeTx(baseRefund), "ref1", "co1");

    const refundEntry = upserts.find((e) => e.type === "REFUND" && e.side === "DEBIT");
    // entryDate = fevereiro (devolução), preservando janeiro (venda) intacto.
    expect(refundEntry!.entryDate).toEqual(REFUND_DATE);
    expect(refundEntry!.entryDate.getUTCMonth()).toBe(1); // 0-indexed → fevereiro
    expect(refundEntry!.entryDate).not.toEqual(SALE_MONTH);
  });

  it("estorna o CMV com COGS/CREDIT (não apaga o COGS original da venda)", async () => {
    await generateRefundEntries(makeTx(baseRefund), "ref1", "co1");

    const cogsReversal = upserts.find((e) => e.type === "COGS" && e.side === "CREDIT");
    expect(cogsReversal).toBeDefined();
    expect(cogsReversal!.amount).toBe(400);
  });

  it("gera o reembolso (PAYMENT_RECEIVED/CREDIT) e decrementa o saldo da conta", async () => {
    await generateRefundEntries(makeTx(baseRefund), "ref1", "co1");

    const payback = upserts.find((e) => e.type === "PAYMENT_RECEIVED" && e.side === "CREDIT");
    expect(payback).toBeDefined();
    expect(payback!.amount).toBe(1000);
    // saldo caiu pelo valor reembolsado (dinheiro que saiu do caixa)
    expect(financeAccountBalance).toBe(0); // 1000 − 1000
  });

  it("CR-2: venda que usou cashback reembolsa/decrementa só o valor PAGO do bolso", async () => {
    // Venda R$1000: R$900 dinheiro + R$100 cashback usado. Só R$900 entrou em
    // caixa, então só R$900 sai. A receita revertida (REFUND/DEBIT) segue bruta.
    const refundComCashback = { ...baseRefund, sale: { cashbackUsed: 100 } };
    await generateRefundEntries(makeTx(refundComCashback), "ref1", "co1");

    const refundEntry = upserts.find((e) => e.type === "REFUND" && e.side === "DEBIT");
    expect(refundEntry!.amount).toBe(1000); // receita revertida = bruto

    const payback = upserts.find((e) => e.type === "PAYMENT_RECEIVED" && e.side === "CREDIT");
    expect(payback!.amount).toBe(900); // reembolso em caixa = pago do bolso
    // saldo: 1000 − 900 = 100 (NÃO drena os 100 de cashback que nunca entraram)
    expect(financeAccountBalance).toBe(100);
  });

  it("CR-2: venda 100% paga com cashback não gera reembolso em caixa nem decrementa saldo", async () => {
    // total 1000, cashbackUsed 1000 → cashRefund 0 → passo 3 é pulado.
    const refundTudoCashback = { ...baseRefund, sale: { cashbackUsed: 1000 } };
    await generateRefundEntries(makeTx(refundTudoCashback), "ref1", "co1");

    const payback = upserts.find((e) => e.type === "PAYMENT_RECEIVED" && e.side === "CREDIT");
    expect(payback).toBeUndefined(); // nenhum reembolso em caixa
    expect(financeAccountBalance).toBe(1000); // saldo intacto
    // a receita ainda é revertida (bruto) — a venda deixou de existir.
    const refundEntry = upserts.find((e) => e.type === "REFUND" && e.side === "DEBIT");
    expect(refundEntry!.amount).toBe(1000);
  });
});
