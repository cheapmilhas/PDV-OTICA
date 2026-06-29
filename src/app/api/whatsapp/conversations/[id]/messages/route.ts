import { NextRequest } from "next/server";
import { requireAuth, getCompanyId, requirePermission } from "@/lib/auth-helpers";
import { successResponse } from "@/lib/api-response";
import { handleApiError, notFoundError } from "@/lib/error-handler";
import { getConversationMessages } from "@/services/whatsapp-inbox.service";

/**
 * GET /api/whatsapp/conversations/[id]/messages
 * Thread de mensagens de UMA conversa, tenant-guarded.
 * Permissão: leads.access. 404 se a conversa não for da empresa.
 */
export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await requireAuth();
    await requirePermission("leads.access");
    const companyId = await getCompanyId();
    const { id } = await ctx.params;

    const messages = await getConversationMessages(companyId, id);
    if (messages === null) throw notFoundError("Conversa não encontrada");

    return successResponse(messages);
  } catch (error) {
    return handleApiError(error);
  }
}
