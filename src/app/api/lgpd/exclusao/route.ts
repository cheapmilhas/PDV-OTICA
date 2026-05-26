import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { anonymizeCustomer } from "@/lib/lgpd";
import { handleApiError } from "@/lib/error-handler";

const inputSchema = z.object({
  customerId: z.string().min(1),
  reason: z.string().min(5),
});

/**
 * POST /api/lgpd/exclusao
 *
 * Direito ao esquecimento (LGPD Art. 18, VI).
 *
 * NÃO deleta o registro fisicamente (preservaria integridade referencial das
 * vendas e financeiro — necessário para contabilidade legal). Em vez disso,
 * anonimiza todos os campos pessoais identificáveis.
 *
 * Vendas anteriores ficam preservadas mas sem dado pessoal vinculado.
 */
export async function POST(request: Request) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();

    const body = await request.json();
    const { customerId, reason } = inputSchema.parse(body);

    const exists = await prisma.customer.findFirst({
      where: { id: customerId, companyId },
      select: { id: true, anonymizedAt: true } as any,
    });
    const existsAny = exists as unknown as { id: string; anonymizedAt: Date | null } | null;

    if (!existsAny) {
      return NextResponse.json({ error: { message: "Cliente não encontrado" } }, { status: 404 });
    }
    if (existsAny.anonymizedAt) {
      return NextResponse.json(
        { error: { message: "Cliente já foi anonimizado" } },
        { status: 409 },
      );
    }

    await anonymizeCustomer(customerId, companyId);

    // Auditoria via GlobalAudit
    await prisma.globalAudit.create({
      data: {
        actorType: "USER",
        companyId,
        action: "LGPD_EXCLUSION",
        metadata: { customerId, reason },
      },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
