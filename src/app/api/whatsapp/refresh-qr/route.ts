import { NextResponse } from "next/server";
import { getCompanyId } from "@/lib/auth-helpers";
import { requirePermission } from "@/lib/auth-permissions";
import { handleApiError, forbiddenError } from "@/lib/error-handler";
import { isWhatsappEnabledForCompany } from "@/lib/whatsapp-flag";
import { instanceNameForCompany } from "@/lib/whatsapp-instance";
import { evolution } from "@/lib/evolution";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/whatsapp/refresh-qr
 *
 * Pede um QR novo para a instância existente (quando o anterior expirou).
 * Não recria a instância. NUNCA expõe a apikey.
 */
export async function GET() {
  try {
    const companyId = await getCompanyId();
    await requirePermission("settings.edit");

    if (!isWhatsappEnabledForCompany(companyId)) {
      throw forbiddenError("Integração de WhatsApp não está habilitada para esta empresa.");
    }

    const instanceName = instanceNameForCompany(companyId);
    const qr = await evolution.connect(instanceName);

    await prisma.whatsappConnection.updateMany({
      where: { companyId },
      data: { status: "CONNECTING", lastQrAt: new Date(), lastError: null },
    });

    return NextResponse.json({
      success: true,
      data: {
        status: "CONNECTING",
        qrBase64: qr.base64 ?? null,
        pairingCode: qr.pairingCode ?? null,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
