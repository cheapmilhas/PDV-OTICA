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

    const templates = await prisma.reconciliationTemplate.findMany({
      where: { companyId, active: true },
      orderBy: { name: "asc" },
    });

    return successResponse(templates);
  } catch (error) {
    return handleApiError(error);
  }
});

export const POST = withPlanFeatureGuard(async (req: Request) => {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    const body = await req.json();

    const { name, acquirerName, columnMapping, delimiter, dateFormat, decimalSep, skipRows } = body;

    if (!name || !columnMapping) {
      return handleApiError(new Error("name e columnMapping são obrigatórios"));
    }

    const template = await prisma.reconciliationTemplate.create({
      data: {
        companyId,
        name,
        acquirerName: acquirerName || null,
        isSystem: false,
        columnMapping,
        delimiter: delimiter || ",",
        dateFormat: dateFormat || "dd/MM/yyyy",
        decimalSep: decimalSep || ",",
        skipRows: skipRows ?? 1,
      },
    });

    return createdResponse(template);
  } catch (error) {
    return handleApiError(error);
  }
});
