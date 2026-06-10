import { describe, it, expect, vi, beforeEach } from "vitest";
import { setupCompanyFinance } from "./finance-setup.service";

// tx fake no formato que setupCompanyFinance usa: três models com upsert.
// O upsert retorna { id: "x" } — necessário porque o accountIdMap do chart
// lê `upserted.id` para montar o parentId dos filhos.
function makeTxFake() {
  return {
    chartOfAccounts: { upsert: vi.fn().mockResolvedValue({ id: "x" }) },
    financeAccount: { upsert: vi.fn().mockResolvedValue({ id: "x" }) },
    reconciliationTemplate: { upsert: vi.fn().mockResolvedValue({ id: "x" }) },
  };
}

type TxFake = ReturnType<typeof makeTxFake>;

function allUpsertCalls(tx: TxFake): Array<{ update: Record<string, unknown> }> {
  return [
    ...tx.chartOfAccounts.upsert.mock.calls,
    ...tx.financeAccount.upsert.mock.calls,
    ...tx.reconciliationTemplate.upsert.mock.calls,
  ].map((call) => call[0] as { update: Record<string, unknown> });
}

describe("setupCompanyFinance — modo additiveOnly", () => {
  let tx: TxFake;

  beforeEach(() => {
    vi.clearAllMocks();
    tx = makeTxFake();
  });

  it("additiveOnly: TODOS os upserts usam update: {} (nunca toca registro existente)", async () => {
    await setupCompanyFinance(tx as never, "co-1", "br-1", { additiveOnly: true });

    const calls = allUpsertCalls(tx);
    expect(tx.chartOfAccounts.upsert).toHaveBeenCalled();
    expect(tx.financeAccount.upsert).toHaveBeenCalled();
    expect(tx.reconciliationTemplate.upsert).toHaveBeenCalled();
    for (const args of calls) {
      expect(args.update).toEqual({});
    }
  });

  it("sem opts (legado/onboarding): updates NÃO são todos vazios (re-aplica seeds)", async () => {
    await setupCompanyFinance(tx as never, "co-1", "br-1");

    const calls = allUpsertCalls(tx);
    const nonEmpty = calls.filter((args) => Object.keys(args.update).length > 0);
    expect(nonEmpty.length).toBe(calls.length);
  });
});
