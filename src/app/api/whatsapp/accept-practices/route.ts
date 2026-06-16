import { NextResponse } from "next/server";
import { getCompanyId } from "@/lib/auth-helpers";
import { requirePermission } from "@/lib/auth-permissions";
import { handleApiError, forbiddenError } from "@/lib/error-handler";
import { isWhatsappEnabledForCompany } from "@/lib/whatsapp-flag";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/whatsapp/accept-practices
 *
 * Grava o aceite das boas-práticas anti-bloqueio (card + checkbox exibido antes
 * de conectar o WhatsApp). companyId vem da sessão, nunca do body. Idempotente:
 * regrava o timestamp do aceite mais recente. Gated por settings.edit + flag.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const companyId = await getCompanyId();
    await requirePermission("settings.edit");
    if (!isWhatsappEnabledForCompany(companyId)) {
      throw forbiddenError("Integração de WhatsApp não está habilitada para esta empresa.");
    }

    const acceptedAt = new Date();
    await prisma.companySettings.upsert({
      where: { companyId },
      create: { companyId, waPracticesAcceptedAt: acceptedAt },
      update: { waPracticesAcceptedAt: acceptedAt },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
