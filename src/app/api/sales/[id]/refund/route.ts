import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, getCompanyId, getUserId } from "@/lib/auth-helpers";
import { handleApiError, notFoundError, businessRuleError } from "@/lib/error-handler";
import { createdResponse } from "@/lib/api-response";
import { generateRefundEntries } from "@/services/finance-entry.service";
import { atomicStockCredit } from "@/services/stock.service";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const companyId = await getCompanyId();
    const userId = await getUserId();
    const { id: saleId } = await params;
    const body = await req.json();

    const { reason, refundMethod, items } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      throw businessRuleError("items é obrigatório e deve conter ao menos um item");
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Buscar venda
      const sale = await tx.sale.findFirst({
        where: { id: saleId, companyId },
        include: {
          items: {
            include: {
              product: { select: { id: true, stockControlled: true, type: true } },
              lotConsumptions: true,
            },
          },
        },
      });

      if (!sale) throw notFoundError("Venda não encontrada");
      if (sale.status !== "COMPLETED") {
        throw businessRuleError("Apenas vendas COMPLETED podem ser devolvidas");
      }

      // 2. Validar itens
      let totalRefund = 0;
      let totalCost = 0;
      const refundItems: Array<{
        saleItemId: string;
        qtyReturned: number;
        refundAmount: number;
        costAmount: number;
      }> = [];

      for (const item of items) {
        const saleItem = sale.items.find((si) => si.id === item.saleItemId);
        if (!saleItem) {
          throw businessRuleError(`SaleItem ${item.saleItemId} não encontrado na venda`);
        }

        const qtyReturned = item.qtyReturned || saleItem.qty;
        if (qtyReturned > saleItem.qty) {
          throw businessRuleError(
            `Quantidade devolvida (${qtyReturned}) excede quantidade vendida (${saleItem.qty})`
          );
        }

        const unitPrice = Number(saleItem.unitPrice) - Number(saleItem.discount) / saleItem.qty;
        const refundAmount = item.refundAmount ?? unitPrice * qtyReturned;

        // Calcular custo (FIFO ou costPrice)
        let costAmount = 0;
        if (saleItem.lotConsumptions.length > 0) {
          costAmount = saleItem.lotConsumptions.reduce(
            (sum, lc) => sum + Number(lc.totalCost),
            0
          );
          // Proporcional se devolução parcial
          if (qtyReturned < saleItem.qty) {
            costAmount = (costAmount / saleItem.qty) * qtyReturned;
          }
        } else {
          costAmount = Number(saleItem.costPrice) * qtyReturned;
        }

        refundItems.push({
          saleItemId: saleItem.id,
          qtyReturned,
          refundAmount,
          costAmount,
        });

        totalRefund += refundAmount;
        totalCost += costAmount;
      }

      // 3. Criar Refund
      const refund = await tx.refund.create({
        data: {
          companyId,
          branchId: sale.branchId,
          saleId,
          customerId: sale.customerId,
          status: "COMPLETED",
          reason: reason || "Devolução solicitada",
          totalRefund,
          totalCost,
          refundMethod: refundMethod || "CASH",
          completedAt: new Date(),
          items: {
            create: refundItems.map((ri) => ({
              saleItemId: ri.saleItemId,
              qtyReturned: ri.qtyReturned,
              refundAmount: ri.refundAmount,
              costAmount: ri.costAmount,
            })),
          },
        },
        include: { items: true },
      });

      // 4. Restock — devolver ao estoque
      // Usa `atomicStockCredit` que faz upsert no BranchStock E atualiza
      // Product.stockQty atomicamente. Antes desta correção (Bug #2) o código
      // só fazia `Product.stockQty.increment`, deixando BranchStock dessincronizado.
      for (const ri of refundItems) {
        const saleItem = sale.items.find((si) => si.id === ri.saleItemId);
        if (saleItem?.product?.stockControlled && saleItem.productId) {
          const creditResult = await atomicStockCredit(
            saleItem.productId,
            ri.qtyReturned,
            companyId,
            tx,
            sale.branchId
          );
          if (!creditResult.success) {
            // Se falhar (improvável em credit), aborta a transação inteira.
            throw businessRuleError(
              creditResult.error || "Falha ao restituir estoque na devolução"
            );
          }

          // Criar StockMovement (auditoria — type CUSTOMER_RETURN)
          await tx.stockMovement.create({
            data: {
              companyId,
              productId: saleItem.productId,
              type: "CUSTOMER_RETURN",
              quantity: ri.qtyReturned,
              reason: `Devolução #${refund.id.substring(0, 8)}`,
              createdByUserId: userId,
              branchId: sale.branchId,
            },
          });
        }
      }

      // 5. Gerar lançamentos financeiros
      // Comportamento: log estruturado + NÃO bloqueia (decisão documentada —
      // refund já fez restock e criou Refund; finance é secundário).
      try {
        await generateRefundEntries(tx as any, refund.id, companyId);
      } catch (financeError) {
        console.error(
          JSON.stringify({
            level: "error",
            event: "refund_finance_entries_generation_failed",
            refundId: refund.id,
            saleId,
            companyId,
            error: financeError instanceof Error ? financeError.message : String(financeError),
            stack: financeError instanceof Error ? financeError.stack : undefined,
          })
        );
      }

      // 6. Se devolução total, atualizar status da venda
      const allItemsReturned = sale.items.every((si) => {
        const refundItem = refundItems.find((ri) => ri.saleItemId === si.id);
        return refundItem && refundItem.qtyReturned >= si.qty;
      });

      if (allItemsReturned) {
        await tx.sale.update({
          where: { id: saleId },
          data: { status: "REFUNDED" },
        });
      }

      return refund;
    });

    return createdResponse(JSON.parse(JSON.stringify(result)));
  } catch (error) {
    return handleApiError(error);
  }
}
