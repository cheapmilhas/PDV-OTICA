import { describe, it, expect } from "vitest";
import { osDisplayNumber, osTypeLetter } from "./os-number";

describe("osDisplayNumber", () => {
  it("OS normal usa o próprio número", () => {
    expect(osDisplayNumber({ id: "x", number: 15 })).toBe("#000015");
  });

  it("garantia exibe o número-base da OS-raiz (não o próprio sequencial)", () => {
    // Pós-Bug 3: a derivação tem number próprio (18) mas originalOrder aponta à
    // raiz (15) → exibe #000015-G, não #000018-G.
    expect(
      osDisplayNumber({
        id: "g",
        number: 18,
        isWarranty: true,
        warrantySeq: 1,
        originalOrder: { number: 15 },
      })
    ).toBe("#000015-G");
  });

  it("retrabalho a partir da raiz exibe #000015-RT", () => {
    expect(
      osDisplayNumber({
        id: "rt",
        number: 17,
        isRework: true,
        warrantySeq: 1,
        originalOrder: { number: 15 },
      })
    ).toBe("#000015-RT");
  });

  it("cenário do dono: retrabalho (RT) e garantia (G) da MESMA raiz mantêm o número-base", () => {
    const rt = osDisplayNumber({
      id: "rt", number: 17, isRework: true, warrantySeq: 1, originalOrder: { number: 15 },
    });
    const g = osDisplayNumber({
      id: "g", number: 18, isWarranty: true, warrantySeq: 1, originalOrder: { number: 15 },
    });
    expect(rt).toBe("#000015-RT");
    expect(g).toBe("#000015-G"); // antes do fix virava #000018-G
  });

  it("segunda garantia da mesma raiz numera (#000015-G2)", () => {
    expect(
      osDisplayNumber({
        id: "g2", number: 20, isWarranty: true, warrantySeq: 2, originalOrder: { number: 15 },
      })
    ).toBe("#000015-G2");
  });

  it("erro médico exibe letra M", () => {
    expect(
      osDisplayNumber({
        id: "m", number: 21, isMedicalError: true, warrantySeq: 1, originalOrder: { number: 15 },
      })
    ).toBe("#000015-M");
  });

  it("precedência: medicalError > rework > warranty", () => {
    expect(osTypeLetter({ id: "x", isWarranty: true, isRework: true, isMedicalError: true })).toBe("M");
    expect(osTypeLetter({ id: "x", isWarranty: true, isRework: true })).toBe("RT");
    expect(osTypeLetter({ id: "x", isWarranty: true })).toBe("G");
    expect(osTypeLetter({ id: "x" })).toBeNull();
  });
});
