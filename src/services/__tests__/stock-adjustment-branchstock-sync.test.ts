import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Prevenção do "estoque fantasma" via ajuste de estoque: applyAdjustment deve
 * atualizar o BranchStock da filial (fonte que a venda debita), não só o cache
 * Product.stockQty. Sem isso, um ajuste manual cria divergência.
 */
const prismaMock: any = vi.hoisted(() => ({
  stockAdjustment: { findUnique: vi.fn() },
  product: { update: vi.fn() },
  branch: { findFirst: vi.fn() },
  branchStock: { upsert: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/validations/stock-adjustment.schema", () => ({}));

import { StockAdjustmentService } from "@/services/stock-adjustment.service";

const service = new StockAdjustmentService();

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation(async (cb: any) => cb(prismaMock));
});

describe("StockAdjustmentService.applyAdjustment — sincroniza BranchStock", () => {
  it("incrementa BranchStock da filial do ajuste (produto controlado)", async () => {
    prismaMock.stockAdjustment.findUnique.mockResolvedValue({
      id: "adj_1",
      productId: "prod_1",
      companyId: "company_1",
      branchId: "branch_x",
      quantityChange: 7,
      product: { stockControlled: true },
    });

    await service.applyAdjustment("adj_1");

    expect(prismaMock.product.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { stockQty: { increment: 7 } } })
    );
    expect(prismaMock.branchStock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { branchId_productId: { branchId: "branch_x", productId: "prod_1" } },
        create: { branchId: "branch_x", productId: "prod_1", quantity: 7 },
        update: { quantity: { increment: 7 } },
      })
    );
  });

  it("usa a filial principal quando o ajuste não tem branchId", async () => {
    prismaMock.stockAdjustment.findUnique.mockResolvedValue({
      id: "adj_2",
      productId: "prod_2",
      companyId: "company_1",
      branchId: null,
      quantityChange: -3,
      product: { stockControlled: true },
    });
    prismaMock.branch.findFirst.mockResolvedValue({ id: "branch_main" });

    await service.applyAdjustment("adj_2");

    expect(prismaMock.branchStock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { branchId_productId: { branchId: "branch_main", productId: "prod_2" } },
        update: { quantity: { increment: -3 } },
      })
    );
  });

  it("ajuste NEGATIVO sem linha BranchStock cria a linha em 0 (não negativa)", async () => {
    prismaMock.stockAdjustment.findUnique.mockResolvedValue({
      id: "adj_neg",
      productId: "prod_neg",
      companyId: "company_1",
      branchId: "branch_x",
      quantityChange: -5,
      product: { stockControlled: true },
    });

    await service.applyAdjustment("adj_neg");

    expect(prismaMock.branchStock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        // create floorado em 0 (não -5); update ainda incrementa o delta real.
        create: { branchId: "branch_x", productId: "prod_neg", quantity: 0 },
        update: { quantity: { increment: -5 } },
      })
    );
  });

  it("NÃO toca BranchStock para produto sem controle de estoque", async () => {
    prismaMock.stockAdjustment.findUnique.mockResolvedValue({
      id: "adj_3",
      productId: "prod_3",
      companyId: "company_1",
      branchId: "branch_x",
      quantityChange: 5,
      product: { stockControlled: false },
    });

    await service.applyAdjustment("adj_3");

    expect(prismaMock.product.update).toHaveBeenCalled();
    expect(prismaMock.branchStock.upsert).not.toHaveBeenCalled();
  });
});
