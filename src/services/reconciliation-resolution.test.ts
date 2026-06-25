import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveItem } from "./reconciliation-resolution.service";

// Bloco 1 segurança: resolveItem só pode tocar item que pertence ao batch da
// rota (que a rota já validou ser da empresa). Prova dupla: item de outro batch
// é bloqueado; item do batch correto é resolvido normalmente.

function makeTx(opts: { itemBatchId?: string | null }) {
  // findFirst respeita o where { id, batchId } — devolve item só se o batchId bate.
  const findFirst = vi.fn(async ({ where }: any) => {
    if (opts.itemBatchId && where.batchId === opts.itemBatchId) {
      return {
        id: where.id,
        batchId: where.batchId,
        externalAmount: 100,
        matchedSalePaymentId: null,
        batch: { companyId: "co_1" },
      };
    }
    return null; // batchId não bate → item "não encontrado neste batch"
  });
  const update = vi.fn(async () => ({}));
  const salePaymentFindFirstOrThrow = vi.fn(async () => ({ amount: 100 }));

  return {
    tx: {
      reconciliationItem: { findFirst, update },
      salePayment: { findFirstOrThrow: salePaymentFindFirstOrThrow },
    } as never,
    findFirst,
    update,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("resolveItem — isolamento item↔batch (IDOR fechado)", () => {
  it("furo fechado: item NÃO pertence ao batch da rota → lança e NÃO atualiza", async () => {
    const { tx, update } = makeTx({ itemBatchId: "batch_da_empresa_B" });
    await expect(
      resolveItem(tx, "batch_da_empresa_A", "item_de_B", { resolutionType: "IGNORED" as any }, "u1")
    ).rejects.toThrow(/não encontrado neste batch/i);
    expect(update).not.toHaveBeenCalled();
  });

  it("uso normal: item pertence ao batch → resolve e atualiza", async () => {
    const { tx, update } = makeTx({ itemBatchId: "batch_1" });
    await resolveItem(tx, "batch_1", "item_1", { resolutionType: "IGNORED" as any, resolutionNotes: "ok" }, "u1");
    expect(update).toHaveBeenCalledTimes(1);
    const call = (update.mock.calls as any[])[0][0];
    expect(call.where.id).toBe("item_1");
    expect(call.data.status).toBe("RESOLVED");
    expect(call.data.resolvedByUserId).toBe("u1");
  });

  it("furo fechado mesmo no caminho SEM matchedSalePaymentId (resolução IGNORED/DIVERGENT)", async () => {
    // Este era o caminho desprotegido: sem matchedSalePaymentId não havia
    // nenhuma checagem. Agora o findFirst {id, batchId} barra antes.
    const { tx, update } = makeTx({ itemBatchId: "outro_batch" });
    await expect(
      resolveItem(tx, "batch_correto", "item_alheio", { resolutionType: "DIVERGENT" as any }, "u1")
    ).rejects.toThrow();
    expect(update).not.toHaveBeenCalled();
  });
});
