import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";

const inputSchema = z.object({
  customerId: z.string().min(1),
  changes: z.object({
    name: z.string().min(1).optional(),
    cpf: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    zipCode: z.string().optional(),
  }),
  reason: z.string().min(5),
});

/**
 * POST /api/lgpd/retificacao
 *
 * Direito à retificação (LGPD Art. 18, III).
 * Atualiza dados pessoais incompletos, inexatos ou desatualizados.
 */
export async function POST(request: Request) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();

    const body = await request.json();
    const { customerId, changes, reason } = inputSchema.parse(body);

    const exists = await prisma.customer.findFirst({
      where: { id: customerId, companyId },
      select: { id: true },
    });
    if (!exists) {
      return NextResponse.json({ error: { message: "Cliente não encontrado" } }, { status: 404 });
    }

    await prisma.customer.update({
      where: { id: customerId },
      data: changes,
    });

    await prisma.globalAudit.create({
      data: {
        actorType: "USER",
        companyId,
        action: "LGPD_RECTIFICATION",
        metadata: { customerId, changes, reason },
      },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
