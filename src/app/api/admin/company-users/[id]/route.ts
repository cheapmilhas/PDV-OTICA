import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/admin-session";
import { logActivity } from "@/services/activity-log.service";
import { ActorType } from "@prisma/client";

/**
 * PATCH /api/admin/company-users/[id]
 * Ativa ou desativa um usuário de empresa cliente.
 * Body: { active: boolean }
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();

  if (typeof body.active !== "boolean") {
    return NextResponse.json({ error: "Campo 'active' (boolean) é obrigatório" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, active: true, companyId: true },
  });

  if (!user) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });

  if (user.active === body.active) {
    return NextResponse.json({ error: "Usuário já está neste estado" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id },
    data: { active: body.active },
  });

  await prisma.globalAudit.create({
    data: {
      actorType: "ADMIN_USER",
      actorId: admin.id,
      companyId: user.companyId,
      action: body.active ? "USER_ACTIVATED" : "USER_DEACTIVATED",
      metadata: {
        userId: user.id,
        userEmail: user.email,
        adminEmail: admin.email,
      },
    },
  });

  await logActivity({
    companyId: user.companyId,
    type: body.active ? "USER_CREATED" : "USER_REMOVED",
    title: body.active
      ? `Usuário reativado: ${user.name}`
      : `Usuário desativado: ${user.name}`,
    detail: { userId: user.id, userEmail: user.email },
    actorId: admin.id,
    actorType: ActorType.ADMIN,
    actorName: admin.name,
  });

  return NextResponse.json({ success: true, active: body.active });
}
