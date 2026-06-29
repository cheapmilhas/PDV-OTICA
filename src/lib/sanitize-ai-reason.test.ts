import { describe, it, expect } from "vitest";
import { sanitizeAiReason } from "./sanitize-ai-reason";

describe("sanitizeAiReason — minimização LGPD do motivo da IA", () => {
  it("mascara valores monetários (R$ e 'reais')", () => {
    expect(sanitizeAiReason("cobrança de R$ 1.234,56 em aberto")).toContain("[valor]");
    expect(sanitizeAiReason("cobrança de R$ 1.234,56 em aberto")).not.toContain("1.234");
    expect(sanitizeAiReason("deve 500 reais")).toContain("[valor]");
  });

  it("mascara e-mail", () => {
    expect(sanitizeAiReason("cliente joao@ex.com pediu")).toContain("[email]");
    expect(sanitizeAiReason("cliente joao@ex.com pediu")).not.toContain("@ex.com");
  });

  it("mascara sequências longas de dígitos (CPF/telefone/pedido)", () => {
    expect(sanitizeAiReason("CPF 123.456.789-00")).toContain("[número]");
    expect(sanitizeAiReason("pedido 85992933218")).toContain("[número]");
  });

  it("NÃO mascara números curtos legítimos", () => {
    const r = sanitizeAiReason("quer 2 óculos de grau");
    expect(r).toContain("2 óculos");
  });

  it("trunca em maxLen e é fail-safe com vazio/null", () => {
    expect(sanitizeAiReason("x".repeat(500)).length).toBeLessThanOrEqual(200);
    expect(sanitizeAiReason(null)).toBe("");
    expect(sanitizeAiReason(undefined)).toBe("");
    expect(sanitizeAiReason("")).toBe("");
  });

  it("preserva texto comum (não-sensível)", () => {
    expect(sanitizeAiReason("conversa pessoal, não é cliente de ótica")).toBe(
      "conversa pessoal, não é cliente de ótica",
    );
  });
});
