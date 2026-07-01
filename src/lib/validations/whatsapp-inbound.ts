export interface InboundMessage {
  evolutionId: string;
  contactNumber: string;
  contactName: string | null;
  // inbound = recebida do cliente; outbound = ENVIADA pela ótica (fromMe). A
  // conversa é a mesma (remoteJid é sempre o nº do cliente). Capturar outbound
  // deixa o inbox mostrar as respostas que o atendente mandou pelo WhatsApp.
  direction: "inbound" | "outbound";
  type: "text" | "audio" | "image" | "other";
  text: string | null;
  mediaUrl: string | null;
  receivedAt: Date;
  isGroup: boolean;
}

/** Extrai uma mensagem (inbound OU outbound) do payload data de um messages.upsert.
 *  Retorna null se faltar id/remoteJid ou o payload for inválido. */
export function parseInboundMessage(data: unknown): InboundMessage | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, any>;
  const key = d.key as Record<string, any> | undefined;
  if (!key || typeof key.id !== "string" || typeof key.remoteJid !== "string") return null;
  const direction: InboundMessage["direction"] = key.fromMe === true ? "outbound" : "inbound";

  const isGroup = String(key.remoteJid).endsWith("@g.us");
  const contactNumber = String(key.remoteJid).split("@")[0];
  if (!contactNumber) return null;

  const msg = (d.message ?? {}) as Record<string, any>;
  let type: InboundMessage["type"] = "other";
  let text: string | null = null;
  let mediaUrl: string | null = null;

  if (typeof msg.conversation === "string") {
    type = "text";
    text = msg.conversation;
  } else if (typeof msg.extendedTextMessage?.text === "string") {
    type = "text";
    text = msg.extendedTextMessage.text;
  } else if (msg.audioMessage) {
    type = "audio";
    mediaUrl = typeof msg.audioMessage.url === "string" ? msg.audioMessage.url : null;
  } else if (msg.imageMessage) {
    type = "image";
    mediaUrl = typeof msg.imageMessage.url === "string" ? msg.imageMessage.url : null;
  }

  const tsRaw = d.messageTimestamp;
  const tsNum = typeof tsRaw === "number" ? tsRaw : typeof tsRaw === "string" ? Number(tsRaw) : NaN;
  const receivedAt = Number.isFinite(tsNum) ? new Date(tsNum * 1000) : new Date();

  return {
    evolutionId: key.id,
    contactNumber,
    // pushName SÓ é do cliente quando a mensagem é INBOUND. Em outbound (fromMe),
    // o pushName do payload é o nome do DONO da instância (a ótica) — usá-lo aqui
    // sobrescrevia o nome real do cliente pelo nome do dono a cada resposta (bug:
    // 14 clientes distintos apareciam como "Matheus Rebouças"). Em outbound → null
    // (o persist não sobrescreve o nome já salvo; ver `?? undefined` no service).
    contactName: direction === "inbound" && typeof d.pushName === "string" ? d.pushName : null,
    direction,
    type,
    text,
    mediaUrl,
    receivedAt,
    isGroup,
  };
}
