import { NextRequest } from "next/server";
import { requireAuth, getCompanyId, requirePermission } from "@/lib/auth-helpers";
import { successResponse } from "@/lib/api-response";
import { handleApiError } from "@/lib/error-handler";
import {
  listInboxConversations,
  type InboxStatusFilter,
} from "@/services/whatsapp-inbox.service";

/**
 * GET /api/whatsapp/conversations
 * Lista conversas de WhatsApp da empresa para a aba "Conversas" do Funil.
 * Permissão: leads.access (mesma do funil). Sempre escopado por companyId.
 *
 * Query params:
 *   status = pending | analyzed | all (default all)
 *   take   = 1..200 (default 50)
 */
export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    await requirePermission("leads.access");
    const companyId = await getCompanyId();

    const { searchParams } = new URL(request.url);
    const statusRaw = searchParams.get("status");
    const status: InboxStatusFilter =
      statusRaw === "pending" || statusRaw === "analyzed" ? statusRaw : "all";
    const takeRaw = Number(searchParams.get("take"));
    const take = Number.isFinite(takeRaw) && takeRaw > 0 ? takeRaw : undefined;

    const conversations = await listInboxConversations(companyId, { status, take });
    return successResponse(conversations);
  } catch (error) {
    return handleApiError(error);
  }
}
