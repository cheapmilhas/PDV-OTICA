import { prisma } from "@/lib/prisma";
import { softDeleteFilter } from "@/lib/soft-delete";
import { notFoundError, businessRuleError } from "@/lib/error-handler";
import type { CreateLeadDTO } from "@/lib/validations/lead.schema";

export async function createLead(
  data: CreateLeadDTO,
  companyId: string,
  userId: string,
  branchId: string | null
) {
  // Resolve a etapa: usa a fornecida (validada por empresa) ou a 1ª (menor order)
  let stageId = data.stageId;
  if (stageId) {
    const stage = await prisma.leadStage.findFirst({
      where: { id: stageId, companyId },
      select: { id: true },
    });
    if (!stage) throw notFoundError("Etapa inválida");
  } else {
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
