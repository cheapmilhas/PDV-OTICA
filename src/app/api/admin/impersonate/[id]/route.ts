import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/admin-session";

/**
 * DELETE /api/admin/impersonate/[id]
 * Encerra uma sessão de impersonação
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;

  const session = await prisma.impersonationSession.findUnique({
    where: { id },
    include: { company: { select: { name: true } } },
  });

  if (!session) {
    return NextResponse.json({ error: "Sessão não encontrada" }, { status: 404 });
  }

  if (session.endedAt) {
    return NextResponse.json({ error: "Sessão já encerrada" }, { status: 400 });
  }

  await prisma.impersonationSession.update({
    where: { id },
    data: { endedAt: new Date() },
  });

  await prisma.globalAudit.create({
    data: {
      actorType: "ADMIN_USER",
      actorId: admin.id,
      companyId: session.companyId,
      action: "IMPERSONATION_ENDED",
      metadata: {
        sessionId: id,
        companyName: session.company.name,
        adminEmail: admin.email,
      },
    },
  });

  return NextResponse.json({ message: "Sessão de impersonação encerrada" });
}
