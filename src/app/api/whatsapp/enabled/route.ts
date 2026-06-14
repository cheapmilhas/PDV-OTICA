import { NextResponse } from "next/server";
import { getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { isWhatsappEnabledForCompany } from "@/lib/whatsapp-flag";

/**
 * GET /api/whatsapp/enabled
 *
 * Endpoint leve usado pela UI (sidebar/menu) para saber se a integração de
 * WhatsApp está habilitada para a empresa da sessão (kill-switch global +
 * allowlist). Não expõe nenhum segredo — só um booleano.
 */
export async function GET() {
  try {
    const companyId = await getCompanyId();
    return NextResponse.json({
      success: true,
      data: { enabled: isWhatsappEnabledForCompany(companyId) },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
