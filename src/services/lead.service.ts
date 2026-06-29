import { prisma } from "@/lib/prisma";
import { softDelete, softDeleteFilter } from "@/lib/soft-delete";
import { notFoundError, businessRuleError, duplicateError } from "@/lib/error-handler";
import { getPaginationParams, createPaginationMeta } from "@/lib/api-response";
import type {
  CreateLeadDTO,
  LeadQuery,
  MoveLeadDTO,
  UpdateLeadDTO,
} from "@/lib/validations/lead.schema";

const LEAD_INCLUDE = {
  stage: true,
  seller: { select: { id: true, name: true } },
  customer: { select: { id: true, name: true } },
  quote: { select: { id: true, total: true, status: true } },
} as const;

/**
 * Valida que cada FK referenciada por um lead pertence à MESMA empresa, fechando
 * IDOR cross-tenant: sem isto, a empresa A poderia gravar customerId/quoteId/
 * sellerUserId/stageId de outra empresa (vínculo/vazamento cross-tenant). Lança
 * notFoundError no primeiro inválido. Cada checagem só roda se o campo veio.
 */
async function assertLeadFksOwnedByCompany(
  data: { customerId?: string; quoteId?: string; sellerUserId?: string; stageId?: string },
  companyId: string,
): Promise<void> {
  if (data.customerId) {
    const c = await prisma.customer.findFirst({ where: { id: data.customerId, companyId }, select: { id: true } });
    if (!c) throw notFoundError("Cliente inválido");
  }
  if (data.quoteId) {
    const q = await prisma.quote.findFirst({ where: { id: data.quoteId, companyId }, select: { id: true } });
    if (!q) throw notFoundError("Orçamento inválido");
  }
  if (data.sellerUserId) {
    const u = await prisma.user.findFirst({ where: { id: data.sellerUserId, companyId }, select: { id: true } });
    if (!u) throw notFoundError("Vendedor inválido");
  }
  if (data.stageId) {
    const s = await prisma.leadStage.findFirst({ where: { id: data.stageId, companyId }, select: { id: true } });
    if (!s) throw notFoundError("Etapa inválida");
  }
}

export async function createLead(
  data: CreateLeadDTO,
  companyId: string,
  userId: string,
  branchId: string | null
) {
  // Fecha IDOR cross-tenant: TODOS os 4 FKs (incl. stageId quando fornecido)
  // passam pela MESMA validação por empresa — sem caminho duplicado (evita que
  // um refator silencie a checagem de stageId).
  await assertLeadFksOwnedByCompany(
    { customerId: data.customerId, quoteId: data.quoteId, sellerUserId: data.sellerUserId, stageId: data.stageId },
    companyId,
  );

  // Resolve a etapa: usa a fornecida (já validada acima) ou a 1ª (menor order).
  let stageId = data.stageId;
  if (!stageId) {
    const first = await prisma.leadStage.findFirst({
      where: { companyId },
      orderBy: { order: "asc" },
      select: { id: true },
    });
    if (!first) throw businessRuleError("Funil não configurado: nenhuma etapa encontrada");
    stageId = first.id;
  }

  // Dedupe não-bloqueante por telefone
  let duplicateWarning = false;
  if (data.phone) {
    const dup = await prisma.lead.findFirst({
      where: { companyId, phone: data.phone, ...softDeleteFilter() },
      select: { id: true },
    });
    duplicateWarning = !!dup;
  }

  const lead = await prisma.lead.create({
    data: {
      companyId,
      branchId,
      name: data.name,
      phone: data.phone,
      email: data.email || null,
      interest: data.interest,
      source: data.source,
      stageId,
      sellerUserId: data.sellerUserId ?? userId,
      estimatedValue: data.estimatedValue,
      customerId: data.customerId,
      quoteId: data.quoteId,
      notes: data.notes,
    },
  });

  return { lead, duplicateWarning };
}

export async function listLeads(
  query: LeadQuery,
  companyId: string,
  branchId: string | null,
  access: { viewAll: boolean; userId: string }
) {
  const where: any = { companyId, deletedAt: null };
  if (branchId) where.branchId = branchId;
  if (query.stageId) where.stageId = query.stageId;
  if (query.source) where.source = query.source;
  if (query.sellerUserId) where.sellerUserId = query.sellerUserId;
  if (!access.viewAll) where.sellerUserId = access.userId;
  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: "insensitive" } },
      { interest: { contains: query.search, mode: "insensitive" } },
    ];
  }

  const { skip, take } = getPaginationParams(query.page, query.pageSize);
  const [rows, total] = await Promise.all([
    prisma.lead.findMany({ where, include: LEAD_INCLUDE, orderBy: { lastActivityAt: "desc" }, skip, take }),
    prisma.lead.count({ where }),
  ]);

  return {
    data: rows.map(serializeLead),
    pagination: createPaginationMeta(query.page, query.pageSize, total),
  };
}

export async function getLeadById(id: string, companyId: string) {
  const lead = await prisma.lead.findFirst({
    where: { id, companyId, deletedAt: null },
    include: LEAD_INCLUDE,
  });
  if (!lead) throw notFoundError("Lead não encontrado");
  return serializeLead(lead);
}

