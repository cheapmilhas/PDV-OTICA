import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Cross-tenant isolation tests for PATCH /api/admin/clientes/[id]
 * Pentest 2026-06-28: provar que um admin sem escopo para a empresa alvo
 * recebe 403 e que nenhuma atualização de dados é realizada.
 */

// --- admin-session mock ---
const getAdminSessionMock = vi.fn();
const requireCompanyScopeMock = vi.fn();
vi.mock("@/lib/admin-session", () => ({
  getAdminSession: (...a: unknown[]) => getAdminSessionMock(...a),
  requireCompanyScope: (...a: unknown[]) => requireCompanyScopeMock(...a),
}));

// --- logger passthrough ---
vi.mock("@/lib/logger", () => ({
  logger: {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
}));

// --- prisma mock ---
const companyFindUniqueMock = vi.fn();
const companyFindFirstMock = vi.fn();
const companyUpdateMock = vi.fn();
const globalAuditCreateMock = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    company: {
      findUnique: (...a: unknown[]) => companyFindUniqueMock(...a),
      findFirst: (...a: unknown[]) => companyFindFirstMock(...a),
      update: (...a: unknown[]) => companyUpdateMock(...a),
    },
    globalAudit: {
      create: (...a: unknown[]) => globalAuditCreateMock(...a),
    },
  },
}));

import { PATCH } from "./route";

function makePatchRequest(companyId: string, body: unknown): Request {
  return new Request(
    `http://localhost/api/admin/clientes/${companyId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

const validBody = {
  name: "Ótica Atualizada",
  tradeName: "Ótica",
  cnpj: "12.345.678/0001-99",
  email: "otica@example.com",
  phone: "11999999999",
  address: "Rua X, 1",
  city: "São Paulo",
  state: "SP",
  zipCode: "01310-100",
  website: null,
};

describe("PATCH /api/admin/clientes/[id] — cross-tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    getAdminSessionMock.mockResolvedValue({
      id: "admin-1",
      email: "admin@vis.app.br",
      role: "SUPER_ADMIN",
    });

    companyUpdateMock.mockResolvedValue({ id: "company-A", ...validBody });
    globalAuditCreateMock.mockResolvedValue({});
  });

  it("403 quando admin não tem escopo para a empresa alvo (cross-tenant barrado)", async () => {
    // requireCompanyScope retorna falsy → acesso negado
    requireCompanyScopeMock.mockResolvedValue(false);

    const res = await PATCH(
      makePatchRequest("company-B", validBody),
      { params: Promise.resolve({ id: "company-B" }) }
    );

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toMatch(/sem permissão/i);

    // Nenhuma escrita deve ter ocorrido
    expect(companyUpdateMock).not.toHaveBeenCalled();
    expect(globalAuditCreateMock).not.toHaveBeenCalled();
  });

  it("200 quando admin tem escopo correto (mesmo escopo aceito)", async () => {
    requireCompanyScopeMock.mockResolvedValue({ id: "admin-1", role: "SUPER_ADMIN" });
    companyFindUniqueMock.mockResolvedValue({
      id: "company-A",
      name: "Ótica Antiga",
      cnpj: "12.345.678/0001-99",
    });
    // Sem conflito de CNPJ
    companyFindFirstMock.mockResolvedValue(null);

    const res = await PATCH(
      makePatchRequest("company-A", validBody),
      { params: Promise.resolve({ id: "company-A" }) }
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(companyUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "company-A" } })
    );
    expect(globalAuditCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "COMPANY_UPDATED" }),
      })
    );
  });

  it("401 quando não há sessão admin ativa", async () => {
    getAdminSessionMock.mockResolvedValue(null);

    const res = await PATCH(
      makePatchRequest("company-A", validBody),
      { params: Promise.resolve({ id: "company-A" }) }
    );

    expect(res.status).toBe(401);
    expect(companyUpdateMock).not.toHaveBeenCalled();
  });
});
