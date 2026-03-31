import { NextResponse } from "next/server";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { getSubscriptionInfo } from "@/lib/subscription";
import { prisma } from "@/lib/prisma";

const ALL_FEATURES = ["crm", "goals", "campaigns", "cashback", "multi_branch", "reports_advanced"];

export async function GET() {
  try {
    await requireAuth();
    const companyId = await getCompanyId();

    // Verificar se empresa tem accessEnabled (acesso total)
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { accessEnabled: true },
    });

    if (company?.accessEnabled) {
      const allFeaturesEnabled = ALL_FEATURES.reduce(
        (acc, key) => ({ ...acc, [key]: "true" }),
        {} as Record<string, string>
      );

      return NextResponse.json({
        features: allFeaturesEnabled,
        limits: {
          maxUsers: -1,
          maxBranches: -1,
          maxProducts: -1,
          maxStorageMB: -1,
        },
      });
    }

    const info = await getSubscriptionInfo(companyId);

    if (!info) {
      return NextResponse.json({
        features: {},
        limits: {
          maxUsers: 0,
          maxBranches: 0,
          maxProducts: 0,
          maxStorageMB: 0,
        },
      });
    }

    return NextResponse.json({
      features: info.features,
      limits: info.limits,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
