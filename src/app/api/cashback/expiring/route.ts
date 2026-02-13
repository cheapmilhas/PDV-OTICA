import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getCompanyId, getBranchId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { cashbackService } from "@/services/cashback.service";

// GET - Buscar cashbacks que vão expirar
export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const branchId = await getBranchId();

    const { searchParams } = new URL(request.url);
    const daysAhead = parseInt(searchParams.get("daysAhead") || "7");

    const expiring = await cashbackService.getExpiringCashbacks(
      branchId,
      daysAhead
    );

    return NextResponse.json({
      success: true,
      data: expiring,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// POST - Processar cashbacks expirados
export async function POST(request: NextRequest) {
  try {
    await requireAuth();
    const branchId = await getBranchId();

    const results = await cashbackService.processExpiredCashbacks(branchId);

    return NextResponse.json({
      success: true,
      data: results,
      message: `${results.filter((r) => r.success).length} cashbacks expirados processados`,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
