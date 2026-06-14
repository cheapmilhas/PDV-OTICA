import { NextRequest } from "next/server";
import { requireAuth, getCompanyId, requirePermission } from "@/lib/auth-helpers";
import { paginatedResponse, createdResponse } from "@/lib/api-response";
import { requireWriteAccess } from "@/lib/subscription";
import { handleApiError } from "@/lib/error-handler";
import { PermissionService } from "@/services/permission.service";
import { listLeads, createLead } from "@/services/lead.service";
import { createLeadSchema, leadQuerySchema } from "@/lib/validations/lead.schema";

const permissionService = new PermissionService();

/**
 * GET /api/leads
 * Lista leads paginados. ADMIN ou quem tem `leads.view_all` vê todos; os demais
 * veem apenas os próprios (filtro por sellerUserId).
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();
    await requirePermission("leads.access");
    const companyId = await getCompanyId();
    const userId = session.user.id;

    const { searchParams } = new URL(request.url);
    const query = leadQuerySchema.parse(Object.fromEntries(searchParams));

    const branchId = searchParams.get("branchId");
    const effectiveBranchId = branchId && branchId !== "ALL" ? branchId : null;

    const viewAll =
      session.user.role === "ADMIN" ||
      (await permissionService.userHasPermission(userId, "leads.view_all"));

    const result = await listLeads(query, companyId, effectiveBranchId, { viewAll, userId });
    return paginatedResponse(result.data, result.pagination);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/leads
 * Cria um novo lead (só `name` é obrigatório). Bloqueia assinatura inadimplente
 * via requireWriteAccess. Retorna `duplicateWarning` (aviso não-bloqueante).
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    const companyId = await getCompanyId();
    await requireWriteAccess(companyId);
    await requirePermission("leads.create");
    const userId = session.user.id;
    const branchId = session.user.branchId ?? null;

    const data = createLeadSchema.parse(await request.json());
    const { lead, duplicateWarning } = await createLead(data, companyId, userId, branchId);

    return createdResponse({
      ...lead,
      estimatedValue: lead.estimatedValue == null ? null : Number(lead.estimatedValue),
      duplicateWarning,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
