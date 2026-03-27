import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/admin-session";

// PATCH /api/admin/notifications/read-all — marca todas como lidas
export async function PATCH() {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  await prisma.adminNotification.updateMany({
    where: {
      OR: [{ adminId: admin.id }, { adminId: null }],
      isRead: false,
    },
    data: { isRead: true, readAt: new Date() },
  });

  return NextResponse.json({ success: true });
}
