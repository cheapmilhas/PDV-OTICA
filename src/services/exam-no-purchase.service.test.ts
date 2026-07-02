import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    sale: { findMany: vi.fn() },
    customer: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { listExamNoPurchase, EXAM_WINDOW_DAYS, examReofferDraft } from "./exam-no-purchase.service";

const NOW = new Date("2026-07-02T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 24 * 3600_000);

beforeEach(() => {
  vi.clearAllMocks();
  (prisma.sale.findMany as any).mockResolvedValue([]);
  (prisma.customer.findMany as any).mockResolvedValue([]);
});

/** 1ª chamada de sale.findMany = exames; 2ª = óculos. */
function mockSales(exam: any[], eyewear: any[]) {
  (prisma.sale.findMany as any)
    .mockResolvedValueOnce(exam)
    .mockResolvedValueOnce(eyewear);
}

describe("listExamNoPurchase — where das queries", () => {
  it("exames: COMPLETED, com item isEyeExam, cliente vinculado, na janela, companyId", async () => {
    await listExamNoPurchase("co_1", null, NOW);
    const w = (prisma.sale.findMany as any).mock.calls[0][0].where;
    expect(w.companyId).toBe("co_1");
    expect(w.status).toBe("COMPLETED");
    expect(w.deletedAt).toBeNull();
    expect(w.customerId).toEqual({ not: null });
    expect(w.items).toEqual({ some: { product: { isEyeExam: true } } });
    // janela = agora - EXAM_WINDOW_DAYS
    const start = new Date(NOW.getTime() - EXAM_WINDOW_DAYS * 24 * 3600_000);
    expect(w.createdAt.gte.getTime()).toBe(start.getTime());
  });

  it("sem exames na janela → não consulta óculos nem clientes", async () => {
    (prisma.sale.findMany as any).mockResolvedValueOnce([]); // exames vazio
    const rows = await listExamNoPurchase("co_1", null, NOW);
    expect(rows).toEqual([]);
    expect((prisma.sale.findMany as any)).toHaveBeenCalledTimes(1);
    expect(prisma.customer.findMany).not.toHaveBeenCalled();
  });

  it("filtra óculos só dos clientes que fizeram exame (in examCustomerIds)", async () => {
    mockSales(
      [{ customerId: "C1", createdAt: daysAgo(10) }],
      [],
    );
    (prisma.customer.findMany as any).mockResolvedValue([{ id: "C1", name: "Ana", phone: "9" }]);
    await listExamNoPurchase("co_1", null, NOW);
    const eyewearWhere = (prisma.sale.findMany as any).mock.calls[1][0].where;
    expect(eyewearWhere.customerId).toEqual({ in: ["C1"] });
    expect(eyewearWhere.status).toBe("COMPLETED");
  });
});

describe("listExamNoPurchase — regra fez-exame-não-comprou", () => {
  it("fez exame e NÃO comprou óculos → entra na lista", async () => {
    mockSales(
      [{ customerId: "C1", createdAt: daysAgo(10) }],
      [], // nenhuma compra de óculos
    );
    (prisma.customer.findMany as any).mockResolvedValue([{ id: "C1", name: "Ana Souza", phone: "8599" }]);
    const rows = await listExamNoPurchase("co_1", null, NOW);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ customerId: "C1", name: "Ana Souza", phone: "8599", examAgo: "há 10 dias" });
    expect(rows[0].draftText).toContain("Ana");
  });

  it("comprou óculos DEPOIS do exame → sai da lista", async () => {
    mockSales(
      [{ customerId: "C1", createdAt: daysAgo(10) }],
      [{ customerId: "C1", createdAt: daysAgo(5) }], // comprou óculos 5 dias atrás (após o exame)
    );
    (prisma.customer.findMany as any).mockResolvedValue([]);
    const rows = await listExamNoPurchase("co_1", null, NOW);
    expect(rows).toHaveLength(0);
    // não busca cliente nenhum (todos compraram)
    expect(prisma.customer.findMany).not.toHaveBeenCalled();
  });

  it("exame + óculos na MESMA venda → comprou (não entra na lista)", async () => {
    // Venda única com exame E armação: a query de exame e a de óculos casam a
    // MESMA venda (mesmo createdAt). createdAt >= examAt é true (igual) → excluído.
    const at = daysAgo(7);
    mockSales(
      [{ customerId: "C1", createdAt: at }],
      [{ customerId: "C1", createdAt: at }], // mesma venda aparece nas duas
    );
    (prisma.customer.findMany as any).mockResolvedValue([]);
    const rows = await listExamNoPurchase("co_1", null, NOW);
    expect(rows).toHaveLength(0);
  });

  it("comprou óculos ANTES do exame não conta como comprou (pediu novo grau)", async () => {
    mockSales(
      [{ customerId: "C1", createdAt: daysAgo(10) }],
      [{ customerId: "C1", createdAt: daysAgo(30) }], // compra ANTES do exame → não neutraliza
    );
    (prisma.customer.findMany as any).mockResolvedValue([{ id: "C1", name: "Ze", phone: "1" }]);
    const rows = await listExamNoPurchase("co_1", null, NOW);
    expect(rows).toHaveLength(1);
    expect(rows[0].customerId).toBe("C1");
  });

  it("usa o exame MAIS RECENTE quando o cliente fez mais de um", async () => {
    mockSales(
      // findMany vem desc → primeiro é o mais recente
      [
        { customerId: "C1", createdAt: daysAgo(3) },
        { customerId: "C1", createdAt: daysAgo(40) },
      ],
      [],
    );
    (prisma.customer.findMany as any).mockResolvedValue([{ id: "C1", name: "Ana", phone: "9" }]);
    const rows = await listExamNoPurchase("co_1", null, NOW);
    expect(rows[0].examAgo).toBe("há 3 dias");
  });

  it("ordena do exame mais recente pro mais antigo", async () => {
    mockSales(
      [
        { customerId: "C1", createdAt: daysAgo(2) },
        { customerId: "C2", createdAt: daysAgo(20) },
      ],
      [],
    );
    (prisma.customer.findMany as any).mockResolvedValue([
      { id: "C2", name: "Antigo", phone: "2" },
      { id: "C1", name: "Recente", phone: "1" },
    ]);
    const rows = await listExamNoPurchase("co_1", null, NOW);
    expect(rows.map((r) => r.customerId)).toEqual(["C1", "C2"]);
  });

  it("branch: filtra o EXAME por filial quando informado", async () => {
    await listExamNoPurchase("co_1", "branch_x", NOW);
    const w = (prisma.sale.findMany as any).mock.calls[0][0].where;
    expect(w.branchId).toBe("branch_x");
  });

  it("checagem 'comprou óculos' é COMPANY-WIDE de propósito (sem branchId)", async () => {
    // Decisão deliberada: fez exame na filial A + comprou óculos na filial B =
    // empresa não perdeu a venda → não reofertar. A 2ª query NÃO leva branchId.
    mockSales([{ customerId: "C1", createdAt: daysAgo(10) }], []);
    (prisma.customer.findMany as any).mockResolvedValue([{ id: "C1", name: "Ana", phone: "9" }]);
    await listExamNoPurchase("co_1", "branch_x", NOW);
    const eyewearWhere = (prisma.sale.findMany as any).mock.calls[1][0].where;
    expect(eyewearWhere.branchId).toBeUndefined();
    expect(eyewearWhere.companyId).toBe("co_1");
  });
});

describe("examReofferDraft", () => {
  it("usa o primeiro nome e menciona o exame", () => {
    const d = examReofferDraft("Carlos Souza");
    expect(d).toContain("Carlos");
    expect(d.toLowerCase()).toContain("exame");
  });
});
