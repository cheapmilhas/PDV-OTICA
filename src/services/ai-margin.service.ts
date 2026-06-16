import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

const log = logger.child({ service: "ai-margin" });
const SINGLETON_ID = "global";

/**
 * Markup efetivo (em %) a aplicar sobre o custo da IA para uma ótica.
 *
 * Resolução: override por ótica (CompanySettings.markupPercentOverride) tem
 * precedência; se nulo/inexistente, cai no global (AiGlobalConfig.markupPercent);
 * se ambos faltarem, 0.
 *
 * Fail-safe: qualquer erro (flake de banco) → 0 (conservador: nunca cobrar
 * markup extra por chute) + log de warn.
 */
export async function getEffectiveMarkup(companyId: string): Promise<number> {
  try {
    const settings = await prisma.companySettings.findUnique({
      where: { companyId },
      select: { markupPercentOverride: true },
    });
    if (settings?.markupPercentOverride != null) {
      return Number(settings.markupPercentOverride.toString());
    }

    const global = await prisma.aiGlobalConfig.findUnique({
      where: { id: SINGLETON_ID },
      select: { markupPercent: true },
    });
    if (global?.markupPercent != null) {
      return Number(global.markupPercent.toString());
    }

    return 0;
  } catch (err) {
    // Conservador: não cobramos markup por chute num erro de banco.
    log.warn("getEffectiveMarkup: falha ao ler markup — usando 0 (fail-safe)", { err, companyId });
    return 0;
  }
}
