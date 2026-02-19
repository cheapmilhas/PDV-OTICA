import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const statusSchema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "WAITING_CUSTOMER", "RESOLVED", "CLOSED"]),
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const { status } = statusSchema.parse(body);

    const updateData: any = { status };

    // Se estiver marcando como resolvido, adicionar timestamp
    if (status === "RESOLVED" || status === "CLOSED") {
      updateData.resolvedAt = new Date();
    }

    const ticket = await prisma.supportTicket.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      data: ticket,
    });
  } catch (error) {
    console.error("❌ Erro ao atualizar status:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Status inválido",
            details: error.issues,
          },
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Erro ao atualizar status",
        },
      },
      { status: 500 }
    );
  }
}
