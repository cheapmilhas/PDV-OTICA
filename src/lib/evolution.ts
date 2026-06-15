/**
 * Cliente HTTP tipado para a Evolution API (WhatsApp multi-instância, v2.3.x).
 *
 * Canal: SEMPRE `WHATSAPP-BAILEYS` (conexão por QR Code) — nunca o canal Cloud API.
 *
 * Documentação: https://doc.evolution-api.com/
 *
 * Env vars (todas server-side; NUNCA expor ao client):
 *   EVOLUTION_API_URL        — base da API (ex: https://evolution.suaempresa.com)
 *   EVOLUTION_API_KEY        — chave GLOBAL (AUTHENTICATION_API_KEY). Usada em
 *                              TODAS as chamadas via header `apikey`. Secret de
 *                              alto valor: server-side only, nunca em resposta.
 *   EVOLUTION_WEBHOOK_SECRET — segredo compartilhado (jwt_key) que a Evolution usa
 *                              para assinar (HS256) as chamadas ao nosso webhook.
 *
 * Endpoints confirmados na tag 2.3.7:
 *   POST   /instance/create
 *   GET    /instance/connect/{instance}
 *   GET    /instance/connectionState/{instance}
 *   DELETE /instance/logout/{instance}
 *   POST   /webhook/set/{instance}   (body ANINHADO sob `webhook`)
 */

/** Eventos que nos interessam na Fase B1 (apenas conexão/status). */
export const WHATSAPP_WEBHOOK_EVENTS = [
  "QRCODE_UPDATED",
  "CONNECTION_UPDATE",
] as const;

/** Canal de integração — QR Code (Baileys). Nunca Cloud API. */
export const EVOLUTION_INTEGRATION = "WHATSAPP-BAILEYS" as const;

/** Estados de conexão devolvidos pela Evolution. */
export type EvolutionConnState = "open" | "connecting" | "close";

/** Objeto de QR retornado por create/connect. `base64` é o PNG data-URI. */
export interface EvolutionQrCode {
  count?: number;
  pairingCode?: string;
  base64?: string;
  code?: string;
}

export interface EvolutionCreateResponse {
  instance?: {
    instanceName?: string;
    instanceId?: string;
    integration?: string;
    status?: string;
  };
  // No 2.3.x `hash` é a string da apikey; doc antiga mostra { apikey }. Trate ambos.
  hash?: string | { apikey?: string };
  qrcode?: EvolutionQrCode;
}

export interface EvolutionConnectionState {
  instance?: {
    instanceName?: string;
    state?: EvolutionConnState;
  };
}

/** Resposta do envio de texto (campos relevantes; o resto é ignorado). */
export interface EvolutionSendResponse {
  key?: {
    id?: string;
    remoteJid?: string;
    fromMe?: boolean;
  };
  status?: string;
  message?: unknown;
}

interface WebhookConfigInput {
  url: string;
  /** Segredo compartilhado para a Evolution assinar o webhook (JWT HS256). */
  secret: string;
  events?: readonly string[];
}

class EvolutionError extends Error {
  constructor(
    public status: number,
    public body: unknown,
    message: string,
  ) {
    super(message);
    this.name = "EvolutionError";
  }
}

function getConfig(): { apiKey: string; baseUrl: string } {
  const apiKey = process.env.EVOLUTION_API_KEY;
  const baseUrl = process.env.EVOLUTION_API_URL;
  if (!apiKey) {
    throw new Error("EVOLUTION_API_KEY environment variable is required");
  }
  if (!baseUrl) {
    throw new Error("EVOLUTION_API_URL environment variable is required");
  }
  // Remove barra final para montar o path sem duplicar "/".
  return { apiKey, baseUrl: baseUrl.replace(/\/+$/, "") };
}

async function evolutionFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const { apiKey, baseUrl } = getConfig();

  const headers: Record<string, string> = {
    apikey: apiKey,
    "Content-Type": "application/json",
    "User-Agent": "pdv-otica/1.0",
    ...((init.headers as Record<string, string>) ?? {}),
  };

  const res = await fetch(`${baseUrl}${path}`, { ...init, headers });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!res.ok) {
    const errMsg =
      (body as { message?: string; error?: string })?.message ||
      (body as { error?: string })?.error ||
      (typeof body === "string" && body ? body : `Evolution ${res.status}`);
    throw new EvolutionError(res.status, body, String(errMsg));
  }

  return body as T;
}

