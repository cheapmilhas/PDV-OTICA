import { NextResponse } from "next/server";
import { requireAuth, getCompanyId, requirePermission } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { settingsService } from "@/services/settings.service";
import { companySettingsSchema } from "@/lib/validations/settings.schema";

// GET - Buscar configurações
export async function GET() {
  try {
    await requireAuth();
    const companyId = await getCompanyId();

    const settings = await settingsService.get(companyId);

    return NextResponse.json({
      success: true,
      data: settings,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// PUT - Atualizar configurações
export async function PUT(request: Request) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    await requirePermission("settings.edit");

    const body = await request.json();
    const data = companySettingsSchema.parse(body);

    const settings = await settingsService.update(companyId, data);

    return NextResponse.json({
      success: true,
      data: settings,
      message: "Configurações salvas com sucesso",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
