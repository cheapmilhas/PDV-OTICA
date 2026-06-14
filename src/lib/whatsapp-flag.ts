/**
 * Feature flag da integração de WhatsApp (Fase B1).
 *
 * A feature nasce DESLIGADA e ISOLADA: só fica ativa quando o kill-switch global
 * `WHATSAPP_INTEGRATION_ENABLED` é `true` E o `companyId` está na allowlist
 * `WHATSAPP_ENABLED_COMPANY_IDS` (CSV de companyIds). Espelha o padrão de
 * `SUBSCRIPTION_BYPASS_COMPANY_IDS` (ver src/lib/subscription.ts).
 *
 * Usado tanto na UI (esconder o item de menu / a tela) quanto nas rotas de API
 * (responder 403 quando desligado). Enquanto a empresa não está na allowlist,
 * nenhum fluxo atual é afetado.
 */

/** Lê e normaliza a allowlist de companyIds (CSV → array). */
export function getEnabledCompanyIds(): string[] {
  return (process.env.WHATSAPP_ENABLED_COMPANY_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** `true` se o kill-switch global estiver ligado. */
export function isWhatsappKillSwitchOn(): boolean {
  return process.env.WHATSAPP_INTEGRATION_ENABLED === "true";
}

/**
 * Decide se a integração de WhatsApp está habilitada para uma empresa.
 *
 * @param companyId companyId da sessão (NUNCA algo vindo do client).
 * @returns true somente se o kill-switch global estiver ligado E o companyId
 *          estiver na allowlist.
 */
export function isWhatsappEnabledForCompany(companyId: string): boolean {
  if (!isWhatsappKillSwitchOn()) return false;
  if (!companyId) return false;
  return getEnabledCompanyIds().includes(companyId);
}