/** Monta o bloco de config de webhook (inline no create ou no /webhook/set). */
function buildWebhookConfig(webhook: WebhookConfigInput) {
  return {
    enabled: true,
    url: webhook.url,
    // `jwt_key` faz a Evolution (v2.3.x) assinar cada chamada com JWT HS256 e
    // enviar `Authorization: Bearer <jwt>`. Validamos isso no nosso webhook.
    headers: { jwt_key: webhook.secret },
    byEvents: false,
    base64: false,
    events: [...(webhook.events ?? WHATSAPP_WEBHOOK_EVENTS)],
  };
}

export const evolution = {
  /**
   * Cria a instância (canal Baileys) já com `qrcode: true` e o webhook inline.
   * Retorna o QR (base64) no mesmo response quando disponível.
   */
  async createInstance(
    instanceName: string,
    webhook: WebhookConfigInput,
  ): Promise<EvolutionCreateResponse> {
    return evolutionFetch<EvolutionCreateResponse>("/instance/create", {
      method: "POST",
      body: JSON.stringify({
        instanceName,
        integration: EVOLUTION_INTEGRATION,
        qrcode: true,
        webhook: buildWebhookConfig(webhook),
      }),
    });
  },

  /** Conecta / obtém um QR novo de uma instância existente. */
  async connect(instanceName: string): Promise<EvolutionQrCode> {
    return evolutionFetch<EvolutionQrCode>(
      `/instance/connect/${encodeURIComponent(instanceName)}`,
    );
  },

  /** Lê o estado da conexão (open | connecting | close). */
  async connectionState(
    instanceName: string,
  ): Promise<EvolutionConnectionState> {
    return evolutionFetch<EvolutionConnectionState>(
      `/instance/connectionState/${encodeURIComponent(instanceName)}`,
    );
  },

  /** Desconecta (logout) a sessão do WhatsApp; mantém a instância no servidor. */
  async logout(instanceName: string): Promise<unknown> {
    return evolutionFetch(
      `/instance/logout/${encodeURIComponent(instanceName)}`,
      { method: "DELETE" },
    );
  },

  /**
   * (Re)registra o webhook da instância. Body ANINHADO sob `webhook` — exigido
   * pelo schema do 2.3.x (a doc de referência mostra flat, mas o código exige
   * aninhado).
   */
  async setWebhook(
    instanceName: string,
    webhook: WebhookConfigInput,
  ): Promise<unknown> {
    return evolutionFetch(
      `/webhook/set/${encodeURIComponent(instanceName)}`,
      {
        method: "POST",
        body: JSON.stringify({ webhook: buildWebhookConfig(webhook) }),
      },
    );
  },

  /**
   * Envia uma mensagem de texto pela instância (Fase B2).
   *
   * `POST /message/sendText/{instance}` com header `apikey` (chave global).
   * `number` deve vir já normalizado (somente dígitos com DDI, ex: 5511999999999).
   * Retorna o `key.id` da mensagem quando disponível.
   */
  async sendText(
    instanceName: string,
    number: string,
    text: string,
  ): Promise<EvolutionSendResponse> {
    return evolutionFetch<EvolutionSendResponse>(
      `/message/sendText/${encodeURIComponent(instanceName)}`,
      {
        method: "POST",
        body: JSON.stringify({ number, text }),
      },
    );
  },
};

/** Extrai a apikey da instância do campo `hash` (string ou objeto). */
export function extractInstanceApiKey(
  hash: EvolutionCreateResponse["hash"],
): string | null {
  if (!hash) return null;
  if (typeof hash === "string") return hash;
  return hash.apikey ?? null;
}

/** Mapeia o estado da Evolution para o enum do nosso schema. */
export function mapEvolutionState(
  state: EvolutionConnState | undefined,
): "CONNECTED" | "CONNECTING" | "DISCONNECTED" {
  if (state === "open") return "CONNECTED";
  if (state === "connecting") return "CONNECTING";
  return "DISCONNECTED";
}

export { EvolutionError };
