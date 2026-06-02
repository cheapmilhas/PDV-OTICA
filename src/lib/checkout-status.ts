export type CheckoutBillingType = "BOLETO" | "CREDIT_CARD" | "PIX";
export type CheckoutCycle = "MONTHLY" | "YEARLY";

/** Dias de folga após o vencimento do boleto/pix antes de o trial expirar. */
export const BOLETO_PIX_GRACE_DAYS = 5;

export interface InitialStateInput {
  billingType: CheckoutBillingType;
  billingCycle: CheckoutCycle;
  now: Date;
  dueDate: Date;
}

export interface InitialState {
  status: "ACTIVE" | "TRIAL";
  activatedAt: Date | null;
  trialEndsAt: Date | null;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
}

/**
 * Estado inicial da Subscription no checkout.
 * CREDIT_CARD cobra no ato → ACTIVE. BOLETO/PIX → TRIAL até o vencimento + folga;
 * o webhook PAYMENT_CONFIRMED/RECEIVED promove para ACTIVE ao pagar.
 */
export function initialSubscriptionState(input: InitialStateInput): InitialState {
  const periodEnd = new Date(input.now);
  if (input.billingCycle === "YEARLY") periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  else periodEnd.setMonth(periodEnd.getMonth() + 1);

  if (input.billingType === "CREDIT_CARD") {
    return {
      status: "ACTIVE",
      activatedAt: input.now,
      trialEndsAt: null,
      currentPeriodStart: input.now,
      currentPeriodEnd: periodEnd,
    };
  }

  const trialEndsAt = new Date(input.dueDate);
  trialEndsAt.setDate(trialEndsAt.getDate() + BOLETO_PIX_GRACE_DAYS);
  return {
    status: "TRIAL",
    activatedAt: null,
    trialEndsAt,
    currentPeriodStart: input.now,
    currentPeriodEnd: periodEnd,
  };
}
