import { NextResponse } from "next/server";
import { SignJWT } from "jose";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { handleApiError } from "@/lib/error-handler";
import { sendWhatsappMessage } from "@/lib/whatsapp-send";
import { whatsappTemplates } from "@/lib/whatsapp-templates";
import { logger } from "@/lib/logger";

const log = logger.child({ route: "sales/share-link" });

// Lazy: lê o secret em runtime (não no import) p/ não quebrar `next build` em
// ambientes sem o secret (ex.: Preview). Ver admin-session.ts getJwtSecret().
function getJwtSecret(): Uint8Array {
  const authSecret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!authSecret) throw new Error("AUTH_SECRET is required");
  return new TextEncoder().encode(authSecret);
}

/**
 * POST /api/sales/[id]/share-link
 *
 * Gera link público assinado (JWT) para o cliente baixar o recibo da venda.
 * Token expira em 7 dias.
 *
 * Body opcional: { sendWhatsApp: true } → envia o link para o telefone do cliente.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    const { id } = await params;

    const sale = await prisma.sale.findFirst({
      where: { id, companyId },
      include: {
        customer: { select: { name: true, phone: true, acceptsMarketing: true } },
        company: { select: { name: true, phone: true } },
      },
    });

    if (!sale) {
      return NextResponse.json({ error: { message: "Venda não encontrada" } }, { status: 404 });
    }

    const token = await new SignJWT({ saleId: sale.id, companyId, type: "receipt" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("7d")
      .sign(getJwtSecret());

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const receiptUrl = `${baseUrl}/recibo/${token}`;

    let body: { sendWhatsApp?: boolean } = {};
    try {
      body = await request.json();
    } catch {
      // Sem body é ok — apenas retorna o link
    }

    // Geração do link acima é o produto principal e SEMPRE funciona. O envio por
    // WhatsApp é adicional e só sai de fato para a ótica habilitada + conectada
    // (senão o serviço registra SKIPPED e devolve graciosamente). type SHARE_LINK
    // é transacional (não exige consentimento de marketing). periodKey null →
    // envio manual, sem dedupe.
    let whatsappSent = false;
    if (body.sendWhatsApp && sale.customer) {
      const result = await sendWhatsappMessage({
        companyId,
        customer: {
          id: sale.customerId,
          name: sale.customer.name,
          phone: sale.customer.phone,
          acceptsMarketing: sale.customer.acceptsMarketing,
        },
        type: "SHARE_LINK",
        transactional: true,
        referenceId: sale.id,
        template: whatsappTemplates.saleReceipt({
          customerName: sale.customer.name,
          company: { name: sale.company.name, phone: sale.company.phone },
          total: `R$ ${Number(sale.total).toFixed(2).replace(".", ",")}`,
          receiptUrl,
        }),
      });
      whatsappSent = result.status === "SENT";
      log.info("Recibo via WhatsApp", {
        saleId: sale.id,
        status: result.status,
        skipReason: result.skipReason,
      });
    }

    return NextResponse.json({
      success: true,
      data: { receiptUrl, expiresInDays: 7, whatsappSent },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
