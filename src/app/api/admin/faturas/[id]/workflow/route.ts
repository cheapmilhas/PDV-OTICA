import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/admin-session";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const { action, method, nfNumber, nfUrl, note } = body;

  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: { subscription: true },
    });

    if (!invoice) {
      return NextResponse.json({ error: "Fatura não encontrada" }, { status: 404 });
    }

    switch (action) {
      case "mark_sent": {
        await prisma.invoice.update({
          where: { id },
          data: {
            invoiceSent: true,
            invoiceSentAt: new Date(),
            invoiceSentBy: admin.name,
            invoiceSentMethod: method || "manual",
          },
        });

        await prisma.globalAudit.create({
          data: {
            actorType: "ADMIN_USER",
            actorId: admin.id,
            action: "INVOICE_SENT",
            metadata: { invoiceId: id, method },
          },
        });

        return NextResponse.json({ success: true, message: "Marcado como enviado" });
      }

      case "mark_paid": {
        await prisma.invoice.update({
          where: { id },
          data: {
            paymentConfirmed: true,
            paymentConfirmedAt: new Date(),
            paymentConfirmedBy: admin.name,
            status: "PAID",
            paidAt: new Date(),
          },
        });

        // Atualizar subscription para ACTIVE
        if (invoice.subscriptionId) {
          await prisma.subscription.update({
            where: { id: invoice.subscriptionId },
            data: {
              status: "ACTIVE",
              pastDueSince: null,
            },
          });
        }

        await prisma.globalAudit.create({
          data: {
            actorType: "ADMIN_USER",
            actorId: admin.id,
            action: "PAYMENT_CONFIRMED",
            metadata: { invoiceId: id },
          },
        });

        return NextResponse.json({ success: true, message: "Pagamento confirmado" });
      }

      case "mark_nf_generated": {
        await prisma.invoice.update({
          where: { id },
          data: {
            nfGenerated: true,
            nfGeneratedAt: new Date(),
            nfGeneratedBy: admin.name,
            nfNumber: nfNumber || null,
            nfUrl: nfUrl || null,
          },
        });

        await prisma.globalAudit.create({
          data: {
            actorType: "ADMIN_USER",
            actorId: admin.id,
            action: "NF_GENERATED",
            metadata: { invoiceId: id, nfNumber },
          },
        });

        return NextResponse.json({ success: true, message: "NF registrada" });
      }

      case "mark_nf_sent": {
        await prisma.invoice.update({
          where: { id },
          data: {
            nfSent: true,
            nfSentAt: new Date(),
            nfSentBy: admin.name,
          },
        });

        await prisma.globalAudit.create({
          data: {
            actorType: "ADMIN_USER",
            actorId: admin.id,
            action: "NF_SENT",
            metadata: { invoiceId: id },
          },
        });

        return NextResponse.json({ success: true, message: "NF marcada como enviada" });
      }

      case "add_note": {
        await prisma.invoice.update({
          where: { id },
          data: {
            adminNotes: note,
          },
        });

        return NextResponse.json({ success: true, message: "Observação salva" });
      }

      default:
        return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
    }
  } catch (error) {
    console.error("[WORKFLOW] Erro:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
