import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

const log = logger.child({ service: "system-event" });

export type SystemEventSource =
  | "vercel"
  | "database"
  | "cron"
  | "integration"
  | "sentry"
  | "manual";
export type SystemEventSeverity = "warning" | "critical" | "info";

export interface SystemEventView {
  id: string;
  source: string;
  severity: string;
  title: string;
  detail: string | null;
  status: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolveNote: string | null;
  createdAt: string;
}

function toView(e: {
  id: string;
  source: string;
  severity: string;
  title: string;
  detail: string | null;
  status: string;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  resolveNote: string | null;
  createdAt: Date;
}): SystemEventView {
  return {
    id: e.id,
    source: e.source,
    severity: e.severity,
    title: e.title,
    detail: e.detail,
    status: e.status,
    resolvedAt: e.resolvedAt?.toISOString() ?? null,
    resolvedBy: e.resolvedBy,
    resolveNote: e.resolveNote,
    createdAt: e.createdAt.toISOString(),
  };
}

/** Registro MANUAL (o dono anotou um problema). */
export async function createEvent(input: {
  source: SystemEventSource;
  severity: SystemEventSeverity;
  title: string;
  detail?: string;
}): Promise<SystemEventView> {
  const e = await prisma.systemEvent.create({
    data: {
      source: input.source,
      severity: input.severity,
      title: input.title,
      detail: input.detail ?? null,
    },
  });
  return toView(e);
}

/**
 * Cria um evento AUTOMÁTICO de forma IDEMPOTENTE por `dedupeKey`: se já existe
 * um evento ABERTO com essa chave, não cria outro (retorna o existente). Assim
 * um limiar que fica estourado por horas gera UM item, não um por verificação.
 * Fecha a corrida com try/catch no unique constraint (dois checks simultâneos).
 */
export async function ensureAutoEvent(
  dedupeKey: string,
  factory: () => {
    source: SystemEventSource;
    severity: SystemEventSeverity;
    title: string;
    detail?: string;
  }
): Promise<SystemEventView | null> {
  try {
    const existingOpen = await prisma.systemEvent.findFirst({
      where: { dedupeKey, status: "open" },
    });
    if (existingOpen) return toView(existingOpen);

    const data = factory();
    const created = await prisma.systemEvent.create({
      data: {
        source: data.source,
        severity: data.severity,
        title: data.title,
        detail: data.detail ?? null,
        dedupeKey,
      },
    });
    return toView(created);
  } catch (err) {
    // Corrida no unique dedupeKey (outro processo criou ao mesmo tempo): não é
    // erro real — o evento existe. Best-effort, não derruba o chamador.
    log.warn("ensureAutoEvent: colisão/erro (evento provavelmente já existe)", { dedupeKey, err });
    const fallback = await prisma.systemEvent.findFirst({ where: { dedupeKey, status: "open" } }).catch(() => null);
    return fallback ? toView(fallback) : null;
  }
}

/** Resolve um evento — NÃO apaga: guarda quem/quando/como (memória). */
export async function resolveEvent(
  id: string,
  resolvedBy: string,
  note?: string
): Promise<SystemEventView> {
  const e = await prisma.systemEvent.update({
    where: { id },
    data: {
      status: "resolved",
      resolvedAt: new Date(),
      resolvedBy,
      resolveNote: note ?? null,
    },
  });
  return toView(e);
}

/** Feed: abertos primeiro (mais recentes no topo) + últimos N resolvidos. */
export async function listEvents(opts?: { resolvedLimit?: number }): Promise<{
  open: SystemEventView[];
  resolved: SystemEventView[];
  openCount: number;
}> {
  const resolvedLimit = opts?.resolvedLimit ?? 10;
  const [open, resolved, openCount] = await Promise.all([
    prisma.systemEvent.findMany({ where: { status: "open" }, orderBy: { createdAt: "desc" } }),
    prisma.systemEvent.findMany({
      where: { status: "resolved" },
      orderBy: { resolvedAt: "desc" },
      take: resolvedLimit,
    }),
    prisma.systemEvent.count({ where: { status: "open" } }),
  ]);
  return { open: open.map(toView), resolved: resolved.map(toView), openCount };
}

/** Contagem de eventos abertos (para o badge/sino). Best-effort → 0 em erro. */
export async function countOpenEvents(): Promise<number> {
  try {
    return await prisma.systemEvent.count({ where: { status: "open" } });
  } catch (err) {
    log.warn("countOpenEvents falhou (retornando 0)", { err });
    return 0;
  }
}
