// src/lib/admin-actions/validate.test.ts
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { validateActionRequest } from "./validate";
import type { AdminActionBlueprint } from "./types";

// Fixtures sintéticas — id genérico de propósito (NÃO são os blueprints reais).
const lowBp: AdminActionBlueprint<{ n: number }> = {
  id: "_test_low", label: "", description: "", category: "client", icon: "",
  riskLevel: "low", schema: z.object({ n: z.number().int().min(1).max(30) }),
  allowedRoles: ["SUPER_ADMIN"], execute: async () => ({ ok: true, message: "" }),
};
const highBp: AdminActionBlueprint<Record<string, never>> = {
  id: "_test_high", label: "", description: "", category: "client", icon: "",
  riskLevel: "high", schema: z.object({}), confirm: { requireReason: true, typeToConfirm: "companyName" },
  allowedRoles: ["SUPER_ADMIN"], execute: async () => ({ ok: true, message: "" }),
};

describe("validateActionRequest", () => {
  it("rejeita role não permitida", () => {
    const r = validateActionRequest(lowBp, { role: "SUPPORT", input: { n: 5 } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(403);
  });
  it("rejeita input inválido", () => {
    const r = validateActionRequest(lowBp, { role: "SUPER_ADMIN", input: { n: 99 } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(400);
  });
  it("aceita input válido low-risk", () => {
    const r = validateActionRequest(lowBp, { role: "SUPER_ADMIN", input: { n: 5 } });
    expect(r.ok).toBe(true);
  });
  it("high-risk exige reason", () => {
    const r = validateActionRequest(highBp, { role: "SUPER_ADMIN", input: {}, companyName: "Ótica X", confirmName: "Ótica X" });
    expect(r.ok).toBe(false); // falta reason
  });
  it("high-risk exige confirmName == companyName", () => {
    const r = validateActionRequest(highBp, { role: "SUPER_ADMIN", input: {}, reason: "fraude", companyName: "Ótica X", confirmName: "errado" });
    expect(r.ok).toBe(false);
  });
  it("high-risk passa com reason + nome correto", () => {
    const r = validateActionRequest(highBp, { role: "SUPER_ADMIN", input: {}, reason: "fraude", companyName: "Ótica X", confirmName: "Ótica X" });
    expect(r.ok).toBe(true);
  });
  it("high-risk passa quando nome do banco tem espaço extra (compara com trim)", () => {
    // Regressão: nome cadastrado com espaço no fim ("OTICA QA ") fazia o botão
    // do modal habilitar (frontend usa trim) mas o backend rejeitava sem trim.
    const r = validateActionRequest(highBp, { role: "SUPER_ADMIN", input: {}, reason: "encerrou", companyName: "OTICA QA ", confirmName: "OTICA QA" });
    expect(r.ok).toBe(true);
  });
});
