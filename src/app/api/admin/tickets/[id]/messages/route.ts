import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { logger } from "@/lib/logger";

const log = logger.child({ route: "admin/tickets/[id]/messages" });

const messageSchema = z.object({
  content: z.string().min(1, "Mensagem não pode estar vazia"),
  isInternal: z.boolean().default(false),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await getAdminSession();
    if (!admin) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }
    const { id: ticketId } = await context.params;
    const body = await request.json();
    const { content, isInternal } = messageSchema.parse(body);

    const message = await prisma.supportMessage.create({
      data: {
        ticketId,
        message: content,
        isInternal,
        authorId: admin.id,
        authorType: "ADMIN",
        authorName: admin.name,
      },
    });

    // Atualizar última atividade do ticket
    await prisma.supportTicket.update({
      where: { id: ticketId },
      data: { updatedAt: new Date() },
    });

    return NextResponse.json({
      success: true,
      data: message,
    });
  } catch (error) {
    log.error("Erro ao criar mensagem", { error: error instanceof Error ? error.message : String(error) });

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

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Erro ao criar mensagem",
        },
      },
      { status: 500 }
    );
  }
}
