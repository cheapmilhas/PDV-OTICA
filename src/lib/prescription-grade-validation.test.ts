import { describe, it, expect } from "vitest";
import { validateGrade } from "./prescription-grade-validation";

describe("validateGrade (faixas alinhadas ao Zod backend)", () => {
  it("aceita grau válido (com vírgula decimal)", () => {
    const r = validateGrade({
      od: { esf: "-1,75", cil: "-0,75", eixo: "90", dnp: "31", altura: "20", add: "1,50" },
      oe: { esf: "-2,00" },
    });
    expect(r.ok).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it("rejeita esférico fora de ±30", () => {
    const r = validateGrade({ od: { esf: "-31" } });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => /esf/i.test(e))).toBe(true);
  });

  it("rejeita eixo fora de 0..180", () => {
    const r = validateGrade({ od: { eixo: "200" } });
    expect(r.ok).toBe(false);
  });

  it("aceita cil positivo (alinhado ao Zod −10..10, diferente do form antigo)", () => {
    const r = validateGrade({ od: { cil: "2,00" } });
    expect(r.ok).toBe(true);
  });

  it("campos vazios são válidos (tudo opcional)", () => {
    expect(validateGrade({ od: {}, oe: {}, adicao: "" }).ok).toBe(true);
    expect(validateGrade({}).ok).toBe(true);
  });
});
