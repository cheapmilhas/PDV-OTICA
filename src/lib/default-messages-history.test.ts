import { describe, it, expect } from "vitest";
import { DEFAULT_MESSAGES } from "./default-messages";
import { classifyMessageValue } from "./default-messages-history";

describe("classifyMessageValue (B2.1)", () => {
  it("NULL/vazio → missing (vai preencher)", () => {
    expect(classifyMessageValue("thankYou", null)).toBe("missing");
    expect(classifyMessageValue("thankYou", "")).toBe("missing");
    expect(classifyMessageValue("thankYou", "   ")).toBe("missing");
  });

  it("igual ao default ATUAL → current-default (nada a fazer)", () => {
    expect(classifyMessageValue("quote", DEFAULT_MESSAGES.quote)).toBe("current-default");
    expect(classifyMessageValue("quote", `  ${DEFAULT_MESSAGES.quote}  `)).toBe("current-default");
  });

  it("igual a um default HISTÓRICO → stale-default (vai atualizar)", () => {
    const history = { thankYou: ["Texto antigo v1"], quote: [], reminder: [], birthday: [] };
    expect(classifyMessageValue("thankYou", "Texto antigo v1", history)).toBe("stale-default");
  });

  it("texto próprio do cliente → custom (NUNCA toca)", () => {
    expect(classifyMessageValue("birthday", "Parabéns do jeito da minha ótica!")).toBe("custom");
  });
});
