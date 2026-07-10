import { describe, it, expect } from "vitest";
import { ROLE_PERMISSIONS } from "@/lib/permissions";
import { Permission } from "@/lib/permissions";

describe("Funil coletivo — permissões do SELLER", () => {
  it("SELLER tem LEADS_VIEW_ALL (funil coletivo por loja)", () => {
    expect(ROLE_PERMISSIONS.SELLER).toContain(Permission.LEADS_VIEW_ALL);
  });

  it("SELLER NÃO tem SALES_VIEW_ALL (vendas seguem por vendedor)", () => {
    expect(ROLE_PERMISSIONS.SELLER).not.toContain(Permission.SALES_VIEW_ALL);
  });

  it("SELLER mantém LEADS_VIEW_OWN e LEADS_ACCESS", () => {
    expect(ROLE_PERMISSIONS.SELLER).toContain(Permission.LEADS_VIEW_OWN);
    expect(ROLE_PERMISSIONS.SELLER).toContain(Permission.LEADS_ACCESS);
  });
});
