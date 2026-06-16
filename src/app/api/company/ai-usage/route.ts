import { NextResponse } from "next/server";
import { requireAuth, getCompanyId, requirePermission } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getAiConfig } from "@/services/ai-config.service";
import { getMonthlyUsage, getDailyUsage } from "@/services/ai-usage.service";
import { tokensToCredits } from "@/lib/ai-pricing";
import { handleApiError } from "@/lib/error-handler";

/**
 * GET /api/company/ai-usage
 *
 * Retorna o uso de IA da ótica em CRÉDITOS — jamais em USD/BRL/custo.
 * A ótica NUNCA vê valores monetários, apenas créditos abstratos.
 *
 * Response shape:
 * {
 *   data: {
 *     iaAvailable: boolean,
 *     iaEnabled: boolean,
 *     creditsUsed: number,        // tokens do mês / creditTokenFactor
 *     creditsLimit: number | null, // null = sem limite
 *     daily: { date: string, credits: number }[]
 *   }
 * }
 *
 * NOTE: getMonthlyUsage retorna totalCostUsd e getDailyUsage retorna costUsd por dia.
 * Esses campos são IGNORADOS intencionalmente — nunca chegam ao response.
 */
export async function GET() {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    await requirePermission("company.settings");

    const [cfg, usage, daily, settings] = await Promise.all([
      getAiConfig(),
      getMonthlyUsage(companyId),
      getDailyUsage(companyId),
      prisma.companySettings.findUnique({
        where: { companyId },
        select: { iaAvailable: true, iaEnabled: true, iaMonthlyTokenLimit: true },
      }),
    ]);

    const { creditTokenFactor } = cfg;

    // Convert tokens → credits. Cost fields from services are intentionally discarded.
    const creditsUsed = tokensToCredits(usage.totalTokens, creditTokenFactor);
    const creditsLimit =
      settings?.iaMonthlyTokenLimit != null
        ? tokensToCredits(settings.iaMonthlyTokenLimit, creditTokenFactor)
        : null;

    // Map daily to {date, credits} ONLY — no costUsd, no tokens
    const dailyCredits = daily.map((d) => ({
      date: d.date,
      credits: tokensToCredits(d.tokens, creditTokenFactor),
    }));

    return NextResponse.json({
      data: {
        iaAvailable: settings?.iaAvailable ?? false,
        iaEnabled: settings?.iaEnabled ?? false,
        creditsUsed,
        creditsLimit,
        daily: dailyCredits,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
