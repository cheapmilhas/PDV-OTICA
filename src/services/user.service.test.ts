import { describe, it, expect, vi, beforeEach } from "vitest";

// Caminho de teste escolhido: FUNÇÃO PURA (normalizeRecoveryEmail) como prova
// robusta da normalização + testes de INTEGRAÇÃO do service que capturam o
// `data` passado a prisma.user.create/update para provar que create/update
// realmente aplicam a normalização e que o campo chega ao banco.

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    user: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    branch: {
      findMany: vi.fn(),
    },
    userBranch: {
      upsert: vi.fn(),
    },
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn(async () => "hashed"),
  },
}));

import { userService, normalizeRecoveryEmail } from "@/services/user.service";

const COMPANY_ID = "company_1";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("normalizeRecoveryEmail (função pura)", () => {
  it('trim + lowercase: "  Fs@GMAIL.com " → "fs@gmail.com"', () => {
    expect(normalizeRecoveryEmail("  Fs@GMAIL.com ")).toBe("fs@gmail.com");
  });

  it('string vazia → null', () => {
    expect(normalizeRecoveryEmail("")).toBeNull();
    expect(normalizeRecoveryEmail("   ")).toBeNull();
  });

  it("não-string (undefined/null/number) → null", () => {
    expect(normalizeRecoveryEmail(undefined)).toBeNull();
    expect(normalizeRecoveryEmail(null)).toBeNull();
    expect(normalizeRecoveryEmail(123)).toBeNull();
  });
});

describe("UserService.create — normaliza recoveryEmail no data do prisma", () => {
  beforeEach(() => {
    prismaMock.user.findFirst.mockResolvedValue(null); // sem duplicado
    prismaMock.user.create.mockResolvedValue({ id: "u1" });
    prismaMock.branch.findMany.mockResolvedValue([]);
  });

  it('recoveryEmail "  Fs@GMAIL.com " → data.recoveryEmail "fs@gmail.com"', async () => {
    await userService.create(
      {
        name: "Fulano",
        email: "user@x.com",
        password: "senha1234",
        role: "VENDEDOR",
        recoveryEmail: "  Fs@GMAIL.com ",
      } as any,
      COMPANY_ID,
    );

    const arg = prismaMock.user.create.mock.calls[0][0];
    expect(arg.data.recoveryEmail).toBe("fs@gmail.com");
  });

  it('recoveryEmail "" → data.recoveryEmail null', async () => {
    await userService.create(
      {
        name: "Fulano",
        email: "user@x.com",
        password: "senha1234",
        role: "VENDEDOR",
        recoveryEmail: "",
      } as any,
      COMPANY_ID,
    );

    const arg = prismaMock.user.create.mock.calls[0][0];
    expect(arg.data.recoveryEmail).toBeNull();
  });

  it("sem recoveryEmail (undefined) → data.recoveryEmail null", async () => {
    await userService.create(
      {
        name: "Fulano",
        email: "user@x.com",
        password: "senha1234",
        role: "VENDEDOR",
      } as any,
      COMPANY_ID,
    );

    const arg = prismaMock.user.create.mock.calls[0][0];
    expect(arg.data.recoveryEmail).toBeNull();
  });
});

describe("UserService.update — normaliza recoveryEmail no updateData do prisma", () => {
  beforeEach(() => {
    // getById (findFirst) precisa achar o usuário; depois checagem de email dup.
    prismaMock.user.findFirst.mockResolvedValue({ id: "u1" });
    prismaMock.user.update.mockResolvedValue({ id: "u1" });
  });

  it('recoveryEmail "X@Y.COM" → updateData.recoveryEmail "x@y.com"', async () => {
    await userService.update(
      "u1",
      { recoveryEmail: "X@Y.COM" } as any,
      COMPANY_ID,
    );

    const arg = prismaMock.user.update.mock.calls[0][0];
    expect(arg.data.recoveryEmail).toBe("x@y.com");
  });

  it('recoveryEmail "" no update → updateData.recoveryEmail null', async () => {
    await userService.update(
      "u1",
      { recoveryEmail: "" } as any,
      COMPANY_ID,
    );

    const arg = prismaMock.user.update.mock.calls[0][0];
    expect(arg.data.recoveryEmail).toBeNull();
  });
});
