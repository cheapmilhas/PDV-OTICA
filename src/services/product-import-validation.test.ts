import { describe, it, expect } from "vitest";
import { parseNumericCell, validateImportNumbers } from "./product-import.service";

// Bloco 2 / C3: a importação não pode mais aceitar lixo calado.

describe("parseNumericCell", () => {
  it("número nativo passa", () => {
    expect(parseNumericCell(199.9)).toBe(199.9);
    expect(parseNumericCell(0)).toBe(0);
  });
  it("string simples vira número", () => {
    expect(parseNumericCell("199.90")).toBe(199.9);
    expect(parseNumericCell("10")).toBe(10);
  });
  it("formato BR (vírgula decimal + ponto milhar) é interpretado certo", () => {
    expect(parseNumericCell("1.234,50")).toBe(1234.5);
    expect(parseNumericCell("199,90")).toBe(199.9);
  });
  it("texto inválido vira null (NÃO 0 silencioso)", () => {
    expect(parseNumericCell("abc")).toBeNull();
    expect(parseNumericCell("R$ x")).toBeNull();
  });
  it("vazio/null/undefined vira null", () => {
    expect(parseNumericCell("")).toBeNull();
    expect(parseNumericCell(null)).toBeNull();
    expect(parseNumericCell(undefined)).toBeNull();
  });
  it("negativo é parseado (a validação decide rejeitar)", () => {
    expect(parseNumericCell("-5")).toBe(-5);
  });
});

describe("validateImportNumbers — prova dupla C3", () => {
  const base = { precoVenda: "100", precoCusto: "50", estoqueAtual: "10", estoqueMin: "2" };

  it("USO NORMAL: linha válida → ok com valores parseados", () => {
    const r = validateImportNumbers(base);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.values.salePrice).toBe(100);
      expect(r.values.costPrice).toBe(50);
      expect(r.values.stockQty).toBe(10);
      expect(r.values.stockMin).toBe(2);
    }
  });

  it("BUG FECHADO: preço de venda ≤ 0 → rejeitado com campo+motivo", () => {
    const r = validateImportNumbers({ ...base, precoVenda: "0" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatchObject({ field: "Preço de Venda" });
  });

  it("BUG FECHADO: preço de venda negativo → rejeitado", () => {
    const r = validateImportNumbers({ ...base, precoVenda: "-50" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => e.field === "Preço de Venda")).toBe(true);
  });

  it("BUG FECHADO: preço de venda texto inválido → rejeitado (não vira 0)", () => {
    const r = validateImportNumbers({ ...base, precoVenda: "abc" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0].message).toMatch(/inválido|número/i);
  });

  it("BUG FECHADO: estoque negativo → rejeitado", () => {
    const r = validateImportNumbers({ ...base, estoqueAtual: "-3" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => e.field === "Quantidade em Estoque")).toBe(true);
  });

  it("BUG FECHADO: estoque fracionário → rejeitado (deve ser inteiro)", () => {
    const r = validateImportNumbers({ ...base, estoqueAtual: "2.5" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => /inteiro/i.test(e.message))).toBe(true);
  });

  it("BUG FECHADO: custo negativo → rejeitado", () => {
    const r = validateImportNumbers({ ...base, precoCusto: "-1" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => e.field === "Preço de Custo")).toBe(true);
  });

  it("acumula múltiplos erros (várias colunas inválidas na mesma linha)", () => {
    const r = validateImportNumbers({ precoVenda: "-1", precoCusto: "-2", estoqueAtual: "-3", estoqueMin: "x" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.length).toBeGreaterThanOrEqual(3);
  });

  it("custo/estoque ausentes assumem default 0 (uso normal, não é erro)", () => {
    const r = validateImportNumbers({ precoVenda: "100", precoCusto: "", estoqueAtual: "", estoqueMin: "" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.values.costPrice).toBe(0);
      expect(r.values.stockQty).toBe(0);
    }
  });

  it("aceita formato BR no preço (uso normal)", () => {
    const r = validateImportNumbers({ ...base, precoVenda: "1.299,90" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.values.salePrice).toBe(1299.9);
  });
});
