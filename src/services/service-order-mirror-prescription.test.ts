import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Task 5b — espelho do grau digitado na OS para a receita do Livro.
 * Foca no método privado via o caminho público update(): ao salvar
 * prescriptionData, resolve a receita por saleId e chama upsertPrescription
 * com o grau, sem duplicar.
 */

const saleFindFirst = vi.fn(); // não usado aqui mas o módulo referencia prisma
const transaction = vi.fn();
const soUpdateTx = vi.fn();
const soHistoryCreate = vi.fn();
const soFindUnique = vi.fn();
const prescriptionFindUnique = vi.fn();
const prescriptionFindFirst = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    sale: { findFirst: (...a: unknown[]) => saleFindFirst(...a) },
    serviceOrder: {
      findUnique: (...a: unknown[]) => soFindUnique(...a),
    },
    prescription: {
      findUnique: (...a: unknown[]) => prescriptionFindUnique(...a),
      findFirst: (...a: unknown[]) => prescriptionFindFirst(...a),
    },
    $transaction: (...a: unknown[]) => transaction(...a),
  },
}));

const { upsertMock } = vi.hoisted(() => ({ upsertMock: vi.fn() }));
vi.mock("./livro-receitas.service", () => ({ upsertPrescription: upsertMock }));

// getById é chamado no começo e fim do update — stub via spy no protótipo.
import { serviceOrderService } from "@/services/service-order.service";

beforeEach(() => {
  vi.clearAllMocks();
  upsertMock.mockResolvedValue({ id: "rx-1" });
  soHistoryCreate.mockResolvedValue({});
  soUpdateTx.mockResolvedValue({});
  transaction.mockImplementation(async (cb: any) =>
    cb({
      serviceOrder: { update: (...a: unknown[]) => soUpdateTx(...a) },
      serviceOrderHistory: { create: (...a: unknown[]) => soHistoryCreate(...a) },
      product: { findUnique: vi.fn().mockResolvedValue({ salePrice: 0 }) },
      serviceOrderItem: { create: vi.fn(), deleteMany: vi.fn() },
    })
  );
  // getById: 1ª chamada (existing) e última (retorno) — devolve OS não-entregue.
  vi.spyOn(serviceOrderService, "getById").mockResolvedValue({ status: "DRAFT" } as never);
});

describe("update() espelha grau na receita do Livro", () => {
  it("resolve receita por saleId e chama upsert com o grau (vírgula decimal)", async () => {
    soFindUnique.mockResolvedValue({ customerId: "cust-1", branchId: "br-1", sale: { id: "sale-9" } });
    prescriptionFindUnique.mockResolvedValue({ id: "rx-existing" });

    const prescription = JSON.stringify({
      od: { esf: "-1,75", cil: "-0,75", eixo: "90" },
      oe: { esf: "-2,00" },
      adicao: "",
    });

    await serviceOrderService.update("os-1", { prescription } as never, "co-1", "user-1");

    expect(prescriptionFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { saleId: "sale-9" } })
    );
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "rx-existing",
        saleId: "sale-9",
        customerId: "cust-1",
        od: expect.objectContaining({ esf: "-1,75" }),
      })
    );
  });

  it("OS sem venda → resolve por serviceOrderId", async () => {
    soFindUnique.mockResolvedValue({ customerId: "cust-1", branchId: "br-1", sale: null });
    prescriptionFindFirst.mockResolvedValue({ id: "rx-os" });

    const prescription = JSON.stringify({ od: { esf: "-1,00" }, oe: {}, adicao: "" });
    await serviceOrderService.update("os-2", { prescription } as never, "co-1", "user-1");

    expect(prescriptionFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { serviceOrderId: "os-2", companyId: "co-1" } })
    );
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "rx-os", serviceOrderId: "os-2" })
    );
  });

  it("falha no espelho NÃO quebra o update (à prova de falha)", async () => {
    soFindUnique.mockRejectedValue(new Error("db flake"));
    const prescription = JSON.stringify({ od: { esf: "-1,00" }, oe: {} });
    // não deve lançar
    await expect(
      serviceOrderService.update("os-3", { prescription } as never, "co-1", "user-1")
    ).resolves.toBeDefined();
  });
});
