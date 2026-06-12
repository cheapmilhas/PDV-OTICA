import { describe, it, expect, vi } from "vitest";
import {
  resolveAsaasCustomerId,
  ensureAsaasCustomer,
} from "./asaas-customer.service";

function makeAsaasClient(overrides: {
  findByCpfCnpj?: ReturnType<typeof vi.fn>;
  create?: ReturnType<typeof vi.fn>;
} = {}) {
  return {
    customers: {
      findByCpfCnpj:
        overrides.findByCpfCnpj ?? vi.fn().mockResolvedValue(null),
      create:
        overrides.create ??
        vi.fn().mockResolvedValue({ id: "cus_new", cpfCnpj: "x" }),
    },
  } as any;
}

describe("resolveAsaasCustomerId", () => {
  it("(a) returns existing customer when findByCpfCnpj finds one, without calling create", async () => {
    const findByCpfCnpj = vi.fn().mockResolvedValue({ id: "cus_X" });
    const create = vi.fn();
    const asaasClient = makeAsaasClient({ findByCpfCnpj, create });

    const result = await resolveAsaasCustomerId(
      {
        name: "Empresa",
        email: "a@a.com",
        cpfCnpjRaw: "12345678901",
        externalReference: "company:1",
      },
      { asaasClient },
    );

    expect(result).toEqual({ asaasCustomerId: "cus_X", created: false });
    expect(create).not.toHaveBeenCalled();
  });

  it("(b) creates customer when not found, with digits-only cpfCnpj and exact externalReference", async () => {
    const findByCpfCnpj = vi.fn().mockResolvedValue(null);
    const create = vi.fn().mockResolvedValue({ id: "cus_created" });
    const asaasClient = makeAsaasClient({ findByCpfCnpj, create });

    const result = await resolveAsaasCustomerId(
      {
        name: "Empresa",
        email: "a@a.com",
        cpfCnpjRaw: "123.456.789-01",
        mobilePhone: "11999998888",
        externalReference: "company:42",
      },
      { asaasClient },
    );

    expect(result).toEqual({ asaasCustomerId: "cus_created", created: true });
    expect(create).toHaveBeenCalledWith({
      name: "Empresa",
      email: "a@a.com",
      cpfCnpj: "12345678901",
      mobilePhone: "11999998888",
      externalReference: "company:42",
      notificationDisabled: true,
    });
  });

  it("(c) normalizes CNPJ with mask to digits-only for both lookup and create", async () => {
    const findByCpfCnpj = vi.fn().mockResolvedValue(null);
    const create = vi.fn().mockResolvedValue({ id: "cus_cnpj" });
    const asaasClient = makeAsaasClient({ findByCpfCnpj, create });

    await resolveAsaasCustomerId(
      {
        name: "Empresa",
        email: "a@a.com",
        cpfCnpjRaw: "20.606.235/0001-39",
        externalReference: "company:9",
      },
      { asaasClient },
    );

    expect(findByCpfCnpj).toHaveBeenCalledWith("20606235000139");
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ cpfCnpj: "20606235000139" }),
    );
  });

  it("(d) throws on invalid/empty cpfCnpj without calling Asaas", async () => {
    const findByCpfCnpj = vi.fn();
    const create = vi.fn();
    const asaasClient = makeAsaasClient({ findByCpfCnpj, create });

    for (const cpfCnpjRaw of ["", "123", "1".repeat(20)]) {
      await expect(
        resolveAsaasCustomerId(
          {
            name: "Empresa",
            email: "a@a.com",
            cpfCnpjRaw,
            externalReference: "company:1",
          },
          { asaasClient },
        ),
      ).rejects.toThrow("CPF/CNPJ inválido ou ausente");
    }

    expect(findByCpfCnpj).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
});

