import type { SubscriptionStatus } from "@prisma/client";

/**
 * Projetor de entitlement: transforma a decisão canônica do Vis
 * (checkSubscription) no DTO que o Domus consome via webhook/pull.
 *
 * É PURO e sem I/O. NÃO reimplementa regras de assinatura — apenas reempacota o
 * que checkSubscription já decidiu. Regra única no Vis; o Domus só executa.
 */

export interface EntitlementInput {
  /** Decisão canônica — vem de SubscriptionCheckResult.allowed. */
  allowed: boolean;
  /** Status vindo de checkSubscription (inclui NO_SUBSCRIPTION). */
  status: SubscriptionStatus | "NO_SUBSCRIPTION";
  /** Nome do plano — ausente nos ramos kill-switch/bypass/sem-empresa. */
  planName?: string;
}

export interface EntitlementDTO {
  /** ÚNICO campo que o guard do Domus lê. Segue SEMPRE `allowed`. */
  writeAllowed: boolean;
  /** Motivo legível para log/exibição (ex.: "TRIAL_EXPIRED", "SUSPENDED"). */
  reason: string;
  /** Status para exibição no Domus (badge/tela). Não decide nada. */
  subscriptionStatus: string;
  /** Nome do plano ou null quando indisponível. */
  planName: string | null;
}

/** Projeta a decisão canônica do Vis no DTO do Domus. Pura. */
export function projectEntitlement(input: EntitlementInput): EntitlementDTO {
  return {
    writeAllowed: input.allowed,
    reason: input.status,
    subscriptionStatus: input.status,
    planName: input.planName ?? null,
  };
}
