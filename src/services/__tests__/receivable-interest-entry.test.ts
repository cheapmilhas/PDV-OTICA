import { describe, it, expect, beforeEach } from "vitest";
import { generateReceivableInterestEntry } from "@/services/finance-entry.service";

/**
 * S5 (Auditoria 2026-07-02): multa/juros recebidos DIRETAMENTE ao quitar um AR
 * (receive-multiple, fora de renegociação) devem virar receita financeira no
 * ledger. Antes, só a renegociação lançava juros; o pagamento direto criava o
 * CashMovement pelo valor cheio mas o ledger não reconhecia a receita
 * financeira — o DRE subestimava o lucro frente ao caixa real.
 *
 * Contrato provado: dado fine+juros > 0, cria FinanceEntry OTHER/CREDIT
 * (Receita Financeira) datado do recebimento (regime de caixa); com 0, é no-op.
 */

interface Upserted {
  type: string;
  side: string;
  amount: number;
  sourceType: string;
  cashDate: Date | null;
  entryDate: Date;
}

const CHART: Record<string, string> = {
  "1.1.03": "acc-contas-receber",
  "3.1": "acc-receita-op",
  "3.1.03": "acc-receita-financeira",
};

let upserts: Upserted[] = [];

function makeTx() {
  return {
    chartOfAccounts: {
      findUnique: async ({ where }: any) => {
        const id = CHART[where.companyId_code.code];
        return id ? { id, code: where.companyId_code.code } : null;
      },
      upsert: async ({ create }: any) => ({ id: CHART[create.code] ?? "acc-new", code: create.code }),
    },
    financeEntry: {
      upsert: async ({ create }: any) => {
        upserts.push({
          type: create.type,
          side: create.side,
          amount: Number(create.amount),
          sourceType: create.sourceType,
          cashDate: create.cashDate,
          entryDate: create.entryDate,
        });
        return { id: "fe-1" };
      },
    },
  } as any;
}

const RECEIVED_AT = new Date("2026-03-10T12:00:00Z");

beforeEach(() => {
  upserts = [];
});

describe("generateReceivableInterestEntry — S5", () => {
  it("lança receita financeira (OTHER/CREDIT) quando há multa/juros", async () => {
    const id = await generateReceivableInterestEntry(
      makeTx(),
      { accountReceivableId: "ar1", interestAndFine: 50, branchId: "b1", entryDate: RECEIVED_AT },
      "co1"
    );

    expect(id).toBe("fe-1");
    expect(upserts).toHaveLength(1);
    const e = upserts[0];
    expect(e.type).toBe("OTHER");
    expect(e.side).toBe("CREDIT");
    expect(e.amount).toBe(50);
    expect(e.sourceType).toBe("ARInterestReceived"); // distinto de ARRenegotiation
  });

  it("usa regime de CAIXA: cashDate = data do recebimento", async () => {
    await generateReceivableInterestEntry(
      makeTx(),
      { accountReceivableId: "ar1", interestAndFine: 50, branchId: "b1", entryDate: RECEIVED_AT },
      "co1"
    );
    expect(upserts[0].cashDate).toEqual(RECEIVED_AT);
    expect(upserts[0].entryDate).toEqual(RECEIVED_AT);
  });

  it("no-op quando não há multa/juros (retorna null, não grava)", async () => {
    const id = await generateReceivableInterestEntry(
      makeTx(),
      { accountReceivableId: "ar1", interestAndFine: 0, branchId: "b1" },
      "co1"
    );
    expect(id).toBeNull();
    expect(upserts).toHaveLength(0);
  });

  it("arredonda a 2 casas (centavos)", async () => {
    await generateReceivableInterestEntry(
      makeTx(),
      { accountReceivableId: "ar1", interestAndFine: 12.345, branchId: "b1", entryDate: RECEIVED_AT },
      "co1"
    );
    expect(upserts[0].amount).toBe(12.35);
  });
});
