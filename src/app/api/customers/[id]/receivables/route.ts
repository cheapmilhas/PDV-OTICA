import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCompanyId } from "@/lib/auth-helpers";
import { handleApiError } from "@/lib/error-handler";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const companyId = await getCompanyId();
    const { id: customerId } = await params;

    const receivables = await prisma.accountReceivable.findMany({
      where: { companyId, customerId },
      select: {
        id: true,
        description: true,
        amount: true,
        receivedAmount: true,
        dueDate: true,
        receivedDate: true,
        status: true,
        installmentNumber: true,
        totalInstallments: true,
        sale: { select: { id: true } },
      },
      orderBy: { dueDate: "desc" },
    });

    const totalPending = receivables
      .filter((r) => r.status === "PENDING" || r.status === "OVERDUE")
      .reduce((sum, r) => sum + Number(r.amount), 0);

    const totalReceived = receivables
      .filter((r) => r.status === "RECEIVED")
      .reduce((sum, r) => sum + Number(r.receivedAmount || r.amount), 0);

    return NextResponse.json({
      data: receivables.map((r) => ({
        ...r,
        amount: Number(r.amount),
        receivedAmount: r.receivedAmount ? Number(r.receivedAmount) : null,
        dueDate: r.dueDate.toISOString(),
        receivedDate: r.receivedDate?.toISOString() || null,
      })),
      summary: {
        totalPending,
        totalReceived,
        count: receivables.length,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
