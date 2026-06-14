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
  const where = findMany.mock.calls[0][0].where;
  expect(where.status).toBe("PENDING");
  expect(where.subscription).toEqual({ status: "ACTIVE" });
  expect(where.dueDate.gte).toBeInstanceOf(Date);
  expect(where.dueDate.lte).toBeInstanceOf(Date);
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
