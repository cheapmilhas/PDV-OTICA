import { createHmac } from "crypto";

/**
 * Assinatura HMAC do canal de PROVISIONAMENTO Vis → Domus (F2). Gêmeo de
 * `signVisProvision` no Domus — a canonical string DEVE ser idêntica nos dois
 * lados, senão as assinaturas não casam. Cobre versão/método/path/nonce/ts/body
 * (mais que o `${ts}.${body}` do canal de entitlement), para prevenir replay
 * cross-endpoint. Secret dedicado: VIS_DOMUS_PROVISION_SECRET.
 */
interface SignInput {
  version: number;
  method: string;
  path: string;
  nonce: string;
  ts: number;
  body: string;
}

function canonical(i: SignInput): string {
  return `${i.version}.${i.method}.${i.path}.${i.nonce}.${i.ts}.${i.body}`;
}

export function signVisProvision(secret: string, i: SignInput): string {
  return createHmac("sha256", secret).update(canonical(i)).digest("hex");
}
