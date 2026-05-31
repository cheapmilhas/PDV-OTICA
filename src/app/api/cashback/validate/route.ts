import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getCompanyId, getBranchId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { cashbackService } from "@/services/cashback.service";
import { validateCashbackUsageSchema } from "@/lib/validations/cashback.schema";

// POST - Validar uso de cashback
export async function POST(request: NextRequest) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    const branchId = await getBranchId();

    const body = await request.json();
    const data = validateCashbackUsageSchema.parse(body);

    const validation = await cashbackService.validateUsage(
      data.customerId,
      data.amount,
      data.saleTotal,
      branchId,
      companyId
    );

    return NextResponse.json({
      success: true,
      data: validation,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
