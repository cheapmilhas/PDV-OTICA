import { describe, it, expect } from "vitest";
import { normalizeLoginEmail } from "./normalize-login";

describe("normalizeLoginEmail", () => {
  it("valor sem @ vira <valor>@login minúsculo", () => {
    expect(normalizeLoginEmail("Matheusr")).toBe("matheusr@login");
    expect(normalizeLoginEmail("  ADO  ")).toBe("ado@login");
  });
  it("valor com @ fica minúsculo + trim", () => {
    expect(normalizeLoginEmail("  Joao@X.com ")).toBe("joao@x.com");
  });
});
