import { describe, it, expect } from "vitest";
import { buildWaMeUrl } from "./whatsapp-deeplink";

describe("buildWaMeUrl", () => {
  it("celular com DDD (11 díg) → wa.me com 55", () => {
    expect(buildWaMeUrl("85999998888")).toBe("https://wa.me/5585999998888");
  });

  it("formato humano (parênteses/traço/espaços) normaliza", () => {
    expect(buildWaMeUrl("(85) 99999-8888")).toBe("https://wa.me/5585999998888");
  });

  it("já com +55 não duplica o DDI", () => {
    expect(buildWaMeUrl("+55 85 99999-8888")).toBe("https://wa.me/5585999998888");
  });

  it("fixo com DDD (10 díg) é válido", () => {
    expect(buildWaMeUrl("8533334444")).toBe("https://wa.me/558533334444");
  });

  it("null/undefined/vazio → null", () => {
    expect(buildWaMeUrl(null)).toBeNull();
    expect(buildWaMeUrl(undefined)).toBeNull();
    expect(buildWaMeUrl("")).toBeNull();
  });

  it("curto demais (sem DDD) → null", () => {
    expect(buildWaMeUrl("99998888")).toBeNull();
  });

  it("lixo com dígitos demais (ex: 0 de discagem) → null (não abre número errado)", () => {
    // 14 dígitos após limpar → fora de 10-11 pós-DDI → normalizePhoneBR rejeita
    expect(buildWaMeUrl("05585999998888")).toBeNull();
  });
});
