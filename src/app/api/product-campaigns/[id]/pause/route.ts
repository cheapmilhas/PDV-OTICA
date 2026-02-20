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

    // Converter Decimals para Number (JSON.parse/stringify converte automaticamente)
    const serializedCampaign = JSON.parse(JSON.stringify(campaign));

    return NextResponse.json({
      success: true,
      data: serializedCampaign,
      message: "Campanha pausada com sucesso",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
