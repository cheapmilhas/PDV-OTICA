import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCompanyId } from "@/lib/auth-helpers";
import { auth } from "@/auth";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: "Apenas administradores podem acessar." } },
        { status: 403 }
      );
    }

    const companyId = await getCompanyId();

    const [
      sales,
      customers,
      serviceOrders,
      prescriptions,
      products,
      labs,
      financeEntries,
      accountsPayable,
      accountsReceivable,
      commissions,
      quotes,
      stockMovements,
      stockAdjustments,
    ] = await Promise.all([
      prisma.sale.count({ where: { companyId } }),
      prisma.customer.count({ where: { companyId } }),
      prisma.serviceOrder.count({ where: { companyId } }),
      prisma.prescription.count({ where: { companyId } }),
      prisma.product.count({ where: { companyId } }),
      prisma.lab.count({ where: { companyId } }),
      prisma.financeEntry.count({ where: { companyId } }),
      prisma.accountPayable.count({ where: { companyId } }),
      prisma.accountReceivable.count({ where: { companyId } }),
      prisma.commission.count({ where: { companyId } }),
      prisma.quote.count({ where: { companyId } }),
      prisma.stockMovement.count({ where: { companyId } }),
      prisma.stockAdjustment.count({ where: { companyId } }),
    ]);

    return NextResponse.json({
      sales,
      customers,
      serviceOrders,
      prescriptions,
      products,
      labs,
      financeEntries,
      accountsPayable,
      accountsReceivable,
      commissions,
      quotes,
      stockMovements,
      stockAdjustments,
    });
  } catch (error) {
    console.error("Error counting records:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL", message: "Erro ao contar registros." } },
      { status: 500 }
    );
  }
}
