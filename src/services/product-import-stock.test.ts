import { describe, it, expect, vi, beforeEach } from "vitest";

// Bloco 2 / C2: importação cria BranchStock (sem isso = "Disponível: 0").

const txMock = {
  product: { create: vi.fn(async () => ({ id: "prod_new" })) },
  branchStock: { upsert: vi.fn(async () => ({})) },
};

const branchFindFirst = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(async (cb: any) => cb(txMock)),
    branch: { findFirst: (...a: any[]) => branchFindFirst(...a) },
  },
}));

import { createProductWithStock } from "./product-import.service";

const baseData = {
  companyId: "co_1",
  sku: "ARM-001",
  name: "Armação Teste",
  type: "FRAME" as any,
  costPrice: 50,
  salePrice: 100,
  stockControlled: true,
  stockQty: 7,
  stockMin: 2,
  active: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  txMock.product.create.mockResolvedValue({ id: "prod_new" });
});

describe("createProductWithStock — prova dupla C2", () => {
  it("BUG FECHADO: produto com estoque cria BranchStock na filial principal", async () => {
    branchFindFirst.mockResolvedValue({ id: "branch_main" }); // resolve filial
    await createProductWithStock(baseData, new Map());

    expect(txMock.product.create).toHaveBeenCalledTimes(1);
    expect(txMock.branchStock.upsert).toHaveBeenCalledTimes(1);
    const call = (txMock.branchStock.upsert.mock.calls as any[])[0][0];
    expect(call.create.branchId).toBe("branch_main");
    expect(call.create.productId).toBe("prod_new");
    expect(call.create.quantity).toBe(7); // = stockQty, não 0
  });

  it("USO NORMAL: respeita o branchId da planilha quando é filial da empresa", async () => {
    // resolveOwnedBranchId valida o branchId informado contra a empresa.
    branchFindFirst.mockResolvedValueOnce({ id: "branch_2" });
    await createProductWithStock({ ...baseData, branchId: "branch_2" }, new Map());
    const call = (txMock.branchStock.upsert.mock.calls as any[])[0][0];
    expect(call.create.branchId).toBe("branch_2");
  });

  it("produto SEM controle de estoque → cria produto mas NÃO cria BranchStock", async () => {
    await createProductWithStock({ ...baseData, stockControlled: false }, new Map());
    expect(txMock.product.create).toHaveBeenCalledTimes(1);
    expect(txMock.branchStock.upsert).not.toHaveBeenCalled();
  });

  it("empresa SEM filial ativa → cria produto, não cria BranchStock (não aborta)", async () => {
    branchFindFirst.mockResolvedValue(null); // nenhuma filial
    const r = await createProductWithStock(baseData, new Map());
    expect(r.id).toBe("prod_new");
    expect(txMock.branchStock.upsert).not.toHaveBeenCalled();
  });
});
