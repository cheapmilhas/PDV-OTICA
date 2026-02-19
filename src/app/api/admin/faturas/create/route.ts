import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/admin-session";

export async function POST(request: Request) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const { subscriptionId, customValue, dueDate, billingType, description } = await request.json();

    if (!subscriptionId) {
      return NextResponse.json({ error: "subscriptionId é obrigatório" }, { status: 400 });
    }

    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { plan: true, company: true },
    });

    if (!subscription) {
      return NextResponse.json({ error: "Assinatura não encontrada" }, { status: 404 });
    }

    // Calcular valor
    const value = customValue || subscription.plan.priceMonthly;

    // Gerar número da fatura
    const invoiceCount = await prisma.invoice.count();
    const invoiceNumber = `INV-${String(invoiceCount + 1).padStart(6, "0")}`;

    // Calcular período (mês atual)
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // Criar fatura
    const invoice = await prisma.invoice.create({
      data: {
        subscriptionId,
        number: invoiceNumber,
        status: "PENDING",
        total: value,
        subtotal: value,
        discount: 0,
        dueDate: dueDate ? new Date(dueDate) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        periodStart,
        periodEnd,
        billingType: billingType || "PIX",

        // Marcar como gerada
        invoiceGenerated: true,
        invoiceGeneratedAt: new Date(),
        invoiceGeneratedBy: admin.name,

        adminNotes: description || null,
      },
    });

    // Registrar auditoria
    await prisma.globalAudit.create({
      data: {
        actorType: "ADMIN_USER",
        actorId: admin.id,
        companyId: subscription.companyId,
        action: "INVOICE_CREATED",
        metadata: {
          invoiceId: invoice.id,
          invoiceNumber,
          value,
        },
      },
    });

    return NextResponse.json({
      success: true,
      invoice: {
        id: invoice.id,
        number: invoice.number,
        total: invoice.total,
      },
    });
  } catch (error) {
    console.error("[CREATE INVOICE] Erro:", error);
    return NextResponse.json({ error: "Erro ao criar fatura" }, { status: 500 });
  }
}
