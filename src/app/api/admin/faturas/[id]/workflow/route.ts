import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession, requireCompanyScope } from "@/lib/admin-session";
import { logger } from "@/lib/logger";

const log = logger.child({ route: "admin/faturas/[id]/workflow" });

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

    if (!(await requireCompanyScope(admin.id, invoice.subscription.companyId))) {
      return NextResponse.json({ error: "Sem permissão para esta empresa" }, { status: 403 });
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
        // Só REATIVA a assinatura se ela estava inadimplente/em trial. Marcar uma
        // fatura antiga como paga NÃO deve "ressuscitar" uma assinatura que o dono
        // cancelou/suspendeu de propósito (F4). subscription já foi carregado acima.
        const reactivate =
          invoice.subscriptionId != null &&
          invoice.subscription != null &&
          ["PAST_DUE", "TRIAL"].includes(invoice.subscription.status);

        // Transação: fatura + subscription + auditoria juntas (F4). Se a 2ª escrita
        // falhar, nada é commitado — sem estado inconsistente (fatura PAID mas
        // subscription intocada).
        await prisma.$transaction(async (tx) => {
          await tx.invoice.update({
            where: { id },
            data: {
              paymentConfirmed: true,
              paymentConfirmedAt: new Date(),
              paymentConfirmedBy: admin.name,
              status: "PAID",
              paidAt: new Date(),
              // F8: registra o método declarado (a tela/export lê paymentMethod).
              ...(typeof method === "string" && method ? { paymentMethod: method } : {}),
            },
          });

          if (reactivate) {
            await tx.subscription.update({
              where: { id: invoice.subscriptionId! },
              data: {
                status: "ACTIVE",
                pastDueSince: null,
                lastDunningStage: null, // F5: zera régua na recuperação
              },
            });
          }

          await tx.globalAudit.create({
            data: {
              actorType: "ADMIN_USER",
              actorId: admin.id,
              action: "PAYMENT_CONFIRMED",
              metadata: { invoiceId: id, reactivatedSubscription: reactivate },
            },
          });
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
        // F7: valida o note (era gravado cru; `undefined` apagava a nota existente).
        if (typeof note !== "string" || note.trim().length === 0) {
          return NextResponse.json({ error: "Observação vazia" }, { status: 400 });
        }
        await prisma.invoice.update({
          where: { id },
          data: {
            adminNotes: note.trim(),
          },
        });

        return NextResponse.json({ success: true, message: "Observação salva" });
      }

      default:
        return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
    }
  } catch (error) {
    log.error("Erro", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
