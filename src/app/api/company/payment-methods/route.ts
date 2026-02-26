import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { prisma } from "@/lib/prisma";
import { ONBOARDING_TO_PRISMA, DEFAULT_PAYMENT_METHOD_IDS } from "@/lib/payment-methods";

/**
 * GET /api/company/payment-methods
 * Returns the list of enabled payment method IDs (Prisma enum format)
 * based on what was configured during onboarding.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { settings: true },
    });

    const settings = (company?.settings as Record<string, unknown>) || {};
    const onboardingMethods = settings.paymentMethods as string[] | undefined;

    let enabledIds: string[];

    if (onboardingMethods && onboardingMethods.length > 0) {
      // Convert onboarding IDs (lowercase) to Prisma enum IDs
      enabledIds = onboardingMethods
        .map((id) => ONBOARDING_TO_PRISMA[id] || id.toUpperCase())
        .filter(Boolean);
    } else {
      enabledIds = DEFAULT_PAYMENT_METHOD_IDS;
    }

    return NextResponse.json({
      success: true,
      data: enabledIds,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
