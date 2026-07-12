import { describe, it, expect } from "vitest";
import { resolveProvisionProduct } from "@/app/api/admin/clientes/provision-product";

describe("resolveProvisionProduct", () => {
  it("default VIS_APP quando ausente (undefined/null/vazio)", () => {
    expect(resolveProvisionProduct(undefined)?.platformProduct).toBe("VIS_APP");
    expect(resolveProvisionProduct(null)?.platformProduct).toBe("VIS_APP");
    expect(resolveProvisionProduct("")?.platformProduct).toBe("VIS_APP");
  });
  it("aceita VIS_MEDICAL", () => {
    expect(resolveProvisionProduct("VIS_MEDICAL")?.platformProduct).toBe("VIS_MEDICAL");
  });
  it("VIS_MEDICAL pula o finance setup de ótica", () => {
    expect(resolveProvisionProduct("VIS_MEDICAL")?.runOpticalFinanceSetup).toBe(false);
    expect(resolveProvisionProduct("VIS_APP")?.runOpticalFinanceSetup).toBe(true);
  });
  it("presente e INVÁLIDO retorna null (caller deve dar 400), não default silencioso", () => {
    expect(resolveProvisionProduct("VIS-MEDICAL")).toBeNull(); // typo com hífen
    expect(resolveProvisionProduct("vis_app")).toBeNull(); // case errado
    expect(resolveProvisionProduct("lixo")).toBeNull();
  });
});
