// src/lib/merge-prescription-grade.test.ts
import { describe, it, expect } from "vitest";
import { mergePrescriptionGrade } from "./merge-prescription-grade";

// Snapshot do shape REAL do estado de prescrição da OS (nova/editar).
// Este teste é o GUARDA anti-perda-de-campo: se a unificação (Task 8) fizer o
// merge errado, algum destes campos some e o teste falha.
const fullOsState = {
  od: { esf: "-2,25", cil: "-0,75", eixo: "90", dnp: "31", altura: "20", add: "", prisma: "2", base: "BN" },
  oe: { esf: "-2,00", cil: "-0,50", eixo: "85", dnp: "31", altura: "20", add: "", prisma: "1", base: "BT" },
  adicao: "1,75",
  olhoDominante: "od",
  pantoscopicAngle: "8",
  vertexDistance: "12",
  frameCurvature: "4",
  tipoLente: "progressiva",
  material: "policarbonato",
  ceratometria: { odH: "42", odHEixo: "180", odV: "43", odVEixo: "90", oeH: "42", oeHEixo: "175", oeV: "43", oeVEixo: "85" },
};

describe("mergePrescriptionGrade — guarda anti-perda-de-campo", () => {
  it("aplica o patch od/oe/adicao e PRESERVA todos os demais campos da OS", () => {
    const patch = {
      od: { esf: "-3,00", cil: "-1,00", eixo: "80", dnp: "32", altura: "21", add: "", prisma: "", base: "" },
      oe: { esf: "-2,50", cil: "-0,75", eixo: "88", dnp: "32", altura: "21", add: "", prisma: "", base: "" },
      adicao: "2,00",
    };
    const result = mergePrescriptionGrade(fullOsState, patch);

    // od/oe/adicao vêm do patch
    expect(result.od).toEqual(patch.od);
    expect(result.oe).toEqual(patch.oe);
    expect(result.adicao).toBe("2,00");

    // TODOS os demais campos preservados byte-a-byte
    expect(result.olhoDominante).toBe("od");
    expect(result.pantoscopicAngle).toBe("8");
    expect(result.vertexDistance).toBe("12");
    expect(result.frameCurvature).toBe("4");
    expect(result.tipoLente).toBe("progressiva");
    expect(result.material).toBe("policarbonato");
    expect(result.ceratometria).toEqual(fullOsState.ceratometria);
  });

  it("não muta o objeto original (imutável)", () => {
    const patch = { od: { esf: "9" }, oe: { esf: "9" }, adicao: "9" };
    const snapshot = JSON.parse(JSON.stringify(fullOsState));
    mergePrescriptionGrade(fullOsState, patch);
    expect(fullOsState).toEqual(snapshot); // original intocado
  });

  it("preserva chaves extras desconhecidas (defensivo)", () => {
    const withExtra = { ...fullOsState, campoNovoQualquer: "x" };
    const result = mergePrescriptionGrade(withExtra, { od: {}, oe: {}, adicao: "" });
    expect((result as { campoNovoQualquer?: string }).campoNovoQualquer).toBe("x");
  });
});
