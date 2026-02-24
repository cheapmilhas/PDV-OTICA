import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { requirePermission } from "@/lib/auth-permissions";
import { handleApiError } from "@/lib/error-handler";
import { successResponse } from "@/lib/api-response";
import { z } from "zod";

const markSentSchema = z.object({
  sent: z.boolean(),
  sentVia: z.enum(["whatsapp", "email", "presencial", "sms"]).optional(),
});

/**
 * PUT /api/quotes/[id]/mark-sent
 * Marca/desmarca orçamento como enviado
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("quotes.edit");
    const companyId = await getCompanyId();
    const { id } = await params;

    const body = await request.json();
    const { sent, sentVia } = markSentSchema.parse(body);

    // Verificar se o orçamento existe e pertence à empresa
    const quote = await prisma.quote.findFirst({
      where: {
        id,
        companyId,
      },
    });

    if (!quote) {
      return NextResponse.json(
        { error: "Orçamento não encontrado" },
        { status: 404 }
      );
    }

    // Atualizar status de envio
    const updated = await prisma.quote.update({
      where: { id },
      data: {
        sentAt: sent ? new Date() : null,
        sentVia: sent ? sentVia || "whatsapp" : null,
      },
      include: {
        customer: true,
        sellerUser: {
          select: {
            id: true,
            name: true,
          },
        },
        branch: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: updated,
      message: sent ? "Orçamento marcado como enviado" : "Marcação removida",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
