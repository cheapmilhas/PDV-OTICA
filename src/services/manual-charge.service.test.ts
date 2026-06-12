import { describe, it, expect, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { createManualCharge } from "./manual-charge.service";

function p2002Number() {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "5.22.0",
    meta: { target: ["number"] },
  });
}

function mkPrisma(opts: { sub?: any; invoice?: any } = {}) {
  const sub = "sub" in opts ? opts.sub : { id: "s1" };
  return {
    subscription: {
      findFirst: vi.fn().mockResolvedValue(sub),
    },
    invoice: {
      create: vi
        .fn()
        .mockResolvedValue(opts.invoice ?? { id: "inv1" }),
    },
  } as any;
}

const baseArgs = {
  companyId: "c1",
  amount: 1000,
  description: "Cobrança avulsa",
  adminId: "adm1",
};

describe("createManualCharge", () => {
  it("(a) fluxo feliz: orquestra na ordem correta e retorna payload", async () => {
    const prismaClient = mkPrisma();
    const ensureCustomerFn = vi.fn().mockResolvedValue(undefined);
    const ensureChargeFn = vi.fn().mockResolvedValue(undefined);
    const numberFn = vi.fn().mockResolvedValue("INV-000001");
    const sendFn = vi
      .fn()
      .mockResolvedValue({ status: "SENT", alreadySentToday: false });

    const out = await createManualCharge(baseArgs, {
      prismaClient,
      ensureCustomerFn,
      ensureChargeFn,
      numberFn,
      sendFn,
    });

    expect(out).toEqual({
      invoiceId: "inv1",
      asaasChargeCreated: true,
      emailStatus: "SENT",
    });

    // ORDEM: ensureCustomerFn ANTES de ensureChargeFn
    expect(ensureCustomerFn.mock.invocationCallOrder[0]).toBeLessThan(
      ensureChargeFn.mock.invocationCallOrder[0]
    );

    // invoice.create recebeu isManual:true
    const createData = prismaClient.invoice.create.mock.calls[0][0].data;
    expect(createData.isManual).toBe(true);
  });

  it("(b) sub CANCELED-only: throw e NÃO toca Asaas", async () => {
    const prismaClient = mkPrisma({ sub: null });
    const ensureCustomerFn = vi.fn();

    await expect(
      createManualCharge(baseArgs, { prismaClient, ensureCustomerFn })
    ).rejects.toThrow("Empresa sem assinatura ativa para cobrar");

    expect(ensureCustomerFn).not.toHaveBeenCalled();
  });

  it("(c) ensureCustomerFn rejeita → propaga, invoice.create NÃO chamado", async () => {
    const prismaClient = mkPrisma();
    const ensureCustomerFn = vi
      .fn()
      .mockRejectedValue(new Error("CPF/CNPJ inválido ou ausente"));

    await expect(
      createManualCharge(baseArgs, { prismaClient, ensureCustomerFn })
    ).rejects.toThrow("CPF/CNPJ inválido ou ausente");

    expect(prismaClient.invoice.create).not.toHaveBeenCalled();
  });

  it("(d) emailStatus propagado (SKIPPED)", async () => {
    const prismaClient = mkPrisma();
    const out = await createManualCharge(baseArgs, {
      prismaClient,
      ensureCustomerFn: vi.fn().mockResolvedValue(undefined),
      ensureChargeFn: vi.fn().mockResolvedValue(undefined),
      numberFn: vi.fn().mockResolvedValue("INV-000002"),
      sendFn: vi
        .fn()
        .mockResolvedValue({ status: "SKIPPED", alreadySentToday: true }),
    });

    expect(out.emailStatus).toBe("SKIPPED");
  });

  it("(e) amount=500 → invoice.create com total e subtotal === 500", async () => {
    const prismaClient = mkPrisma();
    await createManualCharge(
      { ...baseArgs, amount: 500 },
      {
        prismaClient,
        ensureCustomerFn: vi.fn().mockResolvedValue(undefined),
        ensureChargeFn: vi.fn().mockResolvedValue(undefined),
        numberFn: vi.fn().mockResolvedValue("INV-000003"),
        sendFn: vi
          .fn()
          .mockResolvedValue({ status: "SENT", alreadySentToday: false }),
      }
    );

    const createData = prismaClient.invoice.create.mock.calls[0][0].data;
    expect(createData.total).toBe(500);
    expect(createData.subtotal).toBe(500);
  });

  it("(f) ensureChargeFn rejeita → propaga MAS invoice.create JÁ foi chamado (I3)", async () => {
    const prismaClient = mkPrisma();
    const ensureChargeFn = vi
      .fn()
      .mockRejectedValue(new Error("Asaas indisponível"));

    await expect(
      createManualCharge(baseArgs, {
        prismaClient,
        ensureCustomerFn: vi.fn().mockResolvedValue(undefined),
        ensureChargeFn,
        numberFn: vi.fn().mockResolvedValue("INV-000004"),
        sendFn: vi.fn(),
      })
    ).rejects.toThrow("Asaas indisponível");

    expect(prismaClient.invoice.create).toHaveBeenCalled();
  });

  it("(g) retry em colisão de number: 1º create lança P2002(number), 2º sucede", async () => {
    const prismaClient = mkPrisma();
    prismaClient.invoice.create = vi
      .fn()
      .mockRejectedValueOnce(p2002Number())
      .mockResolvedValueOnce({ id: "inv1" });

    const numberFn = vi
      .fn()
      .mockResolvedValueOnce("INV-000010")
      .mockResolvedValueOnce("INV-000011");

    const out = await createManualCharge(baseArgs, {
      prismaClient,
      ensureCustomerFn: vi.fn().mockResolvedValue(undefined),
      ensureChargeFn: vi.fn().mockResolvedValue(undefined),
      numberFn,
      sendFn: vi
        .fn()
        .mockResolvedValue({ status: "SENT", alreadySentToday: false }),
    });

    expect(out.invoiceId).toBe("inv1");
    expect(numberFn).toHaveBeenCalledTimes(2);
    expect(prismaClient.invoice.create).toHaveBeenCalledTimes(2);
    // o 2º create usou o número re-gerado
    expect(prismaClient.invoice.create.mock.calls[1][0].data.number).toBe(
      "INV-000011"
    );
  });

  it("(h) erro não-P2002 propaga sem retry", async () => {
    const prismaClient = mkPrisma();
    prismaClient.invoice.create = vi
      .fn()
      .mockRejectedValue(new Error("DB indisponível"));

    const numberFn = vi.fn().mockResolvedValue("INV-000012");

    await expect(
      createManualCharge(baseArgs, {
        prismaClient,
        ensureCustomerFn: vi.fn().mockResolvedValue(undefined),
        ensureChargeFn: vi.fn().mockResolvedValue(undefined),
        numberFn,
        sendFn: vi.fn(),
      })
    ).rejects.toThrow("DB indisponível");

    expect(numberFn).toHaveBeenCalledTimes(1);
    expect(prismaClient.invoice.create).toHaveBeenCalledTimes(1);
  });

  it("(i) 3 colisões seguidas → propaga o erro P2002", async () => {
    const prismaClient = mkPrisma();
    prismaClient.invoice.create = vi
      .fn()
      .mockRejectedValue(p2002Number());

    const numberFn = vi.fn().mockResolvedValue("INV-000013");

    await expect(
      createManualCharge(baseArgs, {
        prismaClient,
        ensureCustomerFn: vi.fn().mockResolvedValue(undefined),
        ensureChargeFn: vi.fn().mockResolvedValue(undefined),
        numberFn,
        sendFn: vi.fn(),
      })
    ).rejects.toMatchObject({ code: "P2002" });

    expect(prismaClient.invoice.create).toHaveBeenCalledTimes(3);
    expect(numberFn).toHaveBeenCalledTimes(3);
  });
});
