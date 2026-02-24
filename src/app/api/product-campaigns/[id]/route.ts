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

const updateCampaignSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  startDate: z.string().transform((str) => new Date(str)).optional(),
  endDate: z.string().transform((str) => new Date(str)).optional(),
  allowStacking: z.boolean().optional(),
  priority: z.number().int().optional(),

  // Campos de regras (bloqueados se há bônus gerados)
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

  items: z
    .array(
      z.object({
        productId: z.string().optional(),
        categoryId: z.string().optional(),
        brandId: z.string().optional(),
        supplierId: z.string().optional(),
      })
    )
    .optional(),
});

// ============================================================================
// GET /api/product-campaigns/[id]
// ============================================================================

export async function GET(
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

    const campaign = await campaignService.getCampaignById(id, companyId);

    if (!campaign) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Campanha não encontrada" } },
        { status: 404 }
      );
    }

    // Converter Decimals para Number
    const serializedCampaign = JSON.parse(JSON.stringify(campaign));

    return NextResponse.json({
      success: true,
      data: serializedCampaign,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// ============================================================================
// PATCH /api/product-campaigns/[id]
// ============================================================================

export async function PATCH(
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
    await requirePermission("settings.edit");

    const companyId = await getCompanyId();
    const { id } = await context.params;
    const body = await request.json();

    const validatedData = updateCampaignSchema.parse(body);

    const campaign = await campaignService.updateCampaign(
      id,
      companyId,
      validatedData as any
    );

    // Converter Decimals para Number
    const serializedCampaign = JSON.parse(JSON.stringify(campaign));

    return NextResponse.json({
      success: true,
      data: serializedCampaign,
      message: "Campanha atualizada com sucesso",
    });
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

// ============================================================================
// DELETE /api/product-campaigns/[id]
// ============================================================================

export async function DELETE(
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
    await requirePermission("settings.edit");

    const companyId = await getCompanyId();
    const { id } = await context.params;

    await campaignService.endCampaign(id, companyId);

    return NextResponse.json({
      success: true,
      message: "Campanha encerrada com sucesso",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
