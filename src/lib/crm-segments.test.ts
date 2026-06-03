import { describe, it, expect } from "vitest";
import { classifyCustomerSegments, timeBasedSegment, type SegmentThresholds } from "./crm-segments";

const T: SegmentThresholds = {
  postSaleDays2: 30,
  postSaleDays3: 90,
  inactiveDays6Months: 180,
  inactiveDays1Year: 365,
  inactiveDays2Years: 730,
  inactiveDays3Years: 1095,
  vipMinPurchases: 5,
  vipMinTotalSpent: 5000,
};

const base = { totalPurchases: 0, totalSpent: 0 };

describe("timeBasedSegment", () => {
  it("35 dias → POST_SALE_30_DAYS", () => {
    expect(timeBasedSegment(35, T)?.segment).toBe("POST_SALE_30_DAYS");
  });
  it("100 dias → POST_SALE_90_DAYS", () => {
    expect(timeBasedSegment(100, T)?.segment).toBe("POST_SALE_90_DAYS");
  });
  it("400 dias → INACTIVE_1_YEAR", () => {
    expect(timeBasedSegment(400, T)?.segment).toBe("INACTIVE_1_YEAR");
  });
  it("10 dias (recente) → nenhum", () => {
    expect(timeBasedSegment(10, T)).toBeNull();
  });
  it("sem compra (null) → nenhum", () => {
    expect(timeBasedSegment(null, T)).toBeNull();
  });
});

describe("classifyCustomerSegments — aniversário tem prioridade", () => {
  it("aniversariante + 35d sem comprar → SÓ BIRTHDAY (não gera POST_SALE_30_DAYS)", () => {
    const segs = classifyCustomerSegments(
      { ...base, isBirthdayMonth: true, daysSinceLastPurchase: 35 },
      T
    );
    const names = segs.map((s) => s.segment);
    expect(names).toContain("BIRTHDAY");
    expect(names).not.toContain("POST_SALE_30_DAYS");
    expect(names).not.toContain("POST_SALE_90_DAYS");
  });

  it("NÃO aniversariante + 35d → POST_SALE_30_DAYS (mês virou, volta ao normal)", () => {
    const segs = classifyCustomerSegments(
      { ...base, isBirthdayMonth: false, daysSinceLastPurchase: 35 },
      T
    );
    expect(segs.map((s) => s.segment)).toEqual(["POST_SALE_30_DAYS"]);
  });

  it("aniversariante VIP → BIRTHDAY + VIP (VIP não é excluído)", () => {
    const segs = classifyCustomerSegments(
      {
        isBirthdayMonth: true,
        daysSinceLastPurchase: 35,
        totalPurchases: 6,
        totalSpent: 6000,
      },
      T
    );
    const names = segs.map((s) => s.segment).sort();
    expect(names).toEqual(["BIRTHDAY", "VIP_CUSTOMER"]);
  });

  it("não aniversariante VIP + 100d → POST_SALE_90_DAYS + VIP", () => {
    const segs = classifyCustomerSegments(
      {
        isBirthdayMonth: false,
        daysSinceLastPurchase: 100,
        totalPurchases: 6,
        totalSpent: 6000,
      },
      T
    );
    const names = segs.map((s) => s.segment).sort();
    expect(names).toEqual(["POST_SALE_90_DAYS", "VIP_CUSTOMER"]);
  });

  it("aniversariante sem compra recente nem VIP → só BIRTHDAY", () => {
    const segs = classifyCustomerSegments(
      { ...base, isBirthdayMonth: true, daysSinceLastPurchase: null },
      T
    );
    expect(segs.map((s) => s.segment)).toEqual(["BIRTHDAY"]);
  });

  it("cliente novo, sem nada → nenhum segmento", () => {
    const segs = classifyCustomerSegments(
      { ...base, isBirthdayMonth: false, daysSinceLastPurchase: null },
      T
    );
    expect(segs).toEqual([]);
  });
});
