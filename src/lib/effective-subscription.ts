import { SubscriptionStatus } from "@prisma/client";
import { LIVE_STATUSES } from "@/lib/subscription";

/**
 * Assinatura mínima que a resolução precisa enxergar: identidade + status.
 * Não exige `createdAt` de propósito — a função nunca ordena por data (ver
 * nota de fail-closed abaixo); o genérico permite ao chamador passar linhas
 * do Prisma com campos extras (createdAt incluso) sem perda de tipo.
 */
export interface SubscriptionCandidate {
  id: string;
  status: SubscriptionStatus;
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
 * resolvem a ambiguidade de cinco jeitos diferentes (ver
 * docs/superpowers/specs/2026-07-29-recorrencia-cobranca-carencia-design.md
 * §4.1.1 para a lista com arquivo e linha). Esta função centraliza a política:
 *
 * - Considera "viva" apenas quem está em `LIVE_STATUSES` (TRIAL/ACTIVE/PAST_DUE).
 * - Uma viva → é a efetiva.
 * - Zero vivas → `none` (ausência, não erro).
 * - Duas ou mais vivas → `ambiguous`. FAIL-CLOSED: escolher "a mais recente"
 *   (por `createdAt`, como fazem alguns fluxos legados) cobraria valor e
 *   plano errados. O chamador decide o que fazer (bloquear, alertar o
 *   operador, recusar a operação) — por isso `createdAt` não faz parte do
 *   contrato: esta função existe para PROIBIR esse critério, não para usá-lo.
 */
export function resolveEffectiveSubscription<T extends SubscriptionCandidate>(
  subscriptions: T[],
): EffectiveSubscriptionResult<T> {
  const live = subscriptions.filter((s) => LIVE_STATUSES.includes(s.status));

  if (live.length === 0) return { kind: "none" };
  if (live.length > 1) {
    return { kind: "ambiguous", ids: live.map((s) => s.id).sort() };
  }

  return { kind: "ok", subscription: live[0] };
}
