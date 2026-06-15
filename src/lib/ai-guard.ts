import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { forbiddenError, businessRuleError, AppError } from "@/lib/error-handler";
import { getMonthlyUsage } from "@/services/ai-usage.service";

const log = logger.child({ lib: "ai-guard" });

/**
 * Porteira de IA: lança se a empresa não pode rodar IA agora.
 * Regra: iaAvailable && iaEnabled && (cota null OU uso_do_mês < cota).
 *
 * Usado pela IA NOVA (Bloco B'). NÃO usar no OCR (decisão da spec: OCR mede, não bloqueia).
 *
 * Fail-safe de INFRA: se a LEITURA das settings/uso falhar por erro inesperado
 * (não uma regra de negócio), deixa passar — não trava a feature por flake de banco.
 * Erros de regra (AppError) SEMPRE propagam.
 */
export async function assertAiAllowed(companyId: string): Promise<void> {
  let settings: { iaAvailable: boolean; iaEnabled: boolean; iaMonthlyTokenLimit: number | null } | null;
  try {
    settings = await prisma.companySettings.findUnique({
      where: { companyId },
      select: { iaAvailable: true, iaEnabled: true, iaMonthlyTokenLimit: true },
    });
  } catch (error) {
    log.error("falha ao ler CompanySettings no guard — deixando passar (fail-safe)", { error, companyId });
    return;
  }

  if (!settings || !settings.iaAvailable) {
    throw forbiddenError("IA não está disponível para esta ótica.");
  }
  if (!settings.iaEnabled) {
    throw forbiddenError("IA está desligada nas configurações da ótica.");
  }

  if (settings.iaMonthlyTokenLimit != null) {
    let usage;
    try {
      usage = await getMonthlyUsage(companyId);
    } catch (error) {
      log.error("falha ao somar uso mensal no guard — deixando passar (fail-safe)", { error, companyId });
      return;
    }
    if (usage.totalTokens >= settings.iaMonthlyTokenLimit) {
      throw businessRuleError("Cota mensal de IA atingida. Aumente o limite ou aguarde o próximo mês.");
    }
  }
}

// Re-export para conveniência de quem trata o erro do guard.
export { AppError };
