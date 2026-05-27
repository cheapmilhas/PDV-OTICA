import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { successResponse, createdResponse } from "@/lib/api-response";
import { withPlanFeatureGuard } from "@/lib/with-plan-feature";
import { validateBranchOwnership } from "@/lib/validate-branch";

export const GET = withPlanFeatureGuard(async (_req: Request) => {
  try {
    await requireAuth();
    const companyId = await getCompanyId();

    const accounts = await prisma.financeAccount.findMany({
      where: { companyId, active: true },
      orderBy: { name: "asc" },
    });

    return successResponse(
      accounts.map((a) => ({ ...a, balance: Number(a.balance) }))
    );
  } catch (error) {
    return handleApiError(error);
  }
});

export const POST = withPlanFeatureGuard(async (req: Request) => {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    const body = await req.json();

    const { name, type, branchId } = body;

    if (!name || !type) {
      return handleApiError(new Error("name e type são obrigatórios"));
    }

    // Segurança multi-tenant: branchId deve pertencer à empresa do usuário
    if (branchId) {
      await validateBranchOwnership(branchId, companyId);
    }

    const account = await prisma.financeAccount.create({
      data: {
        companyId,
        branchId: branchId || undefined,
        name,
        type,
        balance: 0,
        isDefault: false,
      },
    });

    return createdResponse({ ...account, balance: Number(account.balance) });
  } catch (error) {
    return handleApiError(error);
  }
});
