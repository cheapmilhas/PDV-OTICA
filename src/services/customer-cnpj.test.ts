import { describe, it, expect, vi, beforeEach } from "vitest";

const findFirst = vi.fn();
const create = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { customer: { findFirst: (...a: unknown[]) => findFirst(...a), create: (...a: unknown[]) => create(...a) } },
}));

import { customerService } from "./customer.service";

const baseData = {
  name: "Loja XPTO",
  personType: "PJ" as const,
  cnpj: "11222333000181",
  birthDate: undefined,
  acceptsMarketing: false,
  active: true,
};

describe("customer.service — CNPJ preventivo", () => {
  beforeEach(() => {
    findFirst.mockReset();
    create.mockReset().mockResolvedValue({ id: "c1" });
  });

  it("rejeita CNPJ já existente com erro de campo cnpj (não chega a criar)", async () => {
    findFirst.mockResolvedValue({ id: "existing" });
    await expect(customerService.create(baseData, "co-1")).rejects.toMatchObject({
      code: "DUPLICATE",
      details: [{ field: "cnpj" }],
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("normaliza o CNPJ (remove máscara) antes da checagem", async () => {
    findFirst.mockResolvedValue(null);
    await customerService.create({ ...baseData, cnpj: "11.222.333/0001-81" }, "co-1");
    const call = findFirst.mock.calls.find((c) => (c[0] as any)?.where?.cnpj);
    expect((call?.[0] as any).where.cnpj).toBe("11222333000181");
  });
});
