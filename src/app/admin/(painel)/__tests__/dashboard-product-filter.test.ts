import { describe, it, expect } from "vitest";
import { buildDashboardFilters } from "@/app/admin/(painel)/dashboard-filters";

describe("dashboard filters por produto", () => {
  it("cada entidade recebe o caminho de relação correto", () => {
    const f = buildDashboardFilters("VIS_MEDICAL");
    // Company tem o campo direto
    expect(f.company).toEqual({ platformProduct: "VIS_MEDICAL" });
    // Subscription: FK companyId → relação company (1 nível)
    expect(f.subscriptionCompany).toEqual({ company: { platformProduct: "VIS_MEDICAL" } });
    // Invoice: NÃO tem companyId nem company → só subscriptionId → 2 níveis
    expect(f.invoiceCompany).toEqual({
      subscription: { company: { platformProduct: "VIS_MEDICAL" } },
    });
  });
});
