import { NextResponse } from "next/server";
import { SystemRuleService } from "@/services/system-rule.service";
import { upsertSystemRuleSchema } from "@/lib/validations/system-rule.schema";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { requirePermission } from "@/lib/auth-permissions";
import { Permission } from "@/lib/permissions";
import { handleApiError } from "@/lib/error-handler";
import { successResponse } from "@/lib/api-response";

const systemRuleService = new SystemRuleService();

/**
 * GET /api/settings/rules
 * Lista todas as regras da empresa (ou defaults)
 */
export async function GET(request: Request) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();

    const { searchParams } = new URL(request.url);
    const categoryParam = searchParams.get("category");

    const filters: any = categoryParam ? { category: categoryParam } : {};
    // @ts-ignore - TypeScript não reconhece o tipo correto do filtro
    const rules = await systemRuleService.list(companyId, filters);

    return successResponse(rules);
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/settings/rules
 * Cria ou atualiza uma regra
 *
 * Requer permissão: SETTINGS_EDIT (ADMIN apenas)
 */
export async function POST(request: Request) {
  try {
    await requirePermission(Permission.SETTINGS_EDIT);
    const companyId = await getCompanyId();

    const body = await request.json();
    const data = upsertSystemRuleSchema.parse(body);

    const rule = await systemRuleService.upsert(data, companyId);

    return successResponse(rule);
  } catch (error) {
    return handleApiError(error);
  }
}