describe("ensureAsaasCustomer", () => {
  it("(e) no-op when subscription already has asaasCustomerId", async () => {
    const prismaClient = {
      company: {
        findUnique: vi.fn().mockResolvedValue({
          name: "Empresa",
          cnpj: "20606235000139",
          email: "a@a.com",
          phone: "11999998888",
        }),
      },
      subscription: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: "sub_1", asaasCustomerId: "cus_old" }),
        update: vi.fn(),
      },
    } as any;
    const asaasClient = makeAsaasClient();

    const result = await ensureAsaasCustomer("comp_1", {
      prismaClient,
      asaasClient,
    });

    expect(result).toEqual({ asaasCustomerId: "cus_old", created: false });
    expect(asaasClient.customers.findByCpfCnpj).not.toHaveBeenCalled();
    expect(asaasClient.customers.create).not.toHaveBeenCalled();
    expect(prismaClient.subscription.update).not.toHaveBeenCalled();
  });

  it("(f) creates customer and updates subscription when missing", async () => {
    const create = vi.fn().mockResolvedValue({ id: "cus_brand_new" });
    const findByCpfCnpj = vi.fn().mockResolvedValue(null);
    const asaasClient = makeAsaasClient({ findByCpfCnpj, create });
    const prismaClient = {
      company: {
        findUnique: vi.fn().mockResolvedValue({
          name: "Empresa",
          cnpj: "20.606.235/0001-39",
          email: "a@a.com",
          phone: "11999998888",
        }),
      },
      subscription: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: "sub_2", asaasCustomerId: null }),
        update: vi.fn().mockResolvedValue({}),
      },
    } as any;

    const result = await ensureAsaasCustomer("comp_2", {
      prismaClient,
      asaasClient,
    });

    expect(result).toEqual({ asaasCustomerId: "cus_brand_new", created: true });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        cpfCnpj: "20606235000139",
        externalReference: "company:comp_2",
      }),
    );
    expect(prismaClient.subscription.update).toHaveBeenCalledWith({
      where: { id: "sub_2" },
      data: { asaasCustomerId: "cus_brand_new" },
    });
  });

  it("(g) throws when company has no subscriptions at all", async () => {
    const prismaClient = {
      company: {
        findUnique: vi.fn().mockResolvedValue({
          name: "Empresa",
          cnpj: "20606235000139",
          email: "a@a.com",
          phone: "11999998888",
        }),
      },
      subscription: {
        findFirst: vi.fn().mockResolvedValue(null).mockResolvedValue(null),
        update: vi.fn(),
      },
    } as any;
    prismaClient.subscription.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    const asaasClient = makeAsaasClient();

    await expect(
      ensureAsaasCustomer("comp_3", { prismaClient, asaasClient }),
    ).rejects.toThrow("Empresa sem subscription");
  });

  it("(h) writes to the most recent non-CANCELED subscription", async () => {
    const create = vi.fn().mockResolvedValue({ id: "cus_h" });
    const findByCpfCnpj = vi.fn().mockResolvedValue(null);
    const asaasClient = makeAsaasClient({ findByCpfCnpj, create });
    // findFirst with {status: {not: CANCELED}, orderBy createdAt desc} returns the recent one
    const findFirst = vi
      .fn()
      .mockResolvedValue({ id: "sub_recent", asaasCustomerId: null });
    const prismaClient = {
      company: {
        findUnique: vi.fn().mockResolvedValue({
          name: "Empresa",
          cnpj: "20606235000139",
          email: "a@a.com",
          phone: "11999998888",
        }),
      },
      subscription: {
        findFirst,
        update: vi.fn().mockResolvedValue({}),
      },
    } as any;

    await ensureAsaasCustomer("comp_4", { prismaClient, asaasClient });

    expect(prismaClient.subscription.update).toHaveBeenCalledWith({
      where: { id: "sub_recent" },
      data: { asaasCustomerId: "cus_h" },
    });
  });

  it("(i) throws when company not found", async () => {
    const prismaClient = {
      company: { findUnique: vi.fn().mockResolvedValue(null) },
      subscription: { findFirst: vi.fn(), update: vi.fn() },
    } as any;
    const asaasClient = makeAsaasClient();

    await expect(
      ensureAsaasCustomer("comp_x", { prismaClient, asaasClient }),
    ).rejects.toThrow("Empresa não encontrada");
  });
});
