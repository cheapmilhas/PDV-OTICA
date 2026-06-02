import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";

/**
 * GET /api/support/tickets/[id] — detalhe de um ticket da empresa do usuário.
 * Anti-leak: 404 se o ticket não for da empresa (não revela existência).
 * M3: mensagens servidas ao cliente SEMPRE com isInternal=false (sem nota interna).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const companyId = session.user.companyId;
    const { id } = await params;

    const ticket = await prisma.supportTicket.findFirst({
      where: { id, companyId },
      select: {
        id: true,
        number: true,
        subject: true,
        description: true,
        priority: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        slaDeadline: true,
        resolvedAt: true,
        messages: {
          where: { isInternal: false },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            authorType: true,
            authorName: true,
            message: true,
            attachments: true,
            createdAt: true,
          },
        },
      },
    });

    if (!ticket) {
      return NextResponse.json({ error: "Ticket não encontrado" }, { status: 404 });
    }

    return NextResponse.json({ ticket });
  } catch (error) {
    return handleApiError(error);
  }
}
