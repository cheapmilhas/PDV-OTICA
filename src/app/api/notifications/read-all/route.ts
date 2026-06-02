import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { companyNotificationScope } from "@/services/company-notification.service";

/**
 * PATCH /api/notifications/read-all — marca todas as notificações do usuário como lidas.
 */
export async function PATCH() {
  try {
    const session = await requireAuth();
    const companyId = session.user.companyId;
    const userId = session.user.id;

    await prisma.companyNotification.updateMany({
      where: { ...companyNotificationScope(companyId, userId), isRead: false },
      data: { isRead: true, readAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
