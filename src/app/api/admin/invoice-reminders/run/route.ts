import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { runInvoiceReminders } from "@/services/invoice-reminders.service";
import { logger } from "@/lib/logger";

const log = logger.child({ route: "admin/invoice-reminders/run" });
export const dynamic = "force-dynamic";

export async function POST(_request: Request) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (admin.role !== "SUPER_ADMIN") return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  try {
    const summary = await runInvoiceReminders();
    log.info("invoice-reminders disparado manualmente", { adminId: admin.id, ...summary });
    return NextResponse.json({ success: true, ...summary });
  } catch (error) {
    log.error("Erro no disparo manual de invoice-reminders", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
