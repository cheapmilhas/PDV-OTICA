import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession, requireSupportScope } from "@/lib/admin-session";
import { createTicketByAdmin } from "@/services/support.service";
import { handleApiError } from "@/lib/error-handler";
import type { TicketPriority } from "@prisma/client";
import { logger } from "@/lib/logger";

const log = logger.child({ route: "admin/tickets" });

const ADMIN_PRIORITIES: TicketPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

/**
 * POST /api/admin/tickets
 * Cria um novo ticket de suporte para uma empresa.
 */
export async function POST(request: Request) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  try {
    const body = await request.json();
    const { companyId, subject, description, assignedToId } = body;
    const priority: TicketPriority = ADMIN_PRIORITIES.includes(body.priority)
      ? body.priority
      : "MEDIUM";

    if (!companyId?.trim()) return NextResponse.json({ error: "Empresa é obrigatória" }, { status: 400 });
    if (!subject?.trim()) return NextResponse.json({ error: "Assunto é obrigatório" }, { status: 400 });
    if (!description?.trim()) return NextResponse.json({ error: "Descrição é obrigatória" }, { status: 400 });

    // C1: admin restrito só abre ticket para empresa dentro do seu escopo.
    const scoped = await requireSupportScope(admin.id, companyId);
    if (!scoped) {
      return NextResponse.json({ error: "Sem permissão para esta empresa" }, { status: 403 });
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      include: { users: { where: { active: true }, take: 1, select: { id: true } } },
    });
    if (!company) return NextResponse.json({ error: "Empresa não encontrada" }, { status: 404 });

    // userId obrigatório no schema — usar o primeiro usuário ativo da empresa
    const userId = company.users[0]?.id;
    if (!userId) {
      return NextResponse.json(
        { error: "Empresa não tem usuários ativos para vincular ao ticket" },
        { status: 400 }
      );
    }

    // Cria via serviço (mesmo retry de número P2002 do caminho do cliente — H3).
    const ticket = await createTicketByAdmin({
      companyId,
      userId,
      subject: subject.trim(),
      description: description.trim(),
      priority,
      assignedToId: assignedToId || undefined,
      admin: { id: admin.id, name: admin.name },
    });

    await prisma.globalAudit.create({
      data: {
        actorType: "ADMIN_USER",
        actorId: admin.id,
        action: "TICKET_CREATED",
        companyId,
        metadata: { ticketId: ticket.id, number: ticket.number, subject: subject.trim() },
      },
    });

    return NextResponse.json({ success: true, ticket });
  } catch (error) {
    log.error("Erro", { error: error instanceof Error ? error.message : String(error) });
    return handleApiError(error);
  }
}
