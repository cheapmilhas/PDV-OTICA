import { describe, it, expect } from "vitest";
import { createClientTicketSchema, clientTicketMessageSchema } from "./support.schema";

describe("createClientTicketSchema (C2 — cliente sem URGENT)", () => {
  it("aceita LOW, MEDIUM, HIGH", () => {
    for (const priority of ["LOW", "MEDIUM", "HIGH"] as const) {
      const r = createClientTicketSchema.safeParse({ subject: "x", description: "y", priority });
      expect(r.success).toBe(true);
    }
  });

  it("REJEITA URGENT vindo do cliente", () => {
    const r = createClientTicketSchema.safeParse({ subject: "x", description: "y", priority: "URGENT" });
    expect(r.success).toBe(false);
  });

  it("default é MEDIUM quando priority omitido", () => {
    const r = createClientTicketSchema.parse({ subject: "x", description: "y" });
    expect(r.priority).toBe("MEDIUM");
  });

  it("exige subject e description não-vazios", () => {
    expect(createClientTicketSchema.safeParse({ subject: "", description: "y" }).success).toBe(false);
    expect(createClientTicketSchema.safeParse({ subject: "x", description: "  " }).success).toBe(false);
  });

  it("faz trim de subject e description", () => {
    const r = createClientTicketSchema.parse({ subject: "  oi  ", description: "  ajuda  " });
    expect(r.subject).toBe("oi");
    expect(r.description).toBe("ajuda");
  });

  it("limita tamanho (subject 200, description 5000)", () => {
    expect(
      createClientTicketSchema.safeParse({ subject: "a".repeat(201), description: "y" }).success
    ).toBe(false);
    expect(
      createClientTicketSchema.safeParse({ subject: "x", description: "a".repeat(5001) }).success
    ).toBe(false);
  });
});

describe("clientTicketMessageSchema", () => {
  it("rejeita mensagem vazia", () => {
    expect(clientTicketMessageSchema.safeParse({ message: "  " }).success).toBe(false);
  });
  it("aceita mensagem válida e faz trim", () => {
    expect(clientTicketMessageSchema.parse({ message: "  oi  " }).message).toBe("oi");
  });
});
