import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Fase 1 (pentest 2026-06-27): requireAdminAndScope é o helper único que fecha a
 * classe inteira de bugs "esqueci o requireCompanyScope" nas rotas admin por
 * empresa. Estes testes provam: 401 sem sessão, 403 fora de escopo / inativo /
 * papel insuficiente, ok com escopo, e o modo "support" (aceita SUPPORT).
 */

const cookieGet = vi.fn();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (...a: unknown[]) => cookieGet(...a) }),
}));

const jwtVerify = vi.fn();
vi.mock("jose", () => ({
  jwtVerify: (...a: unknown[]) => jwtVerify(...a),
}));

const adminFindUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { adminUser: { findUnique: (...a: unknown[]) => adminFindUnique(...a) } },
}));

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { requireAdminAndScope } from "./admin-session";

function signedInAs(payload: Record<string, unknown>) {
  cookieGet.mockReturnValue({ value: "fake.jwt.token" });
  jwtVerify.mockResolvedValue({ payload: { isAdmin: true, ...payload } });
}

beforeEach(() => {
  cookieGet.mockReset();
  jwtVerify.mockReset();
  adminFindUnique.mockReset();
  // Segredo DEDICADO do admin (P1, 2026-07-16): o fallback para AUTH_SECRET foi
  // removido — setar AUTH_SECRET aqui deixaria o segredo ausente e tudo viraria
  // 401. Ver src/lib/__tests__/admin-jwt-secret.test.ts.
  process.env.ADMIN_JWT_SECRET = "test-secret";
});

describe("requireAdminAndScope", () => {
  it("401 quando não há cookie de sessão admin", async () => {
    cookieGet.mockReturnValue(undefined);
    const r = await requireAdminAndScope("company-1");
    expect(r).toMatchObject({ ok: false, status: 401 });
  });

  it("401 quando o JWT é inválido", async () => {
    cookieGet.mockReturnValue({ value: "bad" });
    jwtVerify.mockRejectedValue(new Error("invalid"));
    const r = await requireAdminAndScope("company-1");
    expect(r).toMatchObject({ ok: false, status: 401 });
  });

  it("403 quando o admin está fora de escopo da empresa", async () => {
    signedInAs({ id: "admin-1", role: "ADMIN" });
    adminFindUnique.mockResolvedValue({
      id: "admin-1", role: "ADMIN", active: true,
      scopeAllCompanies: false, scopedCompanyIds: ["company-2"],
    });
    const r = await requireAdminAndScope("company-1");
    expect(r).toMatchObject({ ok: false, status: 403 });
  });

  it("403 quando o admin está inativo (revalidado no banco)", async () => {
    signedInAs({ id: "admin-1", role: "SUPER_ADMIN" });
    adminFindUnique.mockResolvedValue({
      id: "admin-1", role: "SUPER_ADMIN", active: false,
      scopeAllCompanies: true, scopedCompanyIds: [],
    });
    const r = await requireAdminAndScope("company-1");
    expect(r).toMatchObject({ ok: false, status: 403 });
  });

  it("403 no modo scope quando o papel é SUPPORT (insuficiente p/ ação sensível)", async () => {
    signedInAs({ id: "admin-1", role: "SUPPORT" });
    adminFindUnique.mockResolvedValue({
      id: "admin-1", role: "SUPPORT", active: true,
      scopeAllCompanies: true, scopedCompanyIds: [],
    });
    const r = await requireAdminAndScope("company-1");
    expect(r).toMatchObject({ ok: false, status: 403 });
  });

  it("ok quando SUPER_ADMIN acessa qualquer empresa", async () => {
    signedInAs({ id: "admin-1", role: "SUPER_ADMIN" });
    adminFindUnique.mockResolvedValue({
      id: "admin-1", role: "SUPER_ADMIN", active: true,
      scopeAllCompanies: true, scopedCompanyIds: [],
    });
    const r = await requireAdminAndScope("company-9");
    expect(r).toEqual({ ok: true, admin: { id: "admin-1", role: "SUPER_ADMIN" } });
  });

  it("ok quando ADMIN escopado acessa empresa da sua lista", async () => {
    signedInAs({ id: "admin-1", role: "ADMIN" });
    adminFindUnique.mockResolvedValue({
      id: "admin-1", role: "ADMIN", active: true,
      scopeAllCompanies: false, scopedCompanyIds: ["company-1"],
    });
    const r = await requireAdminAndScope("company-1");
    expect(r).toMatchObject({ ok: true });
  });

  it("modo support: SUPPORT escopado é aceito", async () => {
    signedInAs({ id: "admin-1", role: "SUPPORT" });
    adminFindUnique.mockResolvedValue({
      id: "admin-1", role: "SUPPORT", active: true,
      scopeAllCompanies: false, scopedCompanyIds: ["company-1"],
    });
    const r = await requireAdminAndScope("company-1", "support");
    expect(r).toMatchObject({ ok: true, admin: { role: "SUPPORT" } });
  });

  it("modo support: SUPPORT fora de escopo é 403", async () => {
    signedInAs({ id: "admin-1", role: "SUPPORT" });
    adminFindUnique.mockResolvedValue({
      id: "admin-1", role: "SUPPORT", active: true,
      scopeAllCompanies: false, scopedCompanyIds: ["company-2"],
    });
    const r = await requireAdminAndScope("company-1", "support");
    expect(r).toMatchObject({ ok: false, status: 403 });
  });
});
