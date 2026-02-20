import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
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
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Não autenticado" } },
        { status: 401 }
      );
    }

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
