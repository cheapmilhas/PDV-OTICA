import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAdminSession, requireCompanyScope } from "@/lib/admin-session";
import { nextSaasInvoiceNumber } from "@/lib/saas-invoice-number";
import { logger } from "@/lib/logger";

const log = logger.child({ route: "admin/faturas/create" });

// billingType da UI → valores aceitos pelo Asaas. Sem esse mapeamento, "CARTAO"/
// "TRANSFERENCIA" iam crus para o gateway e a cobrança falhava com 400 (F6).
const BILLING_TYPE_MAP: Record<string, "BOLETO" | "CREDIT_CARD" | "PIX" | "UNDEFINED"> = {
  PIX: "PIX",
  BOLETO: "BOLETO",
  CARTAO: "CREDIT_CARD",
  CREDIT_CARD: "CREDIT_CARD",
  TRANSFERENCIA: "UNDEFINED",
  UNDEFINED: "UNDEFINED",
};

const bodySchema = z.object({
  subscriptionId: z.string().min(1, "subscriptionId é obrigatório"),
  // customValue: centavos (Int). Positivo. Opcional (usa preço do plano se ausente).
  customValue: z.number().int().positive().optional(),
  dueDate: z.string().optional(),
  billingType: z.string().optional(),
  description: z.string().optional(),
});

export async function POST(request: Request) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    let body: z.infer<typeof bodySchema>;
    try {
      body = bodySchema.parse(await request.json());
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Dados inválidos", details: err.issues }, { status: 400 });
      }
      throw err;
    }
    const { subscriptionId, customValue, dueDate, description } = body;

    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { plan: true, company: true },
    });

    if (!subscription) {
      return NextResponse.json({ error: "Assinatura não encontrada" }, { status: 404 });
    }

    if (!(await requireCompanyScope(admin.id, subscription.companyId))) {
      return NextResponse.json({ error: "Sem permissão para esta empresa" }, { status: 403 });
    }

    // Calcular valor (centavos, Int). customValue já validado como inteiro positivo.
    const value = customValue ?? subscription.plan.priceMonthly;

    // billingType: mapeia rótulo da UI → enum do Asaas (default PIX).
    const billingType = BILLING_TYPE_MAP[body.billingType ?? "PIX"] ?? "PIX";

    // Número da fatura: gerador GLOBALMENTE atômico (sem race entre dois admins,
    // sem colidir com o manual-charge que usa o mesmo contador).
    const invoiceNumber = await nextSaasInvoiceNumber();

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
        billingType,

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
    log.error("Erro ao criar fatura", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Erro ao criar fatura" }, { status: 500 });
  }
}
