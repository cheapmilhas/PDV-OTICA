import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import * as crmService from "@/services/crm.service";
import { z } from "zod";
import { CustomerSegment, ContactResult } from "@prisma/client";

const contactSchema = z.object({
  customerId: z.string(),
  reminderId: z.string().optional(),
  channel: z.string(),
  segment: z.nativeEnum(CustomerSegment),
  result: z.nativeEnum(ContactResult),
  notes: z.string().optional(),
  scheduleFollowUp: z.boolean().optional(),
  followUpDate: z.string().optional().transform(str => str ? new Date(str) : undefined),
  followUpNotes: z.string().optional(),
  saleId: z.string().optional(),
  saleAmount: z.number().optional(),
});

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
    const validatedData = contactSchema.parse(body);

    const contact = await crmService.registerContact({
      companyId,
      contactedById: session.user.id,
      ...validatedData,
    });

    return NextResponse.json({
      success: true,
      data: contact,
      message: "Contato registrado com sucesso",
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
