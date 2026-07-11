import { describe, it, expect } from "vitest";
import { createUserSchema, updateUserSchema, sanitizeUserDTO } from "./user.schema";

describe("recoveryEmail no schema de usuário", () => {
  it("aceita e-mail válido, vazio e ausente; rejeita inválido", () => {
    expect(createUserSchema.safeParse({ name: "A", email: "a", password: "12345678", role: "VENDEDOR", recoveryEmail: "x@y.com" }).success).toBe(true);
    expect(createUserSchema.safeParse({ name: "A", email: "a", password: "12345678", role: "VENDEDOR", recoveryEmail: "" }).success).toBe(true);
    expect(createUserSchema.safeParse({ name: "A", email: "a", password: "12345678", role: "VENDEDOR" }).success).toBe(true);
    expect(createUserSchema.safeParse({ name: "A", email: "a", password: "12345678", role: "VENDEDOR", recoveryEmail: "nao-email" }).success).toBe(false);
  });
  it("sanitizeUserDTO PRESERVA recoveryEmail e mapeia vazio para null (permite limpar)", () => {
    expect(sanitizeUserDTO({ name: "A", recoveryEmail: "" }).recoveryEmail).toBeNull();
    expect(sanitizeUserDTO({ name: "A", recoveryEmail: "x@y.com" }).recoveryEmail).toBe("x@y.com");
    expect("recoveryEmail" in sanitizeUserDTO({ name: "A" })).toBe(false);
  });
  it("sanitizeUserDTO continua descartando OUTROS campos vazios (name vazio some)", () => {
    expect("name" in sanitizeUserDTO({ name: "", role: "VENDEDOR" })).toBe(false);
  });
});
