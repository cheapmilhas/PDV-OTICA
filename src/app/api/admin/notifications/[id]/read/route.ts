import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/admin-session";

// PATCH /api/admin/notifications/[id]/read — marca notificação como lida
export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;

  // Só marca a notificação se for DESTE admin. Globais (adminId: null) são
  // compartilhadas — marcá-las aqui as faria sumir para todos os outros admins.
  await prisma.adminNotification.updateMany({
    where: {
      id,
      adminId: admin.id,
    },
    data: { isRead: true, readAt: new Date() },
  });

  return NextResponse.json({ success: true });
}
