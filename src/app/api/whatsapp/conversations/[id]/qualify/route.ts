import { NextResponse } from "next/server";
import { getCompanyId, requirePermission } from "@/lib/auth-helpers";
import { assertAiAllowed } from "@/lib/ai-guard";
import { prisma } from "@/lib/prisma";
import { qualifyConversation } from "@/services/conversation-qualifier.service";
import { handleApiError, notFoundError } from "@/lib/error-handler";

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission("leads.create");
    const companyId = await getCompanyId();
    const { id } = await ctx.params;

    const conv = await prisma.whatsappConversation.findUnique({ where: { id }, select: { id: true, companyId: true } });
    if (!conv || conv.companyId !== companyId) throw notFoundError("Conversa não encontrada");

    // Caminho 1-a-1: respeita a flag/cota de IA (lança 403/400 se bloqueado).
    await assertAiAllowed(companyId);

    const result = await qualifyConversation(id, { force: true });
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
