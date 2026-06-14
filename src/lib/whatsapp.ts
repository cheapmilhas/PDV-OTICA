/**
 * Cliente HTTP LEGADO para Evolution API (modelo single-instance).
 *
 * Docs: https://doc.evolution-api.com/
 *
 * Env vars (modelo antigo):
 *   EVOLUTION_API_URL       — URL da instância (self-hosted ou cloud)
 *   EVOLUTION_API_KEY       — chave de autenticação
 *   EVOLUTION_INSTANCE_NAME — nome da instância do WhatsApp
 *
 * ⚠️ DESATIVADO (Fase B1.5). Este caminho de ENVIO é single-instance e NÃO tem
 * a feature flag por empresa nem o isolamento por ótica que a Fase B1 introduziu
 * (ver src/lib/evolution.ts + src/lib/whatsapp-flag.ts). Como a B1 precisa setar
 * EVOLUTION_API_URL/EVOLUTION_API_KEY, este envio legado poderia "acordar"
 * sozinho e mandar mensagens fora do novo sistema. Para impedir isso,
 * `sendWhatsAppText` é forçado a NO-OP (independente das env vars) até a Fase B2
 * migrá-lo para o modelo por-ótica.
 *
 * IMPORTANTE: isto PRESERVA o comportamento atual (hoje o envio já é no-op
 * porque as envs não estão setadas) — não introduz nenhum envio novo. A geração
 * de links/recibos que chamam este módulo continua funcionando normalmente; só o
 * envio automático por WhatsApp fica desativado.
 */

import { logger } from "@/lib/logger";

const log = logger.child({ module: "whatsapp-legacy" });

/**
 * Kill-switch do envio legado. Mantém `sendWhatsAppText` INERTE até a Fase B2.
 * Não depende de env var — é um trava de código (fail-safe) para garantir que
 * setar as credenciais da Evolution (necessário para a B1) jamais dispare envio
 * por este caminho antigo, sem flag e sem isolamento por ótica.
 */
const LEGACY_WHATSAPP_SEND_DISABLED = true;

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
  // B1.5: trava de código — envio legado desativado até a B2 migrar para o
  // modelo por-ótica (com feature flag + isolamento). Independe das env vars.
  if (LEGACY_WHATSAPP_SEND_DISABLED) {
    log.warn(
      "Envio de WhatsApp legado DESATIVADO (aguardando Fase B2 — modelo por-ótica). Mensagem não enviada.",
      { to: input.to },
    );
    return { sent: false, reason: "legacy_whatsapp_disabled" };
  }

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