function serializeLead(l: any) {
  return {
    ...l,
    estimatedValue: l.estimatedValue == null ? null : Number(l.estimatedValue),
    quote: l.quote ? { ...l.quote, total: Number(l.quote.total) } : null,
  };
}

export async function moveLead(id: string, data: MoveLeadDTO, companyId: string) {
  const lead = await prisma.lead.findFirst({
    where: { id, companyId, deletedAt: null },
    select: { id: true, updatedAt: true },
  });
  if (!lead) throw notFoundError("Lead não encontrado");

  if (data.expectedUpdatedAt && new Date(data.expectedUpdatedAt).getTime() !== lead.updatedAt.getTime()) {
    throw duplicateError("Este lead foi atualizado por outra pessoa. Recarregue o funil.");
  }

  const stage = await prisma.leadStage.findFirst({
    where: { id: data.stageId, companyId },
    select: { id: true, isLost: true },
  });
  if (!stage) throw notFoundError("Etapa inválida");
  if (stage.isLost && !data.lostReason) {
    throw businessRuleError("Informe o motivo da perda");
  }

  return prisma.lead.update({
    where: { id },
    data: {
      stageId: data.stageId,
      lostReason: stage.isLost ? data.lostReason : null,
      lastActivityAt: new Date(),
    },
  });
}

export async function updateLead(id: string, data: UpdateLeadDTO, companyId: string) {
  const lead = await prisma.lead.findFirst({
    where: { id, companyId, deletedAt: null },
    select: { id: true },
  });
  if (!lead) throw notFoundError("Lead não encontrado");

  // Fecha IDOR cross-tenant: valida que qualquer FK editável é da mesma empresa.
  await assertLeadFksOwnedByCompany(
    { customerId: data.customerId, quoteId: data.quoteId, sellerUserId: data.sellerUserId, stageId: data.stageId },
    companyId,
  );

  // Allowlist EXPLÍCITA (nunca `...data`): só campos editáveis conhecidos chegam
  // ao update — evita que um campo inesperado do DTO vaze para o Prisma. Cada
  // chave só entra se veio no payload (undefined = Prisma ignora).
  return prisma.lead.update({
    where: { id },
    data: {
      name: data.name,
      phone: data.phone,
      email: data.email === "" ? null : data.email,
      interest: data.interest,
      source: data.source,
      estimatedValue: data.estimatedValue,
      notes: data.notes,
      lostReason: data.lostReason,
      stageId: data.stageId,
      sellerUserId: data.sellerUserId,
      customerId: data.customerId,
      quoteId: data.quoteId,
      lastActivityAt: new Date(),
    },
  });
}

/**
 * Writer DEDICADO do vínculo lead↔cliente (confirmação humana do match da IA).
 * Valida que o lead E o customer são da MESMA empresa (fecha IDOR cross-tenant).
 * Passar customerId=null DESVINCULA (vendedor desfaz). Caminho separado do
 * updateLead genérico de propósito: vincular ficha é ação sensível (LGPD) e o
 * match por telefone pode ser falso-positivo — por isso exige clique explícito.
 */
export async function setLeadCustomer(
  id: string,
  customerId: string | null,
  companyId: string,
) {
  const lead = await prisma.lead.findFirst({
    where: { id, companyId, deletedAt: null },
    select: { id: true },
  });
  if (!lead) throw notFoundError("Lead não encontrado");

  if (customerId) {
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, companyId },
      select: { id: true },
    });
    if (!customer) throw notFoundError("Cliente inválido");
  }

  return prisma.lead.update({
    where: { id },
    data: { customerId, lastActivityAt: new Date() },
  });
}

export async function deleteLead(id: string, companyId: string) {
  const lead = await prisma.lead.findFirst({
    where: { id, companyId, deletedAt: null },
    select: { id: true },
  });
  if (!lead) throw notFoundError("Lead não encontrado");
  await softDelete("lead", id);
}

/**
 * Métricas do funil: total, ganhos, taxa de conversão (ganhos/total) e
 * agregações por motivo de perda e por origem. Multi-tenant (companyId) +
 * filtro opcional por filial. Ignora leads soft-deletados.
 */
export async function getLeadStats(companyId: string, branchId: string | null) {
  const where: any = { companyId, deletedAt: null };
  if (branchId) where.branchId = branchId;
  const leads = await prisma.lead.findMany({
    where,
    select: { source: true, lostReason: true, stage: { select: { isWon: true, isLost: true } } },
  });
  const total = leads.length;
  const won = leads.filter((l) => l.stage.isWon).length;
  const byLostReason: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  for (const l of leads) {
    if (l.stage.isLost && l.lostReason) {
      byLostReason[l.lostReason] = (byLostReason[l.lostReason] ?? 0) + 1;
    }
    if (l.source) bySource[l.source] = (bySource[l.source] ?? 0) + 1;
  }
  return { total, won, conversionRate: total ? won / total : 0, byLostReason, bySource };
}
