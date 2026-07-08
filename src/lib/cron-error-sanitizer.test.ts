import { describe, it, expect } from "vitest";
import { sanitizeCronError } from "./cron-error-sanitizer";

describe("sanitizeCronError", () => {
  it("retorna null para entrada null", () => {
    expect(sanitizeCronError(null)).toBeNull();
  });

  it("redige e-mail", () => {
    expect(sanitizeCronError("falha para joao@cliente.com ao enviar")).toBe(
      "falha para [redigido] ao enviar",
    );
  });

  it("redige CPF com e sem máscara", () => {
    expect(sanitizeCronError("cpf 123.456.789-09 inválido")).toBe("cpf [redigido] inválido");
    expect(sanitizeCronError("doc 12345678909 duplicado")).toBe("doc [redigido] duplicado");
  });

  it("redige CNPJ", () => {
    expect(sanitizeCronError("empresa 12.345.678/0001-90 sem plano")).toBe(
      "empresa [redigido] sem plano",
    );
  });

  it("redige telefone brasileiro", () => {
    expect(sanitizeCronError("contato (85) 99999-8888 recusado")).toBe(
      "contato [redigido] recusado",
    );
  });

  it("trunca acima de 300 caracteres", () => {
    const long = "x".repeat(400);
    const out = sanitizeCronError(long)!;
    expect(out.length).toBeLessThanOrEqual(303);
    expect(out.endsWith("…")).toBe(true);
  });

  it("mantém texto limpo intacto", () => {
    expect(sanitizeCronError("Timeout ao conectar no Asaas")).toBe("Timeout ao conectar no Asaas");
  });
});
