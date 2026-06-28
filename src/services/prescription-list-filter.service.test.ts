import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    prescription: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
  },
}));

import { mapHasServiceOrder } from "./prescription.service";

import { prisma } from "@/lib/prisma";
import { prescriptionService } from "./prescription.service";

beforeEach(() => vi.clearAllMocks());

describe("prescriptionService.list — filtros do Livro", () => {
  it("filtra por status quando informado (multi-tenant preservado)", async () => {
    await prescriptionService.list("co-1", 1, 10, undefined, undefined, "COMPLETA");
    const whereArg = (prisma.prescription.findMany as any).mock.calls[0][0].where;
    expect(whereArg).toEqual(expect.objectContaining({ companyId: "co-1", status: "COMPLETA" }));
  });

  it("sem status → where não inclui status", async () => {
    await prescriptionService.list("co-1", 1, 10);
    const whereArg = (prisma.prescription.findMany as any).mock.calls[0][0].where;
    expect(whereArg.status).toBeUndefined();
    expect(whereArg.companyId).toBe("co-1");
  });

  it("busca SÓ texto (sem dígitos) usa apenas o ramo name no OR", async () => {
    await prescriptionService.list("co-1", 1, 10, undefined, undefined, undefined, "maria");
    const whereArg = (prisma.prescription.findMany as any).mock.calls[0][0].where;
    expect(whereArg.customer).toEqual({
      OR: [{ name: { contains: "maria", mode: "insensitive" } }],
    });
  });

  it("busca com dígitos casa nome OU cpf OU telefone (3 ramos)", async () => {
    await prescriptionService.list("co-1", 1, 10, undefined, undefined, undefined, "123.456");
    const whereArg = (prisma.prescription.findMany as any).mock.calls[0][0].where;
    const orArr = whereArg.customer.OR;
    expect(orArr).toContainEqual({ name: { contains: "123.456", mode: "insensitive" } });
    expect(orArr).toContainEqual({ cpf: { contains: "123456", mode: "insensitive" } });
    expect(orArr).toContainEqual({ phone: { contains: "123456", mode: "insensitive" } });
  });

  it("filtro de emissão monta issuedAt gte/lte", async () => {
    const de = new Date("2024-06-27");
    const ate = new Date("2025-06-27");
    await prescriptionService.list(
      "co-1", 1, 10, undefined, undefined, undefined, undefined, undefined, undefined, de, ate
    );
    const whereArg = (prisma.prescription.findMany as any).mock.calls[0][0].where;
    expect(whereArg.issuedAt).toEqual({ gte: de, lte: ate });
  });

  it("filtro de validade monta expiresAt gte/lte", async () => {
    const de = new Date("2026-01-01");
    const ate = new Date("2026-12-31");
    await prescriptionService.list("co-1", 1, 10, undefined, undefined, undefined, undefined, de, ate);
    const whereArg = (prisma.prescription.findMany as any).mock.calls[0][0].where;
    expect(whereArg.expiresAt).toEqual({ gte: de, lte: ate });
  });
});

describe("mapHasServiceOrder", () => {
  it("hasServiceOrder=true quando há OS vinculada (count>0)", () => {
    const r = mapHasServiceOrder({ id: "rx", _count: { serviceOrders: 1 }, serviceOrderId: null });
    expect(r.hasServiceOrder).toBe(true);
  });
  it("hasServiceOrder=true quando é OS de origem (serviceOrderId set)", () => {
    const r = mapHasServiceOrder({ id: "rx", _count: { serviceOrders: 0 }, serviceOrderId: "os-1" });
    expect(r.hasServiceOrder).toBe(true);
  });
  it("hasServiceOrder=false quando não há OS (exame avulso)", () => {
    const r = mapHasServiceOrder({ id: "rx", _count: { serviceOrders: 0 }, serviceOrderId: null });
    expect(r.hasServiceOrder).toBe(false);
  });
});
