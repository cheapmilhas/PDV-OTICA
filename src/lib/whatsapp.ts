/**
 * Cliente HTTP para Evolution API (WhatsApp Business open-source).
 *
 * Docs: https://doc.evolution-api.com/
 *
 * Env vars:
 *   EVOLUTION_API_URL       — URL da instância (self-hosted ou cloud)
 *   EVOLUTION_API_KEY       — chave de autenticação
 *   EVOLUTION_INSTANCE_NAME — nome da instância do WhatsApp
 *
 * Graceful: se vars não estiverem definidas, sendText() vira no-op e
 * logger emite warn. Permite código chamar livremente sem feature flag.
 */

import { logger } from "@/lib/logger";

const log = logger.child({ module: "whatsapp" });

function getConfig() {
  return {
    url: process.env.EVOLUTION_API_URL,
    apiKey: process.env.EVOLUTION_API_KEY,
    instance: process.env.EVOLUTION_INSTANCE_NAME,
  };
}

export function isWhatsAppEnabled(): boolean {
  const c = getConfig();
  return !!(c.url && c.apiKey && c.instance);
}

/**
 * Normaliza número BR para formato Evolution API (55 + DDD + 9 + número).
 * Aceita: "85999999999", "(85) 99999-9999", "+55 85 99999-9999".
 */
export function normalizePhoneBR(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return null;

  const withoutDdi = digits.startsWith("55") && digits.length >= 12 ? digits.slice(2) : digits;
  if (withoutDdi.length < 10 || withoutDdi.length > 11) return null;

  return `55${withoutDdi}`;
}

interface SendTextInput {
  /** Número do destinatário (BR) — vai ser normalizado */
  to: string;
  text: string;
  /** Delay em segundos antes de enviar (Evolution: presence indicator). Default 0. */
  delay?: number;
}

interface SendResponse {
  sent: boolean;
  reason?: string;
}

export async function sendWhatsAppText(input: SendTextInput): Promise<SendResponse> {
  const cfg = getConfig();
  if (!cfg.url || !cfg.apiKey || !cfg.instance) {
    log.warn("WhatsApp não configurado — mensagem não enviada", { to: input.to });
    return { sent: false, reason: "whatsapp_not_configured" };
  }

  const number = normalizePhoneBR(input.to);
  if (!number) {
    log.warn("Número inválido para WhatsApp", { to: input.to });
    return { sent: false, reason: "invalid_phone" };
  }

  try {
    const res = await fetch(`${cfg.url}/message/sendText/${cfg.instance}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": cfg.apiKey,
      },
      body: JSON.stringify({
        number,
        text: input.text,
        delay: (input.delay ?? 0) * 1000,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      log.error("Evolution API retornou erro", { status: res.status, body: errBody.slice(0, 200) });
      return { sent: false, reason: `api_error_${res.status}` };
    }

    return { sent: true };
  } catch (err) {
    log.error("Falha ao chamar Evolution API", { err: String(err) });
    return { sent: false, reason: "network_error" };
  }
}
