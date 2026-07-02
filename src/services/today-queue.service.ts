import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { buildLeadBranchScope } from "@/services/lead.service";
import { computeNeedsReplyLeadIds } from "@/services/lead-needs-reply.service";
import { leadNeedsAttention } from "@/lib/lead-needs-attention";
import { SLA_LATE_HOURS } from "@/lib/lead-sla";
import {
  buildTodayQueue,
  humanWait,
  severityByWait,
  queueDrafts,
  firstName,
  type TodayQueueItem,
} from "@/lib/today-queue";

/**
 * "Fila de Hoje" (Sprint 2, #4) — serviço agregador. Faz as queries multi-tenant
 * dos 4 sinais e delega a PRIORIZAÇÃO/CORTE ao builder puro `buildTodayQueue`.
 *
 * Fontes (tudo já existe, nada de estado novo):
 *  - ATENÇÃO   : lead aberto com intenção de tratativa (reclamação/cobrança/
 *                garantia) ou tom irritado — `leadNeedsAttention`.
 *  - RESPONDER : lead aberto cuja conversa não teve outbound — a bola está com a
 *                ótica. `computeNeedsReplyLeadIds` dá o relógio real (#5).
 *  - OS PARADA : ServiceOrder READY, não entregue, não avisada (fonte canônica
 *                WhatsappMessageLog OS_READY), snooze expirado.
 *  - ATRASADO  : lead aberto parado há >= SLA_LATE_HOURS (staleness).
 *
 * Um mesmo lead pode disparar mais de um sinal; para não duplicar a pessoa na
 * fila, cada lead entra UMA vez pelo sinal de MAIOR urgência (atenção > responder
 * > atrasado). OS parada é entidade diferente (óculos), então convive.
 *
 * Multi-tenant: companyId em todo filtro; branchId opcional (respeita o escopo de
 * leads não-atribuídos, igual ao resto do funil).
 */
export async function getTodayQueue(
  companyId: string,
  branchId: string | null,
  now: Date = new Date(),
): Promise<{ queue: TodayQueueItem[]; total: number; overflow: number }> {
  // 1) Leads ABERTOS da empresa/filial (uma query). Só o necessário p/ a fila.
  // Mesma forma de where multi-tenant do resto do funil (companyId sempre presente).
  const leadWhere: Prisma.LeadWhereInput = {
    companyId,
    deletedAt: null,
    stage: { isWon: false, isLost: false },
  };
  const branchScope = buildLeadBranchScope(branchId);
  if (branchScope) leadWhere.AND = [branchScope];

  const leads = await prisma.lead.findMany({
    where: leadWhere,
    select: {
      id: true,
      name: true,
      phone: true,
      intent: true,
      urgent: true,
      lastActivityAt: true,
      customer: { select: { name: true, phone: true } },
    },
  });

  // Relógio real do "precisa responder" (#5): leadId → desde quando o cliente espera.
  const needsReplyByLead = await computeNeedsReplyLeadIds(
    companyId,
    leads.map((l) => l.id),
  );

  const hoursSince = (d: Date): number => (now.getTime() - d.getTime()) / 3600_000;
  const nameOf = (l: (typeof leads)[number]): string =>
    l.customer?.name?.trim() || l.name?.trim() || "Cliente";
  const phoneOf = (l: (typeof leads)[number]): string | null =>
    l.customer?.phone || l.phone || null;

  const items: TodayQueueItem[] = [];

  // Cada lead entra UMA vez, pelo sinal de maior urgência.
  for (const l of leads) {
    const name = nameOf(l);
    const phone = phoneOf(l);
    const first = firstName(name);

    if (leadNeedsAttention({ intent: l.intent, urgent: l.urgent })) {
      // Atenção = alarme sagrado: sempre 🔴, no topo. Relógio = staleness do card
      // (não há "desde quando reclamou" barato aqui; o importante é o alarme).
      items.push({
        key: `attention:${l.id}`,
        kind: "attention",
        customerName: name,
        phone,
        severity: "red",
        headline: `Fale com ${first} agora`,
        subtext: "precisa de atenção (reclamação/urgente)",
        draftText: queueDrafts.attention(name),
        href: `/dashboard/funil?lead=${l.id}`,
        waitingHours: hoursSince(l.lastActivityAt),
      });
      continue;
    }

    const waitingSince = needsReplyByLead.get(l.id);
    if (waitingSince) {
      const h = hoursSince(waitingSince);
      items.push({
        key: `needs_reply:${l.id}`,
        kind: "needs_reply",
        customerName: name,
        phone,
        severity: severityByWait(h),
        headline: `Responda ${first}`,
        subtext: `esperando resposta ${humanWait(h)}`,
        draftText: queueDrafts.needsReply(name),
        href: `/dashboard/funil?lead=${l.id}`,
        waitingHours: h,
      });
      continue;
    }

    const stale = hoursSince(l.lastActivityAt);
    if (stale >= SLA_LATE_HOURS) {
      items.push({
        key: `sla_late:${l.id}`,
        kind: "sla_late",
        customerName: name,
        phone,
        severity: severityByWait(stale),
        headline: `Retome ${first}`,
        subtext: `parado ${humanWait(stale)} sem resposta`,
        draftText: queueDrafts.slaLate(name),
        href: `/dashboard/funil?lead=${l.id}`,
        waitingHours: stale,
      });
    }
  }

  // 2) OS PARADA ("prontos pra avisar"): mesma regra da fila da tela de OS.
  const notifiedLogs = await prisma.whatsappMessageLog.findMany({
    where: { companyId, type: "OS_READY", status: { in: ["PENDING", "SENT"] }, referenceId: { not: null } },
    select: { referenceId: true },
  });
  const notifiedOsIds = notifiedLogs.map((n) => n.referenceId!).filter(Boolean);

  const readyOrders = await prisma.serviceOrder.findMany({
    where: {
      companyId,
      ...(branchId ? { branchId } : {}),
      status: "READY",
      deliveredAt: null,
      readyAt: { not: null },
      OR: [{ notifySnoozedUntil: null }, { notifySnoozedUntil: { lt: now } }],
      ...(notifiedOsIds.length > 0 ? { id: { notIn: notifiedOsIds } } : {}),
    },
    select: {
      id: true,
      readyAt: true,
      customer: { select: { name: true, phone: true } },
    },
    orderBy: { readyAt: "asc" },
  });

  for (const os of readyOrders) {
    const name = os.customer?.name?.trim() || "Cliente";
    // readyAt não é null aqui (filtrado no where), mas guard defensivo.
    const h = os.readyAt ? hoursSince(os.readyAt) : 0;
    items.push({
      key: `os_ready:${os.id}`,
      kind: "os_ready",
      customerName: name,
      phone: os.customer?.phone || null,
      severity: severityByWait(h),
      headline: `Avise ${firstName(name)}`,
      subtext: `óculos pronto ${humanWait(h)}`,
      draftText: queueDrafts.osReady(name),
      href: `/dashboard/ordens-servico`,
      waitingHours: h,
    });
  }

  return buildTodayQueue(items);
}
