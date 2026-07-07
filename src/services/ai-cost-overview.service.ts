import { Prisma } from "@prisma/client";
import { toZonedTime } from "date-fns-tz";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { usdToBrl } from "@/lib/ai-pricing";
import { TIMEZONE, startOfLocalMonth, endOfLocalMonth } from "@/lib/date-utils";
import { computeTrend, type Trend } from "@/lib/admin-metrics";
import { buildAiCostSeries, type AiCostTrendPoint } from "@/lib/ai-cost-series";
import { getAllCompaniesAiOverview } from "@/services/ai-companies-overview.service";
import { getInternalMonthlyUsage } from "@/services/ai-usage.service";

const log = logger.child({ service: "ai-cost-overview" });
const SINGLETON_ID = "global";

export interface AiFeatureCost {
  feature: string;
  totalTokens: number;
  costUsd: number;
  costBrl: number;
}

export interface AiCostOverview {
  /** Mês corrente, todas as óticas (números EXATOS por-ótica). */
  costBrlReal: number;
  priceBrl: number;
  profitBrl: number;
  /** Tendência do custo real e do lucro vs. mês anterior. */
  costTrend: Trend;
  profitTrend: Trend;
  /** Adoção. */
  activeShops: number;
  availableShops: number;
  /** Consumo interno/playground (companyId = null) — custo real, sem preço. */
  internal: {
    totalTokens: number;
    costUsd: number;
    costBrl: number;
  };
  /** Custo por funcionalidade no mês (todas as óticas + interno). */
  byFeature: AiFeatureCost[];
}

function toNum(v: unknown): number {
  if (v == null) return 0;
  return Number((v as { toString(): string }).toString());
}

const round6 = (n: number): number => Math.round(n * 1_000_000) / 1_000_000;

/**
 * Cards do topo + custo por feature do MÊS CORRENTE (BRT).
 * - Cards de custo/preço/lucro reusam getAllCompaniesAiOverview (fonte única:
 *   batem com a aba "Óticas"), somando as linhas — números EXATOS por-ótica.
 * - Tendência: compara com o mês anterior (aproximação com markup global, pois
 *   não há snapshot histórico — ver ai-cost-series).
 * `now` injetável para teste.
 */
export async function getAiCostOverview(now: Date = new Date()): Promise<AiCostOverview> {
  const gte = startOfLocalMonth(now);
  const lte = endOfLocalMonth(now);

  // Mês anterior: âncora no dia 15 do mês passado (nunca vaza por fuso).
  // ⚠️ Derivar ano/mês do fuso LOCAL (BRT), não do servidor (UTC na Vercel):
  // na 1ª hora do dia 1 em UTC ainda é o mês anterior em BRT — ler now.getMonth()
  // cru reintroduziria o bug de fuso que esta fase corrige.
  const nowLocal = toZonedTime(now, TIMEZONE);
  const prevAnchor = new Date(nowLocal.getFullYear(), nowLocal.getMonth() - 1, 15, 12, 0, 0, 0);
  const prevGte = startOfLocalMonth(prevAnchor);
  const prevLte = endOfLocalMonth(prevAnchor);

  const config = await prisma.aiGlobalConfig.upsert({
    where: { id: SINGLETON_ID },
    update: {},
    create: { id: SINGLETON_ID },
  });
  const usdBrlRate = toNum(config.usdBrlRate);
  const globalMarkup = toNum(config.markupPercent);

  const [rows, internalUsage, featureGroups, prevAgg] = await Promise.all([
    // Números exatos do mês corrente por ótica.
    getAllCompaniesAiOverview(now),
    // Consumo interno/playground (companyId = null) no mês.
    getInternalMonthlyUsage({ gte, lte }),
    // Custo por feature — inclui companyId=null (interno) p/ dar o total real.
    prisma.aiTokenUsage.groupBy({
      by: ["feature"],
      where: { createdAt: { gte, lte } },
      _sum: {
        inputTokens: true,
        outputTokens: true,
        cacheTokens: true,
        cacheWriteTokens: true,
        costUsd: true,
      },
    }),
    // Custo real (USD) do mês anterior — todas as óticas (p/ tendência).
    prisma.aiTokenUsage.aggregate({
      where: { companyId: { not: null }, createdAt: { gte: prevGte, lte: prevLte } },
      _sum: { costUsd: true },
    }),
  ]);

  // Agrega as linhas do mês corrente (fonte única = aba "Óticas").
  let costBrlReal = 0;
  let priceBrl = 0;
  let profitBrl = 0;
  let activeShops = 0;
  let availableShops = 0;
  for (const r of rows) {
    costBrlReal += r.costBrlReal;
    priceBrl += r.priceBrl;
    profitBrl += r.lucroBrl;
    if (r.iaEnabled) activeShops += 1;
    if (r.iaAvailable) availableShops += 1;
  }
  costBrlReal = round6(costBrlReal);
  priceBrl = round6(priceBrl);
  profitBrl = round6(profitBrl);

  // Tendência: mês anterior com markup global (aproximação — sem snapshot).
  const prevCostUsd = toNum(prevAgg._sum.costUsd);
  const prevCostBrl = usdToBrl(prevCostUsd, usdBrlRate);
  const prevPriceBrl = round6(prevCostUsd * usdBrlRate * (1 + globalMarkup / 100));
  const prevProfitBrl = round6(Math.max(0, prevPriceBrl) - prevCostBrl);

  const costTrend = computeTrend(costBrlReal, prevCostBrl);
  const profitTrend = computeTrend(profitBrl, prevProfitBrl);

  const byFeature: AiFeatureCost[] = featureGroups
    .map((g) => {
      const s = g._sum;
      const totalTokens =
        (s.inputTokens ?? 0) +
        (s.outputTokens ?? 0) +
        (s.cacheTokens ?? 0) +
        (s.cacheWriteTokens ?? 0);
      const costUsd = toNum(s.costUsd);
      return {
        feature: g.feature,
        totalTokens,
        costUsd: round6(costUsd),
        costBrl: usdToBrl(costUsd, usdBrlRate),
      };
    })
    .sort((a, b) => b.costBrl - a.costBrl);

  return {
    costBrlReal,
    priceBrl,
    profitBrl,
    costTrend,
    profitTrend,
    activeShops,
    availableShops,
    internal: {
      totalTokens: internalUsage.totalTokens,
      costUsd: internalUsage.totalCostUsd,
      costBrl: usdToBrl(internalUsage.totalCostUsd, usdBrlRate),
    },
    byFeature,
  };
}

