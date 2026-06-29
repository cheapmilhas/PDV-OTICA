import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    customer: { findMany: vi.fn() },
    sale: { count: vi.fn(), findFirst: vi.fn() },
    serviceOrder: { findFirst: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { matchCustomerByPhone, buildSafeSummary } from "./lead-customer-match.service";

const findMany = prisma.customer.findMany as unknown as ReturnType<typeof vi.fn>;
const saleCount = prisma.sale.count as unknown as ReturnType<typeof vi.fn>;
const saleFirst = prisma.sale.findFirst as unknown as ReturnType<typeof vi.fn>;
const osFirst = prisma.serviceOrder.findFirst as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  saleCount.mockResolvedValue(0);
  saleFirst.mockResolvedValue(null);
  osFirst.mockResolvedValue(null);
});

describe("matchCustomerByPhone", () => {
  it("telefone inválido → kind none, sem query", async () => {
    const r = await matchCustomerByPhone("co1", "123");
    expect(r.kind).toBe("none");
    expect(findMany).not.toHaveBeenCalled();
  });

  it("SEMPRE filtra por companyId + ativo/não-deletado/não-anonimizado", async () => {
    findMany.mockResolvedValue([]);
    await matchCustomerByPhone("co1", "85999887766");
    const where = findMany.mock.calls[0][0].where;
    expect(where.companyId).toBe("co1");
    expect(where.active).toBe(true);
    expect(where.deletedAt).toBeNull();
    expect(where.anonymizedAt).toBeNull();
    // casa por chave canônica em phoneNormalized OU phone2Normalized
    expect(where.OR).toEqual([{ phoneNormalized: "8599887766" }, { phone2Normalized: "8599887766" }]);
  });

  it("0 fichas → none", async () => {
    findMany.mockResolvedValue([]);
    const r = await matchCustomerByPhone("co1", "85999887766");
    expect(r.kind).toBe("none");
    expect(r.customerId).toBeNull();
  });

  it("2+ fichas → ambiguous (não casa, não monta resumo)", async () => {
    findMany.mockResolvedValue([{ id: "c1", name: "A" }, { id: "c2", name: "B" }]);
    const r = await matchCustomerByPhone("co1", "85999887766");
    expect(r.kind).toBe("ambiguous");
    expect(r.customerId).toBeNull();
    expect(r.summary).toBeNull();
    expect(r.candidateCount).toBe(2);
    expect(saleCount).not.toHaveBeenCalled();
  });

  it("1 ficha → single com resumo seguro", async () => {
    findMany.mockResolvedValue([{ id: "c1", name: "Maria" }]);
    saleCount.mockResolvedValue(3);
    saleFirst.mockResolvedValue({ createdAt: new Date(Date.now() - 40 * 86_400_000) });
    osFirst.mockResolvedValue({ status: "READY" });
    const r = await matchCustomerByPhone("co1", "85999887766");
    expect(r.kind).toBe("single");
    expect(r.customerId).toBe("c1");
    expect(r.customerName).toBe("Maria");
    expect(r.summary?.purchaseCount).toBe(3);
    expect(r.summary?.daysSinceLastPurchase).toBe(40);
    expect(r.summary?.openServiceOrder).toBe("pronta_para_retirada");
    expect(r.summary?.isRecurring).toBe(true);
  });
});

describe("buildSafeSummary — só agregados, sem PII", () => {
  it("OS em produção vira rótulo fixo", async () => {
    saleCount.mockResolvedValue(1);
    saleFirst.mockResolvedValue({ createdAt: new Date() });
    osFirst.mockResolvedValue({ status: "SENT_TO_LAB" });
    const s = await buildSafeSummary("co1", "c1");
    expect(s.openServiceOrder).toBe("em_producao");
    expect(s.isRecurring).toBe(false); // 1 compra
  });

  it("sem compras → daysSinceLastPurchase null", async () => {
    saleCount.mockResolvedValue(0);
    saleFirst.mockResolvedValue(null);
    const s = await buildSafeSummary("co1", "c1");
    expect(s.daysSinceLastPurchase).toBeNull();
    expect(s.purchaseCount).toBe(0);
  });

  it("o resumo NÃO contém chaves de PII (cpf, grau, total, endereço, saldo)", async () => {
    saleCount.mockResolvedValue(2);
    saleFirst.mockResolvedValue({ createdAt: new Date() });
    const s = await buildSafeSummary("co1", "c1");
    const keys = Object.keys(s);
    for (const forbidden of ["cpf", "rg", "grau", "prescription", "total", "valor", "address", "endereco", "saldo", "balance", "name", "phone"]) {
      expect(keys).not.toContain(forbidden);
    }
    // só as chaves seguras esperadas
    expect(keys.sort()).toEqual(["daysSinceLastPurchase", "isRecurring", "openServiceOrder", "purchaseCount"]);
  });

  it("count de compras só conta COMPLETED, escopado por companyId+customerId", async () => {
    saleCount.mockResolvedValue(5);
    saleFirst.mockResolvedValue({ createdAt: new Date() });
    await buildSafeSummary("co1", "c1");
    const where = saleCount.mock.calls[0][0].where;
    expect(where.companyId).toBe("co1");
    expect(where.customerId).toBe("c1");
    expect(where.status).toBe("COMPLETED");
  });
});
