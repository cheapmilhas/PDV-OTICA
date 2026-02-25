import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { successResponse, createdResponse } from "@/lib/api-response";

export async function GET() {
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
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    const body = await req.json();

    const { name, type, branchId } = body;

    if (!name || !type) {
      return handleApiError(new Error("name e type são obrigatórios"));
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
}
