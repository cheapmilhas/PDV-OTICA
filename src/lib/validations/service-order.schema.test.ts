import { describe, it, expect } from "vitest";
import { createServiceOrderSchema } from "./service-order.schema";

const baseValid = {
  customerId: "c1",
  branchId: "b1",
  items: [{ description: "Lente" }],
};

function withPrescription(p: unknown) {
  return { ...baseValid, prescription: typeof p === "string" ? p : JSON.stringify(p) };
}

describe("createServiceOrderSchema — validação de faixa da prescrição", () => {
  it("aceita OS sem prescrição", () => {
    expect(createServiceOrderSchema.safeParse(baseValid).success).toBe(true);
  });

  it("aceita prescrição com valores dentro da faixa", () => {
    const p = { od: { esf: "-2,25", cil: "-0,75", eixo: "90" }, oe: { esf: "-2,00" }, adicao: "1,75" };
    expect(createServiceOrderSchema.safeParse(withPrescription(p)).success).toBe(true);
  });

  it("REJEITA cilíndrico fora da faixa", () => {
    const p = { od: { cil: "+11" }, oe: {} };
    expect(createServiceOrderSchema.safeParse(withPrescription(p)).success).toBe(false);
  });

  it("REJEITA altura absurda", () => {
    const p = { od: {}, oe: { altura: "99" } };
    expect(createServiceOrderSchema.safeParse(withPrescription(p)).success).toBe(false);
  });

  it("aceita cilíndrico POSITIVO (astigmatismo transposto)", () => {
    const p = { od: { cil: "+0,75" }, oe: {} };
    expect(createServiceOrderSchema.safeParse(withPrescription(p)).success).toBe(true);
  });

  it("JSON malformado vira erro Zod (não lança)", () => {
    const r = createServiceOrderSchema.safeParse({ ...baseValid, prescription: "{ not json" });
    expect(r.success).toBe(false); // erro Zod, não exceção
  });

  it("string de prescrição permanece string (tipo não muda)", () => {
    const p = { od: { esf: "-1,00" }, oe: {} };
    const r = createServiceOrderSchema.safeParse(withPrescription(p));
    expect(r.success).toBe(true);
    if (r.success) expect(typeof r.data.prescription).toBe("string");
  });
});
