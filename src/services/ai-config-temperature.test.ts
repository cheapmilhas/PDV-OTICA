import { describe, it, expect } from "vitest";
import { modelSupportsTemperature, QUALIFIER_MODELS } from "./ai-config.service";

// IA-5: Opus 4.7+ removeu o parâmetro `temperature` (400 se enviado). As chamadas
// de qualificador/copiloto devem OMITIR temperature para esses modelos, senão a
// feature falha silenciosamente ao selecionar opus-4-8 na config de IA.
describe("modelSupportsTemperature (IA-5)", () => {
  it("opus-4-8 NÃO aceita temperature", () => {
    expect(modelSupportsTemperature("claude-opus-4-8")).toBe(false);
  });

  it("sonnet-4-6 e haiku-4-5 aceitam temperature", () => {
    expect(modelSupportsTemperature("claude-sonnet-4-6")).toBe(true);
    expect(modelSupportsTemperature("claude-haiku-4-5")).toBe(true);
  });

  it("modelo desconhecido: assume que aceita (default permissivo)", () => {
    expect(modelSupportsTemperature("modelo-novo-xyz")).toBe(true);
  });

  it("cobre todos os modelos da allowlist sem lançar", () => {
    for (const m of QUALIFIER_MODELS) {
      expect(typeof modelSupportsTemperature(m)).toBe("boolean");
    }
  });
});
