import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { buildLeadBranchScope } from "@/services/lead.service";
import { firstName, humanWait } from "@/lib/today-queue";

/**
 * "Recuperar" (Sprint 3, #7) — a lista de clientes que NÃO converteram, para o
 * dono puxar de volta com promoção/desconto. Reusa o elo `Sale.leadId` (Fatia 1)
 * para saber quem já comprou.
 *
 * Um lead entra na lista quando, ao mesmo tempo:
 *  - NÃO tem venda vinculada (`sales: { none: {} }`), E
 *  - NÃO está ganho (`stage.isWon = false`), E
 *  - já "esfriou": OU foi marcado como PERDIDO (`stage.isLost`), OU está ABERTO
 *    mas parado há >= COLD_DAYS (sumiu no meio, ninguém deu baixa).
 *
 * ⚠️ Limite conhecido (documentado no design): `Sale.leadId` é best-effort (casa
 * por customerId na tx da venda). Um lead SEM customerId que comprou pode não ter
 * o elo → aparece aqui como "não-convertido" (falso positivo). É recuperação
 * MANUAL (a atendente confirma antes de mandar), então o custo do falso positivo
 * é baixo; nunca dispara nada sozinho.
 *
 * Multi-tenant: companyId em todo filtro + escopo de filial igual ao resto do
 * funil (leads não-atribuídos contam em qualquer filial).
 */

/** Dias sem atividade p/ um lead ABERTO ser considerado "frio" (esfriou). */
export const COLD_DAYS = 7;

export interface ColdLeadsFilters {
  /** Origem exata (LeadFunnelSource) ou undefined p/ todas. */
  source?: string;
  /** Motivo de perda ESTRUTURADO (LostReasonCategory, #8) ou undefined p/ todos. */
  lostReasonCategory?: string;
  /** Janela por createdAt (reusa o range do placar, #6). */
  from?: Date;
  to?: Date;
}

export interface ColdLeadRow {
  id: string;
  name: string;
  phone: string | null;
  source: string | null;
  /** Perdido explicitamente (isLost) vs. aberto-e-frio (sumiu). */
  status: "lost" | "cold";
  /** Motivo ESTRUTURADO (#8), quando perdido com categoria. */
  lostReasonCategory: string | null;
  /** Detalhe em texto livre (opcional). */
  lostReason: string | null;
  /** "há X dias" desde a última atividade — pra priorizar o resgate. */
  coldFor: string;
  /** Horas paradas (ordenação: o mais frio primeiro). */
  hoursCold: number;
  /** Rascunho de reoferta pronto pra atendente colar. */
  draftText: string;
}

/** Rascunho de reoferta (reconquista) — caloroso, sem pressão, a atendente edita. */
export function coldLeadDraft(name: string): string {
  return `Oi ${firstName(name)}! 😊 Passando pra saber se você ainda tem interesse nos óculos — temos uma condição especial essa semana. Posso te mostrar?`;
}

export async function listColdLeads(
  companyId: string,
  branchId: string | null,
  filters: ColdLeadsFilters = {},
  now: Date = new Date(),
): Promise<ColdLeadRow[]> {
  const coldBefore = new Date(now.getTime() - COLD_DAYS * 24 * 60 * 60 * 1000);

  const where: Prisma.LeadWhereInput = {
    companyId,
    deletedAt: null,
    // Reuso do elo Lead↔Sale (Fatia 1): sem NENHUMA venda vinculada.
    sales: { none: {} },
    // Nunca ganho (won sai da recuperação — já é cliente).
    stage: { isWon: false },
    // Esfriou = perdido explicitamente OU aberto e parado há >= COLD_DAYS.
    OR: [
      { stage: { isLost: true } },
      { stage: { isLost: false }, lastActivityAt: { lt: coldBefore } },
    ],
  };

  if (filters.source) where.source = filters.source as Prisma.LeadWhereInput["source"];
  if (filters.lostReasonCategory) {
    where.lostReasonCategory = filters.lostReasonCategory as Prisma.LeadWhereInput["lostReasonCategory"];
  }
  if (filters.from || filters.to) {
    where.createdAt = {
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.to ? { lte: filters.to } : {}),
    };
  }

  // Filial e o OR de "esfriou" são cláusulas independentes → vão em AND p/ não
  // colidirem (dois OR no mesmo objeto se sobrescrevem — bug conhecido do funil).
  const and: Prisma.LeadWhereInput[] = [];
  const branchScope = buildLeadBranchScope(branchId);
  if (branchScope) and.push(branchScope as Prisma.LeadWhereInput);
  // Move o OR de "esfriou" para dentro do AND, liberando where.OR sem risco de
  // colisão com um filtro futuro que também use OR no topo.
  if (where.OR) {
    and.push({ OR: where.OR });
    delete where.OR;
  }
  if (and.length) where.AND = and;

  const leads = await prisma.lead.findMany({
    where,
    select: {
      id: true,
      name: true,
      phone: true,
      source: true,
      lostReason: true,
      lostReasonCategory: true,
      lastActivityAt: true,
      stage: { select: { isLost: true } },
      customer: { select: { name: true, phone: true } },
    },
    orderBy: { lastActivityAt: "asc" }, // o mais frio (parado há mais tempo) primeiro
  });

  return leads.map((l) => {
    const name = l.customer?.name?.trim() || l.name?.trim() || "Cliente";
    const phone = l.customer?.phone || l.phone || null;
    const hoursCold = (now.getTime() - l.lastActivityAt.getTime()) / 3600_000;
    return {
      id: l.id,
      name,
      phone,
      source: l.source,
      status: l.stage.isLost ? "lost" : "cold",
      lostReasonCategory: l.lostReasonCategory,
      lostReason: l.lostReason,
      coldFor: humanWait(hoursCold),
      hoursCold,
      draftText: coldLeadDraft(name),
    };
  });
}
