import { randomUUID } from "crypto";

import { signVisProvision } from "@/lib/vis-provision-hmac";

/**
 * Cliente de LEITURA da trilha de suporte Vis → Domus (N7).
 *
 * Irmão de `vis-support-client.ts` (resgate), mesma primitiva e mesmo segredo,
 * outro path. GET: o corpo assinado é o `clinicId`, que é o que amarra o tenant
 * à assinatura sem depender de querystring.
 */

const PATH = "/api/internal/vis/support/audit";
const TIMEOUT_MS = 5000;

export interface SupportAuditEventFromDomus {
  id: string;
  /** Null em `code_generated` — o acesso ainda não existia. */
  grantId: string | null;
  event: string;
  visOperatorRef: string | null;
  createdAt: string;
  details: {
    reason?: string;
    expiresAt?: string;
    absoluteExpiresAt?: string;
    readOnly?: boolean;
  } | null;
}

export type SupportAuditReadResult =
  | { kind: "ok"; events: SupportAuditEventFromDomus[]; truncated: boolean }
  /** Domus fora, lento, ou canal mal configurado. A tela AVISA — nunca finge vazio. */
  | { kind: "unavailable"; reason: string };

export async function getSupportAuditFromDomus(
  clinicId: string,
): Promise<SupportAuditReadResult> {
  const secret = process.env.VIS_DOMUS_SUPPORT_SECRET ?? "";
  // Barra no fim vira "//api/..." na URL montada, mas a ASSINATURA é sobre o
  // PATH com UMA barra — o Domus recusaria a assinatura e o operador leria
  // `http_401` como "segredo errado", indo rotacionar um segredo que está
  // intacto. Normaliza ANTES de assinar qualquer coisa.
  const baseUrl = (process.env.DOMUS_WEBHOOK_URL ?? "").replace(/\/+$/, "");
  if (!secret || !baseUrl) {
    return { kind: "unavailable", reason: "canal_nao_configurado" };
  }

  const ts = Date.now();
  const nonce = randomUUID();
  const signature = signVisProvision(secret, {
    version: 1,
    method: "GET",
    path: PATH,
    nonce,
    ts,
    // O clinicId ocupa o lugar do corpo: é GET, o corpo é vazio.
    body: clinicId,
  });

  try {
    const res = await fetch(`${baseUrl}${PATH}`, {
      method: "GET",
      headers: {
        "x-vis-timestamp": String(ts),
        "x-vis-nonce": nonce,
        "x-vis-signature": signature,
        "x-vis-clinic-id": clinicId,
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });

    if (!res.ok) {
      return { kind: "unavailable", reason: `http_${res.status}` };
    }

    // Ao contrário do irmão do resgate, o parse fica DENTRO do try e sem
    // `.catch(() => ({}))`. Lá o corpo é necessário para distinguir recusa
    // definitiva de transitório mesmo em não-2xx; aqui não há taxonomia a
    // recuperar — corpo ilegível JÁ É indisponibilidade, e uma conexão que cai
    // no meio do corpo tem que cair no catch em vez de virar `{}`.
    // ⚠️ NÃO "alinhar" com o irmão.
    const json = (await res.json()) as {
      events?: SupportAuditEventFromDomus[];
      truncated?: boolean;
    };
    if (!Array.isArray(json.events)) {
      return { kind: "unavailable", reason: "resposta_invalida" };
    }
    // `truncated` ausente → false: os dois lados sobem juntos hoje. Se o Domus
    // parar de emitir a flag, uma lista cortada passaria por trilha COMPLETA —
    // o mesmo erro de leitura que o estado `unavailable` existe para evitar.
    return { kind: "ok", events: json.events, truncated: json.truncated === true };
  } catch (err) {
    // Timeout, DNS, TLS, corpo ilegível — tudo indisponibilidade do ponto de
    // vista de quem lê a tela, e por isso um `kind` só. NUNCA devolver lista
    // vazia aqui.
    //
    // Mas a CAUSA vai junto (como nos irmãos): esta tela é consultada DURANTE
    // incidente, e "falha_de_rede" sem detalhe não distingue timeout de TLS de
    // corpo quebrado quando alguém for ler o log depois. O `reason` é campo de
    // DIAGNÓSTICO — a rota que consome colapsa tudo em "unavailable" e nunca o
    // renderiza, então enriquecê-lo não afeta a tela.
    return {
      kind: "unavailable",
      reason: err instanceof Error ? `falha_de_rede: ${err.message}` : "falha_de_rede",
    };
  }
}
