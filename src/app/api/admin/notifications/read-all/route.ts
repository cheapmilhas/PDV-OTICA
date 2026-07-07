import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/admin-session";

// PATCH /api/admin/notifications/read-all — marca todas como lidas
export async function PATCH() {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  // Só marca as notificações DESTE admin. Notificações globais (adminId: null)
  // são compartilhadas entre todos os admins — marcá-las como lidas aqui faria
  // a linha sumir para todos os outros (que talvez nunca a viram). Enquanto não
  // houver estado de leitura por-admin, globais não são dispensáveis pelo sino.
  await prisma.adminNotification.updateMany({
    where: {
      adminId: admin.id,
      isRead: false,
    },
    data: { isRead: true, readAt: new Date() },
  });

  return NextResponse.json({ success: true });
}
