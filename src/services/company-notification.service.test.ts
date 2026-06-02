import { describe, it, expect } from "vitest";
import { companyNotificationScope } from "./company-notification.service";

describe("companyNotificationScope", () => {
  it("prende SEMPRE à empresa do usuário (não vaza entre empresas)", () => {
    const scope = companyNotificationScope("company-1", "user-1");
    expect(scope.companyId).toBe("company-1");
  });

  it("inclui notificações do usuário E broadcast (userId=null) da mesma empresa", () => {
    const scope = companyNotificationScope("company-1", "user-1");
    expect(scope.OR).toEqual([{ userId: "user-1" }, { userId: null }]);
  });

  it("não cria um OR global (broadcast cross-tenant) — companyId fica fora do OR", () => {
    // Garante que o broadcast (userId:null) está SEMPRE combinado com companyId
    // por AND implícito do where, não como condição solta no OR (bug H2).
    const scope = companyNotificationScope("company-1", "user-1");
    const orHasCompanyless = (scope.OR as Array<Record<string, unknown>>).some(
      (cond) => !("userId" in cond)
    );
    expect(orHasCompanyless).toBe(false);
    expect(scope.companyId).toBe("company-1");
  });

  it("usuário diferente da mesma empresa gera escopo distinto", () => {
    const a = companyNotificationScope("company-1", "user-1");
    const b = companyNotificationScope("company-1", "user-2");
    expect(a.OR).not.toEqual(b.OR);
    expect(a.companyId).toBe(b.companyId);
  });
});
