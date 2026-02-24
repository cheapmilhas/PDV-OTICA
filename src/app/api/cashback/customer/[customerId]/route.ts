import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getCompanyId, getBranchId } from "@/lib/auth-helpers";
import { requirePermission } from "@/lib/auth-permissions";
import { handleApiError } from "@/lib/error-handler";
import { cashbackService } from "@/services/cashback.service";
import {
  adjustCashbackSchema,
  cashbackHistoryQuerySchema,
} from "@/lib/validations/cashback.schema";

interface Params {
  params: Promise<{ customerId: string }>;
}

// GET - Buscar cashback e histórico do cliente
export async function GET(request: NextRequest, { params }: Params) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    const { customerId } = await params;

    const { searchParams } = new URL(request.url);
    const query = cashbackHistoryQuerySchema.parse({
      page: searchParams.get("page") || 1,
      pageSize: searchParams.get("pageSize") || 20,
      startDate: searchParams.get("startDate") || undefined,
      endDate: searchParams.get("endDate") || undefined,
    });

    const branchId = await getBranchId();

    const [customerCashback, history] = await Promise.all([
      cashbackService.getCustomerCashback(customerId, branchId),
      cashbackService.getCustomerHistory(customerId, branchId, query),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        customerCashback,
        history: history.data,
        pagination: history.pagination,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// POST - Ajuste manual de cashback
export async function POST(request: NextRequest, { params }: Params) {
  try {
    await requirePermission("cashback.view");
    const companyId = await getCompanyId();
    const branchId = await getBranchId();
    const { customerId } = await params;

    const body = await request.json();
    const data = adjustCashbackSchema.parse({
      ...body,
      customerId,
    });

    const movement = await cashbackService.adjustCashback(
      data,
      branchId,
      companyId
    );

    return NextResponse.json({
      success: true,
      data: movement,
      message: "Ajuste de cashback realizado com sucesso",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
