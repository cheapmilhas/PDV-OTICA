import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { createTicketByClient } from "@/services/support.service";
import { createClientTicketSchema } from "@/lib/validations/support.schema";

/**
 * GET /api/support/tickets — lista os tickets da empresa do usuário.
 * Inclui contagem de mensagens, NUNCA expõe nota interna (M3 — sem preview de msg).
 */
export async function GET() {
  try {
    const session = await requireAuth();
    const companyId = session.user.companyId;

    const tickets = await prisma.supportTicket.findMany({
      where: { companyId },
      orderBy: { updatedAt: "desc" },
      take: 200,
      select: {
        id: true,
        number: true,
        subject: true,
        priority: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        slaDeadline: true,
        // Sem campo de mensagem aqui → nenhum risco de vazar isInternal no preview.
      },
    });

    return NextResponse.json({ tickets });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/support/tickets — cliente abre um chamado.
 * Sem requireWriteAccess de propósito: cliente inadimplente precisa poder pedir
 * ajuda (mesma lógica de estornos ficarem sem gate).
 */
export async function POST(request: Request) {
  try {
    const session = await requireAuth();
    const companyId = session.user.companyId;
    const userId = session.user.id;

    const { subject, description, priority } = createClientTicketSchema.parse(await request.json());

    const user = await prisma.user.findFirst({
      where: { id: userId, companyId },
      select: { name: true },
    });
    if (!user) {
      return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
    }

    const ticket = await createTicketByClient({
      companyId,
      userId,
      subject,
      description,
      priority,
      authorName: user.name,
    });

    return NextResponse.json({ success: true, ticket }, { status: 201 });
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
