import { describe, it, expect, beforeEach } from "vitest";
import { consumeInventoryFIFO } from "@/services/finance-entry.service";

/**
 * C1 (Auditoria 2026-07-02): consumeInventoryFIFO precisa ser IDEMPOTENTE.
 *
 * Bug: generateSaleEntries roda dentro da tx da venda. Se um passo POSTERIOR ao
 * FIFO falha (ex.: conta contábil 5.1.01 ausente numa ótica antiga), o erro é
 * engolido em applyFinanceEntriesInTx (comentário "NÃO throw") e a venda comita
 * JÁ com o FIFO consumido. O cron retry-finance-entries reprocessa numa tx nova
 * e, sem guard, consumeInventoryFIFO decrementava InventoryLot.qtyRemaining DE
 * NOVO a cada tentativa (até 5×), gerando estoque fantasma e CMV inflado.
 *
 * Fix: se já existe SaleItemLot para o saleItemId, retornar o consumo já
 * registrado sem tocar em InventoryLot.
 *
 * Estratégia: um `tx` em memória que honra inventoryLot.findMany/update e
 * saleItemLot.findMany/create sobre estado mutável. A 2ª chamada (o retry) NÃO
 * pode alterar qtyRemaining nem criar novos SaleItemLot.
 */

interface FakeLot {
  id: string;
  companyId: string;
  productId: string;
  branchId: string | null;
  qtyRemaining: number;
  unitCost: number;
  acquiredAt: Date;
}
interface FakeSaleItemLot {
  saleItemId: string;
  inventoryLotId: string;
  qtyConsumed: number;
  unitCost: number;
  totalCost: number;
}

let lots: FakeLot[] = [];
let saleItemLots: FakeSaleItemLot[] = [];

const tx = {
  inventoryLot: {
    findMany: async ({ where, orderBy }: any) => {
      let result = lots.filter(
        (l) =>
          l.companyId === where.companyId &&
          l.productId === where.productId &&
          l.qtyRemaining > (where.qtyRemaining?.gt ?? -1) &&
          (where.branchId === undefined || l.branchId === where.branchId)
      );
      if (orderBy?.acquiredAt === "asc") {
        result = [...result].sort((a, b) => a.acquiredAt.getTime() - b.acquiredAt.getTime());
      }
      return result;
    },
    update: async ({ where, data }: any) => {
      const lot = lots.find((l) => l.id === where.id);
      if (lot && typeof data.qtyRemaining === "number") lot.qtyRemaining = data.qtyRemaining;
      return lot;
    },
  },
  saleItemLot: {
    findMany: async ({ where }: any) =>
      saleItemLots.filter((s) => s.saleItemId === where.saleItemId),
    create: async ({ data }: any) => {
      saleItemLots.push(data);
      return data;
    },
    upsert: async ({ where, update, create }: any) => {
      const key = where.saleItemId_inventoryLotId;
      const found = saleItemLots.find(
        (s) => s.saleItemId === key.saleItemId && s.inventoryLotId === key.inventoryLotId
      );
      if (found) {
        Object.assign(found, update);
        return found;
      }
      saleItemLots.push(create);
      return create;
    },
  },
} as any;

beforeEach(() => {
  lots = [
    { id: "lot1", companyId: "co1", productId: "p1", branchId: "b1", qtyRemaining: 10, unitCost: 100, acquiredAt: new Date("2026-01-01") },
  ];
  saleItemLots = [];
});

