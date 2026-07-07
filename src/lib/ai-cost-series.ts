/**
 * Série mensal de custo × lucro de IA (Central de IA — aba "Visão Geral").
 *
 * Lógica PURA (sem banco), testável. Recebe o custo REAL em USD já somado por
 * mês (chave "YYYY-MM") e devolve custo/lucro em R$ por mês, aplicando o câmbio
 * e o markup GLOBAL atual de forma uniforme.
 *
 * APROXIMAÇÃO DOCUMENTADA: não há snapshot histórico de markup por ótica
 * (markupPercentOverride é estado ATUAL) — exatamente a mesma limitação que o
 * computeMrrSeries assume para status/preço das assinaturas. Aplicar o override
 * atual a um mês passado seria uma precisão fabricada; por isso a série histórica
 * usa o markup global (o "preço de tabela"). Os cards do MÊS CORRENTE continuam
 * usando os números exatos por-ótica (getAllCompaniesAiOverview).
 */
import { toZonedTime } from "date-fns-tz";
import { TIMEZONE } from "@/lib/date-utils";
import { usdToBrl, priceForCompany } from "@/lib/ai-pricing";

export interface AiCostTrendPoint {
  /** Rótulo curto do mês, ex.: "jan" (pt-BR). */
  month: string;
  /** Ano-mês ISO, ex.: "2026-01" (ordenação/asserção). */
  key: string;
  /** Custo real em R$ do mês (câmbio × custoUSD). */
  costBrl: number;
  /** Lucro estimado em R$ (preço − custo), markup global atual. */
  profitBrl: number;
}

const round6 = (n: number): number => Math.round(n * 1_000_000) / 1_000_000;

/**
 * Monta a série dos últimos `months` meses até `now` (inclusive), no fuso local.
 * Meses sem custo entram com zeros. Mesmo padrão de âncora/rótulo do computeMrrSeries.
 */
export function buildAiCostSeries(args: {
  /** key "YYYY-MM" → Σ custo USD do mês. Meses ausentes = 0. */
  monthlyCostUsd: Map<string, number>;
  now: Date;
  months: number;
  usdBrlRate: number;
  globalMarkupPercent: number;
}): AiCostTrendPoint[] {
  const { monthlyCostUsd, now, months, usdBrlRate, globalMarkupPercent } = args;

  // Âncora no fuso local (America/Sao_Paulo), NÃO no do servidor (UTC na Vercel).
  const anchorLocal = toZonedTime(now, TIMEZONE);
  const baseYear = anchorLocal.getFullYear();
  const baseMonth = anchorLocal.getMonth(); // 0..11

  const points: AiCostTrendPoint[] = [];
  for (let i = months - 1; i >= 0; i--) {
    // Meio do mês-alvo (dia 15, meio-dia local) — nunca vaza de mês por fuso.
    const anchor = new Date(baseYear, baseMonth - i, 15, 12, 0, 0, 0);
    const monthLocal = toZonedTime(anchor, TIMEZONE);
    const year = monthLocal.getFullYear();
    const monthIndex = monthLocal.getMonth();
    const key = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
    const month = monthLocal
      .toLocaleString("pt-BR", { month: "short", timeZone: TIMEZONE })
      .replace(".", "");

    const costUsd = monthlyCostUsd.get(key) ?? 0;
    const costBrl = usdToBrl(costUsd, usdBrlRate);
    const priceBrl = priceForCompany(costUsd, usdBrlRate, globalMarkupPercent);
    const profitBrl = round6(priceBrl - costBrl);

    points.push({ month, key, costBrl, profitBrl });
  }

  return points;
}
