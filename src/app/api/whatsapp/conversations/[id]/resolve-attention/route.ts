import { NextResponse } from "next/server";
import { requireAuth, getCompanyId, requirePermission } from "@/lib/auth-helpers";
import { resolveConversationAttention } from "@/services/conversation-attention-resolve.service";
import { handleApiError, notFoundError } from "@/lib/error-handler";

/**
 * POST /api/whatsapp/conversations/[id]/resolve-attention
 * Baixa HUMANA do guardrail de atenção (Item 1). Marca a conversa como tratada
 * (needsHumanAttention=false) gravando quem/quando. Só apaga o alarme por AÇÃO
 * humana — a IA nunca o apaga (monotônico-pra-cima). Multi-tenant.
 */
export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    // Mesma permissão de gerir leads/funil — quem cuida do funil dá baixa no alarme.
    await requirePermission("leads.edit");
    const companyId = await getCompanyId();
    const { id } = await ctx.params;

    const ok = await resolveConversationAttention(companyId, id, session.user.id);
    if (!ok) throw notFoundError("Conversa não encontrada");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
