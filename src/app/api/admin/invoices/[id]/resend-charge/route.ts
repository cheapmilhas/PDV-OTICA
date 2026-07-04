import { NextResponse } from "next/server";
import { getAdminSession, requireCompanyScope } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import { sendInvoiceCharge } from "@/services/invoice-send.service";
import { logger } from "@/lib/logger";

const log = logger.child({ route: "admin/invoices/resend-charge" });
export const dynamic = "force-dynamic";

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (admin.role !== "SUPER_ADMIN" && admin.role !== "ADMIN") {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await ctx.params;

  try {
    // findUnique para o 404 + escopo (F5): admin restrito não reenvia cobrança de
    // fatura de empresa fora do seu escopo (Invoice → subscription.companyId).
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      select: { id: true, subscription: { select: { companyId: true } } },
    });
    if (!invoice) return NextResponse.json({ error: "Fatura não encontrada" }, { status: 404 });

    if (!(await requireCompanyScope(admin.id, invoice.subscription.companyId))) {
      return NextResponse.json({ error: "Sem permissão para esta empresa" }, { status: 403 });
    }

    const { status, alreadySentToday } = await sendInvoiceCharge(id, admin.id);

    log.info("reenvio de cobrança", { invoiceId: id, adminId: admin.id, status, alreadySentToday });
    return NextResponse.json({ success: true, status, alreadySentToday });
  } catch (error) {
    log.error("Erro no reenvio de cobrança", { invoiceId: id, error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
