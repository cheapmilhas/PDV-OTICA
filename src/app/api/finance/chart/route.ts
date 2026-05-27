import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { successResponse, createdResponse } from "@/lib/api-response";
import { withPlanFeatureGuard } from "@/lib/with-plan-feature";

export const GET = withPlanFeatureGuard(async (_req: Request) => {
  try {
    await requireAuth();
    const companyId = await getCompanyId();

    const accounts = await prisma.chartOfAccounts.findMany({
      where: { companyId, active: true, parentId: null },
      include: {
        children: {
          where: { active: true },
          include: {
            children: {
              where: { active: true },
              orderBy: { code: "asc" },
            },
          },
          orderBy: { code: "asc" },
        },
      },
      orderBy: { code: "asc" },
    });

    return successResponse(accounts);
  } catch (error) {
    return handleApiError(error);
  }
});

export const POST = withPlanFeatureGuard(async (req: Request) => {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    const body = await req.json();

    const { code, name, kind, parentId } = body;

    if (!code || !name || !kind) {
      return handleApiError(new Error("code, name e kind são obrigatórios"));
    }

    const account = await prisma.chartOfAccounts.create({
      data: {
        companyId,
        code,
        name,
        kind,
        parentId: parentId || null,
        isSystem: false,
      },
    });

    return createdResponse(account);
  } catch (error) {
    return handleApiError(error);
  }
});
