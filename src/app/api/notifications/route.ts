import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { companyNotificationScope } from "@/services/company-notification.service";

/**
 * GET /api/notifications — notificações in-app do usuário logado.
 *
 * Escopo (H2): SEMPRE dentro da empresa do usuário. Broadcast (userId=null) só
 * vale para a própria empresa — NUNCA copiar o `OR` cru do admin (que é global).
 */
export async function GET(request: Request) {
  try {
    const session = await requireAuth();
    const companyId = session.user.companyId;
    const userId = session.user.id;

    const { searchParams } = new URL(request.url);
    const unreadOnly = searchParams.get("unread") === "true";
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10) || 20, 50);

    const scope = companyNotificationScope(companyId, userId);

    const [notifications, unreadCount] = await Promise.all([
      prisma.companyNotification.findMany({
        where: { ...scope, ...(unreadOnly && { isRead: false }) },
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
      prisma.companyNotification.count({ where: { ...scope, isRead: false } }),
    ]);

    return NextResponse.json({ notifications, unreadCount });
  } catch (error) {
    return handleApiError(error);
  }
}
