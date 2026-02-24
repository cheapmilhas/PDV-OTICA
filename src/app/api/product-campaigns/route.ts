import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getCompanyId } from "@/lib/auth-helpers";
import { requirePermission } from "@/lib/auth-permissions";
import { handleApiError } from "@/lib/error-handler";
import { z } from "zod";
import * as campaignService from "@/services/product-campaign.service";

// ============================================================================
// SCHEMA DE VALIDAÇÃO
// ============================================================================

const createCampaignSchema = z.object({
  branchId: z.string().optional(),
  scope: z.enum(["SELLER", "BRANCH", "BOTH"]),
  name: z.string().min(1, "Nome é obrigatório"),
  description: z.string().optional(),
  startDate: z.string().transform((str) => new Date(str)),
  endDate: z.string().transform((str) => new Date(str)),
  bonusType: z.enum([
    "PER_UNIT",
    "MINIMUM_FIXED",
    "MINIMUM_PER_UNIT",
    "PER_PACKAGE",
    "TIERED",
  ]),
  countMode: z.enum(["BY_QUANTITY", "BY_ITEM", "BY_SALE"]),
  allowStacking: z.boolean().optional(),
  priority: z.number().int().optional(),

  // Campos específicos por tipo
  bonusPerUnit: z.number().optional(),
  minimumCount: z.number().int().optional(),
  minimumCountMode: z.enum(["AFTER_MINIMUM", "FROM_MINIMUM"]).optional(),
  fixedBonusAmount: z.number().optional(),
  packageSize: z.number().int().optional(),
  bonusPerPackage: z.number().optional(),
  tiers: z
    .array(
      z.object({
        from: z.number().int(),
        to: z.number().int().optional(),
        bonus: z.number(),
      })
    )
    .optional(),

  // Itens da campanha
  items: z.array(
    z.object({
      productId: z.string().optional(),
      categoryId: z.string().optional(),
      brandId: z.string().optional(),
      supplierId: z.string().optional(),
    })
  ),
});

// ============================================================================
// GET /api/product-campaigns
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Não autenticado" } },
        { status: 401 }
      );
    }

    const companyId = await getCompanyId();
    const { searchParams } = new URL(request.url);

    const filter: campaignService.CampaignFilter = {
      companyId,
      branchId: searchParams.get("branchId") || undefined,
      status: (searchParams.get("status") as any) || undefined,
      scope: (searchParams.get("scope") as any) || undefined,
      active: searchParams.get("active") === "true",
    };

    const campaigns = await campaignService.getCampaigns(filter);

    // Converter Decimals para Number
    const serializedCampaigns = JSON.parse(JSON.stringify(campaigns));

    return NextResponse.json({
      success: true,
      data: serializedCampaigns,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================================================
// POST /api/product-campaigns
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Não autenticado" } },
        { status: 401 }
      );
    }
    await requirePermission("sales.view");

    const companyId = await getCompanyId();
    const body = await request.json();

    const validatedData = createCampaignSchema.parse(body);

    const campaign = await campaignService.createCampaign({
      ...validatedData,
      companyId,
      createdById: session.user.id,
    });

    // Converter Decimals para Number
    const serializedCampaign = JSON.parse(JSON.stringify(campaign));

    return NextResponse.json(
      {
        success: true,
        data: serializedCampaign,
        message: "Campanha criada com sucesso",
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Dados inválidos",
            details: error.issues,
          },
        },
        { status: 400 }
      );
    }

    return handleApiError(error);
  }
}
