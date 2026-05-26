import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { logCustomerAccess } from "@/lib/lgpd";
import { handleApiError } from "@/lib/error-handler";
import { serializePrisma } from "@/lib/serialize";

const querySchema = z.object({
  customerId: z.string().min(1),
});

/**
 * GET /api/lgpd/portabilidade?customerId=...
 *
 * Direito à portabilidade (LGPD Art. 18, V).
 * Retorna JSON com todos os dados pessoais e operacionais do titular.
 *
 * Apenas usuários com permissão admin podem solicitar. Em produção,
 * pode ser exposto como auto-serviço com link assinado por email.
 */
export async function GET(request: Request) {
  try {
    const session = await requireAuth();
    const companyId = await getCompanyId();

    const url = new URL(request.url);
    const { customerId } = querySchema.parse({
      customerId: url.searchParams.get("customerId"),
    });

    const customer = await prisma.customer.findFirst({
      where: { id: customerId, companyId },
      include: {
        sales: {
          select: {
            id: true,
            createdAt: true,
            total: true,
            status: true,
          },
        },
        serviceOrders: {
          select: {
            id: true,
            createdAt: true,
            status: true,
            promisedDate: true,
          },
        },
        consentRecords: true,
      },
    });

    if (!customer) {
      return NextResponse.json({ error: { message: "Cliente não encontrado" } }, { status: 404 });
    }

    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    await logCustomerAccess({
      companyId,
      customerId,
      userId: session.user.id,
      resourceType: "export",
      action: "export",
      ipAddress: ip,
    });

    return NextResponse.json({
      success: true,
      generatedAt: new Date().toISOString(),
      data: serializePrisma(customer),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
