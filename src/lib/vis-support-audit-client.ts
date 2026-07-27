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
  const baseUrl = process.env.DOMUS_WEBHOOK_URL ?? "";
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

    const json = (await res.json()) as {
      events?: SupportAuditEventFromDomus[];
      truncated?: boolean;
    };
    if (!Array.isArray(json.events)) {
      return { kind: "unavailable", reason: "resposta_invalida" };
    }
    return { kind: "ok", events: json.events, truncated: json.truncated === true };
  } catch {
    // Timeout, DNS, TLS, JSON quebrado — tudo indisponibilidade do ponto de
    // vista de quem lê a tela. NUNCA devolver lista vazia aqui.
    return { kind: "unavailable", reason: "falha_de_rede" };
  }
}
