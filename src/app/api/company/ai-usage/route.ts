import { NextResponse } from "next/server";
import { requireAuth, getCompanyId, requirePermission } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getAiConfig } from "@/services/ai-config.service";
import { getMonthlyUsage, getDailyUsage } from "@/services/ai-usage.service";
import { getEffectiveMarkup } from "@/services/ai-margin.service";
import { tokensToCredits, priceForCompany } from "@/lib/ai-pricing";
import { handleApiError } from "@/lib/error-handler";

/**
 * GET /api/company/ai-usage
 *
 * Retorna o uso de IA da ótica em CRÉDITOS + R$ JÁ COM A MARGEM EMBUTIDA.
 * A ótica vê o PREÇO que paga (priceBrl), mas NUNCA o custo real nem o markup.
 *
 * Response shape:
 * {
 *   data: {
 *     iaAvailable: boolean,
 *     iaEnabled: boolean,
 *     creditsUsed: number,         // tokens do mês / creditTokenFactor
 *     creditsLimit: number | null, // null = sem limite
 *     priceBrl: number,            // R$ total do mês — margem JÁ embutida
 *     daily: { date: string, credits: number, priceBrl: number }[]
 *   }
 * }
 *
 * SEGURANÇA: getMonthlyUsage retorna totalCostUsd e getDailyUsage retorna costUsd
 * por dia. O custo bruto, o markup% e o lucro JAMAIS chegam ao response — só o
 * preço final (priceForCompany = custo × câmbio × (1 + markup%)). O mapeamento é
 * explícito (sem ...spread) para que nenhum campo de custo/markup vaze.
 */
export async function GET() {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    await requirePermission("company.settings");

    const [cfg, usage, daily, settings, markup] = await Promise.all([
      getAiConfig(),
      getMonthlyUsage(companyId),
      getDailyUsage(companyId),
      prisma.companySettings.findUnique({
        where: { companyId },
        select: { iaAvailable: true, iaEnabled: true, iaMonthlyTokenLimit: true },
      }),
      getEffectiveMarkup(companyId),
    ]);

    const { creditTokenFactor, usdBrlRate } = cfg;

    // Convert tokens → credits. Raw cost fields from services are intentionally discarded.
    const creditsUsed = tokensToCredits(usage.totalTokens, creditTokenFactor);
    const creditsLimit =
      settings?.iaMonthlyTokenLimit != null
        ? tokensToCredits(settings.iaMonthlyTokenLimit, creditTokenFactor)
        : null;

    // R$ total do mês com a margem JÁ embutida (custo × câmbio × (1 + markup%)).
    const priceBrl = priceForCompany(usage.totalCostUsd, usdBrlRate, markup);

    // Map daily to {date, credits, priceBrl} ONLY — never costUsd, never tokens, never markup.
    const dailyOutput = daily.map((d) => ({
      date: d.date,
      credits: tokensToCredits(d.tokens, creditTokenFactor),
      priceBrl: priceForCompany(d.costUsd, usdBrlRate, markup),
    }));

    return NextResponse.json({
      data: {
        iaAvailable: settings?.iaAvailable ?? false,
        iaEnabled: settings?.iaEnabled ?? false,
        creditsUsed,
        creditsLimit,
        priceBrl,
        daily: dailyOutput,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
