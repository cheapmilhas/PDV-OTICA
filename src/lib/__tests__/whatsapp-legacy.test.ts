import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sendWhatsAppText, normalizePhoneBR, isWhatsAppEnabled } from "@/lib/whatsapp";

/**
 * B1.5 — O caminho de ENVIO legado (single-instance, sem flag/isolamento por
 * ótica) deve ficar INERTE (no-op) até a Fase B2, INDEPENDENTE das env vars.
 *
 * Garante que setar EVOLUTION_API_URL/KEY/INSTANCE (necessário para a B1) NÃO
 * dispara nenhum envio por este caminho antigo.
 */

const fetchMock = vi.fn();

describe("whatsapp legado — envio desativado (B1.5)", () => {
  const ORIGINAL = {
    url: process.env.EVOLUTION_API_URL,
    key: process.env.EVOLUTION_API_KEY,
    instance: process.env.EVOLUTION_INSTANCE_NAME,
  };

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    // Pior caso: TODAS as credenciais setadas (o que faria o legado "acordar").
    process.env.EVOLUTION_API_URL = "https://evo.test";
    process.env.EVOLUTION_API_KEY = "GLOBAL_KEY";
    process.env.EVOLUTION_INSTANCE_NAME = "instancia-legada";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.EVOLUTION_API_URL = ORIGINAL.url;
    process.env.EVOLUTION_API_KEY = ORIGINAL.key;
    process.env.EVOLUTION_INSTANCE_NAME = ORIGINAL.instance;
  });

  it("NÃO envia nada mesmo com todas as env vars setadas", async () => {
    const result = await sendWhatsAppText({ to: "85999999999", text: "oi" });
    expect(result.sent).toBe(false);
    expect(result.reason).toBe("legacy_whatsapp_disabled");
    // Trava de código: nem chega a chamar a Evolution.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("número válido/telefone inválido: continua no-op (não tenta enviar)", async () => {
    const valido = await sendWhatsAppText({ to: "(85) 99999-9999", text: "x" });
    const invalido = await sendWhatsAppText({ to: "123", text: "x" });
    expect(valido.sent).toBe(false);
    expect(invalido.sent).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("helpers puros continuam funcionando (usados pela geração do link)", () => {
    // normalizePhoneBR é usado independentemente do envio; deve seguir intacto.
    expect(normalizePhoneBR("85999999999")).toBe("5585999999999");
    expect(normalizePhoneBR("+55 85 99999-9999")).toBe("5585999999999");
    expect(normalizePhoneBR("123")).toBeNull();
    // isWhatsAppEnabled reflete só a config de env (não o kill-switch) — mantido
    // para retrocompatibilidade; o envio em si está travado.
    expect(isWhatsAppEnabled()).toBe(true);
  });
});
