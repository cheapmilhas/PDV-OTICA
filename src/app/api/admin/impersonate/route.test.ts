import { describe, it, expect, vi, beforeEach } from "vitest";

const getAdminSession = vi.fn();
vi.mock("@/lib/admin-session", () => ({
  getAdminSession: () => getAdminSession(),
  // Espelha requireCompanyScope: só ADMIN/SUPER_ADMIN têm escopo.
  requireCompanyScope: async (adminId: string) => {
    const session = await getAdminSession();
    if (session && ["ADMIN", "SUPER_ADMIN"].includes(session.role)) {
      return { id: adminId, role: session.role };
    }
    return null;
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}));

// Sem rate limit nos testes: o alvo aqui é a autorização, não a contenção.
vi.mock("@/lib/rate-limit", () => ({
  rateLimitResponse: () => null,
  clientIp: () => "127.0.0.1",
}));

vi.mock("next-auth/jwt", () => ({ encode: async () => "token-fake" }));

const companyFindUnique = vi.fn();
const userFindFirst = vi.fn();
const globalAuditCreate = vi.fn();
const impersonationCreate = vi.fn();
const impersonationUpdateMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    company: { findUnique: (...a: unknown[]) => companyFindUnique(...a) },
    user: { findFirst: (...a: unknown[]) => userFindFirst(...a) },
    globalAudit: { create: (...a: unknown[]) => globalAuditCreate(...a) },
    $transaction: async (fn: (tx: unknown) => unknown) =>
      fn({
        impersonationSession: {
          updateMany: (...a: unknown[]) => impersonationUpdateMany(...a),
          create: (...a: unknown[]) => impersonationCreate(...a),
        },
      }),
  },
}));

import { POST } from "./route";

function req(body: unknown = { companyId: "co-1", reason: "suporte" }) {
  return new Request("http://localhost/api/admin/impersonate", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const OPTICA = { id: "co-1", name: "Ótica X", platformProduct: "VIS_APP" };
const CLINICA = { id: "co-1", name: "Clínica Y", platformProduct: "VIS_MEDICAL" };

describe("POST /api/admin/impersonate", () => {
  beforeEach(() => {
    process.env.AUTH_SECRET = "segredo-de-teste";
    getAdminSession.mockReset();
    companyFindUnique.mockReset().mockResolvedValue(OPTICA);
    globalAuditCreate.mockReset().mockResolvedValue({});
    impersonationCreate.mockReset().mockResolvedValue({ id: "imp-1" });
    impersonationUpdateMany.mockReset().mockResolvedValue({ count: 0 });
    userFindFirst.mockReset().mockResolvedValue({
      id: "u-1",
      name: "Dono",
      email: "dono@otica.com",
      role: "ADMIN",
      companyId: "co-1",
      branches: [{ branchId: "br-1", branch: { companyId: "co-1" } }],
    });
  });

  it("retorna 401 sem sessão admin", async () => {
    getAdminSession.mockResolvedValue(null);
    expect((await POST(req())).status).toBe(401);
    expect(impersonationCreate).not.toHaveBeenCalled();
  });

  it("retorna 403 para papel sem permissão", async () => {
    getAdminSession.mockResolvedValue({ id: "a1", email: "a@x", role: "SUPPORT" });
    expect((await POST(req())).status).toBe(403);
    expect(impersonationCreate).not.toHaveBeenCalled();
  });

  it("emite token para cliente ótica", async () => {
    getAdminSession.mockResolvedValue({ id: "a1", email: "a@x", name: "A", role: "ADMIN" });
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(impersonationCreate).toHaveBeenCalled();
  });

  // --- Dívida B4: o furo que este gate fecha. ---

  it("BLOQUEIA cliente medical mesmo por chamada direta à API", async () => {
    // A UI já escondia o botão. Sem gate no servidor, um POST direto abria
    // sessão no PDV contornando o código de autorização da Entrega 3 — acesso a
    // dado clínico sem consentimento do cliente e sem trilha no Domus.
    getAdminSession.mockResolvedValue({ id: "a1", email: "a@x", name: "A", role: "ADMIN" });
    companyFindUnique.mockResolvedValue(CLINICA);

    const res = await POST(req());

    expect(res.status).toBe(403);
    expect(impersonationCreate).not.toHaveBeenCalled();
    expect(impersonationUpdateMany).not.toHaveBeenCalled();
  });

  it("audita a tentativa bloqueada — chamada direta precisa deixar rastro", async () => {
    getAdminSession.mockResolvedValue({ id: "a1", email: "a@x", name: "A", role: "ADMIN" });
    companyFindUnique.mockResolvedValue(CLINICA);

    await POST(req());

    const auditada = globalAuditCreate.mock.calls.some(
      ([arg]) =>
        (arg as { data: { action: string; metadata: Record<string, unknown> } }).data.action ===
          "IMPERSONATION_DENIED" &&
        (arg as { data: { metadata: { platformProduct?: string } } }).data.metadata
          .platformProduct === "VIS_MEDICAL",
    );
    expect(auditada).toBe(true);
  });

  it("nega ANTES de encerrar sessões anteriores do admin", async () => {
    // A negação vem antes da transação; um gate tardio derrubaria a sessão de
    // impersonação que o admin já tinha aberta em outra ótica.
    getAdminSession.mockResolvedValue({ id: "a1", email: "a@x", name: "A", role: "ADMIN" });
    companyFindUnique.mockResolvedValue(CLINICA);

    await POST(req());

    expect(impersonationUpdateMany).not.toHaveBeenCalled();
  });
});
