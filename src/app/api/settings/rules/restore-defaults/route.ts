import { SystemRuleService } from "@/services/system-rule.service";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { requirePermission } from "@/lib/auth-permissions";
import { Permission } from "@/lib/permissions";
import { handleApiError } from "@/lib/error-handler";
import { successResponse } from "@/lib/api-response";

const systemRuleService = new SystemRuleService();

/**
 * POST /api/settings/rules/restore-defaults
 * Restaura todas as regras para os valores padrão
 *
 * Requer permissão: SETTINGS_MANAGE (ADMIN apenas)
 */
export async function POST(request: Request) {
  try {
    await requirePermission(Permission.SETTINGS_MANAGE);
    const companyId = await getCompanyId();

    const rules = await systemRuleService.restoreDefaults(companyId);

    return successResponse({
      message: "Regras restauradas para valores padrão",
      count: rules.length,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
