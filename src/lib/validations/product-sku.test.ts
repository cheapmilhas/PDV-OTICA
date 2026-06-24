import { describe, it, expect } from "vitest";
import { sanitizeSkuInput, createProductSchema } from "./product.schema";

// Caso PS VISION: SKU com espaço/ponto/acento era recusado pelo backend só no
// submit. Agora o input é sanitizado enquanto digita.

describe("sanitizeSkuInput", () => {
  it("remove espaços", () => {
    expect(sanitizeSkuInput("ARM 001")).toBe("ARM001");
  });

  it("remove ponto, barra e outros símbolos", () => {
    expect(sanitizeSkuInput("ARM.001")).toBe("ARM001");
    expect(sanitizeSkuInput("PSV/239")).toBe("PSV239");
    expect(sanitizeSkuInput("A#R@M*001")).toBe("ARM001");
  });

  it("remove acentos", () => {
    expect(sanitizeSkuInput("AÇÃO01")).toBe("AO01");
  });

  it("converte para maiúsculas", () => {
    expect(sanitizeSkuInput("arm-001_ok")).toBe("ARM-001_OK");
  });

  it("preserva hífen e underscore", () => {
    expect(sanitizeSkuInput("ARM-001_V2")).toBe("ARM-001_V2");
  });

  it("string só de inválidos vira vazio", () => {
    expect(sanitizeSkuInput("   ...   ")).toBe("");
  });

  it("GARANTIA: todo SKU sanitizado (≥3 chars) passa no regex do schema", () => {
    const entradas = ["ARM 001", "psv/239", "Ação-99", "  abc_1  ", "X1-Y_2"];
    for (const e of entradas) {
      const sku = sanitizeSkuInput(e);
      if (sku.length < 3) continue; // muito curto é outra validação
      const r = createProductSchema.safeParse({
        type: "FRAME",
        name: "Produto Teste",
        sku,
        salePrice: 100,
      });
      expect(r.success, `sku sanitizado "${sku}" (de "${e}") deveria passar`).toBe(true);
    }
  });
});
