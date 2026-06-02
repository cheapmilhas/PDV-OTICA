import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { companyNotificationScope } from "@/services/company-notification.service";

/**
 * PATCH /api/notifications/[id]/read — marca uma notificação como lida.
 * updateMany com o escopo no `where` garante que ninguém marca notificação de
 * outra empresa ou de outro usuário (quando a notificação tem destinatário).
 */
export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const companyId = session.user.companyId;
    const userId = session.user.id;
    const { id } = await params;

    await prisma.companyNotification.updateMany({
      where: { id, ...companyNotificationScope(companyId, userId) },
      data: { isRead: true, readAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
