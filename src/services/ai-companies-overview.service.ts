import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { usdToBrl, priceForCompany } from "@/lib/ai-pricing";
import { startOfLocalMonth, endOfLocalMonth } from "@/lib/date-utils";

const log = logger.child({ service: "ai-companies-overview" });
const SINGLETON_ID = "global";

/**
 * Uma linha da tabela central de óticas (aba "Óticas" da Central de IA).
 * Traz, por ótica, os controles (flags/cota/override) + os números do mês
 * (gasto real, margem efetiva, preço cobrado, lucro/subsídio).
 */
export interface CompanyAiOverviewRow {
  companyId: string;
  companyName: string;
  iaAvailable: boolean;
  iaEnabled: boolean;
  iaMonthlyTokenLimit: number | null;
  /** Override de margem por ótica (null = usa o markup global). */
  markupPercentOverride: number | null;
  /** Tokens totais consumidos no mês (input+output+cache+cacheWrite). */
  totalTokens: number;
  /** Custo real em USD (soma do mês). */
  totalCostUsd: number;
  /** Custo real em R$ (sem margem) — o que o Vis paga ao provedor. */
  costBrlReal: number;
  /** Margem efetiva aplicada (override ?? global). */
  markupPercent: number;
  /** Preço que a ótica paga = custo × câmbio × (1 + margem%). */
  priceBrl: number;
  /** Lucro (ou subsídio, se negativo) = preço − custo. */
  lucroBrl: number;
}

function toNum(v: unknown): number {
  if (v == null) return 0;
  return Number((v as { toString(): string }).toString());
}

const round6 = (n: number): number => Math.round(n * 1_000_000) / 1_000_000;

/**
 * Visão central de TODAS as óticas com IA disponível/ativa, com o gasto do mês
 * agregado por ótica. Só para o super admin (a rota/página já exigem SUPER_ADMIN).
 *
 * PERFORMANCE (crítico): faz UMA query agregada (`groupBy` por companyId no mês),
 * NÃO uma query por ótica. O join ótica↔uso é feito em memória. Evita o N+1 que
 * derrubaria a página quando houver dezenas/centenas de óticas.
 *
 * As linhas vêm ordenadas por lucro desc (quem dá mais lucro primeiro) — o
 * dono pediu "achar quem consome/rende mais". A UI pode reordenar client-side.
 */
export async function getAllCompaniesAiOverview(now: Date = new Date()): Promise<CompanyAiOverviewRow[]> {
  // Janela do mês no fuso local (BRT). MESMA fronteira usada por getMonthlyUsage
  // no ai-usage.service, de propósito: a tabela central e o painel por-cliente
  // exibem o MESMO "gasto do mês". O fix de fuso foi feito nos dois lugares de uma
  // vez (Fase 2 da Central de IA) — não divergir.
  const gte = startOfLocalMonth(now);
  const lte = endOfLocalMonth(now);

  // 1 config global (câmbio + markup global) — lido uma vez, reusado p/ todas.
  const [config, settingsRows, usageRows] = await Promise.all([
    prisma.aiGlobalConfig.upsert({
      where: { id: SINGLETON_ID },
      update: {},
      create: { id: SINGLETON_ID },
    }),
    // Só óticas com IA disponível OU ativa (as que fazem parte da gestão de IA).
    prisma.companySettings.findMany({
      where: { OR: [{ iaAvailable: true }, { iaEnabled: true }] },
      select: {
        companyId: true,
        iaAvailable: true,
        iaEnabled: true,
        iaMonthlyTokenLimit: true,
        markupPercentOverride: true,
        company: { select: { id: true, name: true } },
      },
    }),
    // 1 groupBy agregado (batch) — soma tokens + custo por ótica no mês corrente.
    prisma.aiTokenUsage.groupBy({
      by: ["companyId"],
      where: { companyId: { not: null }, createdAt: { gte, lte } },
      _sum: {
        inputTokens: true,
        outputTokens: true,
        cacheTokens: true,
        cacheWriteTokens: true,
        costUsd: true,
      },
    }),
  ]);

  const usdBrlRate = toNum(config.usdBrlRate);
  const globalMarkup = toNum(config.markupPercent);

  // Índice do uso por companyId (join em memória — não N+1).
  const usageByCompany = new Map<
    string,
    { totalTokens: number; totalCostUsd: number }
  >();
  for (const u of usageRows) {
    if (!u.companyId) continue;
    const s = u._sum;
    const totalTokens =
      (s.inputTokens ?? 0) +
      (s.outputTokens ?? 0) +
      (s.cacheTokens ?? 0) +
      (s.cacheWriteTokens ?? 0);
    usageByCompany.set(u.companyId, {
      totalTokens,
      totalCostUsd: toNum(s.costUsd),
    });
  }

  const rows: CompanyAiOverviewRow[] = settingsRows.map((s) => {
    const usage = usageByCompany.get(s.companyId) ?? { totalTokens: 0, totalCostUsd: 0 };
    const override = s.markupPercentOverride != null ? toNum(s.markupPercentOverride) : null;
    // Markup efetivo: override por ótica tem precedência; senão o global.
    const markupPercent = override ?? globalMarkup;

    const costBrlReal = usdToBrl(usage.totalCostUsd, usdBrlRate);
    const priceBrl = priceForCompany(usage.totalCostUsd, usdBrlRate, markupPercent);
    const lucroBrl = round6(priceBrl - costBrlReal);

    return {
      companyId: s.companyId,
      companyName: s.company?.name ?? "—",
      iaAvailable: s.iaAvailable,
      iaEnabled: s.iaEnabled,
      iaMonthlyTokenLimit: s.iaMonthlyTokenLimit,
      markupPercentOverride: override,
      totalTokens: usage.totalTokens,
      totalCostUsd: round6(usage.totalCostUsd),
      costBrlReal,
      markupPercent,
      priceBrl,
      lucroBrl,
    };
  });

  // Ordena por lucro desc; tiebreak por nome asc (estável entre refreshes).
  rows.sort((a, b) => b.lucroBrl - a.lucroBrl || a.companyName.localeCompare(b.companyName, "pt-BR"));

  log.info("overview de IA das óticas montado", { count: rows.length });
  return rows;
}
