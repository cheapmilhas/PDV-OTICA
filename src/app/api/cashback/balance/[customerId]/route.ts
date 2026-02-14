import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getBranchId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/cashback/balance/[customerId]
 * Retorna saldo de cashback do cliente
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ customerId: string }> }
) {
  try {
    await requireAuth();
    const branchId = await getBranchId();
    const { customerId } = await params;

    // Buscar saldo
    const cashback = await prisma.customerCashback.findUnique({
      where: {
        customerId_branchId: {
          customerId,
          branchId,
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        balance: cashback?.balance ? Number(cashback.balance) : 0,
        totalEarned: cashback?.totalEarned ? Number(cashback.totalEarned) : 0,
        totalUsed: cashback?.totalUsed ? Number(cashback.totalUsed) : 0,
        totalExpired: cashback?.totalExpired ? Number(cashback.totalExpired) : 0,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
