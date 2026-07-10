import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Prevenção do "estoque fantasma": ao criar/editar produto com estoque, o
 * serviço grava a linha BranchStock da filial-alvo e recalcula Product.stockQty
 * como SUM(BranchStock). Em multi-filial, grava na filial resolvida (não aborta).
 */

const prismaMock: any = vi.hoisted(() => ({
  product: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  branch: { findFirst: vi.fn(), findMany: vi.fn() },
  branchStock: { upsert: vi.fn() },
  $executeRaw: vi.fn(),
  $transaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { ProductService } from "@/services/product.service";

const service = new ProductService();

// actor padrão: ADMIN sem filial fixa (força o fallback / escolha explícita).
const adminNoBranch = { role: "ADMIN", userBranchId: null };
const vendedorBranchMain = { role: "VENDEDOR", userBranchId: "branch_main" };

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation(async (cb: any) => cb(prismaMock));
  prismaMock.$executeRaw.mockResolvedValue(1);
  // Fallback "principal/mais antiga ativa" usado quando actor não tem filial.
  prismaMock.branch.findFirst.mockResolvedValue({ id: "branch_main" });
});

describe("ProductService.create — grava BranchStock na filial-alvo", () => {
  it("loja única / vendedor: grava na filial da sessão", async () => {
    prismaMock.product.create.mockResolvedValue({
      id: "prod_1",
      stockQty: 5,
      stockControlled: true,
    });

    await service.create(
      { sku: "SKU1", name: "Armação", stockQty: 5, stockControlled: true } as any,
      "company_1",
      vendedorBranchMain
    );

    expect(prismaMock.branchStock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { branchId_productId: { branchId: "branch_main", productId: "prod_1" } },
        create: { branchId: "branch_main", productId: "prod_1", quantity: 5 },
        update: { quantity: 5 },
      })
    );
    // recalc rodou (SELECT FOR UPDATE + UPDATE = 2 execuções raw).
    expect(prismaMock.$executeRaw).toHaveBeenCalled();
  });

  it("multi-filial: GRAVA na filial-alvo resolvida (não aborta)", async () => {
    // ADMIN sem filial fixa → cai na principal (branch.findFirst → branch_main).
    prismaMock.product.create.mockResolvedValue({
      id: "prod_3",
      stockQty: 10,
      stockControlled: true,
    });

    await service.create(
      { sku: "SKU3", name: "Armação", stockQty: 10, stockControlled: true } as any,
      "company_1",
      adminNoBranch
    );

    expect(prismaMock.branchStock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { branchId: "branch_main", productId: "prod_3", quantity: 10 },
        update: { quantity: 10 },
      })
    );
  });

  it("ADMIN escolhe filial explícita (branchId no DTO)", async () => {
    prismaMock.branch.findFirst.mockResolvedValue({ id: "branch_2" });
    prismaMock.product.create.mockResolvedValue({
      id: "prod_4",
      stockQty: 7,
      stockControlled: true,
    });

    await service.create(
      { sku: "SKU4", name: "Armação", stockQty: 7, stockControlled: true, branchId: "branch_2" } as any,
      "company_1",
      { role: "ADMIN", userBranchId: "branch_main" }
    );

    expect(prismaMock.branchStock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { branchId: "branch_2", productId: "prod_4", quantity: 7 },
      })
    );
  });

  it("NÃO grava BranchStock para produto sem controle de estoque", async () => {
    prismaMock.product.create.mockResolvedValue({
      id: "prod_2",
      stockQty: 0,
      stockControlled: false,
    });

    await service.create(
      { sku: "SKU2", name: "Serviço", stockQty: 0, stockControlled: false } as any,
      "company_1",
      vendedorBranchMain
    );

    expect(prismaMock.branchStock.upsert).not.toHaveBeenCalled();
  });

  it("VENDEDOR tentando filial ≠ dele → 403 (não grava)", async () => {
    prismaMock.product.create.mockResolvedValue({
      id: "prod_5",
      stockQty: 3,
      stockControlled: true,
    });

    await expect(
      service.create(
        { sku: "SKU5", name: "Armação", stockQty: 3, stockControlled: true, branchId: "branch_2" } as any,
        "company_1",
        vendedorBranchMain
      )
    ).rejects.toThrow(/permissão/i);
  });

  it("empresa sem filial ativa → não grava, não quebra", async () => {
    prismaMock.branch.findFirst.mockResolvedValue(null); // sem filial ativa
    prismaMock.product.create.mockResolvedValue({
      id: "prod_6",
      stockQty: 4,
      stockControlled: true,
    });

    await service.create(
      { sku: "SKU6", name: "Armação", stockQty: 4, stockControlled: true } as any,
      "company_1",
      adminNoBranch
    );

    expect(prismaMock.branchStock.upsert).not.toHaveBeenCalled();
  });
});

describe("ProductService.update — grava só quando estoque muda", () => {
  beforeEach(() => {
    prismaMock.product.findFirst.mockResolvedValue({ id: "prod_1", stockQty: 0 });
  });

  it("grava na filial-alvo quando stockQty está no payload", async () => {
    prismaMock.product.update.mockResolvedValue({
      id: "prod_1",
      stockQty: 8,
      stockControlled: true,
    });

    await service.update("prod_1", { stockQty: 8 } as any, "company_1", vendedorBranchMain);

    expect(prismaMock.branchStock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { branchId: "branch_main", productId: "prod_1", quantity: 8 },
        update: { quantity: 8 },
      })
    );
  });

  it("NÃO grava quando o estoque NÃO foi editado", async () => {
    prismaMock.product.update.mockResolvedValue({
      id: "prod_1",
      stockQty: 8,
      stockControlled: true,
    });

    await service.update("prod_1", { name: "Novo nome" } as any, "company_1", vendedorBranchMain);

    expect(prismaMock.branchStock.upsert).not.toHaveBeenCalled();
  });
});
