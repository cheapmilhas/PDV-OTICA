import { NextResponse } from "next/server";
import { getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { PermissionService } from "@/services/permission.service";

/**
 * GET /api/permissions
 * Lista todas as permissões do catálogo
 */
export async function GET() {
  try {
    await getCompanyId(); // Valida autenticação

    const service = new PermissionService();
    const permissions = await service.getAllPermissions();

    return NextResponse.json(permissions);
  } catch (error) {
    return handleApiError(error);
  }
}
