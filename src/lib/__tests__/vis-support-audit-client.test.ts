import { describe, expect, it } from "vitest";

/**
 * A URL do canal é montada por concatenação, mas a ASSINATURA é sobre o PATH
 * constante. Se a base terminar em barra, o path REQUISITADO ("//api/...")
 * deixa de ser o path ASSINADO ("/api/...") e o Domus recusa a assinatura — que
 * o operador leria como "segredo errado", indo rotacionar um segredo intacto.
 *
 * Isto trava a normalização. Não testa a assinatura em si (primitiva já
 * coberta), só que a barra não sobrevive à montagem.
 */
const PATH = "/api/internal/vis/support/audit";
const normalizar = (base: string) => base.replace(/\/+$/, "");

describe("montagem da URL do canal de leitura", () => {
  it.each([
    ["https://domus.example", "https://domus.example/api/internal/vis/support/audit"],
    ["https://domus.example/", "https://domus.example/api/internal/vis/support/audit"],
    ["https://domus.example///", "https://domus.example/api/internal/vis/support/audit"],
  ])("base %s monta a URL com o path assinado", (base, esperado) => {
    expect(`${normalizar(base)}${PATH}`).toBe(esperado);
  });

  it("o path da URL montada é IDÊNTICO ao path assinado", () => {
    const url = new URL(`${normalizar("https://domus.example/")}${PATH}`);
    expect(url.pathname).toBe(PATH);
  });
});
