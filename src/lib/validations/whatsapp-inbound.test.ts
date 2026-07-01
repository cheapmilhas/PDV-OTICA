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
      isGroup: false,
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

  it("mensagem fromMe (enviada pela ótica) → direction outbound, mesma conversa", () => {
    const r = parseInboundMessage({ key: { id: "X", remoteJid: "5585999@s.whatsapp.net", fromMe: true }, message: { conversation: "ok, já separo" } });
    expect(r?.direction).toBe("outbound");
    expect(r?.contactNumber).toBe("5585999"); // remoteJid = nº do cliente (conversa)
    expect(r?.text).toBe("ok, já separo");
  });

  it("outbound NÃO usa pushName como contactName (bug: pushName é o nome do DONO)", () => {
    // Repro: em fromMe=true o pushName do payload é o nome do dono da instância.
    // Antes, isso virava contactName e sobrescrevia o nome do cliente. Agora null.
    const r = parseInboundMessage({
      key: { id: "OUT1", remoteJid: "5585123456789@s.whatsapp.net", fromMe: true },
      pushName: "Matheus Rebouças", // nome do DONO no payload de outbound
      message: { conversation: "já separei seu óculos" },
    });
    expect(r?.direction).toBe("outbound");
    expect(r?.contactName).toBeNull(); // NÃO pega o pushName do dono
  });

  it("inbound continua pegando o pushName (é o nome do cliente)", () => {
    const r = parseInboundMessage({
      key: { id: "IN1", remoteJid: "5585123456789@s.whatsapp.net", fromMe: false },
      pushName: "João Cliente",
      message: { conversation: "oi, quero um óculos" },
    });
    expect(r?.contactName).toBe("João Cliente");
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

  it("marca isGroup=true quando remoteJid termina em @g.us", () => {
    const r = parseInboundMessage({
      key: { id: "G1", remoteJid: "120363012345678901@g.us", fromMe: false },
      message: { conversation: "oferta no grupo" }, messageTimestamp: 1750000000,
    });
    expect(r?.isGroup).toBe(true);
  });

  it("marca isGroup=false para 1:1 (@s.whatsapp.net)", () => {
    const r = parseInboundMessage({
      key: { id: "P1", remoteJid: "5585999998888@s.whatsapp.net", fromMe: false },
      message: { conversation: "quanto custa?" }, messageTimestamp: 1750000000,
    });
    expect(r?.isGroup).toBe(false);
  });
});
