import { describe, it, expect, vi } from "vitest";
// admin-product-context importa `cookies` de next/headers no topo. As funções puras
// testadas aqui NÃO chamam cookies(), mas mockamos preventivamente (padrão do projeto,
// ver src/lib/__tests__/admin-session.test.ts) para blindar contra o import.
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
import { parseProductContext, productWhereFilter } from "@/lib/admin-product-context";

describe("admin product context", () => {
  it("faz default para VIS_APP quando o valor é inválido ou ausente", () => {
    expect(parseProductContext(undefined)).toBe("VIS_APP");
    expect(parseProductContext("lixo")).toBe("VIS_APP");
    expect(parseProductContext("VIS_MEDICAL")).toBe("VIS_MEDICAL");
  });

  it("gera o filtro Prisma direto por produto", () => {
    expect(productWhereFilter("VIS_MEDICAL")).toEqual({ platformProduct: "VIS_MEDICAL" });
  });

  it("gera o filtro via relação company para entidades sem o campo (Subscription)", () => {
    expect(productWhereFilter("VIS_APP", { via: "company" })).toEqual({
      company: { platformProduct: "VIS_APP" },
    });
  });

  it("gera o filtro via subscription.company para Invoice (não tem companyId nem company)", () => {
    expect(productWhereFilter("VIS_APP", { via: "subscription.company" })).toEqual({
      subscription: { company: { platformProduct: "VIS_APP" } },
    });
  });
});
