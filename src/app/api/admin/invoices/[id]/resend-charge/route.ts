import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import { notifyCompany } from "@/services/saas-notification.service";
import { logger } from "@/lib/logger";

const log = logger.child({ route: "admin/invoices/resend-charge" });
export const dynamic = "force-dynamic";

function brl(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dateBR(d: Date | null): string {
  return d
    ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Fortaleza" }).format(d)
    : "";
}

function yyyymmdd(d: Date): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (admin.role !== "SUPER_ADMIN" && admin.role !== "ADMIN") {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await ctx.params;

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: { subscription: { include: { company: { select: { name: true } } } } },
  });
  if (!invoice) return NextResponse.json({ error: "Fatura não encontrada" }, { status: 404 });

  // Sem paymentUrl não há o que reenviar (o template exige uma URL válida); evita
  // enfileirar um email que falharia no render (notifyCompany é fail-silent).
  if (!invoice.paymentUrl) {
    return NextResponse.json(
      { error: "Fatura sem link de pagamento — sincronize a cobrança primeiro" },
      { status: 400 }
    );
  }

  const companyId = invoice.subscription.companyId;

  const result = await notifyCompany(
    companyId,
    "INVOICE_CREATED",
    {
      name: invoice.subscription.company?.name ?? "cliente",
      amountLabel: brl(invoice.total),
      dueDateLabel: dateBR(invoice.dueDate),
      pixCode: invoice.pixCode ?? undefined,
      paymentUrl: invoice.paymentUrl,
      boletoUrl: invoice.boletoUrl ?? undefined,
    },
    {
      channels: ["email"],
      periodKey: `invoice:${id}:resend:${yyyymmdd(new Date())}`,
    }
  );

  log.info("reenvio de cobrança", { invoiceId: id, adminId: admin.id, status: result.status });
  return NextResponse.json({ success: true, status: result.status });
}
