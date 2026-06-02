export interface PlanPricing {
  priceMonthly: number; // centavos
  priceYearly: number;  // centavos
}

/** Aceita o enum Prisma BillingCycle ("MONTHLY"|"YEARLY") por compatibilidade estrutural. */
export type CycleLike = "MONTHLY" | "YEARLY";

/**
 * Valor da assinatura no Asaas (em reais) para o ciclo dado. Banco usa centavos.
 * Lança se o preço do ciclo for não-positivo — evita zerar a cobrança recorrente
 * no Asaas por plano mal configurado (ex.: priceYearly=0).
 */
export function planValueForCycle(plan: PlanPricing, cycle: CycleLike): number {
  const cents = cycle === "YEARLY" ? plan.priceYearly : plan.priceMonthly;
  if (!Number.isFinite(cents) || cents <= 0) {
    throw new Error(`Preço inválido para o ciclo ${cycle}: ${cents} centavos`);
  }
  return cents / 100;
}
