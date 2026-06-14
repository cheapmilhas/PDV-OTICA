import { NextResponse } from "next/server";
import { getCompanyId } from "@/lib/auth-helpers";
import { requirePermission } from "@/lib/auth-permissions";
import { handleApiError, forbiddenError } from "@/lib/error-handler";
import { isWhatsappEnabledForCompany } from "@/lib/whatsapp-flag";
import { instanceNameForCompany } from "@/lib/whatsapp-instance";
import { evolution, mapEvolutionState } from "@/lib/evolution";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

const log = logger.child({ route: "whatsapp/status" });

/**
 * GET /api/whatsapp/status
 *
 * Lê o registro local + o estado ao vivo na Evolution (para o polling da tela).
 * Degradação graciosa: se a Evolution estiver fora do ar, devolve o estado
 * local com `evolutionReachable: false` (a tela mostra "indisponível" sem
 * quebrar). NUNCA expõe a apikey.
 */
export async function GET() {
  try {
    const companyId = await getCompanyId();
    await requirePermission("settings.edit");

    if (!isWhatsappEnabledForCompany(companyId)) {
      throw forbiddenError("Integração de WhatsApp não está habilitada para esta empresa.");
    }

    const conn = await prisma.whatsappConnection.findUnique({
      where: { companyId },
      select: {
        status: true,
        connectedNumber: true,
        connectedAt: true,
        disconnectedAt: true,
        lastEventAt: true,
        lastError: true,
      },
    });

    // Sem registro local: nunca conectou.
    if (!conn) {
      return NextResponse.json({
        success: true,
        data: {
          status: "DISCONNECTED",
          connectedNumber: null,
          evolutionReachable: true,
        },
      });
    }

    // Consulta o estado ao vivo. Falha de rede NÃO derruba a tela.
    let liveStatus: string | null = null;
    let evolutionReachable = true;
    try {
      const instanceName = instanceNameForCompany(companyId);
      const state = await evolution.connectionState(instanceName);
      liveStatus = mapEvolutionState(state.instance?.state);

      // Reconcilia o registro local quando a Evolution diverge (ex.: caiu por
      // fora). Só persiste quando muda, para não escrever a cada polling.
      if (liveStatus && liveStatus !== conn.status) {
        await prisma.whatsappConnection.update({
          where: { companyId },
          data: {
            status: liveStatus as "CONNECTED" | "CONNECTING" | "DISCONNECTED",
            ...(liveStatus === "DISCONNECTED" && conn.status === "CONNECTED"
              ? { disconnectedAt: new Date() }
              : {}),
          },
        });
      }
    } catch (err) {
      evolutionReachable = false;
      log.warn("connectionState indisponível (degradação graciosa)", {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        status: liveStatus ?? conn.status,
        connectedNumber: conn.connectedNumber,
        connectedAt: conn.connectedAt,
        lastEventAt: conn.lastEventAt,
        evolutionReachable,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
