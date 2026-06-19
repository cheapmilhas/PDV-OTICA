import { describe, it, expect } from "vitest";
import { formatLimitsPreview, fmtHour } from "@/lib/whatsapp-limits-display";

describe("formatLimitsPreview", () => {
  it("janela padrão, sábado útil → seg–sáb", () => {
    expect(formatLimitsPreview({ openHour: 8, closeHour: 18, dailyCap: 50, skipSaturday: false }))
      .toBe("Envios das 8h às 18h, seg–sáb · teto 50/dia");
  });

  it("pular sábado → seg–sex", () => {
    expect(formatLimitsPreview({ openHour: 9, closeHour: 17, dailyCap: 30, skipSaturday: true }))
      .toBe("Envios das 9h às 17h, seg–sex · teto 30/dia");
  });

  it("fechamento <= abertura → null (UI mostra aviso)", () => {
    expect(formatLimitsPreview({ openHour: 18, closeHour: 8, dailyCap: 50, skipSaturday: false })).toBeNull();
  });

  it("teto inválido → null", () => {
    expect(formatLimitsPreview({ openHour: 8, closeHour: 18, dailyCap: 0, skipSaturday: false })).toBeNull();
  });

  it("NaN → null", () => {
    expect(formatLimitsPreview({ openHour: NaN, closeHour: 18, dailyCap: 50, skipSaturday: false })).toBeNull();
  });

  it("fmtHour", () => {
    expect(fmtHour(8)).toBe("8h");
    expect(fmtHour(18)).toBe("18h");
  });
});
