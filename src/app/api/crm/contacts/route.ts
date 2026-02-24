import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { requirePermission } from "@/lib/auth-permissions";
import { handleApiError } from "@/lib/error-handler";
import * as crmService from "@/services/crm.service";
import { z } from "zod";
import { CustomerSegment, ContactResult } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get("customerId");

    if (!customerId) {
      return NextResponse.json(
        { error: { code: "BAD_REQUEST", message: "customerId é obrigatório" } },
        { status: 400 }
      );
    }

    const contacts = await crmService.getContactsByCustomer(companyId, customerId);

    return NextResponse.json({
      success: true,
      data: JSON.parse(JSON.stringify(contacts)),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

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
    const session = await requirePermission("reminders.view");
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
