import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { sale: { findFirst: vi.fn() } },
}));
const { upsertMock } = vi.hoisted(() => ({ upsertMock: vi.fn() }));
vi.mock("./livro-receitas.service", () => ({ upsertPrescription: upsertMock }));
const { warnMock } = vi.hoisted(() => ({ warnMock: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { child: () => ({ warn: warnMock, error: vi.fn(), info: vi.fn() }) } }));

import { prisma } from "@/lib/prisma";
import { createPrescriptionFromSale } from "./prescription-from-sale.service";

const saleWith = (items: any[], customerId: string | null = "cust-1") => ({
  id: "sale-1",
  customerId,
  branchId: "br-1",
  items,
});

beforeEach(() => {
  vi.clearAllMocks();
  upsertMock.mockResolvedValue({ id: "rx-1" });
});

describe("createPrescriptionFromSale", () => {
  it("venda com LENTE + cliente → cria receita ligada à venda", async () => {
    (prisma.sale.findFirst as any).mockResolvedValue(
      saleWith([{ product: { type: "OPHTHALMIC_LENS", isEyeExam: false } }])
    );
    const r = await createPrescriptionFromSale("sale-1", "co-1", "user-1");
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ saleId: "sale-1", customerId: "cust-1", companyId: "co-1" })
    );
    expect(r.created).toBe(true);
  });

  it("venda com EXAME (isEyeExam) sem lente + cliente → cria receita", async () => {
    (prisma.sale.findFirst as any).mockResolvedValue(
      saleWith([{ product: { type: "SERVICE", isEyeExam: true } }])
    );
    const r = await createPrescriptionFromSale("sale-1", "co-1", "user-1");
    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(r.created).toBe(true);
  });

  it("venda SEM cliente → NÃO cria receita, loga warn", async () => {
    (prisma.sale.findFirst as any).mockResolvedValue(
      saleWith([{ product: { type: "OPHTHALMIC_LENS", isEyeExam: false } }], null)
    );
    const r = await createPrescriptionFromSale("sale-1", "co-1", "user-1");
    expect(upsertMock).not.toHaveBeenCalled();
    expect(warnMock).toHaveBeenCalled();
    expect(r.created).toBe(false);
  });

  it("venda sem lente e sem exame → NÃO cria receita", async () => {
    (prisma.sale.findFirst as any).mockResolvedValue(
      saleWith([{ product: { type: "FRAME", isEyeExam: false } }])
    );
    const r = await createPrescriptionFromSale("sale-1", "co-1", "user-1");
    expect(upsertMock).not.toHaveBeenCalled();
    expect(r.created).toBe(false);
  });

  it("venda inexistente → NÃO cria, retorna created:false", async () => {
    (prisma.sale.findFirst as any).mockResolvedValue(null);
    const r = await createPrescriptionFromSale("nope", "co-1", "user-1");
    expect(upsertMock).not.toHaveBeenCalled();
    expect(r.created).toBe(false);
  });
});
