import { NextResponse } from "next/server";
import { SystemRuleService } from "@/services/system-rule.service";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { requirePermission } from "@/lib/auth-permissions";
import { Permission } from "@/lib/permissions";
import { handleApiError } from "@/lib/error-handler";
import { successResponse } from "@/lib/api-response";

const systemRuleService = new SystemRuleService();

/**
 * GET /api/settings/rules/[key]
 * Busca regra por key
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    const { key } = await params;

    const value = await systemRuleService.get(key, companyId);

    return successResponse({ key, value });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/settings/rules/[key]
 * Remove regra customizada (volta ao default)
 *
 * Requer permissão: SETTINGS_MANAGE (ADMIN apenas)
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    await requirePermission(Permission.SETTINGS_MANAGE);
    const companyId = await getCompanyId();
    const { key } = await params;

    await systemRuleService.delete(key, companyId);

    return successResponse({ message: "Regra removida, usando valor padrão" });
  } catch (error) {
    return handleApiError(error);
  }
}
