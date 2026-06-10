import { describe, it, expect } from "vitest";
import { Permission, ROLE_PERMISSIONS, PERMISSION_LABELS } from "./permissions";

/**
 * SEC-001 (Fase 1): a permissão `sales.refund` deve existir e ser concedida
 * apenas a GERENTE (MANAGER no enum TS) e ADMIN. VENDEDOR, CAIXA e ATENDENTE
 * NÃO podem devolver vendas. A fonte que vai ao banco é o ROLE_PERMISSIONS_MAP
 * em permissions/seed/route.ts (roles em PT); aqui validamos o catálogo TS,
 * que deve estar coerente com ela.
 */
describe("SEC-001: permissão sales.refund", () => {
  it("a permissão existe no enum com o código correto", () => {
    expect(Permission.SALES_REFUND).toBe("sales.refund");
  });

  it("tem label legível", () => {
    expect(PERMISSION_LABELS[Permission.SALES_REFUND]).toBeTruthy();
  });

  it("ADMIN possui sales.refund (acesso total)", () => {
    expect(ROLE_PERMISSIONS.ADMIN).toContain(Permission.SALES_REFUND);
  });

  it("MANAGER (GERENTE) possui sales.refund", () => {
    expect(ROLE_PERMISSIONS.MANAGER).toContain(Permission.SALES_REFUND);
  });

  it("SELLER (VENDEDOR) NÃO possui sales.refund", () => {
    expect(ROLE_PERMISSIONS.SELLER).not.toContain(Permission.SALES_REFUND);
  });

  it("CASHIER (CAIXA) NÃO possui sales.refund", () => {
    expect(ROLE_PERMISSIONS.CASHIER).not.toContain(Permission.SALES_REFUND);
  });
});
