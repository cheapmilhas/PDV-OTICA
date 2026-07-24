import { randomUUID } from "crypto";
import { signVisProvision } from "@/lib/vis-provision-hmac";

/**
 * Cliente do canal de provisionamento Vis → Domus (F2). Assina e POSTa o
 * ProvisionInput ao endpoint `/api/internal/vis/provision` do Domus.
 *
 * Usado pelo fast-path síncrono (na criação do cliente) E pelo worker do outbox
 * (retry). Retorna um resultado tipado que o chamador usa para decidir o estado:
 *  - `applied`     → PROVISIONED
 *  - `terminal`    → PROVISION_FAILED (não retentar: identity_conflict, órfã)
 *  - `transient`   → continua PROVISIONING (worker retenta)
 */

const PATH = "/api/internal/vis/provision";
const TIMEOUT_MS = 5000; // fast-path: cold start do Domus serverless cabe em 5s

/** Payload que o Vis envia ao Domus. Casa com o ProvisionInput do lado Domus. */
export interface ProvisionRequest {
  eventId: string;
  requestId: string;
  requestedByAdminId: string;
  clinicId: string;
  visCompanyId: string;
  clinicName: string;
  admin: { email: string; name: string; role: "admin" };
  entitlement: { writeAllowed: boolean; planTier: string; sourceRevision: string };
}

export type ProvisionClientResult =
  | { kind: "applied"; appliedRevision?: string; inviteToken?: string; inviteExpiresAt?: string }
  | { kind: "terminal"; error: string }
  | { kind: "transient"; reason: string };

export async function postProvision(req: ProvisionRequest): Promise<ProvisionClientResult> {
  const secret = process.env.VIS_DOMUS_PROVISION_SECRET;
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
    // Timeout/rede → transitório (o worker retenta).
    return { kind: "transient", reason: err instanceof Error ? err.message : String(err) };
  }

  if (res.ok) {
    const data = (await res.json().catch(() => ({}))) as {
      appliedRevision?: string;
      inviteToken?: string;
      inviteExpiresAt?: string;
    };
    return {
      kind: "applied",
      appliedRevision: data.appliedRevision,
      inviteToken: data.inviteToken,
      inviteExpiresAt: data.inviteExpiresAt,
    };
  }
  // 409 = conflito terminal (não retentar); 422/5xx = transitório.
  if (res.status === 409) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return { kind: "terminal", error: data.error ?? "conflict" };
  }
  return { kind: "transient", reason: `http ${res.status}` };
}
