import { describe, it, expect } from "vitest";
import { leadNeedsAttention, countNeedsAttention } from "./lead-needs-attention";

describe("leadNeedsAttention — visão 'Precisa de atenção' (Fase 3, Item 1)", () => {
  it("marca intenções de tratativa: reclamação, cobrança, garantia", () => {
    expect(leadNeedsAttention({ intent: "RECLAMACAO" })).toBe(true);
    expect(leadNeedsAttention({ intent: "COBRANCA_FINANCEIRO" })).toBe(true);
    expect(leadNeedsAttention({ intent: "GARANTIA_CONSERTO" })).toBe(true);
  });

  it("marca lead com tom irritado (urgent) mesmo se a intenção é de venda", () => {
    expect(leadNeedsAttention({ intent: "NOVA_COMPRA", urgent: true })).toBe(true);
  });

  it("NÃO marca intenções de venda sem urgência", () => {
    expect(leadNeedsAttention({ intent: "NOVA_COMPRA" })).toBe(false);
    expect(leadNeedsAttention({ intent: "ORCAMENTO_PRECO" })).toBe(false);
  });

  it("NÃO marca AGUARDANDO_OS (atraso deve vir de fato, não da IA)", () => {
    expect(leadNeedsAttention({ intent: "AGUARDANDO_OS" })).toBe(false);
  });

  it("NÃO marca lead sem intenção nem urgência", () => {
    expect(leadNeedsAttention({ intent: null, urgent: false })).toBe(false);
    expect(leadNeedsAttention({})).toBe(false);
  });

  it("countNeedsAttention conta só os que precisam", () => {
    const n = countNeedsAttention([
      { intent: "RECLAMACAO" },
      { intent: "NOVA_COMPRA" },
      { intent: "NOVA_COMPRA", urgent: true },
      { intent: null },
    ]);
    expect(n).toBe(2);
  });
});
