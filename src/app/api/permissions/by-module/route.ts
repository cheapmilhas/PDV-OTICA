import { NextResponse } from "next/server";
import { getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { PermissionService } from "@/services/permission.service";

/**
 * GET /api/permissions/by-module
 * Lista permissões agrupadas por módulo
 */
export async function GET() {
  try {
    await getCompanyId(); // Valida autenticação

    const service = new PermissionService();
    const permissionsByModule = await service.getPermissionsByModule();

    return NextResponse.json(permissionsByModule);
  } catch (error) {
    return handleApiError(error);
  }
}
