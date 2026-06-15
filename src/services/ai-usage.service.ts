import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { computeCostUsd } from "@/lib/ai-pricing";

const log = logger.child({ service: "ai-usage" });

export interface LogAiUsageInput {
  companyId: string;
  feature: string;
  provider: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheTokens?: number;
  audioSeconds?: number;
}

/**
 * Grava uma linha de uso de IA com o custo calculado.
 * FAIL-SAFE: qualquer erro é logado e engolido — a medição NUNCA derruba a feature de IA.
 */
export async function logAiUsage(input: LogAiUsageInput): Promise<void> {
  try {
    const costUsd = computeCostUsd(input);
    await prisma.aiTokenUsage.create({
      data: {
        companyId: input.companyId,
        feature: input.feature,
        provider: input.provider,
        model: input.model,
        inputTokens: input.inputTokens ?? 0,
        outputTokens: input.outputTokens ?? 0,
        cacheTokens: input.cacheTokens ?? 0,
        audioSeconds: input.audioSeconds ?? null,
        costUsd: new Prisma.Decimal(costUsd),
      },
    });
  } catch (error) {
    log.error("falha ao gravar AiTokenUsage (engolido)", { error, companyId: input.companyId, feature: input.feature });
  }
}

export interface MonthlyUsage {
  totalTokens: number;
  totalCostUsd: number;
  byFeature: Record<string, { tokens: number; costUsd: number }>;
}

/** Início do mês corrente (UTC) — janela da cota mensal.
 *  v1 usa UTC; numa virada de mês a atribuição pode diferir do horário BR (UTC-3)
 *  por até 3h. Aceitável para a cota; revisitar ao exibir "este mês" nas telas C2/C3. */
function startOfCurrentMonth(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * Soma o uso de IA do mês corrente de uma empresa (tokens + custo + breakdown por feature).
 * Usado pelo guard (cota) e pelas telas (C2/C3). Multi-tenant por companyId.
 */
export async function getMonthlyUsage(companyId: string): Promise<MonthlyUsage> {
  const rows = await prisma.aiTokenUsage.findMany({
    where: { companyId, createdAt: { gte: startOfCurrentMonth() } },
    select: { feature: true, inputTokens: true, outputTokens: true, cacheTokens: true, costUsd: true },
  });

  const result: MonthlyUsage = { totalTokens: 0, totalCostUsd: 0, byFeature: {} };
  for (const r of rows) {
    const tokens = (r.inputTokens ?? 0) + (r.outputTokens ?? 0) + (r.cacheTokens ?? 0);
    const cost = Number(r.costUsd.toString());
    result.totalTokens += tokens;
    result.totalCostUsd += cost;
    const f = (result.byFeature[r.feature] ??= { tokens: 0, costUsd: 0 });
    f.tokens += tokens;
    f.costUsd += cost;
  }
  result.totalCostUsd = Math.round(result.totalCostUsd * 1_000_000) / 1_000_000;
  return result;
}
