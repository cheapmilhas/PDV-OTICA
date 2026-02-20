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

    const campaign = await campaignService.activateCampaign(id, companyId);

    // Converter Decimals para Number
    const serializedCampaign = {
      ...campaign,
      bonusPerUnit: campaign.bonusPerUnit ? Number(campaign.bonusPerUnit) : null,
      minimumCount: campaign.minimumCount,
      fixedBonusAmount: campaign.fixedBonusAmount ? Number(campaign.fixedBonusAmount) : null,
      packageSize: campaign.packageSize,
      bonusPerPackage: campaign.bonusPerPackage ? Number(campaign.bonusPerPackage) : null,
      maxBonusPerSale: campaign.maxBonusPerSale ? Number(campaign.maxBonusPerSale) : null,
      maxBonusPerDay: campaign.maxBonusPerDay ? Number(campaign.maxBonusPerDay) : null,
      maxBonusPerMonth: campaign.maxBonusPerMonth ? Number(campaign.maxBonusPerMonth) : null,
      maxBonusTotal: campaign.maxBonusTotal ? Number(campaign.maxBonusTotal) : null,
    };

    return NextResponse.json({
      success: true,
      data: serializedCampaign,
      message: "Campanha ativada com sucesso",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
