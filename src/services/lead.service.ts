import { prisma } from "@/lib/prisma";
import { softDelete, softDeleteFilter } from "@/lib/soft-delete";
import { notFoundError, businessRuleError, duplicateError } from "@/lib/error-handler";
import { getPaginationParams, createPaginationMeta } from "@/lib/api-response";
import type { ContactIntent, CustomerMatchKind } from "@prisma/client";
import { INTENT_VALUES } from "@/lib/contact-intent-label";
import { computeIntentAccuracy, computeIntentAccuracyByIntent } from "@/lib/intent-accuracy";
import { computeLeadSla } from "@/lib/lead-sla";
import { computeNeedsReplyLeadIds } from "@/services/lead-needs-reply.service";
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
  suggestedCustomer: { select: { id: true, name: true } },
  quote: { select: { id: true, total: true, status: true } },
} as const;

/**
 * Escopo de filial para LEITURA de leads. Um lead SEM filial (branchId=null) NÃO
 * pertence a nenhuma filial específica — é "não-atribuído". Casos que nascem assim:
 * leads da IA do WhatsApp (a conversa não tem filial) e leads criados por um
 * usuário sem filial (ex.: admin). Se filtrássemos com `where.branchId = X`, o SQL
 * `branch_id = 'X'` NUNCA casa com NULL, então esses leads SOMEM ao selecionar uma
 * filial — o dono vê o funil vazio. Correção: um lead não-atribuído aparece em
 * QUALQUER filial selecionada (`branchId = X OR branchId IS NULL`).
 *
 * Retorna uma cláusula pronta p/ um `where.AND` (nunca `where.OR` direto: o topo do
 * where já usa OR p/ a busca por texto, e dois `OR` no mesmo objeto se sobrescrevem).
 * `null`/`"ALL"` ⇒ sem escopo (todas as filiais) ⇒ retorna null (o chamador ignora).
 */
export function buildLeadBranchScope(
  branchId: string | null,
): { OR: [{ branchId: string }, { branchId: null }] } | null {
  if (!branchId) return null;
  return { OR: [{ branchId }, { branchId: null }] };
}

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

/** Campos classificados pela IA (não vêm do DTO público de criação manual). */
export interface LeadAiFields {
  intent?: ContactIntent;
  contactNotPatient?: boolean;
  urgent?: boolean;
  /** Confiança (0-1) da classificação — persistida p/ auditar o auto-move. */
  confidence?: number;
  customerMatchKind?: CustomerMatchKind;
  /** Cliente sugerido pela IA (match único, a confirmar). */
  suggestedCustomerId?: string | null;
}

