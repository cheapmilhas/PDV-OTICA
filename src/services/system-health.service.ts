import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getCronHealth, type CronHealthRow, type CronHealthState } from "@/services/cron-heartbeat.service";
import { getIntegrationsStatus, type IntegrationStatus } from "@/services/integrations-status.service";
import { listEvents, type SystemEventView } from "@/services/system-event.service";
import { AREA_LABELS, type BusinessArea } from "@/services/system-health-labels";

const log = logger.child({ service: "system-health" });

/**
 * Saúde do Sistema — "O Pulso". Snapshot ON-DEMAND (nunca polling): a tela chama
 * router.refresh() e este serviço remonta tudo do zero. Um ping em banco a cada
 * poll quebraria o scale-to-zero do Neon — por isso só rodamos SELECT 1 quando a
 * página é aberta/atualizada, não num intervalo.
 *
 * Quatro estados (design inegociável): saudável / atenção / crítico / "não sei"
 * (unknown = cinza, "não monitoro isso"). Nunca inventamos dado: um sinal sem
 * fonte confiável fica unknown, não verde falso nem vermelho falso.
 */

export type HealthState = "healthy" | "warning" | "critical" | "unknown";

export interface HealthSignal {
  key: string;
  label: string;
  state: HealthState;
  /** Frase curta pro humano ("banco respondeu", "sem token, não monitoro"). */
  detail: string;
  /** O que fazer quando este sinal não está verde (null = nada a fazer). */
  action?: string | null;
}

/** Um cartão do "resumo pro dono": uma área de negócio agregada. */
export interface BusinessAreaHealth {
  area: BusinessArea;
  label: string;
  state: HealthState;
  /** Frase de 1 linha explicando o estado em termos de negócio. */
  summary: string;
}

export interface SystemHealthSnapshot {
  /** Estado geral = PIOR sinal (unknown não piora além de warning). */
  overall: HealthState;
  capturedAt: string;
  /** Resumo pro dono: os sinais técnicos agrupados por área de negócio. */
  businessAreas: BusinessAreaHealth[];
  signals: {
    database: HealthSignal;
    vercel: HealthSignal;
    sentry: HealthSignal;
    crons: HealthSignal;
    integrations: HealthSignal;
  };
  cronRows: CronHealthRow[];
  integrationRows: IntegrationStatus[];
  events: { open: SystemEventView[]; resolved: SystemEventView[]; openCount: number };
  /** Linha fixa de honestidade: o que este painel NÃO garante monitorar. */
  notMonitored: string[];
}

/** Severidade pra ordenar/combinar estados. unknown NÃO é pior que warning. */
const SEVERITY: Record<HealthState, number> = {
  healthy: 0,
  unknown: 1,
  warning: 2,
  critical: 3,
};

/** Combina estados pegando o PIOR (maior severidade). */
export function worstState(states: HealthState[]): HealthState {
  return states.reduce<HealthState>(
    (worst, s) => (SEVERITY[s] > SEVERITY[worst] ? s : worst),
    "healthy"
  );
}

/** Ping barato de banco — só on-demand. healthy se responde, critical se cai. */
async function pingDatabase(): Promise<HealthSignal> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { key: "database", label: "Banco de dados", state: "healthy", detail: "Está respondendo normalmente." };
  } catch (err) {
    log.error("db-ping falhou", { err });
    return {
      key: "database",
      label: "Banco de dados",
      state: "critical",
      detail: "O banco não respondeu — o sistema pode estar fora do ar.",
      action: "Verifique o status do banco (Neon) e se o site está no ar. Se persistir, é urgente.",
    };
  }
}

/**
 * Status do Vercel. A API pública NÃO dá uso por rota — só o softBlock binário
 * (conta bloqueada por estourar limite/pagamento). Sem VERCEL_TOKEN configurado,
 * fica cinza "não monitoro" (design: nunca dado falso). Com token, consulta o
 * softBlock do time/projeto.
 */
