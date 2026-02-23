import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import * as crmService from "@/services/crm.service";
import { CustomerSegment, CrmReminderStatus } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    const { searchParams } = new URL(request.url);

    const filters = {
      segment: searchParams.get("segment") as CustomerSegment | undefined,
      status: searchParams.get("status") as CrmReminderStatus | undefined,
      assignedToId: searchParams.get("assignedToId") || undefined,
      customerId: searchParams.get("customerId") || undefined,
      search: searchParams.get("search") || undefined,
      page: parseInt(searchParams.get("page") || "1"),
      pageSize: parseInt(searchParams.get("pageSize") || "20"),
    };

    const result = await crmService.getReminders(companyId, filters);

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();

    const result = await crmService.generateReminders(companyId);

    return NextResponse.json({
      success: true,
      data: result,
      message: `${result.generated} lembretes gerados com sucesso`,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
