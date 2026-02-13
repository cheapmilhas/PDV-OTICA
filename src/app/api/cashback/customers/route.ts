import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getCompanyId, getBranchId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { cashbackService } from "@/services/cashback.service";

// GET - Listar clientes com cashback
export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const branchId = await getBranchId();

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "20");

    const result = await cashbackService.listCustomersWithCashback(
      branchId,
      page,
      pageSize
    );

    return NextResponse.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
