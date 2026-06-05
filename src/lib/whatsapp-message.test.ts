import { describe, it, expect } from "vitest";
import {
  buildThankYouMessage,
  buildProductSummary,
  mapMessagesToSettingsPayload,
} from "./whatsapp-message";
import { DEFAULT_MESSAGES } from "./default-messages";

// formatador simples equivalente ao formatCurrency da venda
const fmt = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

describe("buildProductSummary", () => {
  it("junta nomes dos produtos", () => {
    expect(buildProductSummary(["Armação", "Lente"])).toBe("Armação, Lente");
  });
  it("ignora nulos/vazios", () => {
    expect(buildProductSummary([null, "Lente", undefined, ""])).toBe("Lente");
  });
  it("retorna vazio sem itens", () => {
    expect(buildProductSummary([])).toBe("");
    expect(buildProductSummary(undefined)).toBe("");
  });
});

describe("buildThankYouMessage (fluxo real do botão Agradecer)", () => {
  const sale = {
    customerName: "João",
    total: 1500,
    dateLabel: "04/06/2026",
    sellerName: "Maria",
    productNames: ["Armação Ray-Ban", "Lente Transitions"],
  };
  const settings = {
    displayName: "Ótica Vis",
    phone: "(11) 3333-3333",
    whatsapp: "(11) 99999-9999",
    address: "Rua X, 123",
  };

  it("NÃO deixa nenhum placeholder literal no template padrão", () => {
    const msg = buildThankYouMessage(DEFAULT_MESSAGES.thankYou, sale, settings, fmt);
    expect(msg).not.toMatch(/\{[a-z_]+\}/);
  });

  it("substitui {empresa}, {produto}, {telefone} (o bug C3) corretamente", () => {
    const tpl =
      "Oi {cliente}! Compra de {produto} na {empresa}. Tel {telefone}, zap {whatsapp}, end {endereco}.";
    const msg = buildThankYouMessage(tpl, sale, settings, fmt);
    expect(msg).toBe(
      "Oi João! Compra de Armação Ray-Ban, Lente Transitions na Ótica Vis. Tel (11) 3333-3333, zap (11) 99999-9999, end Rua X, 123."
    );
  });

  it("{empresa} cai no nome da ótica e campos vazios não deixam placeholder literal", () => {
    const tpl = "{empresa} - tel {telefone}";
    const msg = buildThankYouMessage(
      tpl,
      { customerName: "Ana", total: 0, productNames: [] },
      { displayName: "Minha Ótica" }, // sem phone
      fmt
    );
    expect(msg).toBe("Minha Ótica - tel ");
    expect(msg).not.toMatch(/\{telefone\}/);
  });

  it("usa defaults quando dados ausentes (cliente/vendedor/ótica)", () => {
    const msg = buildThankYouMessage(
      "{cliente} / {vendedor} / {otica}",
      { total: 0 },
      {},
      fmt
    );
    expect(msg).toBe("Cliente / Vendedor / Ótica");
  });
});

describe("mapMessagesToSettingsPayload (fluxo real do botão Salvar)", () => {
  it("mapeia os 4 textareas para os campos do backend (bug C2)", () => {
    const payload = mapMessagesToSettingsPayload({
      agradecimento: "A",
      orcamento: "B",
      lembrete: "C",
      aniversario: "D",
    });
    expect(payload).toEqual({
      messageThankYou: "A",
      messageQuote: "B",
      messageReminder: "C",
      messageBirthday: "D",
    });
  });
});
