/**
 * Templates padrão das 4 automações de WhatsApp (Fase B2).
 *
 * Sintaxe `{chave}` (renderizada por replaceMessageVariables de default-messages).
 * A ótica pode sobrescrever cada um via CompanySettings.wa*Template; null → usa
 * o padrão daqui.
 *
 * LGPD: só nome, nº da OS, valor, vencimento — NUNCA grau/receita/dado clínico.
 */

import type { WhatsappMessageType } from "@prisma/client";

export const DEFAULT_AUTOMATION_TEMPLATES: Record<
  "OS_READY" | "POST_SALE" | "BIRTHDAY" | "INSTALLMENT_DUE",
  string
> = {
  OS_READY:
    `Olá {cliente}! 👓\n\n` +
    `Seu pedido *{os}* está pronto para retirada na {otica}.\n\n` +
    `Estamos te esperando!`,

  POST_SALE:
    `Olá {cliente}! 😊\n\n` +
    `Tudo certo com sua compra na {otica}? ` +
    `Qualquer ajuste ou dúvida, é só chamar. Obrigado pela preferência!`,

  BIRTHDAY:
    `Feliz aniversário, {cliente}! 🎂🎉\n\n` +
    `A {otica} te deseja um dia incrível!`,

  INSTALLMENT_DUE:
    `Olá {cliente}!\n\n` +
    `Lembrete: sua parcela *{parcela}* de *{valor}* vence em {vencimento}.\n\n` +
    `{otica}`,
};

/** Mapa de cada tipo → campo de flag e de template em CompanySettings. */
export const AUTOMATION_FIELDS: Record<
  "OS_READY" | "POST_SALE" | "BIRTHDAY" | "INSTALLMENT_DUE",
  {
    enabledField: keyof typeof FLAG_KEYS;
    templateField: keyof typeof TEMPLATE_KEYS;
    type: WhatsappMessageType;
    transactional: boolean;
  }
> = {
  OS_READY: { enabledField: "OS_READY", templateField: "OS_READY", type: "OS_READY", transactional: true },
  POST_SALE: { enabledField: "POST_SALE", templateField: "POST_SALE", type: "POST_SALE", transactional: false },
  BIRTHDAY: { enabledField: "BIRTHDAY", templateField: "BIRTHDAY", type: "BIRTHDAY", transactional: false },
  INSTALLMENT_DUE: { enabledField: "INSTALLMENT_DUE", templateField: "INSTALLMENT_DUE", type: "INSTALLMENT_DUE", transactional: true },
};

const FLAG_KEYS = {
  OS_READY: "waOsReadyEnabled",
  POST_SALE: "waPostSaleEnabled",
  BIRTHDAY: "waBirthdayEnabled",
  INSTALLMENT_DUE: "waInstallmentDueEnabled",
} as const;

const TEMPLATE_KEYS = {
  OS_READY: "waOsReadyTemplate",
  POST_SALE: "waPostSaleTemplate",
  BIRTHDAY: "waBirthdayTemplate",
  INSTALLMENT_DUE: "waInstallmentDueTemplate",
} as const;

export { FLAG_KEYS, TEMPLATE_KEYS };
