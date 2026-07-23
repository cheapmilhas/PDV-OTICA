import { describe, it, expect } from "vitest";
import {
  buildProductSnapshot,
  consolidateTotals,
  type ProductSnapshot,
} from "@/app/admin/(painel)/grupo/group-metrics";
import type { SubscriptionForMRR } from "@/lib/admin-metrics";

const NOW = new Date("2026-07-22T12:00:00Z");

function sub(priceMonthly: number): SubscriptionForMRR {
  return {
    priceMonthly,
    priceYearly: 0,
    billingCycle: "MONTHLY",
    discountPercent: null,
    discountExpiresAt: null,
  };
}

describe("group-metrics — dashboard consolidado", () => {
  it("buildProductSnapshot soma o MRR das subs ativas do produto (centavos)", () => {
    const snap = buildProductSnapshot({
      product: "VIS_APP",
      companies: 10,
      activeSubs: 2,
      trialSubs: 3,
      activeSubsForMrr: [sub(14990), sub(14990)],
      now: NOW,
    });
    expect(snap.product).toBe("VIS_APP");
    expect(snap.companies).toBe(10);
    expect(snap.trialSubs).toBe(3);
    expect(snap.mrrCentavos).toBe(29980);
  });

  it("consolidateTotals = Σ dos snapshots por produto (invariante do Grupo)", () => {
    const snapshots: ProductSnapshot[] = [
      { product: "VIS_APP", companies: 10, activeSubs: 8, trialSubs: 2, mrrCentavos: 100000 },
      { product: "VIS_MEDICAL", companies: 4, activeSubs: 3, trialSubs: 1, mrrCentavos: 26970 },
    ];
    const totals = consolidateTotals(snapshots);
    expect(totals.companies).toBe(14);
    expect(totals.activeSubs).toBe(11);
    expect(totals.trialSubs).toBe(3);
    expect(totals.mrrCentavos).toBe(126970);
  });

  it("totais de lista vazia são zerados (não NaN)", () => {
    const totals = consolidateTotals([]);
    expect(totals).toEqual({ companies: 0, activeSubs: 0, trialSubs: 0, mrrCentavos: 0 });
  });
});
