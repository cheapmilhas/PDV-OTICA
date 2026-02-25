import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { successResponse, createdResponse } from "@/lib/api-response";

export async function GET() {
  try {
    await requireAuth();
    const companyId = await getCompanyId();

    const rules = await prisma.reconciliationRule.findMany({
      where: { companyId, active: true },
      orderBy: { priority: "asc" },
    });

    return successResponse(rules);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    const body = await req.json();

    const { name, description, matchCriteria, autoApprove, priority } = body;

    if (!name || !matchCriteria) {
      return handleApiError(new Error("name e matchCriteria são obrigatórios"));
    }

    const rule = await prisma.reconciliationRule.create({
      data: {
        companyId,
        name,
        description: description || null,
        matchCriteria,
        autoApprove: autoApprove ?? false,
        priority: priority ?? 0,
      },
    });

    return createdResponse(rule);
  } catch (error) {
    return handleApiError(error);
  }
}
