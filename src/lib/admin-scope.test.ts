import { describe, it, expect } from "vitest";
import { canAccessCompany, type AdminScope } from "./admin-scope";

const superAdmin: AdminScope = { role: "SUPER_ADMIN", scopeAllCompanies: true, scopedCompanyIds: [] };
const restricted: AdminScope = { role: "SUPPORT", scopeAllCompanies: false, scopedCompanyIds: ["c1", "c2"] };
const fullSupport: AdminScope = { role: "SUPPORT", scopeAllCompanies: true, scopedCompanyIds: [] };

describe("canAccessCompany", () => {
  it("SUPER_ADMIN acessa qualquer empresa", () => {
    expect(canAccessCompany(superAdmin, "qualquer")).toBe(true);
  });
  it("admin com scopeAllCompanies acessa qualquer empresa", () => {
    expect(canAccessCompany(fullSupport, "c9")).toBe(true);
  });
  it("admin restrito acessa empresa na lista", () => {
    expect(canAccessCompany(restricted, "c1")).toBe(true);
  });
  it("admin restrito NÃO acessa empresa fora da lista", () => {
    expect(canAccessCompany(restricted, "c3")).toBe(false);
  });
  it("admin restrito com lista vazia não acessa nada", () => {
    expect(canAccessCompany({ role: "BILLING", scopeAllCompanies: false, scopedCompanyIds: [] }, "c1")).toBe(false);
  });
});
