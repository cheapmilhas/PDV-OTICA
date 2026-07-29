import { SubscriptionStatus } from "@prisma/client";
import { LIVE_STATUSES } from "@/lib/subscription";

/**
 * Assinatura mínima que a resolução precisa enxergar. Qualquer shape do
 * Prisma com esses campos (mais os que o chamador quiser) serve — a função
 * é pura, não sabe de banco.
 */
export interface SubscriptionCandidate {
  id: string;
  status: SubscriptionStatus;
  createdAt: Date;
}

export type EffectiveSubscriptionResult<T extends SubscriptionCandidate> =
  | { kind: "ok"; subscription: T }
  | { kind: "none" }
  | { kind: "ambiguous"; ids: string[] };

/**
 * Resolve qual assinatura de uma company é "a efetiva" para fins de
 * cobrança/gating, a partir de uma lista já carregada.
 *
 * `Subscription.companyId` não tem unique constraint — hoje cinco fluxos
 * resolvem a ambiguidade de cinco jeitos diferentes (alguns escolhem "a mais
 * recente", outros recusam com 409). Esta função centraliza a política:
 *
 * - Considera "viva" apenas quem está em `LIVE_STATUSES` (TRIAL/ACTIVE/PAST_DUE).
 * - Uma viva → é a efetiva.
 * - Zero vivas → `none` (ausência, não erro).
 * - Duas ou mais vivas → `ambiguous`. FAIL-CLOSED: escolher "a mais recente"
 *   cobraria valor e plano errados. O chamador decide o que fazer (bloquear,
 *   alertar o operador, recusar a operação).
 */
export function resolveEffectiveSubscription<T extends SubscriptionCandidate>(
  subscriptions: T[],
): EffectiveSubscriptionResult<T> {
  const live = subscriptions.filter((s) => LIVE_STATUSES.includes(s.status));

  if (live.length === 0) return { kind: "none" };
  if (live.length > 1) return { kind: "ambiguous", ids: live.map((s) => s.id) };

  return { kind: "ok", subscription: live[0] };
}
