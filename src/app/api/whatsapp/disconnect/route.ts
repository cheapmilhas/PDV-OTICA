import { NextResponse } from "next/server";
import { getCompanyId } from "@/lib/auth-helpers";
import { requirePermission } from "@/lib/auth-permissions";
import { handleApiError, forbiddenError } from "@/lib/error-handler";
import { isWhatsappEnabledForCompany } from "@/lib/whatsapp-flag";
import { instanceNameForCompany } from "@/lib/whatsapp-instance";
import { evolution } from "@/lib/evolution";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

const log = logger.child({ route: "whatsapp/disconnect" });

/**
 * POST /api/whatsapp/disconnect
 *
 * Faz logout da instância na Evolution (derruba o pareamento, mantém a
 * instância) e zera o status local. Idempotente: zera o estado local mesmo se a
 * Evolution já estava fora/sem a instância.
 */
export async function POST() {
  try {
    const companyId = await getCompanyId();
    await requirePermission("settings.edit");

    if (!isWhatsappEnabledForCompany(companyId)) {
      throw forbiddenError("Integração de WhatsApp não está habilitada para esta empresa.");
    }

    const instanceName = instanceNameForCompany(companyId);

    try {
      await evolution.logout(instanceName);
    } catch (err) {
      // Logout falhar (instância já fora/inexistente) não impede zerar o local.
      log.warn("logout falhou (seguindo para zerar estado local)", {
        instanceName,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    await prisma.whatsappConnection.updateMany({
      where: { companyId },
      data: {
        status: "DISCONNECTED",
        connectedNumber: null,
        disconnectedAt: new Date(),
        lastError: null,
      },
    });

    return NextResponse.json({ success: true, data: { status: "DISCONNECTED" } });
  } catch (error) {
    return handleApiError(error);
  }
}
