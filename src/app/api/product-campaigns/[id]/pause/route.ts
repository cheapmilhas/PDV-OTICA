import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import * as campaignService from "@/services/product-campaign.service";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Não autenticado" } },
        { status: 401 }
      );
    }

    const companyId = await getCompanyId();
    const { id } = await context.params;

    const campaign = await campaignService.pauseCampaign(id, companyId);

    return NextResponse.json({
      success: true,
      data: campaign,
      message: "Campanha pausada com sucesso",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
