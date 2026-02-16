import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { successResponse } from "@/lib/api-response";
import { z } from "zod";

const followUpSchema = z.object({
  followUpDate: z.string().datetime().optional().nullable(),
  followUpNotes: z.string().optional().nullable(),
  incrementContact: z.boolean().optional(), // Se true, incrementa contactCount
});

/**
 * PUT /api/quotes/[id]/follow-up
 * Atualiza informações de follow-up do orçamento
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    const { id } = await params;

    const body = await request.json();
    const { followUpDate, followUpNotes, incrementContact } = followUpSchema.parse(body);

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

    // Preparar dados para atualização
    const updateData: any = {};

    if (followUpDate !== undefined) {
      updateData.followUpDate = followUpDate ? new Date(followUpDate) : null;
    }

    if (followUpNotes !== undefined) {
      updateData.followUpNotes = followUpNotes;
    }

    if (incrementContact) {
      updateData.contactCount = { increment: 1 };
      updateData.lastContactAt = new Date();
    }

    // Atualizar orçamento
    const updated = await prisma.quote.update({
      where: { id },
      data: updateData,
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
      message: "Follow-up atualizado com sucesso",
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * GET /api/quotes/[id]/follow-up
 * Retorna histórico de follow-up
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    const { id } = await params;

    const quote = await prisma.quote.findFirst({
      where: {
        id,
        companyId,
      },
      select: {
        id: true,
        followUpDate: true,
        followUpNotes: true,
        contactCount: true,
        lastContactAt: true,
        sentAt: true,
        sentVia: true,
      },
    });

    if (!quote) {
      return NextResponse.json(
        { error: "Orçamento não encontrado" },
        { status: 404 }
      );
    }

    return successResponse(quote);
  } catch (error) {
    return handleApiError(error);
  }
}
