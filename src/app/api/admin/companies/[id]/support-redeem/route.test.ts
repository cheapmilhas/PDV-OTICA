import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/admin-session", () => ({
  getAdminSession: vi.fn(),
  requireCompanyScope: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    company: { findUnique: vi.fn() },
    globalAudit: { create: vi.fn() },
  },
}));
vi.mock("@/lib/vis-support-client", () => ({
  postSupportRedeem: vi.fn(),
}));

import { POST } from "./route";
import { getAdminSession, requireCompanyScope } from "@/lib/admin-session";
import { prisma } from "@/lib/prisma";
import { postSupportRedeem } from "@/lib/vis-support-client";

const mockSession = vi.mocked(getAdminSession);
const mockScope = vi.mocked(requireCompanyScope);
const mockCompany = vi.mocked(prisma.company.findUnique);
const mockAudit = vi.mocked(prisma.globalAudit.create);
const mockRedeem = vi.mocked(postSupportRedeem);

const ADMIN = {
  id: "admin-1",
  email: "op@vis.com",
  name: "Operador",
  role: "ADMIN",
  isAdmin: true,
};

const CLINIC_ID = "11111111-1111-1111-1111-111111111111";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/admin/companies/c1/support-redeem", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const params = Promise.resolve({ id: "c1" });

/** Estado feliz: admin autenticado, com escopo, empresa com clínica provisionada. */
function arrangeHappyPath() {
  mockSession.mockResolvedValue(ADMIN);
  mockScope.mockResolvedValue(true as never);
  mockCompany.mockResolvedValue({
    domusClinicId: CLINIC_ID,
    platformProduct: "VIS_MEDICAL",
    name: "Clínica Teste",
  } as never);
  mockAudit.mockResolvedValue({} as never);
}

/** Última linha de auditoria gravada. */
function lastAudit() {
  return mockAudit.mock.calls.at(-1)?.[0]?.data as
    | { action: string; actorId: string; companyId: string; metadata: Record<string, unknown> }
    | undefined;
}

describe("POST support-redeem — porta de entrada", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("401 sem sessão — não chama o Domus nem audita", async () => {
    mockSession.mockResolvedValue(null);
    const res = await POST(makeRequest({ code: "X" }), { params });
    expect(res.status).toBe(401);
    expect(mockRedeem).not.toHaveBeenCalled();
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it("403 fora do escopo — não chama o Domus", async () => {
    mockSession.mockResolvedValue(ADMIN);
    mockScope.mockResolvedValue(false as never);
    const res = await POST(makeRequest({ code: "X" }), { params });
    expect(res.status).toBe(403);
    expect(mockRedeem).not.toHaveBeenCalled();
  });

  it("422 quando a empresa não tem clínica provisionada", async () => {
    mockSession.mockResolvedValue(ADMIN);
    mockScope.mockResolvedValue(true as never);
    mockCompany.mockResolvedValue({
      domusClinicId: null,
      platformProduct: "VIS_MEDICAL",
      name: "Sem clínica",
    } as never);
    const res = await POST(makeRequest({ code: "X" }), { params });
    expect(res.status).toBe(422);
    expect(mockRedeem).not.toHaveBeenCalled();
  });

  it("400 com código vazio", async () => {
    arrangeHappyPath();
    const res = await POST(makeRequest({ code: "   " }), { params });
    expect(res.status).toBe(400);
    expect(mockRedeem).not.toHaveBeenCalled();
  });

  it("clinicId vai do CADASTRO, não do corpo do operador", async () => {
    arrangeHappyPath();
    mockRedeem.mockResolvedValue({
      kind: "ok",
      magicUrl: "https://d/x#t=1",
      grantId: "g1",
      expiresAt: null,
    });
    // O operador tenta injetar outra clínica no corpo — deve ser ignorado.
    await POST(
      makeRequest({ code: "ABC", clinicId: "99999999-9999-9999-9999-999999999999" }),
      { params },
    );
    expect(mockRedeem.mock.calls[0][0].clinicId).toBe(CLINIC_ID);
  });
});

describe("POST support-redeem — trilha de auditoria", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    arrangeHappyPath();
  });

  it("sucesso → grava SUPPORT_ACCESS_GRANTED com actor e empresa", async () => {
    mockRedeem.mockResolvedValue({
      kind: "ok",
      magicUrl: "https://d/x#t=1",
      grantId: "g-dom",
      expiresAt: null,
    });
    const res = await POST(makeRequest({ code: "ABC" }), { params });
    expect(res.status).toBe(200);

    const audit = lastAudit();
    expect(audit?.action).toBe("SUPPORT_ACCESS_GRANTED");
    expect(audit?.actorId).toBe(ADMIN.id);
    expect(audit?.companyId).toBe("c1");
    expect(audit?.metadata.adminEmail).toBe(ADMIN.email);
    expect(audit?.metadata.supportGrantId).toBeTruthy();
  });

  it("recusa → grava SUPPORT_ACCESS_DENIED (tentativa também é auditável)", async () => {
    // Se só logássemos sucesso, um operador tateando códigos não deixaria rastro.
    mockRedeem.mockResolvedValue({ kind: "rejected", status: 409, error: "already_used" });
    const res = await POST(makeRequest({ code: "ABC" }), { params });
    expect(res.status).toBe(409);
    expect(lastAudit()?.action).toBe("SUPPORT_ACCESS_DENIED");
  });

  it("código queimado sem link → grava SUPPORT_ACCESS_STUCK e responde 502", async () => {
    mockRedeem.mockResolvedValue({ kind: "activation_unavailable", grantId: "g-x" });
    const res = await POST(makeRequest({ code: "ABC" }), { params });
    expect(res.status).toBe(502);
    expect(lastAudit()?.action).toBe("SUPPORT_ACCESS_STUCK");
  });

  it("falha de canal (transient) → 503 e NÃO audita (nada foi tentado no Domus)", async () => {
    mockRedeem.mockResolvedValue({ kind: "transient", reason: "config ausente" });
    const res = await POST(makeRequest({ code: "ABC" }), { params });
    expect(res.status).toBe(503);
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it("NUNCA grava o código do cliente na trilha (é credencial)", async () => {
    mockRedeem.mockResolvedValue({ kind: "rejected", status: 409, error: "already_used" });
    await POST(makeRequest({ code: "SEGREDO-123" }), { params });
    expect(JSON.stringify(lastAudit())).not.toContain("SEGREDO-123");
  });

  it("falha ao gravar auditoria NÃO derruba um acesso já concedido", async () => {
    // Decisão deliberada: a trilha autoritativa sobre o PHI é a do Domus (essa
    // sim fail-closed). Derrubar aqui trocaria observabilidade por indisponibi-
    // lidade no meio de um atendimento.
    mockRedeem.mockResolvedValue({
      kind: "ok",
      magicUrl: "https://d/x#t=1",
      grantId: "g1",
      expiresAt: null,
    });
    mockAudit.mockRejectedValue(new Error("db down"));
    const res = await POST(makeRequest({ code: "ABC" }), { params });
    expect(res.status).toBe(200);
  });
});
