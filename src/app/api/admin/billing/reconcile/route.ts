import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { reconcilePendingBilling } from "@/services/billing-reconcile.service";
import { logger } from "@/lib/logger";

const log = logger.child({ route: "admin/billing/reconcile" });

/**
 * POST /api/admin/billing/reconcile
 * Dispara a reconciliação billingSyncPending sob demanda (botão no painel admin).
 */
export async function POST() {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!["SUPER_ADMIN", "ADMIN"].includes(admin.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  try {
    const summary = await reconcilePendingBilling({ limit: 200 });
    return NextResponse.json({ success: true, ...summary });
  } catch (error) {
    log.error("Erro na reconciliação manual", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