async function checkVercel(): Promise<HealthSignal> {
  const token = process.env.VERCEL_TOKEN;
  if (!token) {
    return {
      key: "vercel",
      label: "Hospedagem (site)",
      state: "unknown",
      detail: "Não estou monitorando a conta de hospedagem (falta configurar o acesso).",
      action: "Opcional: defina a variável VERCEL_TOKEN na Vercel para acompanhar o status da conta.",
    };
  }

  const teamId = process.env.VERCEL_TEAM_ID;
  const qs = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
  try {
    const res = await fetch(`https://api.vercel.com/v2/user${qs}`, {
      headers: { Authorization: `Bearer ${token}` },
      // On-demand; não queremos cache preso mostrando estado velho.
      cache: "no-store",
    });
    if (!res.ok) {
      return {
        key: "vercel",
        label: "Hospedagem (site)",
        state: "unknown",
        detail: "Não consegui ler o status da conta de hospedagem agora.",
        action: "Confira se o VERCEL_TOKEN ainda é válido (pode ter expirado).",
      };
    }
    const body = (await res.json()) as { user?: { softBlock?: unknown } };
    const softBlock = body?.user?.softBlock;
    if (softBlock) {
      return {
        key: "vercel",
        label: "Hospedagem (site)",
        state: "critical",
        detail: "A conta de hospedagem está bloqueada — o site pode estar fora do ar.",
        action: "Abra o painel da Vercel → Spend Management e libere o limite (ou aguarde o próximo ciclo).",
      };
    }
    return {
      key: "vercel",
      label: "Hospedagem (site)",
      state: "healthy",
      detail: "Conta ativa, sem bloqueio.",
    };
  } catch (err) {
    log.warn("checkVercel falhou", { err });
    return {
      key: "vercel",
      label: "Hospedagem (site)",
      state: "unknown",
      detail: "Não consegui falar com a hospedagem agora.",
    };
  }
}

/**
 * Sinal do Sentry. Presença apenas: se SENTRY_DSN existe, monitoramento de erros
 * está LIGADO (healthy = "estou coletando"); sem DSN, cinza "não monitoro". Não
 * consultamos a API do Sentry aqui — só reportamos se a captura está configurada.
 */
function checkSentry(): HealthSignal {
  const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) {
    return {
      key: "sentry",
      label: "Captura de erros",
      state: "unknown",
      detail: "Não estou capturando os erros do sistema (falta configurar o Sentry).",
      action: "Opcional: crie um projeto no Sentry e defina SENTRY_DSN para registrar os erros.",
    };
  }
  return {
    key: "sentry",
    label: "Captura de erros",
    state: "healthy",
    detail: "Ligada — os erros do sistema estão sendo registrados.",
  };
}

/**
 * Resume o array de crons num sinal único. Distingue "atrasado de verdade" de
 * "ainda não rodou" (unknown): um monitor recém-ligado tem vários crons sem
 * batimento, o que NÃO é problema — a mensagem deixa isso claro pro dono.
 */
function summarizeCrons(rows: CronHealthRow[]): HealthSignal {
  const state = worstState(rows.map((r) => r.state as HealthState));
  const critical = rows.filter((r) => r.state === "critical");
  const warning = rows.filter((r) => r.state === "warning");
  const unknown = rows.filter((r) => r.state === "unknown").length;

  let detail: string;
  let action: string | null = null;
  if (critical.length > 0) {
    detail = `${critical.length} tarefa(s) parada(s) muito além do esperado — ex.: ${critical[0].label}.`;
    action = "Veja a lista abaixo qual está parada e há quanto tempo.";
  } else if (warning.length > 0) {
    const ext = warning.find((r) => r.external);
    if (ext) {
      detail = `${warning.length} tarefa(s) atrasada(s) — ex.: ${ext.label}, que depende de um gatilho externo.`;
      action = "Reative o gatilho no cron-job.org (aponta para /api/cron/… com o CRON_SECRET). Se o WhatsApp está funcionando normal, não é urgente.";
    } else {
      detail = `${warning.length} tarefa(s) atrasada(s) — ex.: ${warning[0].label}.`;
      action = "Acompanhe: se não normalizar em algumas horas, investigue a tarefa na lista abaixo.";
    }
  } else if (unknown > 0) {
    detail = `${unknown} tarefa(s) ainda sem registro — normal se o monitor foi ligado há pouco (rodam ao longo do dia).`;
  } else {
    detail = "Todas as tarefas rodaram dentro do esperado.";
  }
  return { key: "crons", label: "Tarefas automáticas", state, detail, action };
}

