import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { computeCostUsd } from "@/lib/ai-pricing";
import { getPricingOverrides } from "@/services/ai-config.service";
import { startOfLocalMonth, endOfLocalMonth } from "@/lib/date-utils";

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
    // Overrides de preço (Fase 4b) vêm do cache de 60s — sem query por chamada no
    // caminho quente. Vazio = tabela hardcoded (comportamento anterior).
    const overrides = await getPricingOverrides();
    const costUsd = computeCostUsd(input, overrides);
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

/** Janela [início, fim] de um mês. gte inclusivo, lte inclusivo (fim do mês). */
export interface UsageWindow {
  gte: Date;
  lte: Date;
}

/**
 * Janela do mês corrente no fuso local (BRT), em instantes UTC.
 * Corrige o bug de fuso (antes usava borda de mês em UTC → virada de mês
 * atribuía até 3h ao mês errado, divergindo do MRR/painel). Fix feito de uma vez
 * aqui e no ai-companies-overview.service (Fase 2 da Central de IA).
 * IMPORTANTE: agora a janela é FECHADA (gte..lte) — antes era só `gte` aberto;
 * com a borda em BRT, sem o teto `lte` vazariam linhas do mês seguinte.
 */
function currentMonthWindow(now: Date = new Date()): UsageWindow {
  return { gte: startOfLocalMonth(now), lte: endOfLocalMonth(now) };
}

/**
 * Uso de IA do mês corrente agrupado por dia (UTC), ordenado asc.
 * Usado pelas telas C2/C3 para exibir o gráfico histórico diário.
 * Multi-tenant por companyId.
 */
export async function getDailyUsage(
  companyId: string,
  window: UsageWindow = currentMonthWindow()
): Promise<{ date: string; tokens: number; costUsd: number }[]> {
  const rows = await prisma.aiTokenUsage.findMany({
    where: { companyId, createdAt: { gte: window.gte, lte: window.lte } },
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
export async function getInternalMonthlyUsage(
  window: UsageWindow = currentMonthWindow()
): Promise<MonthlyUsage> {
  const rows = await prisma.aiTokenUsage.findMany({
    where: { companyId: null, createdAt: { gte: window.gte, lte: window.lte } },
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
export async function getMonthlyUsage(
  companyId: string,
  window: UsageWindow = currentMonthWindow()
): Promise<MonthlyUsage> {
  const rows = await prisma.aiTokenUsage.findMany({
    where: { companyId, createdAt: { gte: window.gte, lte: window.lte } },
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
