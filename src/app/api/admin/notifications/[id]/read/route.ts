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

  await prisma.adminNotification.updateMany({
    where: {
      id,
      OR: [{ adminId: admin.id }, { adminId: null }],
    },
    data: { isRead: true, readAt: new Date() },
  });

  return NextResponse.json({ success: true });
}
