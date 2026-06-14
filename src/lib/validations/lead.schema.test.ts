import { describe, it, expect } from "vitest";
import { createLeadSchema, leadQuerySchema, moveLeadSchema } from "./lead.schema";

describe("createLeadSchema", () => {
  it("aceita lead só com nome (resto opcional)", () => {
    const r = createLeadSchema.parse({ name: "Maria" });
    expect(r.name).toBe("Maria");
    expect(r.source).toBeUndefined();
  });

  it("rejeita lead sem nome", () => {
    expect(() => createLeadSchema.parse({})).toThrow();
  });

  it("coage estimatedValue string para number", () => {
    const r = createLeadSchema.parse({ name: "João", estimatedValue: "890.50" });
    expect(r.estimatedValue).toBe(890.5);
  });

  it("valida source contra o enum", () => {
    expect(() => createLeadSchema.parse({ name: "X", source: "TIKTOK" })).toThrow();
    expect(createLeadSchema.parse({ name: "X", source: "WHATSAPP" }).source).toBe("WHATSAPP");
  });
});

describe("leadQuerySchema", () => {
  it("aplica defaults de paginação", () => {
    const r = leadQuerySchema.parse({});
    expect(r.page).toBe(1);
    expect(r.pageSize).toBe(50);
  });
});

describe("moveLeadSchema", () => {
  it("exige stageId e aceita updatedAt para optimistic-lock", () => {
    const r = moveLeadSchema.parse({ stageId: "stg_1", expectedUpdatedAt: "2026-06-14T00:00:00.000Z" });
    expect(r.stageId).toBe("stg_1");
  });
});