describe("consumeInventoryFIFO — C1: idempotência no retry", () => {
  it("1ª chamada consome o lote e registra o SaleItemLot", async () => {
    const r = await consumeInventoryFIFO(tx, "co1", "p1", 2, "si1", "b1");

    expect(r.totalCost).toBe(200); // 2 × 100
    expect(lots[0].qtyRemaining).toBe(8); // 10 − 2
    expect(saleItemLots).toHaveLength(1);
    expect(saleItemLots[0].qtyConsumed).toBe(2);
  });

  it("2ª chamada (retry) NÃO decrementa o lote de novo e NÃO cria novo SaleItemLot", async () => {
    await consumeInventoryFIFO(tx, "co1", "p1", 2, "si1", "b1");
    expect(lots[0].qtyRemaining).toBe(8);
    expect(saleItemLots).toHaveLength(1);

    // Retry: reprocessa o MESMO saleItemId.
    const retry = await consumeInventoryFIFO(tx, "co1", "p1", 2, "si1", "b1");

    // Estoque intacto (não caiu para 6) e nenhum SaleItemLot novo.
    expect(lots[0].qtyRemaining).toBe(8);
    expect(saleItemLots).toHaveLength(1);
    // O custo retornado continua correto (lido do consumo já registrado).
    expect(retry.totalCost).toBe(200);
  });

  it("5 retries seguidos mantêm o estoque estável (blast-radius do cron)", async () => {
    await consumeInventoryFIFO(tx, "co1", "p1", 3, "si1", "b1");
    const afterFirst = lots[0].qtyRemaining; // 7

    for (let i = 0; i < 5; i++) {
      await consumeInventoryFIFO(tx, "co1", "p1", 3, "si1", "b1");
    }

    expect(lots[0].qtyRemaining).toBe(afterFirst); // ainda 7, não 7 − 5×3
    expect(saleItemLots).toHaveLength(1);
  });

  it("saleItemIds diferentes consomem independentemente (não confunde itens)", async () => {
    await consumeInventoryFIFO(tx, "co1", "p1", 2, "si1", "b1"); // → 8
    await consumeInventoryFIFO(tx, "co1", "p1", 3, "si2", "b1"); // → 5

    expect(lots[0].qtyRemaining).toBe(5);
    expect(saleItemLots).toHaveLength(2);
  });

  it("CR-1: consumo PARCIAL anterior (multi-lote) é COMPLETADO no retry, não travado", async () => {
    // Cenário: item precisa de 5 un., em 2 lotes (lot1=2, lot2=3). Simulamos que
    // uma tentativa anterior consumiu SÓ o lot1 (registro parcial de 2 un.).
    lots = [
      { id: "lot1", companyId: "co1", productId: "p1", branchId: "b1", qtyRemaining: 0, unitCost: 100, acquiredAt: new Date("2026-01-01") },
      { id: "lot2", companyId: "co1", productId: "p1", branchId: "b1", qtyRemaining: 3, unitCost: 120, acquiredAt: new Date("2026-02-01") },
    ];
    saleItemLots = [
      { saleItemId: "si1", inventoryLotId: "lot1", qtyConsumed: 2, unitCost: 100, totalCost: 200 },
    ];

    // Retry pedindo as 5 un.: deve completar SÓ as 3 faltantes do lot2.
    const r = await consumeInventoryFIFO(tx, "co1", "p1", 5, "si1", "b1");

    // lot2 decrementado de 3→0 (só o saldo faltante), lot1 intacto (já usado).
    expect(lots[0].qtyRemaining).toBe(0);
    expect(lots[1].qtyRemaining).toBe(0);
    // 2 registros: o parcial anterior + o novo do lot2.
    expect(saleItemLots).toHaveLength(2);
    // Custo total = 200 (lot1, já registrado) + 360 (3×120, lot2) = 560.
    expect(r.totalCost).toBe(560);
  });

  it("CR-1: consumo já completo devolve o registrado sem tocar em lotes (idempotente)", async () => {
    saleItemLots = [
      { saleItemId: "si1", inventoryLotId: "lot1", qtyConsumed: 5, unitCost: 100, totalCost: 500 },
    ];
    const before = lots[0].qtyRemaining;

    const r = await consumeInventoryFIFO(tx, "co1", "p1", 5, "si1", "b1");

    expect(lots[0].qtyRemaining).toBe(before); // nada consumido
    expect(saleItemLots).toHaveLength(1);
    expect(r.totalCost).toBe(500);
  });
});
