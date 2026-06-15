import { describe, it, expect } from "vitest";
import { parseInboundMessage } from "./whatsapp-inbound";

describe("parseInboundMessage", () => {
  it("extrai mensagem de texto inbound", () => {
    const r = parseInboundMessage({
      key: { id: "ABC123", remoteJid: "5585999998888@s.whatsapp.net", fromMe: false },
      pushName: "Maria",
      message: { conversation: "quanto custa um óculos de grau?" },
      messageTimestamp: 1750000000,
    });
    expect(r).toEqual({
      evolutionId: "ABC123",
      contactNumber: "5585999998888",
      contactName: "Maria",
      direction: "inbound",
      type: "text",
      text: "quanto custa um óculos de grau?",
      mediaUrl: null,
      receivedAt: new Date(1750000000 * 1000),
    });
  });

  it("detecta áudio (type=audio, text null)", () => {
    const r = parseInboundMessage({
      key: { id: "AUD1", remoteJid: "5585111@s.whatsapp.net", fromMe: false },
      message: { audioMessage: { url: "https://x/a.ogg" } },
      messageTimestamp: 1750000001,
    });
    expect(r?.type).toBe("audio");
    expect(r?.text).toBeNull();
    expect(r?.mediaUrl).toBe("https://x/a.ogg");
  });

  it("retorna null para mensagem fromMe (outbound — fora do escopo A')", () => {
    expect(
      parseInboundMessage({ key: { id: "X", remoteJid: "5585@s.whatsapp.net", fromMe: true }, message: { conversation: "oi" } })
    ).toBeNull();
  });

  it("retorna null se faltam campos essenciais (sem id ou sem remoteJid)", () => {
    expect(parseInboundMessage({ message: { conversation: "oi" } })).toBeNull();
    expect(parseInboundMessage(null)).toBeNull();
    expect(parseInboundMessage({ key: { id: "X" } })).toBeNull();
  });

  it("lê texto de extendedTextMessage", () => {
    const r = parseInboundMessage({
      key: { id: "E1", remoteJid: "5585@s.whatsapp.net", fromMe: false },
      message: { extendedTextMessage: { text: "tem lente de contato?" } },
      messageTimestamp: 1750000002,
    });
    expect(r?.type).toBe("text");
    expect(r?.text).toBe("tem lente de contato?");
  });
});
