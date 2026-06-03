import { osDisplayNumber } from "@/lib/os-number";
import { startOfLocalDay } from "@/lib/date-utils";

// status é tratado como string no boundary (o tipo local da tela é string);
// a lógica só compara com "CANCELED" e repassa o valor para exibição.

/**
 * Monta a linha do tempo (histórico) de uma OS-raiz: a OS original + todas as
 * derivações (garantias/retrabalhos/erros médicos), com contadores por tipo e
 * o estado de prazo de cada etapa. Lógica pura, sem I/O — testável isolada.
 *
 * Só faz sentido para a OS-RAIZ (pós-Bug 3, reworkOrders da raiz contém todas
 * as derivações, lista plana). Eventos ordenados do mais recente ao mais antigo.
 */

// As datas chegam como Date (server) ou string ISO (cliente, pós-JSON).
type DateLike = Date | string;

function toDate(value: DateLike): Date {
  return value instanceof Date ? value : new Date(value);
}

export type OsTimelineEventType = "ORIGINAL" | "WARRANTY" | "REWORK" | "MEDICAL_ERROR";

export type OsDeadlineState = "ON_TIME" | "LATE" | "PENDING";

export interface OsTimelineEvent {
  id: string;
  type: OsTimelineEventType;
  displayNumber: string;
  status: string;
  reason: string | null;
  createdAt: Date;
  promisedDate: Date | null;
  deliveredAt: Date | null;
  deadline: { state: OsDeadlineState; lateDays: number | null };
  isCanceled: boolean;
}

export interface OsTimeline {
  events: OsTimelineEvent[];
  counts: { warranty: number; rework: number; medicalError: number };
}

interface DerivationInput {
  id: string;
  number?: number | null;
  status: string;
  isWarranty?: boolean | null;
  isRework?: boolean | null;
  isMedicalError?: boolean | null;
  warrantySeq?: number | null;
  createdAt: DateLike;
  promisedDate?: DateLike | null;
  deliveredAt?: DateLike | null;
  isDelayed?: boolean | null;
  delayDays?: number | null;
  warrantyReason?: string | null;
  reworkReason?: string | null;
  medicalErrorReason?: string | null;
}

export interface OsTimelineRootInput {
  id: string;
  number?: number | null;
  status: string;
  createdAt: DateLike;
  promisedDate?: DateLike | null;
  deliveredAt?: DateLike | null;
  isDelayed?: boolean | null;
  delayDays?: number | null;
  reworkOrders?: DerivationInput[];
}

function typeOf(d: {
  isMedicalError?: boolean | null;
  isRework?: boolean | null;
  isWarranty?: boolean | null;
}): OsTimelineEventType {
  if (d.isMedicalError) return "MEDICAL_ERROR";
  if (d.isRework) return "REWORK";
  if (d.isWarranty) return "WARRANTY";
  return "ORIGINAL";
}

function reasonOf(d: DerivationInput): string | null {
  return d.warrantyReason ?? d.reworkReason ?? d.medicalErrorReason ?? null;
}

/** Dias inteiros (local) entre prometida e entregue; >0 = atraso. */
function dayDiff(promised: Date, delivered: Date): number {
  const a = startOfLocalDay(delivered).getTime();
  const b = startOfLocalDay(promised).getTime();
  return Math.round((a - b) / (1000 * 60 * 60 * 24));
}

function computeDeadline(input: {
  promisedDate?: DateLike | null;
  deliveredAt?: DateLike | null;
  isDelayed?: boolean | null;
  delayDays?: number | null;
}): { state: OsDeadlineState; lateDays: number | null } {
  // Entregue: compara entrega × prazo prometido (granularidade de dia local).
  if (input.deliveredAt) {
    if (!input.promisedDate) return { state: "ON_TIME", lateDays: null };
    const late = dayDiff(toDate(input.promisedDate), toDate(input.deliveredAt));
    return late > 0
      ? { state: "LATE", lateDays: late }
      : { state: "ON_TIME", lateDays: null };
  }
  // Aberta: usa o flag de atraso já calculado pelo serviço.
  if (input.isDelayed) {
    return { state: "LATE", lateDays: input.delayDays ?? null };
  }
  return { state: "PENDING", lateDays: null };
}

export function buildOsTimeline(root: OsTimelineRootInput): OsTimeline {
  const events: OsTimelineEvent[] = [];

  // Evento da OS original (raiz).
  events.push({
    id: root.id,
    type: "ORIGINAL",
    displayNumber: osDisplayNumber({ id: root.id, number: root.number }),
    status: root.status,
    reason: null,
    createdAt: toDate(root.createdAt),
    promisedDate: root.promisedDate ? toDate(root.promisedDate) : null,
    deliveredAt: root.deliveredAt ? toDate(root.deliveredAt) : null,
    deadline: computeDeadline(root),
    isCanceled: root.status === "CANCELED",
  });

  const counts = { warranty: 0, rework: 0, medicalError: 0 };

  for (const d of root.reworkOrders ?? []) {
    const type = typeOf(d);
    const isCanceled = d.status === "CANCELED";
    // Contadores ignoram canceladas; a timeline mostra tudo (inclusive cancelada).
    if (!isCanceled) {
      if (type === "WARRANTY") counts.warranty++;
      else if (type === "REWORK") counts.rework++;
      else if (type === "MEDICAL_ERROR") counts.medicalError++;
    }
    events.push({
      id: d.id,
      type,
      // Número-base vem da raiz (todas as derivações apontam à raiz pós-Bug 3).
      displayNumber: osDisplayNumber({
        id: d.id,
        number: d.number,
        isWarranty: d.isWarranty,
        isRework: d.isRework,
        isMedicalError: d.isMedicalError,
        warrantySeq: d.warrantySeq,
        originalOrder: { number: root.number },
      }),
      status: d.status,
      reason: reasonOf(d),
      createdAt: toDate(d.createdAt),
      promisedDate: d.promisedDate ? toDate(d.promisedDate) : null,
      deliveredAt: d.deliveredAt ? toDate(d.deliveredAt) : null,
      deadline: computeDeadline(d),
      isCanceled,
    });
  }

  // Mais recente no topo.
  events.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return { events, counts };
}
