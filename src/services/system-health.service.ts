import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getCronHealth, type CronHealthRow, type CronHealthState } from "@/services/cron-heartbeat.service";
import { getIntegrationsStatus, type IntegrationStatus } from "@/services/integrations-status.service";
import { listEvents, type SystemEventView } from "@/services/system-event.service";

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
}

export interface SystemHealthSnapshot {
  /** Estado geral = PIOR sinal (unknown não piora além de warning). */
  overall: HealthState;
  capturedAt: string;
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
    return { key: "database", label: "Banco de dados", state: "healthy", detail: "Respondeu ao ping." };
  } catch (err) {
    log.error("db-ping falhou", { err });
    return {
      key: "database",
      label: "Banco de dados",
      state: "critical",
      detail: "Não respondeu ao ping (SELECT 1 falhou).",
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
      label: "Hospedagem (Vercel)",
      state: "unknown",
      detail: "Sem VERCEL_TOKEN — não monitoro o status da conta.",
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
        label: "Hospedagem (Vercel)",
        state: "unknown",
        detail: `API do Vercel respondeu ${res.status} — não consegui ler o status.`,
      };
    }
    const body = (await res.json()) as { user?: { softBlock?: unknown } };
    const softBlock = body?.user?.softBlock;
    if (softBlock) {
      return {
        key: "vercel",
        label: "Hospedagem (Vercel)",
        state: "critical",
        detail: "Conta com softBlock ativo — o site pode estar fora do ar.",
      };
    }
    return {
      key: "vercel",
      label: "Hospedagem (Vercel)",
      state: "healthy",
      detail: "Conta ativa, sem bloqueio.",
    };
  } catch (err) {
    log.warn("checkVercel falhou", { err });
    return {
      key: "vercel",
      label: "Hospedagem (Vercel)",
      state: "unknown",
      detail: "Não consegui falar com a API do Vercel.",
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
      label: "Monitoramento de erros (Sentry)",
      state: "unknown",
      detail: "Sem SENTRY_DSN — não estou capturando erros.",
    };
  }
  return {
    key: "sentry",
    label: "Monitoramento de erros (Sentry)",
    state: "healthy",
    detail: "DSN configurado — capturando erros.",
  };
}

/** Resume o array de crons num sinal único (pior estado entre eles). */
function summarizeCrons(rows: CronHealthRow[]): HealthSignal {
  const state = worstState(rows.map((r) => r.state as HealthState));
  const critical = rows.filter((r) => r.state === "critical").length;
  const warning = rows.filter((r) => r.state === "warning").length;
  const unknown = rows.filter((r) => r.state === "unknown").length;
  let detail: string;
  if (critical > 0) detail = `${critical} cron(s) atrasado(s) muito além do esperado.`;
  else if (warning > 0) detail = `${warning} cron(s) atrasado(s).`;
  else if (unknown > 0) detail = `${unknown} cron(s) ainda sem batimento registrado.`;
  else detail = "Todos os crons rodaram dentro do esperado.";
  return { key: "crons", label: "Tarefas agendadas (crons)", state, detail };
}

/** Resume as integrações num sinal. Faltar integração NÃO é erro — é unknown. */
function summarizeIntegrations(rows: IntegrationStatus[]): HealthSignal {
  const missing = rows.filter((r) => !r.configured);
  const state: HealthState = missing.length === 0 ? "healthy" : "unknown";
  const detail =
    missing.length === 0
      ? "Todas as integrações conhecidas estão configuradas."
      : `${missing.length} integração(ões) sem configuração: ${missing.map((r) => r.label).join(", ")}.`;
  return { key: "integrations", label: "Integrações externas", state, detail };
}

const NOT_MONITORED: string[] = [
  "Uso/custo por rota no Vercel (a API pública não expõe — só softBlock da conta).",
  "Latência real das requisições dos usuários.",
  "Fila do WhatsApp / entrega de mensagens ponta a ponta.",
  "Erros de front-end no navegador do usuário (a menos que o Sentry esteja ligado).",
];

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

  return {
    overall,
    capturedAt: now.toISOString(),
    signals: { database, vercel, sentry, crons, integrations },
    cronRows,
    integrationRows,
    events,
    notMonitored: NOT_MONITORED,
  };
}
