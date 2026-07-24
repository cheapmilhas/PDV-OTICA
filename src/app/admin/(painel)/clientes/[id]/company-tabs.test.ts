import { describe, it, expect } from "vitest";
import { visibleTabsFor } from "./company-tabs";

describe("visibleTabsFor (abas product-aware)", () => {
  it("ótica (VIS_APP) vê as abas óticas e NÃO vê Clínica", () => {
    const tabs = visibleTabsFor("VIS_APP");
    expect(tabs).toContain("filiais");
    expect(tabs).toContain("uso");
    expect(tabs).toContain("rede");
    expect(tabs).toContain("ia");
    expect(tabs).not.toContain("clinica");
  });

  it("medical (VIS_MEDICAL) vê Clínica e NÃO vê as abas óticas", () => {
    const tabs = visibleTabsFor("VIS_MEDICAL");
    expect(tabs).toContain("clinica");
    expect(tabs).not.toContain("filiais");
    expect(tabs).not.toContain("uso");
    expect(tabs).not.toContain("rede");
    expect(tabs).not.toContain("ia");
  });

  it("abas comuns aparecem nos dois produtos", () => {
    for (const product of ["VIS_APP", "VIS_MEDICAL"] as const) {
      const tabs = visibleTabsFor(product);
      for (const common of ["resumo", "dados", "assinatura", "usuarios", "faturas", "notas"]) {
        expect(tabs).toContain(common);
      }
    }
  });

  it("o defaultTab 'resumo' é sempre visível (não quebra o painel inicial)", () => {
    expect(visibleTabsFor("VIS_APP")).toContain("resumo");
    expect(visibleTabsFor("VIS_MEDICAL")).toContain("resumo");
  });
});
