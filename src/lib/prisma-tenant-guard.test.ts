import { describe, it, expect } from "vitest";
import { whereHasCompanyId, resolveTenantGuardMode } from "./prisma-tenant-guard";

describe("resolveTenantGuardMode", () => {
  it("default em development é throw (vazamento estoura local)", () => {
    expect(resolveTenantGuardMode(undefined, "development")).toBe("throw");
  });
  it("default em production é warn (nunca derruba request legítima)", () => {
    expect(resolveTenantGuardMode(undefined, "production")).toBe("warn");
  });
  it("default em test é warn", () => {
    expect(resolveTenantGuardMode(undefined, "test")).toBe("warn");
  });
  it("TENANT_GUARD_MODE explícito vence o default", () => {
    expect(resolveTenantGuardMode("throw", "production")).toBe("throw");
    expect(resolveTenantGuardMode("warn", "development")).toBe("warn");
  });
  it("valor inválido cai no default do ambiente", () => {
    expect(resolveTenantGuardMode("banana", "development")).toBe("throw");
    expect(resolveTenantGuardMode("", "production")).toBe("warn");
  });
});

describe("whereHasCompanyId — detecção de filtro multi-tenant", () => {
  it("detecta companyId no topo do where", () => {
    expect(whereHasCompanyId({ companyId: "c1" })).toBe(true);
  });

  it("detecta companyId junto de outros filtros", () => {
    expect(whereHasCompanyId({ companyId: "c1", status: "COMPLETED" })).toBe(true);
  });

  it("retorna false quando companyId está ausente", () => {
    expect(whereHasCompanyId({ status: "COMPLETED" })).toBe(false);
    expect(whereHasCompanyId({ id: "x", name: { contains: "abc" } })).toBe(false);
  });

  it("retorna false para where vazio/indefinido", () => {
    expect(whereHasCompanyId(undefined)).toBe(false);
    expect(whereHasCompanyId({})).toBe(false);
    expect(whereHasCompanyId(null)).toBe(false);
  });

  it("detecta companyId dentro de AND (array)", () => {
    expect(whereHasCompanyId({ AND: [{ status: "OPEN" }, { companyId: "c1" }] })).toBe(true);
  });

  it("detecta companyId dentro de OR", () => {
    expect(whereHasCompanyId({ OR: [{ companyId: "c1" }, { companyId: "c2" }] })).toBe(true);
  });

  it("detecta companyId dentro de NOT (objeto)", () => {
    expect(whereHasCompanyId({ NOT: { companyId: "c1" } })).toBe(true);
  });

  it("detecta companyId via relação aninhada", () => {
    expect(whereHasCompanyId({ sale: { companyId: "c1" } })).toBe(true);
  });

  it("não confunde campo parecido", () => {
    expect(whereHasCompanyId({ company: { name: "X" } })).toBe(false);
  });

  it("respeita o limite de profundidade (não estoura em where muito aninhado)", () => {
    const deep = { a: { b: { c: { d: { e: { companyId: "c1" } } } } } };
    // depth > 4 corta a busca — aceitável (conservador), não deve lançar
    expect(() => whereHasCompanyId(deep)).not.toThrow();
  });
});
