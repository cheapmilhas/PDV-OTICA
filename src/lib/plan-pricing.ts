export interface PlanPricing {
  priceMonthly: number; // centavos
  priceYearly: number;  // centavos
}

/** Aceita o enum Prisma BillingCycle ("MONTHLY"|"YEARLY") por compatibilidade estrutural. */
export type CycleLike = "MONTHLY" | "YEARLY";

/** Valor da assinatura no Asaas (em reais) para o ciclo dado. Banco usa centavos. */
export function planValueForCycle(plan: PlanPricing, cycle: CycleLike): number {
  const cents = cycle === "YEARLY" ? plan.priceYearly : plan.priceMonthly;
  return cents / 100;
}
