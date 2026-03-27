import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/admin-session";

// GET /api/admin/notifications — lista notificações do admin logado
export async function GET(request: Request) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const unreadOnly = searchParams.get("unread") === "true";
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20"), 50);

  const [notifications, unreadCount] = await Promise.all([
    prisma.adminNotification.findMany({
      where: {
        OR: [{ adminId: admin.id }, { adminId: null }],
        ...(unreadOnly && { isRead: false }),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    prisma.adminNotification.count({
      where: {
        OR: [{ adminId: admin.id }, { adminId: null }],
        isRead: false,
      },
    }),
  ]);

  return NextResponse.json({ notifications, unreadCount });
}
