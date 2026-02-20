import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { z } from "zod";
import * as campaignService from "@/services/product-campaign.service";

const simulateSchema = z.object({
  quantity: z.number().int().min(0),
});

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
    const body = await request.json();

    const { quantity } = simulateSchema.parse(body);

    const simulation = await campaignService.simulateBonus(
      id,
      companyId,
      quantity
    );

    // Converter Decimals para Number
    const serializedSimulation = JSON.parse(JSON.stringify(simulation));

    return NextResponse.json({
      success: true,
      data: serializedSimulation,
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
