import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCompanyId } from "@/lib/auth-helpers";
import { auth } from "@/auth";

type Category =
  | "sales"
  | "customers"
  | "serviceOrders"
  | "prescriptions"
  | "products"
  | "labs"
  | "finance"
  | "commissions"
  | "quotes"
  | "stockMovements"
  | "all";

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== "ADMIN") {
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: "Apenas administradores podem executar esta ação." } },
        { status: 403 }
      );
    }

    const companyId = await getCompanyId();
    const body = await req.json();
    const { category, confirmation } = body as {
      category: Category;
      confirmation: string;
    };

    if (!category) {
      return NextResponse.json(
        { error: { code: "BAD_REQUEST", message: "Categoria é obrigatória." } },
        { status: 400 }
      );
    }

    const expectedConfirmation = category === "all" ? "ZERAR SISTEMA" : "EXCLUIR";
    if (confirmation !== expectedConfirmation) {
      return NextResponse.json(
        { error: { code: "BAD_REQUEST", message: `Confirmação inválida. Digite "${expectedConfirmation}".` } },
        { status: 400 }
      );
    }

    const userId = session.user.id;
    let deletedCount = 0;

    await prisma.$transaction(async (tx) => {
      // Helper to log the deletion
      const logDeletion = async (entityType: string, count: number) => {
        if (count > 0) {
          await tx.auditLog.create({
            data: {
              companyId,
              userId,
              action: "BULK_DELETE",
              entityType,
              entityId: "bulk",
              newData: { category, count, timestamp: new Date().toISOString() },
            },
          });
        }
      };

      if (category === "sales" || category === "all") {
        // Delete sale-related data in correct FK order
        const saleIds = (await tx.sale.findMany({ where: { companyId }, select: { id: true } })).map((s) => s.id);

        if (saleIds.length > 0) {
          // RefundItems → Refunds
          const refundIds = (await tx.refund.findMany({ where: { saleId: { in: saleIds } }, select: { id: true } })).map((r) => r.id);
          if (refundIds.length > 0) {
            await tx.refundItem.deleteMany({ where: { refundId: { in: refundIds } } });
          }
          await tx.refund.deleteMany({ where: { saleId: { in: saleIds } } });

          // SaleItemLot
          const saleItemIds = (await tx.saleItem.findMany({ where: { saleId: { in: saleIds } }, select: { id: true } })).map((si) => si.id);
          if (saleItemIds.length > 0) {
            await tx.saleItemLot.deleteMany({ where: { saleItemId: { in: saleItemIds } } });
          }

          // CampaignBonusEntry
          await tx.campaignBonusEntry.deleteMany({ where: { saleId: { in: saleIds } } });

          // Warranties linked to sale
          await tx.warranty.deleteMany({ where: { saleId: { in: saleIds } } });

          // StockReservations linked to sale
          await tx.stockReservation.deleteMany({ where: { saleId: { in: saleIds } } });

          // CashbackMovements
          await tx.cashbackMovement.deleteMany({ where: { saleId: { in: saleIds } } });

          // AccountReceivable linked to sale
          await tx.accountReceivable.deleteMany({ where: { saleId: { in: saleIds } } });

          // Commissions linked to sale
          await tx.commission.deleteMany({ where: { saleId: { in: saleIds } } });

          // CashMovements linked to payments
          const paymentIds = (await tx.salePayment.findMany({ where: { saleId: { in: saleIds } }, select: { id: true } })).map((p) => p.id);
          if (paymentIds.length > 0) {
            await tx.reconciliationItem.deleteMany({ where: { matchedSalePaymentId: { in: paymentIds } } });
            await tx.cashMovement.deleteMany({ where: { salePaymentId: { in: paymentIds } } });
          }

          // SalePayments
          await tx.salePayment.deleteMany({ where: { saleId: { in: saleIds } } });

          // SaleItems
          await tx.saleItem.deleteMany({ where: { saleId: { in: saleIds } } });

          // FinanceEntries linked to sales
          await tx.financeEntry.deleteMany({ where: { companyId, sourceType: "Sale", sourceId: { in: saleIds } } });
          await tx.financeEntry.deleteMany({ where: { companyId, sourceType: "SalePayment", sourceId: { in: paymentIds } } });

          // Sales
          const result = await tx.sale.deleteMany({ where: { companyId } });
          deletedCount += result.count;
          await logDeletion("Sale", result.count);
        }
      }

      if (category === "quotes" || category === "all") {
        const quoteIds = (await tx.quote.findMany({ where: { companyId }, select: { id: true } })).map((q) => q.id);
        if (quoteIds.length > 0) {
          await tx.quoteFollowUp.deleteMany({ where: { quoteId: { in: quoteIds } } });
          await tx.quoteItem.deleteMany({ where: { quoteId: { in: quoteIds } } });
          const result = await tx.quote.deleteMany({ where: { companyId } });
          deletedCount += result.count;
          await logDeletion("Quote", result.count);
        }
      }

      if (category === "serviceOrders" || category === "all") {
        const soIds = (await tx.serviceOrder.findMany({ where: { companyId }, select: { id: true } })).map((so) => so.id);
        if (soIds.length > 0) {
          await tx.frameMeasurement.deleteMany({ where: { serviceOrderId: { in: soIds } } });
          await tx.qualityChecklist.deleteMany({ where: { serviceOrderId: { in: soIds } } });
          await tx.serviceOrderHistory.deleteMany({ where: { serviceOrderId: { in: soIds } } });
          await tx.serviceOrderItem.deleteMany({ where: { serviceOrderId: { in: soIds } } });
          await tx.stockReservation.deleteMany({ where: { serviceOrderId: { in: soIds } } });
          await tx.warranty.deleteMany({ where: { serviceOrderId: { in: soIds } } });
          await tx.warrantyClaim.deleteMany({ where: { warrantyOrderId: { in: soIds } } });
          const result = await tx.serviceOrder.deleteMany({ where: { companyId } });
          deletedCount += result.count;
          await logDeletion("ServiceOrder", result.count);
        }
      }

      if (category === "prescriptions" || category === "all") {
        const prescIds = (await tx.prescription.findMany({ where: { companyId }, select: { id: true } })).map((p) => p.id);
        if (prescIds.length > 0) {
          await tx.prescriptionValues.deleteMany({ where: { prescriptionId: { in: prescIds } } });
          // Unlink service orders from prescriptions first
          await tx.serviceOrder.updateMany({ where: { companyId, prescriptionId: { in: prescIds } }, data: { prescriptionId: null } });
          const result = await tx.prescription.deleteMany({ where: { companyId } });
          deletedCount += result.count;
          await logDeletion("Prescription", result.count);
        }
      }

      if (category === "customers" || category === "all") {
        const customerIds = (await tx.customer.findMany({ where: { companyId }, select: { id: true } })).map((c) => c.id);
        if (customerIds.length > 0) {
          await tx.customerContact.deleteMany({ where: { customerId: { in: customerIds } } });
          await tx.customerCashback.deleteMany({ where: { customerId: { in: customerIds } } });
          await tx.loyaltyPoints.deleteMany({ where: { customerId: { in: customerIds } } });
          await tx.reminder.deleteMany({ where: { customerId: { in: customerIds } } });
          await tx.customerReminder.deleteMany({ where: { customerId: { in: customerIds } } });
          await tx.crmContact.deleteMany({ where: { customerId: { in: customerIds } } });
          // Unlink sales and service orders
          await tx.sale.updateMany({ where: { companyId, customerId: { in: customerIds } }, data: { customerId: null } });
          await tx.accountReceivable.deleteMany({ where: { customerId: { in: customerIds } } });
          const result = await tx.customer.deleteMany({ where: { companyId } });
          deletedCount += result.count;
          await logDeletion("Customer", result.count);
        }
      }

      if (category === "products" || category === "all") {
        const productIds = (await tx.product.findMany({ where: { companyId }, select: { id: true } })).map((p) => p.id);
        if (productIds.length > 0) {
          await tx.frameDetail.deleteMany({ where: { productId: { in: productIds } } });
          await tx.contactLensDetail.deleteMany({ where: { productId: { in: productIds } } });
          await tx.accessoryDetail.deleteMany({ where: { productId: { in: productIds } } });
          await tx.serviceDetail.deleteMany({ where: { productId: { in: productIds } } });
          await tx.lensServiceDetail.deleteMany({ where: { productId: { in: productIds } } });
          await tx.productBarcode.deleteMany({ where: { productId: { in: productIds } } });
          await tx.productCampaignItem.deleteMany({ where: { productId: { in: productIds } } });
          await tx.inventoryLot.deleteMany({ where: { productId: { in: productIds } } });
          await tx.stockAdjustment.deleteMany({ where: { productId: { in: productIds } } });
          await tx.stockMovement.deleteMany({ where: { productId: { in: productIds } } });
          await tx.stockReservation.deleteMany({ where: { productId: { in: productIds } } });
          // Unlink SaleItems and QuoteItems (nullify productId)
          await tx.saleItem.updateMany({ where: { productId: { in: productIds } }, data: { productId: null } });
          await tx.quoteItem.updateMany({ where: { productId: { in: productIds } }, data: { productId: null } });
          await tx.serviceOrderItem.updateMany({ where: { productId: { in: productIds } }, data: { productId: null } });
          const result = await tx.product.deleteMany({ where: { companyId } });
          deletedCount += result.count;
          await logDeletion("Product", result.count);
        }
      }

      if (category === "labs" || category === "all") {
        const labIds = (await tx.lab.findMany({ where: { companyId }, select: { id: true } })).map((l) => l.id);
        if (labIds.length > 0) {
          await tx.labPriceRange.deleteMany({ where: { labId: { in: labIds } } });
          await tx.lensServiceDetail.deleteMany({ where: { labId: { in: labIds } } });
          // Unlink service orders and items
          await tx.serviceOrder.updateMany({ where: { companyId, laboratoryId: { in: labIds } }, data: { laboratoryId: null } });
          await tx.serviceOrderItem.updateMany({ where: { labId: { in: labIds } }, data: { labId: null } });
          const result = await tx.lab.deleteMany({ where: { companyId } });
          deletedCount += result.count;
          await logDeletion("Lab", result.count);
        }
      }

      if (category === "finance" || category === "all") {
        // FinanceEntries
        const feResult = await tx.financeEntry.deleteMany({ where: { companyId } });
        deletedCount += feResult.count;
        await logDeletion("FinanceEntry", feResult.count);

        // AccountsPayable
        const apResult = await tx.accountPayable.deleteMany({ where: { companyId } });
        deletedCount += apResult.count;
        await logDeletion("AccountPayable", apResult.count);

        // AccountsReceivable (not linked to sales/customers already deleted)
        const arResult = await tx.accountReceivable.deleteMany({ where: { companyId } });
        deletedCount += arResult.count;
        await logDeletion("AccountReceivable", arResult.count);

        // ReconciliationItems → ReconciliationBatches
        const batchIds = (await tx.reconciliationBatch.findMany({ where: { companyId }, select: { id: true } })).map((b) => b.id);
        if (batchIds.length > 0) {
          await tx.reconciliationItem.deleteMany({ where: { batchId: { in: batchIds } } });
          await tx.reconciliationBatch.deleteMany({ where: { companyId } });
        }

        // DailyAgg
        await tx.dailyAgg.deleteMany({ where: { companyId } });

        // DREReport
        await tx.dREReport.deleteMany({ where: { companyId } });
      }

      if (category === "commissions" || category === "all") {
        const result = await tx.commission.deleteMany({ where: { companyId } });
        deletedCount += result.count;
        await logDeletion("Commission", result.count);

        const scResult = await tx.sellerCommission.deleteMany({ where: { branch: { companyId } } });
        deletedCount += scResult.count;
        await logDeletion("SellerCommission", scResult.count);
      }

      if (category === "stockMovements" || category === "all") {
        const smResult = await tx.stockMovement.deleteMany({ where: { companyId } });
        deletedCount += smResult.count;
        await logDeletion("StockMovement", smResult.count);

        const saResult = await tx.stockAdjustment.deleteMany({ where: { companyId } });
        deletedCount += saResult.count;
        await logDeletion("StockAdjustment", saResult.count);
      }

      // For "all" - also clean additional data
      if (category === "all") {
        // CashShifts & CashMovements
        await tx.cashMovement.deleteMany({ where: { cashShift: { companyId } } });
        await tx.cashShift.deleteMany({ where: { companyId } });

        // Warranties & WarrantyClaims
        await tx.warrantyClaim.deleteMany({ where: { warranty: { companyId } } });
        await tx.warranty.deleteMany({ where: { companyId } });

        // Cashback
        await tx.cashbackMovement.deleteMany({ where: { customerCashback: { branch: { companyId } } } });
        await tx.customerCashback.deleteMany({ where: { branch: { companyId } } });
        await tx.loyaltyPoints.deleteMany({ where: { companyId } });

        // Reminders & Appointments
        await tx.reminder.deleteMany({ where: { branch: { companyId } } });

        // CRM data
        await tx.customerReminder.deleteMany({ where: { companyId } });
        await tx.crmContact.deleteMany({ where: { companyId } });

        // Campaigns
        await tx.campaignSellerProgress.deleteMany({ where: { campaign: { companyId } } });
        await tx.campaignBonusEntry.deleteMany({ where: { companyId } });
        await tx.productCampaignItem.deleteMany({ where: { campaign: { companyId } } });
        await tx.productCampaign.deleteMany({ where: { companyId } });

        // Goals
        await tx.sellerGoal.deleteMany({ where: { salesGoal: { branch: { companyId } } } });
        await tx.salesGoal.deleteMany({ where: { branch: { companyId } } });

        // Counters - reset
        await tx.counter.deleteMany({ where: { companyId } });

        // Audit log entry for full reset
        await tx.auditLog.create({
          data: {
            companyId,
            userId,
            action: "SYSTEM_RESET",
            entityType: "System",
            entityId: companyId,
            newData: { timestamp: new Date().toISOString(), resetBy: session.user.email },
          },
        });
      }
    }, { timeout: 120000 }); // 2 min timeout for large deletions

    return NextResponse.json({
      success: true,
      deletedCount,
      category,
    });
  } catch (error) {
    console.error("Error deleting data:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL", message: "Erro ao excluir dados. Tente novamente." } },
      { status: 500 }
    );
  }
}
