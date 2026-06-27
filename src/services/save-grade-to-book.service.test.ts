import { describe, it, expect, vi, beforeEach } from "vitest";

const { getByIdMock } = vi.hoisted(() => ({ getByIdMock: vi.fn() }));
vi.mock("./prescription.service", () => ({
  prescriptionService: { getById: getByIdMock },
}));
const { upsertMock } = vi.hoisted(() => ({ upsertMock: vi.fn() }));
vi.mock("./livro-receitas.service", () => ({ upsertPrescription: upsertMock }));

import { saveGradeToBook } from "./save-grade-to-book.service";

beforeEach(() => {
  vi.clearAllMocks();
  upsertMock.mockResolvedValue({ id: "rx-1", status: "COMPLETA" });
});

describe("saveGradeToBook", () => {
  it("404 se a receita não existir (tenant: getById filtra companyId)", async () => {
    getByIdMock.mockResolvedValue(null);
    await expect(
      saveGradeToBook("rx-x", "co-1", { od: { esf: "-1,00" } })
    ).rejects.toThrow(/não encontrada|not found|404/i);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("busca a receita, usa o customerId dela e chama upsertPrescription", async () => {
    getByIdMock.mockResolvedValue({ id: "rx-1", customerId: "cust-9", companyId: "co-1" });
    await saveGradeToBook("rx-1", "co-1", {
      od: { esf: "-1,00" },
      oe: { esf: "-2,00" },
      adicao: "1,50",
      isDependente: true,
      patientName: "Filho",
    });
    expect(getByIdMock).toHaveBeenCalledWith("rx-1", "co-1");
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "rx-1",
        companyId: "co-1",
        customerId: "cust-9",
        isDependente: true,
        patientName: "Filho",
        od: expect.objectContaining({ esf: "-1,00" }),
      })
    );
  });
});
