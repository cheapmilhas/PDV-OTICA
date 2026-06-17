import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

const log = logger.child({ service: "whatsapp-limits" });
const SINGLETON_ID = "global";

/**
 * Travas anti-bloqueio do WhatsApp, resolvidas para uma ótica.
 * - openHour/closeHour: janela de envio (hora BRT; closeHour exclusivo).
 * - dailyCap: teto de mensagens enviadas por dia civil (BRT).
 * - skipSaturday: quando true, sábado também é pulado (domingo já é sempre).
 * - staleMin: minutos p/ considerar uma linha PROCESSING presa (técnico).
 */
export interface WhatsappLimits {
  openHour: number;
  closeHour: number;
  dailyCap: number;
  skipSaturday: boolean;
  staleMin: number;
}

/**
 * Defaults hardcoded = valores da Fase 1. São o fallback final: sem config no
 * banco (ou erro de banco), o comportamento é IDÊNTICO ao de antes da Fase 2.
 */
export const DEFAULT_WA_LIMITS: WhatsappLimits = {
  openHour: 8,
  closeHour: 18,
  dailyCap: 50,
  skipSaturday: false,
  staleMin: 10,
};

/**
 * Resolve as travas para uma ótica: override da ótica (se != null) → global
 * (se existir) → default hardcoded. Espelha `getEffectiveMarkup` (ai-margin).
 *
 * Fail-safe: qualquer erro (flake de banco) → DEFAULT_WA_LIMITS + log de warn.
 * Nunca lança — o caminho de envio não pode quebrar por causa de config.
 */
export async function getWhatsappLimits(companyId: string): Promise<WhatsappLimits> {
  try {
    const [global, settings] = await Promise.all([
      prisma.whatsappGlobalConfig.findUnique({
        where: { id: SINGLETON_ID },
        select: { openHour: true, closeHour: true, dailyCap: true, skipSaturday: true, staleMin: true },
      }),
      prisma.companySettings.findUnique({
        where: { companyId },
        select: {
          waOpenHourOverride: true,
          waCloseHourOverride: true,
          waDailyCapOverride: true,
          waSkipSaturdayOverride: true,
        },
      }),
    ]);

    // Para cada trava: override (se != null) → global (se != null) → default.
    // `?? `  trata null/undefined corretamente (false explícito NÃO vira default).
    return {
      openHour: settings?.waOpenHourOverride ?? global?.openHour ?? DEFAULT_WA_LIMITS.openHour,
      closeHour: settings?.waCloseHourOverride ?? global?.closeHour ?? DEFAULT_WA_LIMITS.closeHour,
      dailyCap: settings?.waDailyCapOverride ?? global?.dailyCap ?? DEFAULT_WA_LIMITS.dailyCap,
      skipSaturday: settings?.waSkipSaturdayOverride ?? global?.skipSaturday ?? DEFAULT_WA_LIMITS.skipSaturday,
      // staleMin não tem override por ótica (técnico) → só global ou default.
      staleMin: global?.staleMin ?? DEFAULT_WA_LIMITS.staleMin,
    };
  } catch (err) {
    log.warn("getWhatsappLimits: falha ao ler config — usando defaults (fail-safe)", { err, companyId });
    return DEFAULT_WA_LIMITS;
  }
}
