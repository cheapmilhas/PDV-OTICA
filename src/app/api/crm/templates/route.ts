import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import * as crmService from "@/services/crm.service";
import { z } from "zod";
import { CustomerSegment } from "@prisma/client";

const templateSchema = z.object({
  segment: z.nativeEnum(CustomerSegment),
  name: z.string(),
  message: z.string(),
  channel: z.string().optional(),
  isActive: z.boolean().optional(),
});

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

export async function POST(request: NextRequest) {
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
    const validatedData = templateSchema.parse(body);

    const template = await crmService.upsertTemplate({
      companyId,
      createdById: session.user.id,
      ...validatedData,
    });

    return NextResponse.json({
      success: true,
      data: template,
      message: "Template salvo com sucesso",
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
