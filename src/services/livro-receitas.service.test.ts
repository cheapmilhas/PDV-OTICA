import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    prescription: {
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import { upsertPrescription } from "./livro-receitas.service";

beforeEach(() => {
  vi.clearAllMocks();
  // create/update devolvem o data recebido pra simplificar asserts.
  (prisma.prescription.create as any).mockImplementation(async (args: any) => ({
    id: "rx-new",
    ...args.data,
  }));
  (prisma.prescription.update as any).mockImplementation(async (args: any) => ({
    id: args.where.id,
    ...args.data,
  }));
});

describe("upsertPrescription (Livro de Receitas — camada de dados)", () => {
  it("CREATE: mapeia o JSON da OS (od/oe) para as colunas relacionais", async () => {
    await upsertPrescription({
      companyId: "co-1",
      customerId: "cust-1",
      od: { esf: "-2.50", cil: "-0.75", eixo: "180", dnp: "31", altura: "20", base: "NASAL" },
      oe: { esf: "-2.00", cil: "-0.50", eixo: "90", dnp: "30", altura: "19" },
      adicao: "1.50",
    });

    expect(prisma.prescription.create).toHaveBeenCalledTimes(1);
    const arg = (prisma.prescription.create as any).mock.calls[0][0];
    const v = arg.data.values.create;

    expect(v.odSph).toBe(-2.5);
    expect(v.odCyl).toBe(-0.75);
    expect(v.odAxis).toBe(180);
    expect(v.odBase).toBe("NASAL");
    expect(v.oeSph).toBe(-2);
    expect(v.oeAxis).toBe(90);
    // DNP por olho → pdFar (OD) / pdNear (OE)
    expect(v.pdFar).toBe(31);
    expect(v.pdNear).toBe(30);
    // altura → fittingHeight
    expect(v.fittingHeightOd).toBe(20);
    expect(v.fittingHeightOe).toBe(19);
    // adição global preenche os dois olhos quando od.add/oe.add ausentes
    expect(v.odAdd).toBe(1.5);
    expect(v.oeAdd).toBe(1.5);
  });

  it("status COMPLETA quando há qualquer grau", async () => {
    const result = await upsertPrescription({
      companyId: "co-1",
      customerId: "cust-1",
      od: { esf: "-1.00" },
    });
    expect((result as any).status).toBe("COMPLETA");
  });

  it("status AGUARDANDO_GRAU quando nenhum grau foi informado", async () => {
    const result = await upsertPrescription({
      companyId: "co-1",
      customerId: "cust-1",
    });
    expect((result as any).status).toBe("AGUARDANDO_GRAU");
  });

  it("vínculo de origem: serviceOrderId é gravado quando presente", async () => {
    const result = await upsertPrescription({
      companyId: "co-1",
      customerId: "cust-1",
      serviceOrderId: "os-99",
    });
    expect((result as any).serviceOrderId).toBe("os-99");
    expect((result as any).saleId).toBeUndefined();
  });

  it("dependente: grava isDependente + patientName", async () => {
    const result = await upsertPrescription({
      companyId: "co-1",
      customerId: "cust-1",
      isDependente: true,
      patientName: "Filho do Titular",
    });
    expect((result as any).isDependente).toBe(true);
    expect((result as any).patientName).toBe("Filho do Titular");
  });

  it("UPDATE: usa prescription.update e faz upsert dos valores quando id é passado", async () => {
    await upsertPrescription({
      companyId: "co-1",
      customerId: "cust-1",
      id: "rx-existing",
      od: { esf: "-3.00" },
    });
    expect(prisma.prescription.update).toHaveBeenCalledTimes(1);
    expect(prisma.prescription.create).not.toHaveBeenCalled();
    const arg = (prisma.prescription.update as any).mock.calls[0][0];
    expect(arg.where.id).toBe("rx-existing");
    expect(arg.data.values.upsert.create.odSph).toBe(-3);
    expect(arg.data.values.upsert.update.odSph).toBe(-3);
  });

  it("multi-tenant: exige companyId e customerId", async () => {
    await expect(upsertPrescription({ companyId: "", customerId: "c" } as any)).rejects.toThrow(/companyId/);
    await expect(upsertPrescription({ companyId: "co", customerId: "" } as any)).rejects.toThrow(/customerId/);
  });
});
