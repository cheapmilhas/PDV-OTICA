import { describe, it, expect } from "vitest";
import { gradeSchema } from "./grade-book.schema";

describe("gradeSchema — validação de faixa do grau (Livro)", () => {
  it("aceita grau vazio", () => {
    expect(gradeSchema.safeParse({}).success).toBe(true);
  });

  it("aceita valores dentro da faixa (vírgula e ponto)", () => {
    const r = gradeSchema.safeParse({
      od: { esf: "-2,25", cil: "-0.75", eixo: "90", dnp: "31", altura: "22", add: "1,50" },
      oe: { esf: "-2,00" },
      adicao: "1,75",
    });
    expect(r.success).toBe(true);
  });

  it("REJEITA esférico fora da faixa", () => {
    expect(gradeSchema.safeParse({ od: { esf: "-40" } }).success).toBe(false);
  });

  it("REJEITA altura absurda", () => {
    expect(gradeSchema.safeParse({ oe: { altura: "99" } }).success).toBe(false);
  });

  it("REJEITA adição fora da faixa", () => {
    expect(gradeSchema.safeParse({ adicao: "9" }).success).toBe(false);
  });

  it("aceita cilíndrico POSITIVO (astigmatismo transposto)", () => {
    expect(gradeSchema.safeParse({ od: { cil: "+0,75" } }).success).toBe(true);
  });

  it("REJEITA cilíndrico fora da faixa", () => {
    expect(gradeSchema.safeParse({ od: { cil: "+11" } }).success).toBe(false);
  });

  it("não restringe prisma/base", () => {
    expect(gradeSchema.safeParse({ od: { prisma: "2", base: "180" } }).success).toBe(true);
  });
});
