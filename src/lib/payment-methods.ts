import {
  Banknote,
  Smartphone,
  CreditCard,
  Wallet,
  FileText,
  CheckSquare,
  type LucideIcon,
} from "lucide-react";

export interface PaymentMethodConfig {
  id: string;          // Prisma enum value (CASH, PIX, etc.)
  onboardingId: string; // Onboarding lowercase ID (dinheiro, pix, etc.)
  label: string;
  icon: LucideIcon;
  color: string;
}

/**
 * All payment methods supported by the system.
 * Maps between Prisma enum IDs and onboarding lowercase IDs.
 */
export const ALL_PAYMENT_METHODS: PaymentMethodConfig[] = [
  { id: "CASH", onboardingId: "dinheiro", label: "Dinheiro", icon: Banknote, color: "bg-green-500" },
  { id: "PIX", onboardingId: "pix", label: "PIX", icon: Smartphone, color: "bg-blue-500" },
  { id: "DEBIT_CARD", onboardingId: "debito", label: "Débito", icon: CreditCard, color: "bg-purple-500" },
  { id: "CREDIT_CARD", onboardingId: "credito", label: "Crédito", icon: CreditCard, color: "bg-orange-500" },
  { id: "BOLETO", onboardingId: "boleto", label: "Boleto", icon: FileText, color: "bg-yellow-600" },
  { id: "CHEQUE", onboardingId: "cheque", label: "Cheque", icon: CheckSquare, color: "bg-teal-500" },
  { id: "STORE_CREDIT", onboardingId: "crediario", label: "Crediário", icon: Wallet, color: "bg-gray-500" },
];

/**
 * Default payment methods when no company settings are configured.
 * Matches the onboarding default selection.
 */
export const DEFAULT_PAYMENT_METHOD_IDS = ["CASH", "PIX", "DEBIT_CARD", "CREDIT_CARD", "STORE_CREDIT"];

/**
 * Maps onboarding lowercase IDs to Prisma enum IDs.
 */
export const ONBOARDING_TO_PRISMA: Record<string, string> = {};
for (const m of ALL_PAYMENT_METHODS) {
  ONBOARDING_TO_PRISMA[m.onboardingId] = m.id;
}

/**
 * Maps Prisma enum IDs to labels.
 */
export const PAYMENT_METHOD_LABELS: Record<string, string> = {};
for (const m of ALL_PAYMENT_METHODS) {
  PAYMENT_METHOD_LABELS[m.id] = m.label;
}

/**
 * Given an array of onboarding IDs (lowercase), returns the corresponding
 * PaymentMethodConfig entries (using Prisma enum IDs).
 */
export function getEnabledPaymentMethods(onboardingIds: string[]): PaymentMethodConfig[] {
  if (!onboardingIds || onboardingIds.length === 0) {
    return ALL_PAYMENT_METHODS.filter((m) => DEFAULT_PAYMENT_METHOD_IDS.includes(m.id));
  }

  const enabled = onboardingIds
    .map((id) => ALL_PAYMENT_METHODS.find((m) => m.onboardingId === id))
    .filter(Boolean) as PaymentMethodConfig[];

  return enabled.length > 0 ? enabled : ALL_PAYMENT_METHODS.filter((m) => DEFAULT_PAYMENT_METHOD_IDS.includes(m.id));
}
