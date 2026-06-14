import { NextResponse } from "next/server";
import { getCompanyId } from "@/lib/auth-helpers";
import { requirePermission } from "@/lib/auth-permissions";
import { handleApiError, forbiddenError } from "@/lib/error-handler";
import { isWhatsappEnabledForCompany } from "@/lib/whatsapp-flag";
import { instanceNameForCompany, whatsappWebhookUrl } from "@/lib/whatsapp-instance";
import {
  evolution,
  extractInstanceApiKey,
  type EvolutionQrCode,
} from "@/lib/evolution";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

const log = logger.child({ route: "whatsapp/connect" });

/**
 * POST /api/whatsapp/connect
 *
 * Cria/conecta a instância `vis_${companyId}` na Evolution (canal Baileys),
 * registra o webhook e persiste o registro local. Retorna o QR (base64) para a
 * tela exibir.
 *
 * Isolamento: instanceName SEMPRE derivado do companyId da sessão.
 * Gating: settings.edit + feature flag por empresa.
 */
export async function POST() {
  try {
    const companyId = await getCompanyId();
    await requirePermission("settings.edit");

    if (!isWhatsappEnabledForCompany(companyId)) {
      throw forbiddenError("Integração de WhatsApp não está habilitada para esta empresa.");
    }

    const instanceName = instanceNameForCompany(companyId);
    const secret = process.env.EVOLUTION_WEBHOOK_SECRET;
    if (!secret) {
      // Sem segredo não há como autenticar o webhook → recusa (fail-closed).
      log.error("EVOLUTION_WEBHOOK_SECRET ausente — conexão recusada");
      return NextResponse.json(
        { success: false, error: "Configuração incompleta do servidor (webhook secret)." },
        { status: 503 },
      );
    }

    const webhook = { url: whatsappWebhookUrl(), secret };

    // Persiste/garante o registro local ANTES de chamar a Evolution, para que o
    // webhook (que pode chegar imediatamente) resolva a empresa pelo instanceName.
    await prisma.whatsappConnection.upsert({
      where: { companyId },
      create: {
        companyId,
        instanceName,
        status: "CONNECTING",
        lastQrAt: new Date(),
      },
      update: {
        status: "CONNECTING",
        lastQrAt: new Date(),
        lastError: null,
      },
    });

    let qr: EvolutionQrCode | undefined;
    let instanceApiKey: string | null = null;

    try {
      // Tenta criar a instância (idempotente do nosso lado: se já existe na
      // Evolution, o create falha e caímos no connect para obter um novo QR).
      const created = await evolution.createInstance(instanceName, webhook);
      qr = created.qrcode;
      instanceApiKey = extractInstanceApiKey(created.hash);
    } catch (err) {
      log.warn("createInstance falhou; tentando connect (instância pode já existir)", {
        instanceName,
        error: err instanceof Error ? err.message : String(err),
      });
      // Garante que o webhook está registrado mesmo no caminho de reconexão.
      try {
        await evolution.setWebhook(instanceName, webhook);
      } catch (whErr) {
        log.warn("setWebhook falhou no reconnect", {
          instanceName,
          error: whErr instanceof Error ? whErr.message : String(whErr),
        });
      }
      qr = await evolution.connect(instanceName);
    }

    if (instanceApiKey) {
      await prisma.whatsappConnection.update({
        where: { companyId },
        data: { instanceApiKey },
      });
    }

    // NUNCA devolver a apikey (global ou da instância) ao client.
    return NextResponse.json({
      success: true,
      data: {
        status: "CONNECTING",
        qrBase64: qr?.base64 ?? null,
        pairingCode: qr?.pairingCode ?? null,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
