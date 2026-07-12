import { describe, it, expect, vi, beforeEach } from "vitest";

const getAdminSession = vi.fn();
const requireCompanyScope = vi.fn();
vi.mock("@/lib/admin-session", () => ({
  getAdminSession: () => getAdminSession(),
  requireCompanyScope: (...a: unknown[]) => requireCompanyScope(...a),
}));

const userFindFirst = vi.fn();
const userCount = vi.fn();
const companyFindUnique = vi.fn();
const branchFindFirst = vi.fn();

// Captura o que tx.user.create recebe (o alvo dos asserts).
const txUserCreate = vi.fn();
const txBranchCreate = vi.fn();
const txUserBranchCreate = vi.fn();
const txAuditCreate = vi.fn();

const txTransaction = vi.fn(async (cb: (tx: unknown) => unknown) =>
  cb({
    user: { create: (...a: unknown[]) => txUserCreate(...a) },
    branch: { create: (...a: unknown[]) => txBranchCreate(...a) },
    userBranch: { create: (...a: unknown[]) => txUserBranchCreate(...a) },
    globalAudit: { create: (...a: unknown[]) => txAuditCreate(...a) },
  })
);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findFirst: (...a: unknown[]) => userFindFirst(...a),
      count: (...a: unknown[]) => userCount(...a),
    },
    company: { findUnique: (...a: unknown[]) => companyFindUnique(...a) },
    branch: { findFirst: (...a: unknown[]) => branchFindFirst(...a) },
    $transaction: (cb: (tx: unknown) => unknown) => txTransaction(cb),
  },
}));

vi.mock("bcryptjs", () => ({
  default: { hash: vi.fn(async () => "hashed") },
}));

import { POST } from "./route";

function req(body: unknown) {
  return new Request("http://x/api/admin/companies/c1/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}
const params = Promise.resolve({ id: "c1" });

function createdEmail(): string {
  return txUserCreate.mock.calls[0][0].data.email as string;
}
function createdRecoveryEmail(): string | null {
  return txUserCreate.mock.calls[0][0].data.recoveryEmail as string | null;
}

describe("POST /api/admin/companies/[id]/users — login-curto + recoveryEmail", () => {
  beforeEach(() => {
    getAdminSession.mockReset().mockResolvedValue({ id: "a1", email: "a@x", name: "A", role: "SUPPORT" });
    requireCompanyScope.mockReset().mockResolvedValue({ id: "a1", role: "SUPPORT" });
    userFindFirst.mockReset().mockResolvedValue(null); // sem duplicado
    userCount.mockReset().mockResolvedValue(0);
    companyFindUnique.mockReset().mockResolvedValue({
      id: "c1",
      maxUsers: 999,
      tradeName: "Ótica X",
      name: "Ótica X LTDA",
      subscriptions: [],
    });
    branchFindFirst.mockReset().mockResolvedValue({ id: "b1" });
    txUserCreate.mockReset().mockResolvedValue({
      id: "u1", name: "Nome", email: "x@login", role: "VENDEDOR", active: true,
    });
    txBranchCreate.mockReset().mockResolvedValue({ id: "b1" });
    txUserBranchCreate.mockReset().mockResolvedValue({});
    txAuditCreate.mockReset().mockResolvedValue({});
    txTransaction.mockClear();
  });

  const base = { name: "Matheus", password: "senha1234", role: "VENDEDOR" as const };

  it("login-curto 'matheusr' → create recebe email 'matheusr@login'", async () => {
    const res = await POST(req({ ...base, email: "matheusr" }), { params });
    expect(res.status).toBe(201);
    expect(createdEmail()).toBe("matheusr@login");
  });

  it("email com '@' 'Joao@X.com' → create recebe 'joao@x.com'", async () => {
    const res = await POST(req({ ...base, email: "Joao@X.com" }), { params });
    expect(res.status).toBe(201);
    expect(createdEmail()).toBe("joao@x.com");
  });

  it("recoveryEmail '  R@Y.com ' → create recebe 'r@y.com'", async () => {
    const res = await POST(
      req({ ...base, email: "matheusr", recoveryEmail: "  R@Y.com " }),
      { params }
    );
    expect(res.status).toBe(201);
    expect(createdRecoveryEmail()).toBe("r@y.com");
  });

  it("recoveryEmail '' → create recebe null", async () => {
    const res = await POST(
      req({ ...base, email: "matheusr", recoveryEmail: "" }),
      { params }
    );
    expect(res.status).toBe(201);
    expect(createdRecoveryEmail()).toBeNull();
  });

  it("sem recoveryEmail → create recebe null", async () => {
    const res = await POST(req({ ...base, email: "matheusr" }), { params });
    expect(res.status).toBe(201);
    expect(createdRecoveryEmail()).toBeNull();
  });

  it("dup check usa o email já normalizado (matheusr@login)", async () => {
    await POST(req({ ...base, email: "matheusr" }), { params });
    const where = userFindFirst.mock.calls[0][0].where;
    expect(where.email.equals).toBe("matheusr@login");
  });
});
