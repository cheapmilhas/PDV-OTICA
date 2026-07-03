import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession, requireCompanyScope } from "@/lib/admin-session";
import { adminRateLimit } from "@/lib/rate-limit";

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

  const limited = adminRateLimit("admin-impersonate-end", admin.id, request);
  if (limited) return limited;

  const { id } = await params;

  const session = await prisma.impersonationSession.findUnique({
    where: { id },
    include: { company: { select: { name: true } } },
  });

  if (!session) {
    return NextResponse.json({ error: "Sessão não encontrada" }, { status: 404 });
  }

  // SEC (auditoria 2026-07-02): antes qualquer admin autenticado (inclusive
  // SUPPORT/BILLING) podia encerrar a sessão de impersonação de OUTRO admin.
  // Agora só o dono da sessão OU um admin com escopo sobre a empresa da sessão
  // (mesma regra do POST /impersonate) pode encerrá-la.
  const isOwner = session.adminUserId === admin.id;
  const hasScope = isOwner || (await requireCompanyScope(admin.id, session.companyId));
  if (!hasScope) {
    await prisma.globalAudit.create({
      data: {
        actorType: "ADMIN_USER",
        actorId: admin.id,
        companyId: session.companyId,
        action: "IMPERSONATION_END_DENIED",
        metadata: {
          sessionId: id,
          reason: "fora de escopo e não é dono da sessão",
          adminEmail: admin.email,
        },
      },
    });
    return NextResponse.json({ error: "Sem permissão para encerrar esta sessão" }, { status: 403 });
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
