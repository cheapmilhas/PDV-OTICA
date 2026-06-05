import { describe, it, expect } from "vitest";
import {
  DEFAULT_MESSAGES,
  replaceMessageVariables,
} from "./default-messages";

/** Conjunto de valores equivalente ao que handleThankYouWhatsApp fornece. */
const fullVars = {
  cliente: "João",
  valor: "R$ 1.500,00",
  otica: "Ótica Vis",
  empresa: "Ótica Vis",
  data: "04/06/2026",
  vendedor: "Maria",
  produto: "Armação Ray-Ban",
  telefone: "(11) 99999-9999",
  whatsapp: "(11) 99999-9999",
  endereco: "Rua X, 123",
  itens: "1x Armação",
  validade: "11/06/2026",
  saldo: "R$ 50,00",
  ganho: "R$ 25,00",
  dias: "30",
};

describe("replaceMessageVariables", () => {
  it("não deixa placeholder literal no template de agradecimento", () => {
    const result = replaceMessageVariables(DEFAULT_MESSAGES.thankYou, fullVars);
    expect(result).not.toMatch(/\{[a-z_]+\}/);
  });

  it("{empresa} usa o valor de {otica} quando não informado explicitamente", () => {
    const result = replaceMessageVariables("Bem-vindo à {empresa}!", {
      otica: "Ótica Vis",
    });
    expect(result).toBe("Bem-vindo à Ótica Vis!");
  });

  it("substitui campo vazio sem deixar o placeholder literal", () => {
    const result = replaceMessageVariables("Tel: {telefone}.", {
      telefone: "",
    });
    expect(result).toBe("Tel: .");
  });

  it("não toca placeholders cujas chaves não foram informadas", () => {
    const result = replaceMessageVariables("Olá {cliente}, {desconhecido}", {
      cliente: "João",
    });
    expect(result).toBe("Olá João, {desconhecido}");
  });

  it("substitui todas as ocorrências da mesma chave", () => {
    const result = replaceMessageVariables("{otica} - obrigado pela {otica}", {
      otica: "Vis",
    });
    expect(result).toBe("Vis - obrigado pela Vis");
  });
});
