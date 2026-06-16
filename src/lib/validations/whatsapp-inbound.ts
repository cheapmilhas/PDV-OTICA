export interface InboundMessage {
  evolutionId: string;
  contactNumber: string;
  contactName: string | null;
  direction: "inbound";
  type: "text" | "audio" | "image" | "other";
  text: string | null;
  mediaUrl: string | null;
  receivedAt: Date;
  isGroup: boolean;
}

/** Extrai uma mensagem inbound do payload data de um evento messages.upsert.
 *  Retorna null se for outbound (fromMe), se faltar id/remoteJid, ou se o payload for inválido. */
export function parseInboundMessage(data: unknown): InboundMessage | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, any>;
  const key = d.key as Record<string, any> | undefined;
  if (!key || typeof key.id !== "string" || typeof key.remoteJid !== "string") return null;
  if (key.fromMe === true) return null; // outbound — fora do escopo A'

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
    contactName: typeof d.pushName === "string" ? d.pushName : null,
    direction: "inbound",
    type,
    text,
    mediaUrl,
    receivedAt,
    isGroup,
  };
}
