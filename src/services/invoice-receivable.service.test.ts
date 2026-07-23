import { it, expect, vi } from "vitest";
import { getReceivableThisWeek } from "./invoice-receivable.service";

it("consulta PENDING/ACTIVE/próx 7d e soma total", async () => {
  const findMany = vi.fn().mockResolvedValue([
    { id: "i1", total: 14990, dueDate: new Date("2026-07-12"), subscription: { company: { name: "Ótica X" } } },
    { id: "i2", total: 18990, dueDate: new Date("2026-07-14"), subscription: { company: { name: "Ótica Y" } } },
  ]);
  const prismaClient = { invoice: { findMany } } as any;
  const out = await getReceivableThisWeek(new Date("2026-07-08T00:00:00Z"), prismaClient);
  expect(out.total).toBe(33980);
  expect(out.items).toHaveLength(2);
  // where agora é { AND: [productWhere, { status, subscription, dueDate }] }.
  // Sem produto (default {}), o 1º ramo é vazio e o 2º carrega as condições.
  const where = findMany.mock.calls[0][0].where;
  expect(where.AND[0]).toEqual({});
  const cond = where.AND[1];
  expect(cond.status).toBe("PENDING");
  expect(cond.subscription).toEqual({ status: "ACTIVE" });
  expect(cond.dueDate.gte).toBeInstanceOf(Date);
  expect(cond.dueDate.lte).toBeInstanceOf(Date);
});

it("segmenta por produto: productWhere entra como 1º ramo do AND", async () => {
  const findMany = vi.fn().mockResolvedValue([]);
  const prismaClient = { invoice: { findMany } } as any;
  // Formato que buildDashboardFilters(...).invoiceCompany produz.
  const productWhere = {
    AND: [
      { subscription: { company: { platformProduct: "VIS_MEDICAL" } } },
      { subscription: { company: { OR: [{ blockedReason: null }, { blockedReason: { not: "DELETED" } }] } } },
    ],
  };
  await getReceivableThisWeek(new Date("2026-07-08T00:00:00Z"), prismaClient, productWhere);
  const where = findMany.mock.calls[0][0].where;
  expect(where.AND[0]).toBe(productWhere);
  // As condições de status/data seguem no 2º ramo, sem colidir com o produto.
  expect(where.AND[1].status).toBe("PENDING");
});

it("usa '—' quando company é null e aceita dueDate null", async () => {
  const findMany = vi.fn().mockResolvedValue([
    { id: "i3", total: 9900, dueDate: null, subscription: { company: null } },
  ]);
  const prismaClient = { invoice: { findMany } } as any;
  const out = await getReceivableThisWeek(new Date("2026-07-08T00:00:00Z"), prismaClient);
  expect(out.items[0].companyName).toBe("—");
  expect(out.items[0].dueDate).toBeNull();
  expect(out.total).toBe(9900);
});