export async function createLead(
  data: CreateLeadDTO,
  companyId: string,
  userId: string,
  branchId: string | null,
  aiFields?: LeadAiFields,
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
      // Campos da IA (quando o lead nasce da qualificação automática).
      // intent E intentPredicted nascem iguais (o palpite original da IA); o
      // intent pode divergir depois se o humano corrigir, mas intentPredicted
      // preserva o que a IA disse — base da telemetria de acurácia (Fase 3).
      ...(aiFields?.intent ? { intent: aiFields.intent, intentPredicted: aiFields.intent } : {}),
      ...(aiFields?.contactNotPatient != null ? { contactNotPatient: aiFields.contactNotPatient } : {}),
      ...(aiFields?.urgent != null ? { urgent: aiFields.urgent } : {}),
      ...(aiFields?.confidence != null ? { intentConfidence: aiFields.confidence } : {}),
      ...(aiFields?.customerMatchKind ? { customerMatchKind: aiFields.customerMatchKind } : {}),
      ...(aiFields?.suggestedCustomerId ? { suggestedCustomerId: aiFields.suggestedCustomerId } : {}),
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
  if (query.stageId) where.stageId = query.stageId;
  if (query.source) where.source = query.source;
  if (query.sellerUserId) where.sellerUserId = query.sellerUserId;
  if (!access.viewAll) where.sellerUserId = access.userId;
  // Filial e busca são cláusulas OR INDEPENDENTES; vão em `AND` p/ não se
  // sobrescreverem (dois `where.OR` no mesmo objeto colidem — o 2º apaga o 1º).
  const and: any[] = [];
  const branchScope = buildLeadBranchScope(branchId);
  if (branchScope) and.push(branchScope);
  if (query.search) {
    and.push({
      OR: [
        { name: { contains: query.search, mode: "insensitive" } },
        { interest: { contains: query.search, mode: "insensitive" } },
      ],
    });
  }
  if (and.length) where.AND = and;

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

/**
 * Move um lead de estágio. `movedBy` (Fatia 3) registra a autoria:
 *  - "USER" (default, vindo da rota humana): carimba lastMovedBy=USER +
 *    lastHumanMoveAt e ARMA a trava humana — aiLockUntilMessageAt recebe o
 *    lastMessageAt da conversa vinculada (a IA só re-mexe se chegar msg MAIS
 *    nova que isso). Sem conversa vinculada (lead manual), a trava fica null.
 *  - "AI" (vindo do motor de auto-move): carimba lastMovedBy=AI e NÃO mexe na
 *    trava humana (não consulta conversa).
 */
export async function moveLead(
  id: string,
  data: MoveLeadDTO,
  companyId: string,
  movedBy: "USER" | "AI" = "USER",
) {
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
    select: { id: true, isLost: true, isWon: true },
  });
  if (!stage) throw notFoundError("Etapa inválida");
  if (stage.isLost && !data.lostReason) {
    throw businessRuleError("Informe o motivo da perda");
  }
  // Defense-in-depth (Fatia 3): a IA NUNCA leva um card p/ "Ganho" via moveLead.
  // O auto-Ganho é determinístico (linkLeadAndMaybeWinInTx, na venda real). Se um
  // estágio virar isWon entre a leitura do motor e aqui, o guard impede a IA de
  // "ganhar" um lead sem venda. Humano (USER) pode mover p/ Ganho manualmente.
  if (movedBy === "AI" && stage.isWon) {
    throw businessRuleError("A IA não move card para Ganho (só venda real ou humano).");
  }

  // Trava humana inteligente: ao mover por humano, congela a IA até chegar uma
  // mensagem mais nova que a última conhecida da conversa. Só p/ o caminho USER.
  let humanStamp: {
    lastMovedBy: "USER";
    lastHumanMoveAt: Date;
    aiLockUntilMessageAt: Date | null;
  } | undefined;
  if (movedBy === "USER") {
    const conv = await prisma.whatsappConversation.findFirst({
      where: { leadId: id, companyId },
      select: { lastMessageAt: true },
    });
    humanStamp = {
      lastMovedBy: "USER",
      lastHumanMoveAt: new Date(),
      aiLockUntilMessageAt: conv?.lastMessageAt ?? null,
    };
  }

  // Auto-move da IA: NUNCA sobrescreve uma correção humana. updateMany com guard
  // que fecha a janela de corrida (humano move entre a leitura do motor e este
  // update) — se um USER carimbou no meio, count=0 e a IA aborta.
  // 🐛 NULL (lógica de 3 valores do SQL): NÃO usar `{ not: "USER" }` — `NULL <>
  // 'USER'` é NULL (não TRUE), então excluiria as linhas com lastMovedBy=NULL, que
  // é o PADRÃO de TODO lead nunca-tocado-por-humano (o caso comum). Resultado: a IA
  // nunca movia card nenhum em prod. O guard tem de INCLUIR a linha NULL e ainda
  // BARRAR a linha USER → OR explícito (null OU AI), nunca a negação direta.
  if (movedBy === "AI") {
    const res = await prisma.lead.updateMany({
      where: { id, companyId, OR: [{ lastMovedBy: null }, { lastMovedBy: "AI" }] },
      data: {
        stageId: data.stageId,
        lostReason: stage.isLost ? data.lostReason : null,
        lastActivityAt: new Date(),
        lastMovedBy: "AI",
      },
    });
    if (res.count === 0) {
      // Humano carimbou na corrida — respeita e não move.
      throw duplicateError("Lead foi movido por um humano. A IA não sobrescreve.");
    }
    return prisma.lead.findUniqueOrThrow({ where: { id } });
  }

  return prisma.lead.update({
    where: { id },
    data: {
      stageId: data.stageId,
      lostReason: stage.isLost ? data.lostReason : null,
      lastActivityAt: new Date(),
      ...humanStamp,
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
  confirmedByUserId?: string | null,
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

  // Registra a CONFIRMAÇÃO humana e limpa a sugestão (a decisão do vendedor
  // substitui o palpite da IA). Confirmar → marca quem/quando; desvincular
  // (customerId=null) → limpa o vínculo mas mantém o registro de que foi humano.
  return prisma.lead.update({
    where: { id },
    data: {
      customerId,
      customerMatchConfirmedById: confirmedByUserId ?? null,
      customerMatchConfirmedAt: new Date(),
      suggestedCustomerId: null, // decisão tomada — limpa o palpite
      lastActivityAt: new Date(),
    },
  });
}

/** Allowlist do enum ContactIntent — fonte única em contact-intent-label. */
const VALID_INTENTS: ReadonlySet<string> = new Set(INTENT_VALUES);

/**
 * Writer DEDICADO da correção HUMANA de intenção (telemetria de acurácia, Fase 3).
 * O vendedor/gerente corrige o palpite da IA em 1 clique no card. Grava o novo
 * `intent` (verdade atual) + quem/quando corrigiu, SEM tocar `intentPredicted`
 * (o palpite original da IA é preservado — é a base p/ medir acurácia depois).
 * Caminho separado do updateLead de propósito: é o evento que alimenta o placar
 * "a IA acertou X de Y", então precisa registrar autor/timestamp de forma limpa.
 * Multi-tenant: valida que o lead é da empresa (fecha IDOR).
 */
export async function correctLeadIntent(
  id: string,
  intent: ContactIntent,
  companyId: string,
  correctedByUserId: string,
) {
  if (!VALID_INTENTS.has(intent)) {
    throw businessRuleError("Intenção inválida");
  }
  const lead = await prisma.lead.findFirst({
    where: { id, companyId, deletedAt: null },
    select: { id: true },
  });
  if (!lead) throw notFoundError("Lead não encontrado");

  return prisma.lead.update({
    where: { id },
    data: {
      intent,
      intentCorrectedById: correctedByUserId,
      intentCorrectedAt: new Date(),
      lastActivityAt: new Date(),
      // intentPredicted NÃO entra aqui — preserva o palpite original da IA.
    },
    // select mínimo: o PATCH de intenção não precisa devolver phone/email/userId
    // (minimização LGPD); só o que o card usa p/ refletir a correção.
    select: { id: true, intent: true, intentPredicted: true, lastActivityAt: true },
  });
}

/**
 * Atualiza os campos derivados da IA num lead EXISTENTE durante a
 * RE-QUALIFICAÇÃO (conversa que já é lead recebeu msg nova). Evita o bug de
 * criar lead duplicado a cada ciclo do cron. NÃO toca `intentPredicted` (o
 * palpite ORIGINAL — preserva a telemetria de acurácia) nem `stageId` (quem move
 * é o auto-move/humano, não a re-análise). Multi-tenant: companyId no filtro.
 */
export async function updateLeadAiFields(
  id: string,
  companyId: string,
  aiFields: {
    intent?: ContactIntent;
    contactNotPatient?: boolean;
    urgent?: boolean;
    confidence?: number;
  },
) {
  const lead = await prisma.lead.findFirst({
    where: { id, companyId, deletedAt: null },
    select: { id: true },
  });
  if (!lead) throw notFoundError("Lead não encontrado");

  return prisma.lead.update({
    where: { id },
    data: {
      // intent reflete a "verdade atual" da IA; intentPredicted NÃO muda.
      ...(aiFields.intent ? { intent: aiFields.intent } : {}),
      ...(aiFields.contactNotPatient !== undefined ? { contactNotPatient: aiFields.contactNotPatient } : {}),
      ...(aiFields.urgent !== undefined ? { urgent: aiFields.urgent } : {}),
      ...(aiFields.confidence !== undefined ? { intentConfidence: aiFields.confidence } : {}),
      lastActivityAt: new Date(),
    },
    select: { id: true },
  });
}

/**
 * Gancho de "2ª via de receita" (Fase 3, Item 2): dado um lead com cliente
 * vinculado, devolve a ÚLTIMA receita (grau) desse cliente — para o vendedor
 * responder "sua receita é de DD/MM, válida até DD/MM" sem sair do funil.
 *
 * Multi-tenant em DOIS níveis (fecha IDOR cross-feature): o lead é validado por
 * companyId E a receita é buscada com companyId (nunca casa receita de outra
 * empresa). Retorna null quando: lead sem cliente vinculado, ou cliente sem
 * receita. Só lê dados de grau de quem JÁ foi confirmado como cliente do lead.
 */
export async function getLeadPrescriptionHint(id: string, companyId: string) {
  const lead = await prisma.lead.findFirst({
    where: { id, companyId, deletedAt: null },
    select: { id: true, customerId: true },
  });
  if (!lead) throw notFoundError("Lead não encontrado");
  if (!lead.customerId) return null; // sem cliente confirmado → sem grau a mostrar

  const rx = await prisma.prescription.findFirst({
    where: { customerId: lead.customerId, companyId },
    orderBy: { issuedAt: "desc" },
    select: { id: true, issuedAt: true, expiresAt: true, status: true },
  });
  if (!rx) return null;
  return {
    id: rx.id,
    issuedAt: rx.issuedAt,
    expiresAt: rx.expiresAt,
    status: rx.status,
    // Guard defensivo: linha legada pré-migração pode ter expiresAt null.
    isExpired: rx.expiresAt ? rx.expiresAt.getTime() < Date.now() : false,
  };
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
 * Janela de tempo (opcional) para o placar de conversão: filtra os leads por
 * `createdAt`. `from`/`to` são calculados no servidor (a rota deriva do preset)
 * para não confiar no relógio do cliente. Ambos opcionais e independentes.
 */
export interface LeadStatsRange {
  from?: Date;
  to?: Date;
}

/**
 * Métricas do funil: total, ganhos, taxa de conversão (ganhos/total) e
 * agregações por motivo de perda e por origem. Multi-tenant (companyId) +
 * filtro opcional por filial + filtro opcional por período (createdAt).
 * Ignora leads soft-deletados.
 *
 * `bySourceConversion` responde à pergunta central do dono ("quanto cada origem
 * converte?"): total e ganhos POR origem — o placar mostra a taxa = won/total.
 * Leads sem origem ficam de fora dessa agregação (não há origem a atribuir),
 * mas continuam no `total` global e em `bySource` (volume).
 */
export async function getLeadStats(
  companyId: string,
  branchId: string | null,
  range?: LeadStatsRange
) {
  const where: any = { companyId, deletedAt: null };
  // Mesmo escopo da listagem: leads não-atribuídos (branchId=null) contam em
  // qualquer filial selecionada, senão as métricas do funil ficam zeradas.
  const branchScope = buildLeadBranchScope(branchId);
  if (branchScope) where.AND = [branchScope];
  // NÃO filtramos createdAt na query: o período (Sprint 2, #6) só escopa o PLACAR
  // (conversão/origem/perdas). Os sinais de urgência (SLA, "precisa responder",
  // volume por intenção) precisam refletir TODOS os leads abertos AGORA — um lead
  // aberto há 40 dias esperando resposta não pode sumir do alerta porque o dono
  // olhou "últimos 30 dias" (regra do dono: nunca perder lead aguardando resposta).
  const leads = await prisma.lead.findMany({
    where,
    select: {
      id: true,
      source: true,
      lostReason: true,
      lastActivityAt: true,
      createdAt: true,
      // Telemetria de acurácia (par palpite×atual) + volume por intenção (Fase 3).
      intent: true,
      intentPredicted: true,
      stage: { select: { isWon: true, isLost: true } },
    },
  });
  // Placar = só os leads criados dentro da janela escolhida (in-memory: negócio
  // pequeno, 1-4 filiais; evita 2ª query e mantém SLA/atenção sobre o conjunto todo).
  const inRange = (l: { createdAt: Date }): boolean => {
    if (range?.from && l.createdAt < range.from) return false;
    if (range?.to && l.createdAt > range.to) return false;
    return true;
  };
  const scoredLeads = leads.filter(inRange);
  const total = scoredLeads.length;
  const won = scoredLeads.filter((l) => l.stage.isWon).length;
  const byLostReason: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  // Conversão por origem (Sprint 2, #6): total e ganhos de cada origem — o placar
  // deriva a taxa. Só origens explícitas (l.source truthy): sem origem = sem
  // atribuição confiável, não infla nem dilui a taxa de nenhuma origem real.
  const bySourceConversion: Record<string, { total: number; won: number }> = {};
  // Placar (escopado ao período): perdas por motivo + volume/conversão por origem.
  for (const l of scoredLeads) {
    if (l.stage.isLost && l.lostReason) {
      byLostReason[l.lostReason] = (byLostReason[l.lostReason] ?? 0) + 1;
    }
    if (l.source) {
      bySource[l.source] = (bySource[l.source] ?? 0) + 1;
      const agg = (bySourceConversion[l.source] ??= { total: 0, won: 0 });
      agg.total += 1;
      if (l.stage.isWon) agg.won += 1;
    }
  }
  // Volume por intenção = demanda VIVA (só leads abertos), sobre TODOS os leads —
  // é sinal de "o que pedem agora", não deve ser cortado pela janela do placar.
  const byIntent: Record<string, number> = {};
  for (const l of leads) {
    if (l.intent && !l.stage.isWon && !l.stage.isLost) {
      byIntent[l.intent] = (byIntent[l.intent] ?? 0) + 1;
    }
  }
  const aiAccuracy = computeIntentAccuracy(leads);
  // Gold set (Item 5): acurácia POR intenção das correções humanas reais — mostra
  // ONDE a IA erra e destrava a Fase 4 (automação por intenção com acurácia >= piso).
  const aiAccuracyByIntent = computeIntentAccuracyByIntent(leads);
  // SLA AFIADO (Item 5): "precisa responder" = a bola está com a ótica (cliente
  // engajou, sem outbound). Só p/ leads ABERTOS (os únicos que aguardam resposta).
  const openLeadIds = leads.filter((l) => !l.stage.isWon && !l.stage.isLost).map((l) => l.id);
  const needsReplyByLead = await computeNeedsReplyLeadIds(companyId, openLeadIds);
  const slaRows = leads.map((l) => {
    // waitingSince (#5): o relógio do "precisa responder" conta desde a mensagem
    // do CLIENTE sem resposta, não desde lastActivityAt (que nem muda com WhatsApp).
    const waitingSince = needsReplyByLead.get(l.id);
    return {
      id: l.id,
      lastActivityAt: l.lastActivityAt,
      stage: l.stage,
      // undefined p/ leads sem conversa (o Map só tem os que precisam responder;
      // ausência = ou já respondida, ou sem conversa → o SLA não conta como precisa).
      needsReply: waitingSince ? true : undefined,
      // Só presente quando precisa responder — o SLA usa isto como relógio afiado.
      waitingSince,
    };
  });
  const sla = computeLeadSla(slaRows, new Date());
  return {
    total,
    won,
    conversionRate: total ? won / total : 0,
    byLostReason,
    bySource,
    bySourceConversion,
    byIntent,
    aiAccuracy,
    aiAccuracyByIntent,
    sla,
  };
}
