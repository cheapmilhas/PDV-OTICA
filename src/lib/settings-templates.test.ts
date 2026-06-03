import { describe, it, expect } from "vitest";
import { missingMessageTemplates } from "./settings-templates";
import { DEFAULT_MESSAGES } from "./default-messages";

describe("missingMessageTemplates", () => {
  it("preenche todos os 4 campos quando estão null (registro legado/drift)", () => {
    const patch = missingMessageTemplates({
      messageThankYou: null,
      messageQuote: null,
      messageReminder: null,
      messageBirthday: null,
    });
    expect(patch).toEqual({
      messageThankYou: DEFAULT_MESSAGES.thankYou,
      messageQuote: DEFAULT_MESSAGES.quote,
      messageReminder: DEFAULT_MESSAGES.reminder,
      messageBirthday: DEFAULT_MESSAGES.birthday,
    });
  });

  it("retorna objeto vazio quando todos os campos já têm valor (não reescreve)", () => {
    const patch = missingMessageTemplates({
      messageThankYou: "Obrigado!",
      messageQuote: "Seu orçamento",
      messageReminder: "Lembrete",
      messageBirthday: "Parabéns",
    });
    expect(patch).toEqual({});
  });

  it("preenche só o campo faltante, preservando os já configurados", () => {
    const patch = missingMessageTemplates({
      messageThankYou: "Texto personalizado do lojista",
      messageQuote: null,
      messageReminder: "Lembrete custom",
      messageBirthday: "",
    });
    expect(patch).toEqual({
      messageQuote: DEFAULT_MESSAGES.quote,
      messageBirthday: DEFAULT_MESSAGES.birthday,
    });
    expect(patch).not.toHaveProperty("messageThankYou");
    expect(patch).not.toHaveProperty("messageReminder");
  });

  it("trata string em branco (só espaços) como faltante", () => {
    const patch = missingMessageTemplates({
      messageThankYou: "   ",
      messageQuote: "ok",
      messageReminder: "ok",
      messageBirthday: "ok",
    });
    expect(patch).toEqual({ messageThankYou: DEFAULT_MESSAGES.thankYou });
  });

  it("trata campos ausentes (undefined) como faltantes", () => {
    const patch = missingMessageTemplates({});
    expect(Object.keys(patch).sort()).toEqual(
      ["messageBirthday", "messageQuote", "messageReminder", "messageThankYou"].sort()
    );
  });
});