interface MonthCostRaw {
  key: string;
  cost_usd: string | number | null;
}

/**
 * Série de `months` meses até `now` (inclusive): custo real × lucro estimado (R$).
 * UMA query ($queryRaw com date_trunc em BRT) soma o custo por mês; a matemática
 * (câmbio + markup global) fica no buildAiCostSeries (puro/testável).
 * Exclui companyId=null (interno não tem preço/lucro; entra só nos cards).
 */
export async function getAiCostTrend(now: Date, months: number): Promise<AiCostTrendPoint[]> {
  // Âncora do mês mais antigo da janela (dia 15 p/ não vazar por fuso).
  // Ano/mês do fuso LOCAL (BRT), não do servidor (UTC) — mesmo cuidado do
  // buildAiCostSeries; senão a janela inteira desliza um mês na 1ª hora do dia 1.
  const nowLocal = toZonedTime(now, TIMEZONE);
  const oldestAnchor = new Date(nowLocal.getFullYear(), nowLocal.getMonth() - (months - 1), 15, 12, 0, 0, 0);
  const gte = startOfLocalMonth(oldestAnchor);
  const lte = endOfLocalMonth(now);

  const config = await prisma.aiGlobalConfig.upsert({
    where: { id: SINGLETON_ID },
    update: {},
    create: { id: SINGLETON_ID },
  });
  const usdBrlRate = toNum(config.usdBrlRate);
  const globalMarkup = toNum(config.markupPercent);

  // Bucketiza em BRT para a virada de mês cair no mês local correto; o WHERE
  // continua em instantes UTC (usa o índice [companyId, createdAt]).
  // ⚠️ createdAt é TIMESTAMP sem fuso, guardando o instante em UTC (padrão Prisma).
  // Para obter a hora-de-parede em São Paulo: primeiro `AT TIME ZONE 'UTC'` lê o
  // valor naive COMO utc (→ timestamptz); depois `AT TIME ZONE 'America/Sao_Paulo'`
  // renderiza esse instante no relógio local. Fazer só um AT TIME ZONE trataria o
  // valor como se já fosse horário de SP e daria o mês errado.
  const rawRows = await prisma.$queryRaw<MonthCostRaw[]>(Prisma.sql`
    SELECT to_char(
             date_trunc('month', ("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo'),
             'YYYY-MM'
           ) AS key,
           SUM("costUsd") AS cost_usd
    FROM "AiTokenUsage"
    WHERE "createdAt" >= ${gte}
      AND "createdAt" <= ${lte}
      AND "companyId" IS NOT NULL
    GROUP BY 1
    ORDER BY 1
  `);

  const monthlyCostUsd = new Map<string, number>();
  for (const r of rawRows) {
    monthlyCostUsd.set(r.key, toNum(r.cost_usd));
  }

  const series = buildAiCostSeries({ monthlyCostUsd, now, months, usdBrlRate, globalMarkupPercent: globalMarkup });
  log.info("série de custo de IA montada", { months, points: series.length });
  return series;
}