/** Resume as integrações num sinal. Faltar integração NÃO é erro — é unknown. */
function summarizeIntegrations(rows: IntegrationStatus[]): HealthSignal {
  const missing = rows.filter((r) => !r.configured);
  const state: HealthState = missing.length === 0 ? "healthy" : "unknown";
  const detail =
    missing.length === 0
      ? "Todos os serviços externos estão configurados."
      : `${missing.length} serviço(s) ainda sem configuração: ${missing.map((r) => r.label).join(", ")}.`;
  const action =
    missing.length === 0
      ? null
      : "Não é erro — cada serviço só precisa ser ligado quando você for usá-lo (ex.: nota fiscal).";
  return { key: "integrations", label: "Serviços externos", state, detail, action };
}

/** Silêncio máximo tolerado da IA de qualificação antes de acender o alarme. */
const AI_QUALIFY_STALE_MS = 24 * 60 * 60 * 1000;

/**
 * "A IA parou de qualificar?" — mede RESULTADO (última qualificação com sucesso),
 * não execução do cron. O cron pode responder 200 e a IA estar morta (incidente
 * 02/07: chave Anthropic ausente, falha por-conversa silenciosa).
 *
 * Regra (limiar chapado, por DELTA de tempo — nunca horário de parede):
 *  - nenhuma ótica com iaEnabled=true → unknown (desligada por opção).
 *  - IA ligada + sem qualificação há > 24h (ou nunca) → critical.
 *  - IA ligada + última <= 24h → healthy.
 * Fail-safe: erro de leitura → unknown.
 */
