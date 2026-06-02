import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { addClientMessage } from "@/services/support.service";
import { clientTicketMessageSchema } from "@/lib/validations/support.schema";

/**
 * POST /api/support/tickets/[id]/messages — cliente responde um chamado.
 * O serviço valida que o ticket é da empresa (anti-leak) e bloqueia se terminal.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const companyId = session.user.companyId;
    const userId = session.user.id;
    const { id: ticketId } = await params;

    const { message } = clientTicketMessageSchema.parse(await request.json());

    const user = await prisma.user.findFirst({
      where: { id: userId, companyId },
      select: { name: true },
    });
    if (!user) {
      return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
    }

    const created = await addClientMessage({
      ticketId,
      companyId,
      userId,
      authorName: user.name,
      message,
    });

    return NextResponse.json({ success: true, message: created }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Dados inválidos", details: error.issues } },
        { status: 400 }
      );
    }
    return handleApiError(error);
  }
}
