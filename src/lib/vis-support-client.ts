import { randomUUID } from "crypto";
import { signVisProvision } from "@/lib/vis-provision-hmac";

/**
 * Cliente do canal de RESGATE de código de suporte Vis → Domus (Entrega 3).
 * Assina e POSTa ao endpoint `/api/internal/vis/support/redeem` do Domus.
 *
 * Reusa a PRIMITIVA HMAC path-bound do F2 (signVisProvision assina
 * version.method.path.nonce.ts.body), mas com um SEGREDO PRÓPRIO
 * (VIS_DOMUS_SUPPORT_SECRET, separado do provisionamento) para que o vazamento de
 * um segredo não comprometa o outro canal.
 *
 * F3.1: só a fundação de canal. O payload do resgate (código, operador) e o
 * tratamento do grant/sessão entram na F3.2/F3.3.
 */

const PATH = "/api/internal/vis/support/redeem";
const TIMEOUT_MS = 5000;

export interface SupportRedeemRequest {
  /** Código de autorização que o admin da clínica gerou no Domus. */
  code: string;
  /** UUID v7 de correlação cross-DB — some no grant e na auditoria dos 2 lados. */
  supportGrantId: string;
  /** Referência OPACA do operador Vis (nunca o ID interno; nunca FK no Domus). */
  visOperatorRef: string;
}

export type SupportRedeemResult =
  | { kind: "ok"; magicUrl?: string }
  | { kind: "rejected"; status: number; error: string }
  | { kind: "transient"; reason: string };

export async function postSupportRedeem(
  req: SupportRedeemRequest,
): Promise<SupportRedeemResult> {
  const secret = process.env.VIS_DOMUS_SUPPORT_SECRET;
  const url = process.env.DOMUS_WEBHOOK_URL;
  if (!secret || !url) {
    return { kind: "transient", reason: "config ausente (secret/url)" };
  }

  const body = JSON.stringify(req);
  const ts = Date.now();
  const nonce = randomUUID();
  const signature = signVisProvision(secret, {
    version: 1,
    method: "POST",
    path: PATH,
    nonce,
    ts,
    body,
  });

  let res: Response;
  try {
    res = await fetch(`${url}${PATH}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-vis-timestamp": String(ts),
        "x-vis-nonce": nonce,
        "x-vis-signature": signature,
      },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    return { kind: "transient", reason: err instanceof Error ? err.message : String(err) };
  }

  if (res.ok) {
    const data = (await res.json().catch(() => ({}))) as { magicUrl?: string };
    return { kind: "ok", magicUrl: data.magicUrl };
  }
  // 401 (código inválido/replay), 403 (host), 409 (código já usado/expirado) →
  // rejeição definitiva; o operador vê o erro e não retenta cegamente.
  if ([400, 401, 403, 409, 422].includes(res.status)) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return { kind: "rejected", status: res.status, error: data.error ?? "rejected" };
  }
  return { kind: "transient", reason: `http ${res.status}` };
}
