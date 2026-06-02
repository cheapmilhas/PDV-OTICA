import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, requireSupportScope } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import { addAdminMessage } from "@/services/support.service";
import { handleApiError } from "@/lib/error-handler";
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

    // C1: o ticket precisa existir E o admin precisa ter escopo na empresa dele.
    const ticket = await prisma.supportTicket.findUnique({
      where: { id: ticketId },
      select: { companyId: true },
    });
    if (!ticket) {
      return NextResponse.json({ error: "Ticket não encontrado" }, { status: 404 });
    }
    const scoped = await requireSupportScope(admin.id, ticket.companyId);
    if (!scoped) {
      return NextResponse.json({ error: "Sem permissão para este ticket" }, { status: 403 });
    }

    const message = await addAdminMessage({
      ticketId,
      adminId: admin.id,
      adminName: admin.name,
      message: content,
      isInternal,
    });

    return NextResponse.json({ success: true, data: message });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Dados inválidos", details: error.issues } },
        { status: 400 }
      );
    }
    log.error("Erro ao criar mensagem", { error: error instanceof Error ? error.message : String(error) });
    return handleApiError(error);
  }
}
