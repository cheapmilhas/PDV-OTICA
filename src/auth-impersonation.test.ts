import { describe, it, expect } from "vitest";
import { applyRevalidatedClaims } from "./auth-claims";

const fresh = {
  role: "VENDEDOR",
  name: "Alvo Rebaixado",
  companyId: "company-ALVO",
  networkId: "net-ALVO",
  branchId: "branch-ALVO",
};

describe("applyRevalidatedClaims", () => {
  it("FORA de impersonação: atualiza company/role/name normalmente", () => {
    const token: any = { role: "ADMIN", name: "Admin", companyId: "X" };
    applyRevalidatedClaims(token, fresh, false);
    expect(token.companyId).toBe("company-ALVO");
    expect(token.role).toBe("VENDEDOR");
    expect(token.name).toBe("Alvo Rebaixado");
  });

  it("DURANTE impersonação: NÃO altera company/role/name", () => {
    const token: any = {
      role: "ADMIN",
      name: "Super Admin",
      companyId: "company-IMPERSONADA",
      impersonation: { sessionId: "s1" },
    };
    applyRevalidatedClaims(token, fresh, true);
    expect(token.companyId).toBe("company-IMPERSONADA");
    expect(token.role).toBe("ADMIN");
    expect(token.name).toBe("Super Admin");
  });
});
