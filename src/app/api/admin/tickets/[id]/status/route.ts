import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, requireSupportScope } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import { updateTicketStatus } from "@/services/support.service";
import { handleApiError } from "@/lib/error-handler";
import { z } from "zod";
import { logger } from "@/lib/logger";

const log = logger.child({ route: "admin/tickets/[id]/status" });

const statusSchema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "WAITING_CUSTOMER", "RESOLVED", "CLOSED"]),
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await getAdminSession();
    if (!admin) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }
    const { id } = await context.params;
    const { status } = statusSchema.parse(await request.json());

    // C1: ticket deve existir E admin precisa de escopo na empresa dele.
    const ticket = await prisma.supportTicket.findUnique({
      where: { id },
      select: { companyId: true },
    });
    if (!ticket) {
      return NextResponse.json({ error: "Ticket não encontrado" }, { status: 404 });
    }
    const scoped = await requireSupportScope(admin.id, ticket.companyId);
    if (!scoped) {
      return NextResponse.json({ error: "Sem permissão para este ticket" }, { status: 403 });
    }

    const updated = await updateTicketStatus({ ticketId: id, status });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Status inválido", details: error.issues } },
        { status: 400 }
      );
    }
    log.error("Erro ao atualizar status", { error: error instanceof Error ? error.message : String(error) });
    return handleApiError(error);
  }
}
