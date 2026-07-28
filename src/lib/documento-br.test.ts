import { describe, expect, it } from "vitest";

import {
  erroDocumento,
  formatarDocumento,
  isCnpjValido,
  isCpfValido,
  isDocumentoValido,
  tipoDocumento,
} from "@/lib/documento-br";

describe("isCnpjValido", () => {
  it("aceita CNPJ real", () => {
    // CNPJ da Petrobras (público, dígito verificador correto).
    expect(isCnpjValido("33000167000101")).toBe(true);
    expect(isCnpjValido("33.000.167/0001-01")).toBe(true);
  });

  it("REJEITA o CNPJ que passou no cadastro e o gateway recusou", () => {
    // 🔥 O caso real: 14 dígitos, passou na validação de comprimento, entrou em
    // produção, e só na hora de cobrar o Asaas devolveu "CPF/CNPJ inválido".
    expect(isCnpjValido("20606235000131")).toBe(false);
  });

  it("rejeita sequência repetida (satisfaz a fórmula mas não existe)", () => {
    expect(isCnpjValido("11111111111111")).toBe(false);
  });

  it("rejeita comprimento errado", () => {
    expect(isCnpjValido("330001670001")).toBe(false);
  });
});

describe("isCpfValido", () => {
  it("aceita CPF com dígito correto", () => {
    expect(isCpfValido("52998224725")).toBe(true);
    expect(isCpfValido("529.982.247-25")).toBe(true);
  });

  it("rejeita dígito verificador errado", () => {
    expect(isCpfValido("52998224726")).toBe(false);
  });

  it("rejeita sequência repetida", () => {
    expect(isCpfValido("11111111111")).toBe(false);
  });
});

describe("isDocumentoValido — aceita os DOIS", () => {
  it("consultório individual usa CPF; clínica usa CNPJ", () => {
    // Exigir CNPJ excluiria metade do público-alvo do produto.
    expect(isDocumentoValido("52998224725")).toBe(true);
    expect(isDocumentoValido("33000167000101")).toBe(true);
  });

  it("rejeita vazio e comprimento intermediário", () => {
    expect(isDocumentoValido("")).toBe(false);
    expect(isDocumentoValido("1234567890")).toBe(false);
  });
});

describe("tipoDocumento", () => {
  it("distingue pelo comprimento", () => {
    expect(tipoDocumento("52998224725")).toBe("CPF");
    expect(tipoDocumento("33000167000101")).toBe("CNPJ");
    expect(tipoDocumento("123")).toBeNull();
  });
});

describe("erroDocumento — mensagem acionável", () => {
  it("vazio pede o documento", () => {
    expect(erroDocumento("")).toMatch(/Informe/);
  });

  it("comprimento errado diz quantos dígitos faltam", () => {
    expect(erroDocumento("123456")).toMatch(/você digitou 6/);
  });

  it("dígito inválido diz que o verificador não confere", () => {
    expect(erroDocumento("20606235000131")).toMatch(/dígito verificador/);
  });

  it("documento válido não gera erro", () => {
    expect(erroDocumento("33000167000101")).toBeNull();
    expect(erroDocumento("52998224725")).toBeNull();
  });
});

describe("formatarDocumento", () => {
  it("mascara CPF e CNPJ conforme o tamanho", () => {
    expect(formatarDocumento("52998224725")).toBe("529.982.247-25");
    expect(formatarDocumento("33000167000101")).toBe("33.000.167/0001-01");
  });

  it("ignora o que passar de 14 dígitos", () => {
    expect(formatarDocumento("330001670001019999")).toBe("33.000.167/0001-01");
  });
});
