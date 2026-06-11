import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Cobre createFromSale com foco na regra combinada com o dono:
 *  - GATILHO: só gera OS se houver lente.
 *  - CONTEÚDO: a OS leva lentes + armação (FRAME). Acessórios ficam de fora.
 *
 * O laboratório precisa enxergar a armação na OS para não perder a peça do cliente.
 */

// --- mocks do prisma ---
const saleFindFirst = vi.fn();
const serviceOrderFindUnique = vi.fn();
const transaction = vi.fn();

// chamadas capturadas dentro da transação
const soItemCreate = vi.fn();
const soCreate = vi.fn();
const soHistoryCreate = vi.fn();
const saleUpdate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    sale: { findFirst: (...a: unknown[]) => saleFindFirst(...a) },
    serviceOrder: { findUnique: (...a: unknown[]) => serviceOrderFindUnique(...a) },
    $transaction: (...a: unknown[]) => transaction(...a),
  },
}));

vi.mock("@/lib/counter", () => ({
  getNextSequence: vi.fn().mockResolvedValue(7),
}));

vi.mock("@/lib/sale-number", () => ({
  saleDisplayNumber: () => "#1001",
}));

import { serviceOrderService } from "@/services/service-order.service";

// Reconstrói o objeto tx que o createFromSale usa dentro do $transaction.
function makeTx() {
  return {
    serviceOrder: { create: (...a: unknown[]) => soCreate(...a) },
    serviceOrderItem: { create: (...a: unknown[]) => soItemCreate(...a) },
    serviceOrderHistory: { create: (...a: unknown[]) => soHistoryCreate(...a) },
    sale: { update: (...a: unknown[]) => saleUpdate(...a) },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  soCreate.mockResolvedValue({ id: "os-1", number: 7 });
  soItemCreate.mockResolvedValue({});
  soHistoryCreate.mockResolvedValue({});
  saleUpdate.mockResolvedValue({});
  // getNextNumber chama tx.serviceOrder? Não — usa getNextSequence (mockado).
  transaction.mockImplementation(async (cb: any) => cb(makeTx()));
});

const LENS = { id: "p-lens", name: "Lente Ultra", type: "OPHTHALMIC_LENS" };
const FRAME = { id: "p-frame", name: "Armação Acetato", type: "FRAME" };
const SUNGLASSES = { id: "p-sun", name: "Solar com Grau", type: "SUNGLASSES" };
const ACCESSORY = { id: "p-acc", name: "Estojo", type: "ACCESSORY" };

function saleWith(items: Array<{ qty: number; description: string; product: any }>) {
  return {
    id: "sale-1",
    number: 1001,
    customerId: "cust-1",
    branchId: "branch-1",
    serviceOrderId: null,
    items,
  };
}

describe("createFromSale — armação na OS", () => {
  it("venda lente + armação gera OS com AMBOS os itens (incluindo FRAME)", async () => {
    saleFindFirst.mockResolvedValue(
      saleWith([
        { qty: 1, description: "Lente Ultra", product: LENS },
        { qty: 1, description: "Armação Acetato", product: FRAME },
      ])
    );

    const res = await serviceOrderService.createFromSale("sale-1", "comp-1", "user-1");

    expect(res.created).toBe(true);
    expect(soItemCreate).toHaveBeenCalledTimes(2);
    const descricoes = soItemCreate.mock.calls.map((c: any) => c[0].data.description);
    expect(descricoes).toContain("Lente Ultra");
    expect(descricoes).toContain("Armação Acetato");
  });

  it("venda só com armação (sem lente) NÃO gera OS — gatilho preservado", async () => {
    saleFindFirst.mockResolvedValue(
      saleWith([{ qty: 1, description: "Armação Acetato", product: FRAME }])
    );

    const res = await serviceOrderService.createFromSale("sale-1", "comp-1", "user-1");

    expect(res.created).toBe(false);
    expect(res.serviceOrderId).toBeNull();
    expect(soItemCreate).not.toHaveBeenCalled();
  });

  it("venda só com lente gera OS com 1 item — sem regressão", async () => {
    saleFindFirst.mockResolvedValue(
      saleWith([{ qty: 1, description: "Lente Ultra", product: LENS }])
    );

    const res = await serviceOrderService.createFromSale("sale-1", "comp-1", "user-1");

    expect(res.created).toBe(true);
    expect(soItemCreate).toHaveBeenCalledTimes(1);
    expect(soItemCreate.mock.calls[0][0].data.description).toBe("Lente Ultra");
  });

  it("óculos de sol com grau (SUNGLASSES) entra na OS junto com a lente", async () => {
    saleFindFirst.mockResolvedValue(
      saleWith([
        { qty: 1, description: "Lente Ultra", product: LENS },
        { qty: 1, description: "Solar com Grau", product: SUNGLASSES },
      ])
    );

    const res = await serviceOrderService.createFromSale("sale-1", "comp-1", "user-1");

    expect(res.created).toBe(true);
    expect(soItemCreate).toHaveBeenCalledTimes(2);
    const descricoes = soItemCreate.mock.calls.map((c: any) => c[0].data.description);
    expect(descricoes).toContain("Solar com Grau");
  });

  it("item manual (sem produto) NÃO entra na OS — decisão atual", async () => {
    saleFindFirst.mockResolvedValue(
      saleWith([
        { qty: 1, description: "Lente Ultra", product: LENS },
        { qty: 1, description: "Armação digitada à mão", product: null },
      ])
    );

    const res = await serviceOrderService.createFromSale("sale-1", "comp-1", "user-1");

    expect(res.created).toBe(true);
    // Só a lente: item manual (product null) fica de fora por decisão de produto.
    expect(soItemCreate).toHaveBeenCalledTimes(1);
    const descricoes = soItemCreate.mock.calls.map((c: any) => c[0].data.description);
    expect(descricoes).not.toContain("Armação digitada à mão");
  });

  it("acessório (não-lente, não-armação) NÃO entra na OS", async () => {
    saleFindFirst.mockResolvedValue(
      saleWith([
        { qty: 1, description: "Lente Ultra", product: LENS },
        { qty: 1, description: "Estojo", product: ACCESSORY },
      ])
    );

    const res = await serviceOrderService.createFromSale("sale-1", "comp-1", "user-1");

    expect(res.created).toBe(true);
    expect(soItemCreate).toHaveBeenCalledTimes(1);
    const descricoes = soItemCreate.mock.calls.map((c: any) => c[0].data.description);
    expect(descricoes).toContain("Lente Ultra");
    expect(descricoes).not.toContain("Estojo");
  });
});
