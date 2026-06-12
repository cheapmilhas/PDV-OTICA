import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Prevenção do bug "estoque fantasma": ao criar/editar um produto com estoque,
 * o serviço DEVE sincronizar a linha BranchStock da filial (loja única) com
 * Product.stockQty. Sem isso o produto nasce com estoque no cache mas sem linha
 * BranchStock — a tela mostra estoque e a venda falha ("Disponível: 0").
 *
 * Estes testes travam o comportamento na origem (product.service), garantindo
 * que não volte a acontecer.
 */

// Mock do prisma. $transaction executa o callback passando o próprio mock como tx.
// vi.hoisted garante que o mock exista antes do vi.mock hoisteado.
const prismaMock: any = vi.hoisted(() => ({
  product: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  branch: { findMany: vi.fn() },
  branchStock: { upsert: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { ProductService } from "@/services/product.service";

const service = new ProductService();

function singleBranch() {
  prismaMock.branch.findMany.mockResolvedValue([{ id: "branch_main" }]);
}
function twoBranches() {
  prismaMock.branch.findMany.mockResolvedValue([{ id: "branch_main" }, { id: "branch_2" }]);
}

beforeEach(() => {
  vi.clearAllMocks();
  // $transaction(cb) => cb(prismaMock) — simula a transação executando inline.
  prismaMock.$transaction.mockImplementation(async (cb: any) => cb(prismaMock));
  // getById (chamado no update) — produto existe.
  prismaMock.product.findFirst.mockResolvedValue(null);
});

describe("ProductService.create — sincroniza BranchStock (loja única)", () => {
  it("cria BranchStock com quantity = stockQty na filial única", async () => {
    singleBranch();
    prismaMock.product.create.mockResolvedValue({
      id: "prod_1",
      stockQty: 5,
      stockControlled: true,
    });

    await service.create(
      { sku: "SKU1", name: "Armação", stockQty: 5, stockControlled: true } as any,
      "company_1"
    );

    expect(prismaMock.branchStock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { branchId_productId: { branchId: "branch_main", productId: "prod_1" } },
        create: { branchId: "branch_main", productId: "prod_1", quantity: 5 },
        update: { quantity: 5 },
      })
    );
  });

  it("NÃO cria BranchStock para produto sem controle de estoque", async () => {
    singleBranch();
    prismaMock.product.create.mockResolvedValue({
      id: "prod_2",
      stockQty: 0,
      stockControlled: false,
    });

    await service.create(
      { sku: "SKU2", name: "Serviço", stockQty: 0, stockControlled: false } as any,
      "company_1"
    );

    expect(prismaMock.branchStock.upsert).not.toHaveBeenCalled();
  });

  it("NÃO toca BranchStock em empresa multi-filial (distribuição por transferência)", async () => {
    twoBranches();
    prismaMock.product.create.mockResolvedValue({
      id: "prod_3",
      stockQty: 10,
      stockControlled: true,
    });

    await service.create(
      { sku: "SKU3", name: "Armação", stockQty: 10, stockControlled: true } as any,
      "company_1"
    );

    expect(prismaMock.branchStock.upsert).not.toHaveBeenCalled();
  });
});

describe("ProductService.update — sincroniza BranchStock só quando estoque muda", () => {
  beforeEach(() => {
    // getById (início do update) precisa encontrar o produto existente.
    prismaMock.product.findFirst.mockResolvedValue({ id: "prod_1", stockQty: 0 });
  });

  it("sincroniza BranchStock quando stockQty está no payload", async () => {
    singleBranch();
    prismaMock.product.update.mockResolvedValue({
      id: "prod_1",
      stockQty: 8,
      stockControlled: true,
    });

    await service.update("prod_1", { stockQty: 8 } as any, "company_1");

    expect(prismaMock.branchStock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { branchId: "branch_main", productId: "prod_1", quantity: 8 },
        update: { quantity: 8 },
      })
    );
  });

  it("NÃO sincroniza BranchStock quando o estoque NÃO foi editado", async () => {
    singleBranch();
    prismaMock.product.update.mockResolvedValue({
      id: "prod_1",
      stockQty: 8,
      stockControlled: true,
    });

    await service.update("prod_1", { name: "Novo nome" } as any, "company_1");

    expect(prismaMock.branchStock.upsert).not.toHaveBeenCalled();
  });
});
