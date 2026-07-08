/**
 * Camada de TRADUÇÃO da Saúde do Sistema (Fase "O Pulso didático").
 *
 * O painel usa nomes de código (jobKeys de cron, chaves de sinal) que não dizem
 * nada pra quem não é dev. Aqui ficam os rótulos amigáveis, a descrição do que
 * cada coisa faz e a ÁREA DE NEGÓCIO a que pertence — pra tela agregar em cartões
 * que o dono entende (Cobranças, E-mails, WhatsApp, Site).
 *
 * Sem lógica de estado aqui: é só vocabulário. A classificação vive no
 * cron-heartbeat.service; o snapshot no system-health.service.
 */

/** Área de negócio — usada pra agrupar sinais no painel de topo. */
export type BusinessArea = "cobrancas" | "emails" | "whatsapp" | "sistema";

export interface CronMeta {
  /** Nome amigável (sem jargão). */
  label: string;
  /** O que essa tarefa faz, em 1 frase de dono de ótica. */
  does: string;
  /** Área de negócio a que pertence. */
  area: BusinessArea;
  /**
   * true = acionado por gatilho EXTERNO (cron-job.org), não pelo Vercel. Se ele
   * para, o negócio não necessariamente parou — a tela mostra "Atenção", nunca
   * "Crítico" vermelho, e orienta a reativar o gatilho.
   */
  external?: boolean;
}

/** Metadados de cada cron conhecido. jobKey → tradução. */
export const CRON_META: Record<string, CronMeta> = {
  dunning: {
    label: "Cobrança de inadimplentes",
    does: "Avisa e suspende quem está com a mensalidade atrasada.",
    area: "cobrancas",
  },
  "invoice-reminders": {
    label: "Lembretes de fatura",
    does: "Envia o e-mail de fatura criada aos assinantes.",
    area: "cobrancas",
  },
  "reconcile-billing": {
    label: "Conferência de cobranças",
    does: "Bate os valores das assinaturas com o Asaas.",
    area: "cobrancas",
  },
  "subscription-watch": {
    label: "Vigia fim de teste grátis",
    does: "Avisa quando o período de teste de uma ótica está acabando.",
    area: "cobrancas",
  },
  "retry-finance-entries": {
    label: "Reprocessa lançamentos financeiros",
    does: "Tenta de novo os lançamentos de caixa que falharam.",
    area: "cobrancas",
  },
  "email-queue": {
    label: "Envio de e-mails",
    does: "Processa a fila e dispara os e-mails transacionais.",
    area: "emails",
  },
  "whatsapp-messages": {
    label: "Automações de WhatsApp",
    does: "Prepara as mensagens automáticas (OS pronta, pós-venda, aniversário…).",
    area: "whatsapp",
  },
  "whatsapp-dispatch": {
    label: "Envio das mensagens de WhatsApp",
    does: "Manda as mensagens da fila aos poucos (anti-bloqueio).",
    area: "whatsapp",
    external: true,
  },
  "whatsapp-qualify": {
    label: "IA lê as conversas do WhatsApp",
    does: "A IA classifica os leads a partir das conversas.",
    area: "whatsapp",
    external: true,
  },
  "whatsapp-retention": {
    label: "Limpeza do inbox de WhatsApp",
    does: "Apaga mensagens antigas pra não lotar o banco.",
    area: "whatsapp",
  },
  "mark-delayed": {
    label: "Marca OS atrasadas",
    does: "Sinaliza as ordens de serviço que passaram do prazo.",
    area: "sistema",
  },
  "recalc-health": {
    label: "Recalcula saúde das óticas",
    does: "Atualiza o score de saúde de cada cliente do SaaS.",
    area: "sistema",
  },
  "sync-all-companies": {
    label: "Sincroniza configurações",
    does: "Propaga configurações padrão entre as óticas.",
    area: "sistema",
  },
  "health-alert": {
    label: "Este monitor (alerta por e-mail)",
    does: "É o próprio vigia da saúde — te avisa por e-mail quando algo cai.",
    area: "sistema",
  },
};

/** jobKey → meta (com fallback genérico pra crons ainda não catalogados). */
export function cronMeta(jobKey: string): CronMeta {
  return (
    CRON_META[jobKey] ?? {
      label: jobKey,
      does: "Tarefa agendada do sistema.",
      area: "sistema",
    }
  );
}

/** Rótulo humano de cada área de negócio. */
export const AREA_LABELS: Record<BusinessArea, string> = {
  cobrancas: "Cobranças e faturas",
  emails: "E-mails",
  whatsapp: "WhatsApp",
  sistema: "Sistema",
};
