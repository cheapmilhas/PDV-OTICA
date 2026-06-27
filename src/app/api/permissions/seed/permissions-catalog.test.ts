import { describe, it, expect } from "vitest";
import { Permission } from "@/lib/permissions";
import { PERMISSIONS, ROLE_PERMISSIONS_MAP } from "./catalog";

describe("Catálogo de permissões do seed — Livro de Receitas (LGPD)", () => {
  it("enum tem PRESCRIPTIONS_VIEW/EDIT com os códigos esperados", () => {
    expect(Permission.PRESCRIPTIONS_VIEW).toBe("prescriptions.view");
    expect(Permission.PRESCRIPTIONS_EDIT).toBe("prescriptions.edit");
  });

  it("o array PERMISSIONS do seed tem entrada para os 2 códigos novos", () => {
    const codes = PERMISSIONS.map((p: { code: string }) => p.code);
    expect(codes).toContain(Permission.PRESCRIPTIONS_VIEW);
    expect(codes).toContain(Permission.PRESCRIPTIONS_EDIT);
  });

  it("GERENTE e VENDEDOR recebem ver+editar receita no seed real", () => {
    for (const role of ["GERENTE", "VENDEDOR"]) {
      expect(ROLE_PERMISSIONS_MAP[role]).toContain(Permission.PRESCRIPTIONS_VIEW);
      expect(ROLE_PERMISSIONS_MAP[role]).toContain(Permission.PRESCRIPTIONS_EDIT);
    }
  });

  it("ADMIN recebe tudo (inclui receita) via .map do catálogo", () => {
    expect(ROLE_PERMISSIONS_MAP.ADMIN).toContain(Permission.PRESCRIPTIONS_VIEW);
    expect(ROLE_PERMISSIONS_MAP.ADMIN).toContain(Permission.PRESCRIPTIONS_EDIT);
  });
});
