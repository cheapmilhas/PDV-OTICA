/**
 * Helpers de isolamento da instância de WhatsApp por ótica (Fase B1).
 *
 * O nome da instância na Evolution é SEMPRE derivado do `companyId` da sessão —
 * nunca de algo vindo do client. Assim uma ótica nunca alcança a instância de
 * outra, e o webhook resolve a empresa pelo `instanceName` único.
 */

/** Prefixo do nome da instância (marca Vis). */
const INSTANCE_PREFIX = "vis_";

/** Deriva o nome da instância a partir do companyId. */
export function instanceNameForCompany(companyId: string): string {
  return `${INSTANCE_PREFIX}${companyId}`;
}

/**
 * URL pública do webhook que a Evolution deve chamar. Construída a partir da
 * mesma env de URL pública que os crons já usam (NEXTAUTH_URL), sem hardcode de
 * domínio. O dono confirma/ajusta o valor no deploy.
 */
export function whatsappWebhookUrl(): string {
  const base = (
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    ""
  ).replace(/\/+$/, "");
  return `${base}/api/webhooks/evolution`;
}
