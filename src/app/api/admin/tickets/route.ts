import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/admin-session";
import { logActivity } from "@/services/activity-log.service";
import { ActorType } from "@prisma/client";

/**
 * POST /api/admin/tickets
 * Cria um novo ticket de suporte para uma empresa.
 */
export async function POST(request: Request) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  try {
    const body = await request.json();
    const { companyId, subject, description, priority = "MEDIUM", assignedToId } = body;

    if (!companyId?.trim()) return NextResponse.json({ error: "Empresa é obrigatória" }, { status: 400 });
    if (!subject?.trim()) return NextResponse.json({ error: "Assunto é obrigatório" }, { status: 400 });
    if (!description?.trim()) return NextResponse.json({ error: "Descrição é obrigatória" }, { status: 400 });

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      include: { users: { where: { active: true }, take: 1, select: { id: true } } },
    });
    if (!company) return NextResponse.json({ error: "Empresa não encontrada" }, { status: 404 });

    // userId obrigatório no schema — usar o primeiro usuário ativo da empresa
    const userId = company.users[0]?.id;
    if (!userId) return NextResponse.json({ error: "Empresa não tem usuários ativos para vincular ao ticket" }, { status: 400 });

    // Gerar número sequencial
    const count = await prisma.supportTicket.count();
    const number = `TKT-${String(count + 1).padStart(5, "0")}`;

    const ticket = await prisma.supportTicket.create({
      data: {
        companyId,
        userId,
        number,
        subject: subject.trim(),
        description: description.trim(),
        category: "SUPORTE",
        priority,
        status: "OPEN",
        ...(assignedToId ? { assignedToId } : {}),
        messages: {
          create: {
            authorId: admin.id,
            authorName: admin.name,
            authorType: "ADMIN",
            message: description.trim(),
            isInternal: false,
          },
        },
      },
    });

    await logActivity({
      companyId,
      type: "TICKET_OPENED",
      title: `Ticket #${number} aberto: ${subject}`,
      actorId: admin.id,
      actorType: ActorType.ADMIN,
      actorName: admin.name,
    });

    await prisma.globalAudit.create({
      data: {
        actorType: "ADMIN_USER",
        actorId: admin.id,
        action: "TICKET_CREATED",
        companyId,
        metadata: { ticketId: ticket.id, number, subject },
      },
    });

    return NextResponse.json({ success: true, ticket });
  } catch (error) {
    console.error("[ADMIN-TICKETS] Erro:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
