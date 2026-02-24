import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { requirePermission } from "@/lib/auth-permissions";
import { handleApiError } from "@/lib/error-handler";
import * as crmService from "@/services/crm.service";

export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();

    const settings = await crmService.getOrCreateSettings(companyId);

    return NextResponse.json({
      success: true,
      data: settings,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requirePermission("settings.edit");
    const companyId = await getCompanyId();
    const body = await request.json();

    const settings = await crmService.updateSettings(companyId, body);

    return NextResponse.json({
      success: true,
      data: settings,
      message: "Configurações atualizadas com sucesso",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
