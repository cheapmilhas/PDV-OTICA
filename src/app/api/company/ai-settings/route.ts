import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getCompanyId, requirePermission } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { handleApiError, forbiddenError } from "@/lib/error-handler";

/**
 * PUT /api/company/ai-settings
 *
 * A ótica pode ligar/desligar a IA nas próprias configurações.
 * Somente o campo `iaEnabled` é aceito — a ótica NUNCA pode alterar
 * iaAvailable nem iaMonthlyTokenLimit (esses são controles exclusivos do super admin).
 *
 * Rejeita iaEnabled=true se iaAvailable=false (não pode ligar o que não foi liberado).
 */
export async function PUT(request: NextRequest) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    await requirePermission("company.settings");

    const body = await request.json();
    const iaEnabled = body.iaEnabled === true;

    // Guard: só precisa checar disponibilidade se tentando LIGAR
    if (iaEnabled) {
      const cur = await prisma.companySettings.findUnique({
        where: { companyId },
        select: { iaAvailable: true },
      });
      if (!cur?.iaAvailable) {
        throw forbiddenError("IA não está disponível para esta ótica. Fale com o suporte.");
      }
    }

    // Atualiza SOMENTE iaEnabled — nunca iaAvailable, nunca iaMonthlyTokenLimit
    await prisma.companySettings.upsert({
      where: { companyId },
      update: { iaEnabled },
      create: { companyId, iaEnabled },
    });

    return NextResponse.json({ success: true, data: { iaEnabled } });
  } catch (error) {
    return handleApiError(error);
  }
}
