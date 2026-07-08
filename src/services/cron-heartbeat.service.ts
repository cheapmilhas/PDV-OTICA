import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { cronMeta, type BusinessArea } from "@/services/system-health-labels";
import { sanitizeCronError } from "@/lib/cron-error-sanitizer";

const log = logger.child({ service: "cron-heartbeat" });

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Cadência ESPERADA de cada cron (ms). Reflete a frequência REAL — para os dois
 * que rodam por acionador externo (cron-job.org) com alta frequência, usamos a
 * cadência externa, não a do Vercel (1×/dia). Um cron ausente deste mapa cai no
 * default diário.
 */
const EXPECTED_EVERY_MS: Record<string, number> = {
  // Vercel Cron, 1×/dia:
  dunning: DAY,
  "email-queue": DAY,
  "invoice-reminders": DAY,
  "mark-delayed": DAY,
  "recalc-health": DAY,
  "reconcile-billing": DAY,
  "retry-finance-entries": DAY,
  "subscription-watch": DAY,
  "sync-all-companies": DAY,
  "whatsapp-messages": DAY,
  "whatsapp-retention": DAY,
  // Saúde do Sistema: alerta de incidentes. Vercel roda 1×/h; se apontarem o
  // cron-job.org p/ */15, roda mais — a cadência aqui (1h) é o piso esperado.
  "health-alert": HOUR,
  // Acionador externo (cron-job.org), alta frequência:
  "whatsapp-qualify": 5 * MINUTE,
  "whatsapp-dispatch": 5 * MINUTE,
};

const DEFAULT_EXPECTED_MS = DAY;

export type CronHealthState = "healthy" | "warning" | "critical" | "unknown";

export interface CronHealthRow {
  jobKey: string;
  /** Nome amigável (ex.: "Cobrança de inadimplentes"). */
  label: string;
  /** O que a tarefa faz, em 1 frase. */
  does: string;
  /** Área de negócio (cobrancas/emails/whatsapp/sistema). */
  area: BusinessArea;
  /** true = acionado por gatilho externo (cron-job.org). */
  external: boolean;
  state: CronHealthState;
  expectedEveryMs: number;
  lastStartedAt: string | null;
  lastSucceededAt: string | null;
  lastStatus: string | null;
  lastErrorSafe: string | null; // sanitizado — NUNCA o err.message cru (PII/LGPD)
  lastDurationMs: number | null;
  /** ms desde o último SUCESSO (null se nunca teve sucesso). */
  sinceLastSuccessMs: number | null;
}

/** Marca o INÍCIO de uma execução. Best-effort — nunca lança. */
export async function beginCronRun(jobKey: string): Promise<void> {
  try {
    const now = new Date();
    await prisma.cronHeartbeat.upsert({
      where: { jobKey },
      create: { jobKey, lastStartedAt: now },
      update: { lastStartedAt: now },
    });
  } catch (err) {
    log.warn("beginCronRun falhou (engolido)", { jobKey, err });
  }
}

/** Marca o FIM de uma execução (sucesso ou erro). Best-effort — nunca lança. */
export async function finishCronRun(
  jobKey: string,
  ok: boolean,
  opts?: { durationMs?: number; error?: string }
): Promise<void> {
  try {
    const now = new Date();
    await prisma.cronHeartbeat.upsert({
      where: { jobKey },
      create: {
        jobKey,
        lastSucceededAt: ok ? now : undefined,
        lastStatus: ok ? "ok" : "error",
        lastError: ok ? null : opts?.error ?? null,
        lastDurationMs: opts?.durationMs ?? null,
      },
      update: {
        lastSucceededAt: ok ? now : undefined,
        lastStatus: ok ? "ok" : "error",
        lastError: ok ? null : opts?.error ?? null,
        lastDurationMs: opts?.durationMs ?? null,
      },
    });
  } catch (err) {
    log.warn("finishCronRun falhou (engolido)", { jobKey, err });
  }
}

/**
 * Classifica a saúde de um cron por DELTA de tempo (imune a fuso — nunca compara
 * horário de parede). Sem sucesso registrado = unknown ("nunca rodou desde que o
 * monitor foi ligado"), NÃO crítico — não assustar com vermelho falso no dia 1.
 *
 * `external`: crons acionados por gatilho EXTERNO (cron-job.org). Se o gatilho
 * para, o negócio não necessariamente parou — então esses NUNCA chegam a
 * "critical" (teto em "warning"). Um cron do Vercel atrasado além de 4× o
 * esperado é de fato um problema do sistema; um externo é "reative o gatilho".
 */
export function classifyCron(
  lastSucceededAt: Date | null,
  expectedEveryMs: number,
  now: Date = new Date(),
  external = false
): { state: CronHealthState; sinceLastSuccessMs: number | null } {
  if (!lastSucceededAt) return { state: "unknown", sinceLastSuccessMs: null };
  const since = now.getTime() - lastSucceededAt.getTime();
  if (since <= expectedEveryMs * 2) return { state: "healthy", sinceLastSuccessMs: since };
  if (since <= expectedEveryMs * 4) return { state: "warning", sinceLastSuccessMs: since };
  // Externo atrasado demais = "warning" (reative o gatilho), não "critical".
  return { state: external ? "warning" : "critical", sinceLastSuccessMs: since };
}

/**
 * Saúde de TODOS os crons conhecidos (une o mapa esperado + o que há no banco).
 * Um cron do mapa sem heartbeat aparece como `unknown` (nunca rodou).
 */
export async function getCronHealth(now: Date = new Date()): Promise<CronHealthRow[]> {
  const rows = await prisma.cronHeartbeat.findMany();
  const byKey = new Map(rows.map((r) => [r.jobKey, r]));

  const keys = new Set<string>([...Object.keys(EXPECTED_EVERY_MS), ...byKey.keys()]);

  const result: CronHealthRow[] = [];
  for (const jobKey of keys) {
    const hb = byKey.get(jobKey);
    const meta = cronMeta(jobKey);
    const external = meta.external ?? false;
    const expectedEveryMs = EXPECTED_EVERY_MS[jobKey] ?? DEFAULT_EXPECTED_MS;
    const { state, sinceLastSuccessMs } = classifyCron(hb?.lastSucceededAt ?? null, expectedEveryMs, now, external);
    result.push({
      jobKey,
      label: meta.label,
      does: meta.does,
      area: meta.area,
      external,
      state,
      expectedEveryMs,
      lastStartedAt: hb?.lastStartedAt?.toISOString() ?? null,
      lastSucceededAt: hb?.lastSucceededAt?.toISOString() ?? null,
      lastStatus: hb?.lastStatus ?? null,
      lastErrorSafe: sanitizeCronError(hb?.lastError ?? null),
      lastDurationMs: hb?.lastDurationMs ?? null,
      sinceLastSuccessMs,
    });
  }

  // Pior primeiro (critical > warning > unknown > healthy), depois por nome.
  const order: Record<CronHealthState, number> = { critical: 0, warning: 1, unknown: 2, healthy: 3 };
  result.sort((a, b) => order[a.state] - order[b.state] || a.jobKey.localeCompare(b.jobKey));
  return result;
}
