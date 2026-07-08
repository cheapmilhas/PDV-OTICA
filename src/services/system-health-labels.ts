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
  /** Efeito no negócio se esta tarefa parar. 1 frase de dono. Opcional. */
  ifStops?: string;
  /** Frequência em linguagem de dono ("1× por dia, de manhã"). Opcional — sem isso, derivada de expectedEveryMs. */
  frequencyLabel?: string;
}

/** Metadados de cada cron conhecido. jobKey → tradução. */
export const CRON_META: Record<string, CronMeta> = {
  dunning: {
    label: "Cobrança de inadimplentes",
    does: "Avisa e suspende quem está com a mensalidade atrasada.",
    area: "cobrancas",
    ifStops: "Clientes inadimplentes deixam de receber cobrança — dinheiro parado na rua.",
    frequencyLabel: "1× por dia, de manhã",
  },
  "invoice-reminders": {
    label: "Lembretes de fatura",
    does: "Envia o e-mail de fatura criada aos assinantes.",
    area: "cobrancas",
    ifStops: "Assinantes deixam de receber o e-mail da fatura e podem esquecer de pagar.",
    frequencyLabel: "1× por dia",
  },
  "reconcile-billing": {
    label: "Conferência de cobranças",
    does: "Bate os valores das assinaturas com o Asaas.",
    area: "cobrancas",
    ifStops: "Divergências entre o que você cobra e o que o Asaas registra passam despercebidas.",
    frequencyLabel: "1× por dia",
  },
  "subscription-watch": {
    label: "Vigia fim de teste grátis",
    does: "Avisa quando o período de teste de uma ótica está acabando.",
    area: "cobrancas",
    ifStops: "Óticas em teste grátis podem virar inadimplentes sem aviso de fim de período.",
    frequencyLabel: "1× por dia",
  },
  "retry-finance-entries": {
    label: "Reprocessa lançamentos financeiros",
    does: "Tenta de novo os lançamentos de caixa que falharam.",
    area: "cobrancas",
    ifStops: "Lançamentos de caixa que falharam ficam sem ser refeitos — relatórios ficam furados.",
    frequencyLabel: "1× por dia",
  },
  "email-queue": {
    label: "Envio de e-mails",
    does: "Processa a fila e dispara os e-mails transacionais.",
    area: "emails",
    ifStops: "E-mails transacionais (cobrança, avisos) param de sair.",
    frequencyLabel: "1× por dia",
  },
  "whatsapp-messages": {
    label: "Automações de WhatsApp",
    does: "Prepara as mensagens automáticas (OS pronta, pós-venda, aniversário…).",
    area: "whatsapp",
    ifStops: "As mensagens de WhatsApp param de ser processadas.",
    frequencyLabel: "1× por dia",
  },
  "whatsapp-dispatch": {
    label: "Envio das mensagens de WhatsApp",
    does: "Manda as mensagens da fila aos poucos (anti-bloqueio).",
    area: "whatsapp",
    external: true,
    ifStops: "As mensagens de WhatsApp param de ser enviadas.",
    frequencyLabel: "a cada 5 minutos",
  },
  "whatsapp-qualify": {
    label: "IA lê as conversas do WhatsApp",
    does: "A IA classifica os leads a partir das conversas.",
    area: "whatsapp",
    external: true,
    ifStops: "Os leads do WhatsApp param de ser qualificados pela IA.",
    frequencyLabel: "a cada 5 minutos",
  },
  "whatsapp-retention": {
    label: "Limpeza do inbox de WhatsApp",
    does: "Apaga mensagens antigas pra não lotar o banco.",
    area: "whatsapp",
    ifStops: "As ações de retenção por WhatsApp param de rodar.",
    frequencyLabel: "1× por dia",
  },
  "mark-delayed": {
    label: "Marca OS atrasadas",
    does: "Sinaliza as ordens de serviço que passaram do prazo.",
    area: "sistema",
    ifStops: "Ordens de serviço atrasadas deixam de ser sinalizadas.",
    frequencyLabel: "1× por dia",
  },
  "recalc-health": {
    label: "Recalcula saúde das óticas",
    does: "Atualiza o score de saúde de cada cliente do SaaS.",
    area: "sistema",
    ifStops: "O score de saúde das óticas fica desatualizado — você perde o sinal de quem está em risco.",
    frequencyLabel: "1× por dia",
  },
  "sync-all-companies": {
    label: "Sincroniza configurações",
    does: "Propaga configurações padrão entre as óticas.",
    area: "sistema",
    ifStops: "As configurações padrão param de se propagar entre as óticas.",
    frequencyLabel: "1× por dia",
  },
  "health-alert": {
    label: "Este monitor (alerta por e-mail)",
    does: "É o próprio vigia da saúde — te avisa por e-mail quando algo cai.",
    area: "sistema",
    ifStops: "Você para de receber o e-mail de alerta quando algo cai — o vigia fica cego.",
    frequencyLabel: "a cada hora",
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

/**
 * Frequência em linguagem de dono. Usa o override do meta se houver; senão
 * deriva de expectedEveryMs (aproximação amigável, sem jargão).
 */
export function frequencyLabelFor(expectedEveryMs: number, override?: string): string {
  if (override) return override;
  const MIN = 60 * 1000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;
  if (expectedEveryMs >= DAY) return "aproximadamente 1× por dia";
  if (expectedEveryMs >= HOUR) return "a cada hora";
  const mins = Math.max(1, Math.round(expectedEveryMs / MIN));
  return `a cada ${mins} min`;
}
