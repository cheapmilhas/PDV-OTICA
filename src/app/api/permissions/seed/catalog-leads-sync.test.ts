import { describe, it, expect } from "vitest";
import { ROLE_PERMISSIONS_MAP } from "@/app/api/permissions/seed/catalog";
import { Permission } from "@/lib/permissions";

/**
 * O gate de permissão em runtime (`permission.service.ts:userHasPermission`) lê
 * as permissões de role DO BANCO (`rolePermission`), que é populado pelo seed a
 * partir de `ROLE_PERMISSIONS_MAP` (catalog.ts) — NÃO de `ROLE_PERMISSIONS`
 * (permissions.ts). Havia duas listas duplicadas divergentes: a página do funil
 * exige `leads.access` (`funil/page.tsx:606`) e VENDEDOR/GERENTE não tinham
 * NENHUMA permissão de leads no catalog → funil coletivo inerte em prod.
 *
 * Estes testes travam o catalog como fonte de verdade do que o seed grava.
 */
describe("catalog ROLE_PERMISSIONS_MAP — permissões de funil (leads)", () => {
  it("VENDEDOR acessa o funil (leads.access) — senão nem abre a tela", () => {
    expect(ROLE_PERMISSIONS_MAP.VENDEDOR).toContain(Permission.LEADS_ACCESS);
  });

  it("VENDEDOR vê todos os leads (leads.view_all) — funil coletivo por loja", () => {
    expect(ROLE_PERMISSIONS_MAP.VENDEDOR).toContain(Permission.LEADS_VIEW_ALL);
  });

  it("VENDEDOR tem o bloco operacional de leads (view_own, create, edit, convert)", () => {
    for (const p of [
      Permission.LEADS_VIEW_OWN,
      Permission.LEADS_CREATE,
      Permission.LEADS_EDIT,
      Permission.LEADS_CONVERT,
    ]) {
      expect(ROLE_PERMISSIONS_MAP.VENDEDOR).toContain(p);
    }
  });

  it("VENDEDOR NÃO tem sales.view_all (vendas seguem por vendedor)", () => {
    expect(ROLE_PERMISSIONS_MAP.VENDEDOR).not.toContain(Permission.SALES_VIEW_ALL);
  });

  it("GERENTE acessa e vê todos os leads (leads.access + leads.view_all)", () => {
    expect(ROLE_PERMISSIONS_MAP.GERENTE).toContain(Permission.LEADS_ACCESS);
    expect(ROLE_PERMISSIONS_MAP.GERENTE).toContain(Permission.LEADS_VIEW_ALL);
  });
});
