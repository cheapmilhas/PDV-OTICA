import { describe, it, expect } from "vitest";
import { z } from "zod";
import { describeFields, describeBlueprint } from "./describe-schema";
import type { AdminActionBlueprint } from "./types";

describe("describeFields", () => {
  it("descreve campos string e enum, ocultando companyId", () => {
    const schema = z.object({
      companyId: z.string().min(1),
      planId: z.string().min(1),
      cycle: z.enum(["MONTHLY", "YEARLY"]),
    });
    const fields = describeFields(schema);
    // companyId é oculto (injetado pela UI), não listado como input visível
    expect(fields.find((f) => f.name === "companyId")).toBeUndefined();
    expect(fields).toEqual([
      { name: "planId", type: "string" },
      { name: "cycle", type: "enum", options: ["MONTHLY", "YEARLY"] },
    ]);
  });

  it("retorna lista vazia para schema só com companyId", () => {
    expect(describeFields(z.object({ companyId: z.string().min(1) }))).toEqual([]);
  });

  it("não quebra com schema não-objeto", () => {
    expect(describeFields(z.string())).toEqual([]);
  });
});

describe("describeBlueprint", () => {
  it("serializa os metadados seguros do blueprint (sem execute/schema)", () => {
    const bp: AdminActionBlueprint = {
      id: "delete",
      label: "Excluir",
      description: "Exclui a empresa.",
      category: "client",
      icon: "Trash2",
      riskLevel: "high",
      confirm: { requireReason: true, typeToConfirm: "companyName" },
      schema: z.object({ companyId: z.string().min(1) }),
      allowedRoles: ["SUPER_ADMIN"],
      execute: async () => ({ ok: true, message: "" }),
    };
    const d = describeBlueprint(bp);
    expect(d).toEqual({
      id: "delete",
      label: "Excluir",
      description: "Exclui a empresa.",
      category: "client",
      icon: "Trash2",
      riskLevel: "high",
      confirm: { requireReason: true, typeToConfirm: "companyName" },
      allowedRoles: ["SUPER_ADMIN"],
      fields: [],
    });
    expect((d as unknown as Record<string, unknown>).execute).toBeUndefined();
    expect((d as unknown as Record<string, unknown>).schema).toBeUndefined();
  });
});
