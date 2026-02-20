import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import * as crmService from "@/services/crm.service";

export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();

    const templates = await crmService.getTemplates(companyId);

    return NextResponse.json({
      success: true,
      data: templates,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
