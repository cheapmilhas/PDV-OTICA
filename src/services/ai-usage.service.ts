import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { computeCostUsd } from "@/lib/ai-pricing";

const log = logger.child({ service: "ai-usage" });

export interface LogAiUsageInput {
  companyId: string | null;
  feature: string;
  provider: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  /** cache_read_input_tokens (leitura de cache). */
  cacheTokens?: number;
  /** cache_creation_input_tokens (escrita de cache — cobrada 1,25× o input). */
  cacheWriteTokens?: number;
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
        cacheWriteTokens: input.cacheWriteTokens ?? 0,
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
 * Uso de IA do mês corrente agrupado por dia (UTC), ordenado asc.
 * Usado pelas telas C2/C3 para exibir o gráfico histórico diário.
 * Multi-tenant por companyId.
 */
export async function getDailyUsage(companyId: string): Promise<{ date: string; tokens: number; costUsd: number }[]> {
  const rows = await prisma.aiTokenUsage.findMany({
    where: { companyId, createdAt: { gte: startOfCurrentMonth() } },
    select: { createdAt: true, inputTokens: true, outputTokens: true, cacheTokens: true, cacheWriteTokens: true, costUsd: true },
  });
  const byDay = new Map<string, { tokens: number; costUsd: number }>();
  for (const r of rows) {
    const date = r.createdAt.toISOString().slice(0, 10);
    const tokens = (r.inputTokens ?? 0) + (r.outputTokens ?? 0) + (r.cacheTokens ?? 0) + (r.cacheWriteTokens ?? 0);
    const cost = Number(r.costUsd.toString());
    const d = byDay.get(date) ?? { tokens: 0, costUsd: 0 };
    d.tokens += tokens;
    d.costUsd += cost;
    byDay.set(date, d);
  }
  return [...byDay.entries()]
    .map(([date, v]) => ({ date, tokens: v.tokens, costUsd: Math.round(v.costUsd * 1_000_000) / 1_000_000 }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Uso INTERNO/GLOBAL do mês corrente (linhas com companyId = null: playground do
 * super admin e chamadas internas). Esse gasto é real (pago à Anthropic/OpenAI)
 * mas não pertence a nenhuma ótica — sem isto, não aparecia em painel nenhum.
 * Só para o super admin.
 */
export async function getInternalMonthlyUsage(): Promise<MonthlyUsage> {
  const rows = await prisma.aiTokenUsage.findMany({
    where: { companyId: null, createdAt: { gte: startOfCurrentMonth() } },
    select: { feature: true, inputTokens: true, outputTokens: true, cacheTokens: true, cacheWriteTokens: true, costUsd: true },
  });

  const result: MonthlyUsage = { totalTokens: 0, totalCostUsd: 0, byFeature: {} };
  for (const r of rows) {
    const tokens = (r.inputTokens ?? 0) + (r.outputTokens ?? 0) + (r.cacheTokens ?? 0) + (r.cacheWriteTokens ?? 0);
    const cost = Number(r.costUsd.toString());
    result.totalTokens += tokens;
    result.totalCostUsd += cost;
    const f = (result.byFeature[r.feature] ??= { tokens: 0, costUsd: 0 });
    f.tokens += tokens;
    f.costUsd += cost;
  }
  const round6 = (n: number) => Math.round(n * 1_000_000) / 1_000_000;
  result.totalCostUsd = round6(result.totalCostUsd);
  for (const f of Object.values(result.byFeature)) {
    f.costUsd = round6(f.costUsd);
  }
  return result;
}

/**
 * Soma o uso de IA do mês corrente de uma empresa (tokens + custo + breakdown por feature).
 * Usado pelo guard (cota) e pelas telas (C2/C3). Multi-tenant por companyId.
 */
export async function getMonthlyUsage(companyId: string): Promise<MonthlyUsage> {
  const rows = await prisma.aiTokenUsage.findMany({
    where: { companyId, createdAt: { gte: startOfCurrentMonth() } },
    select: { feature: true, inputTokens: true, outputTokens: true, cacheTokens: true, cacheWriteTokens: true, costUsd: true },
  });

  const result: MonthlyUsage = { totalTokens: 0, totalCostUsd: 0, byFeature: {} };
  for (const r of rows) {
    const tokens = (r.inputTokens ?? 0) + (r.outputTokens ?? 0) + (r.cacheTokens ?? 0) + (r.cacheWriteTokens ?? 0);
    const cost = Number(r.costUsd.toString());
    result.totalTokens += tokens;
    result.totalCostUsd += cost;
    const f = (result.byFeature[r.feature] ??= { tokens: 0, costUsd: 0 });
    f.tokens += tokens;
    f.costUsd += cost;
  }
  // Arredonda em 6 casas (= precisão de Decimal(12,6)) tanto o total quanto cada
  // feature, para o total e o breakdown exibidos nas telas baterem.
  const round6 = (n: number) => Math.round(n * 1_000_000) / 1_000_000;
  result.totalCostUsd = round6(result.totalCostUsd);
  for (const f of Object.values(result.byFeature)) {
    f.costUsd = round6(f.costUsd);
  }
  return result;
}
