import type { SaasEmailType } from "@prisma/client";

export interface SaasEmailCatalogEntry {
  /** string do switch em renderEmailTemplate */
  template: string;
  /** assunto do email */
  subject: string;
  /** chave da flag liga/desliga no SaasEmailConfig */
  configFlag:
    | "welcomeEnabled"
    | "trialEndingEnabled"
    | "trialExpiredEnabled"
    | "invoiceOverdueEnabled"
    | "paymentConfirmedEnabled"
    | "subscriptionSuspendedEnabled"
    | "subscriptionCanceledEnabled";
}

// Partial: os tipos gerados pelo fluxo de cobrança Asaas (INVOICE_CREATED,
// INVOICE_DUE_SOON) NÃO têm template/flag neste catálogo de emails do SaaS —
// eles são enviados pelo fluxo de cobrança, com seus próprios templates.
export const SAAS_EMAIL_CATALOG: Partial<Record<SaasEmailType, SaasEmailCatalogEntry>> = {
  WELCOME: {
    template: "saas-welcome",
    subject: "Bem-vindo(a) ao Vis 🎉",
    configFlag: "welcomeEnabled",
  },
  TRIAL_ENDING: {
    template: "saas-trial-ending",
    subject: "Seu período de teste do Vis está acabando",
    configFlag: "trialEndingEnabled",
  },
  TRIAL_EXPIRED: {
    template: "saas-trial-expired",
    subject: "Seu período de teste do Vis terminou",
    configFlag: "trialExpiredEnabled",
  },
  INVOICE_OVERDUE: {
    template: "saas-invoice-overdue",
    subject: "Pagamento da sua assinatura Vis em atraso",
    configFlag: "invoiceOverdueEnabled",
  },
  PAYMENT_CONFIRMED: {
    template: "saas-payment-confirmed",
    subject: "Pagamento confirmado — obrigado!",
    configFlag: "paymentConfirmedEnabled",
  },
  SUBSCRIPTION_SUSPENDED: {
    template: "saas-subscription-suspended",
    subject: "Seu acesso ao Vis foi suspenso",
    configFlag: "subscriptionSuspendedEnabled",
  },
  SUBSCRIPTION_CANCELED: {
    template: "saas-subscription-canceled",
    subject: "Sua assinatura do Vis foi cancelada",
    configFlag: "subscriptionCanceledEnabled",
  },
};

/** Config (parcial) que carrega as flags por tipo — `SaasEmailConfig` satisfaz isto. */
export type SaasEmailFlags = Partial<Record<SaasEmailCatalogEntry["configFlag"], boolean>>;

/** True se o tipo está ligado na config (e o mestre está ligado — checado fora). */
export function isSaasEmailEnabled(eventType: SaasEmailType, config: SaasEmailFlags): boolean {
  const entry = SAAS_EMAIL_CATALOG[eventType];
  // Tipo sem entrada no catálogo (ex.: eventos de cobrança) não é controlado
  // por estas flags — considera habilitado (não bloqueia o fluxo de cobrança).
  if (!entry) return true;
  return config[entry.configFlag] !== false;
}
