import { formatCurrency } from "@/lib/utils";

export interface PublicPlan {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  priceMonthly: number; // centavos
  priceYearly: number;  // centavos
  trialDays: number;
  status: string;       // "ACTIVE" | "COMING_SOON"
  isFeatured: boolean;
  highlightFeatures: string[] | null;
}

const NBSP = String.fromCharCode(160); // U+00A0, inserido pelo Intl entre "R$" e o número

/** Centavos → "R$ x,yy" (NBSP normalizado p/ espaço comum). null se sem preço (0/null). */
export function formatPlanPrice(cents: number | null | undefined): string | null {
  if (!cents || cents <= 0) return null;
  return formatCurrency(cents / 100).split(NBSP).join(" ");
}

export function isComingSoon(plan: { status?: string }): boolean {
  return plan.status === "COMING_SOON";
}
