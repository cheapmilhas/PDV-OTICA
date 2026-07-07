import { getSaasEmailSenderView } from "@/services/saas-email-config.service";

/**
 * Status de PRESENÇA das integrações do sistema (super admin).
 *
 * Só reporta se cada integração está CONFIGURADA (booleano) — NUNCA expõe o
 * valor do segredo. `source` diz de onde veio a config (banco cifrado ou env),
 * ajudando a operação a saber onde editar. Este serviço é reusado pela aba de
 * Saúde do Sistema (sinal "integrações").
 */

export type IntegrationSource = "banco" | "env" | "nenhum";

export interface IntegrationStatus {
  key: string;
  label: string;
  configured: boolean;
  source: IntegrationSource;
  /** Onde ajustar a config (rota do admin ou "variável de ambiente"). */
  hint: string;
}

function envPresent(...names: string[]): boolean {
  return names.every((n) => !!process.env[n]);
}

export async function getIntegrationsStatus(): Promise<IntegrationStatus[]> {
  // E-mail (Resend): pode estar no banco (cifrado, via UI) OU em env.
  const sender = await getSaasEmailSenderView().catch(() => ({
    hasResendKey: false,
    emailFrom: null,
    emailReplyTo: null,
  }));
  const resendInEnv = envPresent("RESEND_API_KEY");
  const resendConfigured = sender.hasResendKey || resendInEnv;
  const resendSource: IntegrationSource = sender.hasResendKey
    ? "banco"
    : resendInEnv
      ? "env"
      : "nenhum";

  const rows: IntegrationStatus[] = [
    {
      key: "resend",
      label: "E-mail (Resend)",
      configured: resendConfigured,
      source: resendSource,
      hint: "Configurações → Emails",
    },
    {
      key: "asaas",
      label: "Cobrança (Asaas)",
      configured: envPresent("ASAAS_API_KEY"),
      source: envPresent("ASAAS_API_KEY") ? "env" : "nenhum",
      hint: "variável de ambiente ASAAS_API_KEY",
    },
    {
      key: "evolution",
      label: "WhatsApp (Evolution)",
      configured: envPresent("EVOLUTION_API_KEY", "EVOLUTION_API_URL"),
      source: envPresent("EVOLUTION_API_KEY", "EVOLUTION_API_URL") ? "env" : "nenhum",
      hint: "variáveis EVOLUTION_API_KEY / EVOLUTION_API_URL",
    },
    {
      key: "sentry",
      label: "Monitoramento de erros (Sentry)",
      configured: envPresent("SENTRY_DSN"),
      source: envPresent("SENTRY_DSN") ? "env" : "nenhum",
      hint: "variável de ambiente SENTRY_DSN",
    },
    {
      key: "focus_nfe",
      label: "Nota fiscal (Focus NFe)",
      configured: envPresent("FOCUS_NFE_TOKEN"),
      source: envPresent("FOCUS_NFE_TOKEN") ? "env" : "nenhum",
      hint: "variável de ambiente FOCUS_NFE_TOKEN",
    },
  ];

  return rows;
}
