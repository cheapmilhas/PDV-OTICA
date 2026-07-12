import { describe, it, expect } from "vitest";
import { resolveProvisionProduct } from "@/app/api/admin/clientes/provision-product";

describe("resolveProvisionProduct", () => {
  it("default VIS_APP quando ausente", () => {
    expect(resolveProvisionProduct(undefined).platformProduct).toBe("VIS_APP");
  });
  it("aceita VIS_MEDICAL", () => {
    expect(resolveProvisionProduct("VIS_MEDICAL").platformProduct).toBe("VIS_MEDICAL");
  });
  it("VIS_MEDICAL pula o finance setup de ótica", () => {
    expect(resolveProvisionProduct("VIS_MEDICAL").runOpticalFinanceSetup).toBe(false);
    expect(resolveProvisionProduct("VIS_APP").runOpticalFinanceSetup).toBe(true);
  });
});