export async function summarizeAiQualification(now: Date = new Date()): Promise<HealthSignal> {
  const LABEL = "Inteligência do funil";
  try {
    const anyEnabled = await prisma.companySettings.findFirst({
      where: { iaEnabled: true },
      select: { companyId: true },
    });
    if (!anyEnabled) {
      return {
        key: "ai",
        label: LABEL,
        state: "unknown",
        detail: "A IA de qualificação está desligada em todas as óticas — isto é uma escolha, não um problema.",
        action: null,
      };
    }

    const last = await prisma.aiTokenUsage.findFirst({
      where: { feature: "lead_qualification" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });

    const ageMs = last ? now.getTime() - last.createdAt.getTime() : Infinity;
    if (ageMs > AI_QUALIFY_STALE_MS) {
      const desde = last
        ? last.createdAt.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
        : null;
      return {
        key: "ai",
        label: LABEL,
        state: "critical",
        detail: desde
          ? `A IA parou de transformar conversas em oportunidades — sem qualificações desde ${desde}.`
          : "A IA está ligada, mas nunca transformou uma conversa em oportunidade.",
        action: "Verifique a configuração de IA no super admin (a chave da Anthropic pode ter caído) ou avise o suporte técnico.",
      };
    }

    const horas = Math.max(1, Math.round(ageMs / (60 * 60 * 1000)));
    return {
      key: "ai",
      label: LABEL,
      state: "healthy",
      detail: `A IA está transformando conversas em oportunidades — última há ${horas}h.`,
      action: null,
    };
  } catch (err) {
    log.warn("summarizeAiQualification falhou (fail-safe → unknown)", { err });
    return {
      key: "ai",
      label: LABEL,
      state: "unknown",
      detail: "Não consegui verificar a IA de qualificação agora.",
      action: null,
    };
  }
}

const NOT_MONITORED: string[] = [
  "Quanto o site está custando por página (a hospedagem não fornece esse dado — só se a conta está bloqueada).",
  "A velocidade real que o cliente sente ao usar o sistema.",
  "Se cada mensagem de WhatsApp chegou de fato no celular do cliente.",
  "Erros que acontecem no navegador do cliente (só se a captura de erros estiver ligada).",
];

/**
 * Cartões do "resumo pro dono": agrupa os sinais técnicos por ÁREA DE NEGÓCIO.
 * Cada cartão = pior estado entre os sinais/tarefas daquela área + 1 frase.
 * "unknown" (nunca rodou / não monitorado) NÃO derruba a área pra vermelho.
 */
function buildBusinessAreas(
  signals: HealthSignal[],
  cronRows: CronHealthRow[]
): BusinessAreaHealth[] {
  // Mapeia sinais técnicos → área de negócio.
  const signalArea: Record<string, BusinessArea> = {
    database: "sistema",
    vercel: "sistema",
    sentry: "sistema",
    integrations: "sistema",
    // "crons" é distribuído por cron individual (cada um tem sua área), não aqui.
  };

  const areas: BusinessArea[] = ["cobrancas", "emails", "whatsapp", "sistema"];
  return areas.map((area) => {
    const areaSignals = signals.filter((s) => signalArea[s.key] === area);
    const areaCrons = cronRows.filter((c) => c.area === area);
    const states: HealthState[] = [
      ...areaSignals.map((s) => s.state),
      ...areaCrons.map((c) => c.state as HealthState),
    ];
    const state = states.length > 0 ? worstState(states) : "unknown";
    const summary = businessSummary(area, state, areaCrons);
    return { area, label: AREA_LABELS[area], state, summary };
  });
}

/** Frase de negócio por área conforme o pior estado. */
function businessSummary(area: BusinessArea, state: HealthState, crons: CronHealthRow[]): string {
  const bad = crons.find((c) => c.state === "critical" || c.state === "warning");
  if (state === "healthy") {
    const ok: Record<BusinessArea, string> = {
      cobrancas: "Cobranças, faturas e avisos de inadimplência rodando normalmente.",
      emails: "Os e-mails do sistema estão saindo normalmente.",
      whatsapp: "Automações e envio de WhatsApp funcionando.",
      sistema: "Banco, hospedagem e serviços de apoio no ar.",
    };
    return ok[area];
  }
  if (state === "critical" || state === "warning") {
    return bad
      ? `Atenção em "${bad.label}" — veja os detalhes abaixo.`
      : "Um sinal desta área precisa de atenção — veja abaixo.";
  }
  // unknown
  const wait: Record<BusinessArea, string> = {
    cobrancas: "Aguardando a 1ª execução das tarefas de cobrança (rodam ao longo do dia).",
    emails: "Aguardando a 1ª execução do envio de e-mails.",
    whatsapp: "Aguardando a 1ª execução das tarefas de WhatsApp.",
    sistema: "Alguns itens de apoio ainda sem dados — normal se o monitor foi ligado há pouco.",
  };
  return wait[area];
}

/**
 * Monta o snapshot inteiro. Cada sinal é isolado: a falha de um (ex.: API do
 * Vercel fora) não derruba os outros — cai no seu próprio estado unknown.
 */
export async function getSystemHealthSnapshot(now: Date = new Date()): Promise<SystemHealthSnapshot> {
  const [database, vercel, cronRows, integrationRows, events] = await Promise.all([
    pingDatabase(),
    checkVercel(),
    getCronHealth(now).catch((err) => {
      log.warn("getCronHealth falhou no snapshot", { err });
      return [] as CronHealthRow[];
    }),
    getIntegrationsStatus().catch((err) => {
      log.warn("getIntegrationsStatus falhou no snapshot", { err });
      return [] as IntegrationStatus[];
    }),
    listEvents({ resolvedLimit: 10 }).catch((err) => {
      log.warn("listEvents falhou no snapshot", { err });
      return { open: [] as SystemEventView[], resolved: [] as SystemEventView[], openCount: 0 };
    }),
  ]);

  const sentry = checkSentry();
  const crons = summarizeCrons(cronRows);
  const integrations = summarizeIntegrations(integrationRows);

  const overall = worstState([
    database.state,
    vercel.state,
    sentry.state,
    crons.state,
    integrations.state,
  ]);

  const businessAreas = buildBusinessAreas(
    [database, vercel, sentry, integrations],
    cronRows
  );

  return {
    overall,
    capturedAt: now.toISOString(),
    businessAreas,
    signals: { database, vercel, sentry, crons, integrations },
    cronRows,
    integrationRows,
    events,
    notMonitored: NOT_MONITORED,
  };
}
