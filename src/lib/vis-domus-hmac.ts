import { createHmac, timingSafeEqual } from "crypto";

/**
 * HMAC do canal interno Vis → Domus (entitlements).
 *
 * Assina `${timestamp}.${rawBody}` — o timestamp entra na assinatura para que
 * um replay com corpo válido mas horário trocado não passe. A verificação é
 * timing-safe e rejeita fora da janela de 5 min (replay velho ou relógio
 * adulterado). Mesmo padrão do webhook Asaas, com anti-replay somado.
 */

const WINDOW_MS = 5 * 60 * 1000;

/** Assina timestamp+corpo. Retorna hex. */
export function signVisDomus(secret: string, timestamp: number, rawBody: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

export interface VerifyResult {
  ok: boolean;
  reason?: string;
}

/**
 * Verifica assinatura + janela temporal.
 * @param now epoch ms atual (injetável para teste).
 */
export function verifyVisDomus(
  secret: string,
  timestamp: number,
  rawBody: string,
  signature: string | null,
  now: number,
): VerifyResult {
  if (!signature) return { ok: false, reason: "signature_missing" };
  if (!Number.isFinite(timestamp)) return { ok: false, reason: "timestamp_invalid" };
  if (Math.abs(now - timestamp) > WINDOW_MS) return { ok: false, reason: "timestamp_stale" };

  const expected = signVisDomus(secret, timestamp, rawBody);
  const got = signature.replace(/^sha256=/, "").trim();

  if (expected.length !== got.length) return { ok: false, reason: "length_mismatch" };
  try {
    const match = timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(got, "hex"));
    return match ? { ok: true } : { ok: false, reason: "signature_mismatch" };
  } catch {
    return { ok: false, reason: "signature_decode_error" };
  }
}
