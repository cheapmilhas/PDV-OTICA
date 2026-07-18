import { describe, it, expect } from "vitest";
import { buildDashboardFilters } from "@/app/admin/(painel)/dashboard-filters";

const notDeleted = {
  OR: [{ blockedReason: null }, { blockedReason: { not: "DELETED" } }],
};

describe("dashboard filters por produto", () => {
  it("combina produto + soft-delete por AND, com o caminho de relação correto", () => {
    const f = buildDashboardFilters("VIS_MEDICAL");

    // Company: campo direto. AND [produto, soft-delete] — o soft-delete evita
    // que a casca DELETED entre nas contagens (o bug que a lista já filtrava).
    expect(f.company).toEqual({
      AND: [{ platformProduct: "VIS_MEDICAL" }, notDeleted],
    });

    // Subscription: FK companyId → relação company (1 nível), nas duas condições.
    expect(f.subscriptionCompany).toEqual({
      AND: [
        { company: { platformProduct: "VIS_MEDICAL" } },
        { company: notDeleted },
      ],
    });

    // Invoice: só subscriptionId → subscription.company (2 níveis).
    expect(f.invoiceCompany).toEqual({
      AND: [
        { subscription: { company: { platformProduct: "VIS_MEDICAL" } } },
        { subscription: { company: notDeleted } },
      ],
    });
  });
});
