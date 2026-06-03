import { describe, it, expect } from "vitest";
import { buildOsTimeline, type OsTimelineRootInput } from "./os-timeline";

const d = (s: string) => new Date(s);

function root(overrides: Partial<OsTimelineRootInput> = {}): OsTimelineRootInput {
  return {
    id: "os-15",
    number: 15,
    status: "DELIVERED",
    createdAt: d("2026-05-05T12:00:00Z"),
    promisedDate: d("2026-05-12T12:00:00Z"),
    deliveredAt: d("2026-05-11T12:00:00Z"),
    reworkOrders: [],
    ...overrides,
  };
}

describe("buildOsTimeline", () => {
  it("raiz sem derivações: 1 evento ORIGINAL, contadores zerados", () => {
    const tl = buildOsTimeline(root());
    expect(tl.events).toHaveLength(1);
    expect(tl.events[0].type).toBe("ORIGINAL");
    expect(tl.events[0].displayNumber).toBe("#000015");
    expect(tl.counts).toEqual({ warranty: 0, rework: 0, medicalError: 0 });
  });

  it("ordena do mais recente ao mais antigo", () => {
    const tl = buildOsTimeline(
      root({
        reworkOrders: [
          { id: "rt", number: 17, status: "DELIVERED", isRework: true, warrantySeq: 1, createdAt: d("2026-05-18T12:00:00Z") },
          { id: "g", number: 18, status: "DELIVERED", isWarranty: true, warrantySeq: 1, createdAt: d("2026-05-28T12:00:00Z") },
        ],
      })
    );
    expect(tl.events.map((e) => e.id)).toEqual(["g", "rt", "os-15"]);
  });

  it("contadores por tipo ignoram canceladas, mas a timeline mostra a cancelada", () => {
    const tl = buildOsTimeline(
      root({
        reworkOrders: [
          { id: "g1", number: 16, status: "DELIVERED", isWarranty: true, warrantySeq: 1, createdAt: d("2026-05-20T12:00:00Z") },
          { id: "g2", number: 17, status: "CANCELED", isWarranty: true, warrantySeq: 2, createdAt: d("2026-05-22T12:00:00Z") },
          { id: "rt", number: 18, status: "READY", isRework: true, warrantySeq: 1, createdAt: d("2026-05-25T12:00:00Z") },
        ],
      })
    );
    expect(tl.counts).toEqual({ warranty: 1, rework: 1, medicalError: 0 });
    expect(tl.events).toHaveLength(4); // original + 3 derivações (incl. cancelada)
    const canceled = tl.events.find((e) => e.id === "g2");
    expect(canceled?.isCanceled).toBe(true);
  });

  it("derivações exibem o número-base da raiz (#000015-G), não o próprio", () => {
    const tl = buildOsTimeline(
      root({
        reworkOrders: [
          { id: "g", number: 18, status: "DELIVERED", isWarranty: true, warrantySeq: 1, createdAt: d("2026-05-28T12:00:00Z") },
        ],
      })
    );
    expect(tl.events.find((e) => e.id === "g")?.displayNumber).toBe("#000015-G");
  });

  describe("prazo (deadline)", () => {
    it("entregue antes/na data prometida → ON_TIME", () => {
      const tl = buildOsTimeline(root()); // entregue 11, prometida 12
      expect(tl.events[0].deadline).toEqual({ state: "ON_TIME", lateDays: null });
    });

    it("entregue depois da prometida → LATE com lateDays", () => {
      const tl = buildOsTimeline(
        root({ deliveredAt: d("2026-05-15T12:00:00Z"), promisedDate: d("2026-05-12T12:00:00Z") })
      );
      expect(tl.events[0].deadline).toEqual({ state: "LATE", lateDays: 3 });
    });

    it("sem prazo prometido → ON_TIME (não penaliza)", () => {
      const tl = buildOsTimeline(root({ promisedDate: null, deliveredAt: d("2026-05-20T12:00:00Z") }));
      expect(tl.events[0].deadline.state).toBe("ON_TIME");
    });

    it("aberta sem atraso → PENDING", () => {
      const tl = buildOsTimeline(root({ status: "IN_PROGRESS", deliveredAt: null, isDelayed: false }));
      expect(tl.events[0].deadline.state).toBe("PENDING");
    });

    it("derivação entregue sem prazo prometido → ON_TIME", () => {
      const tl = buildOsTimeline(
        root({
          reworkOrders: [
            { id: "g", number: 18, status: "DELIVERED", isWarranty: true, warrantySeq: 1, createdAt: d("2026-05-28T12:00:00Z"), promisedDate: null, deliveredAt: d("2026-05-30T12:00:00Z") },
          ],
        })
      );
      expect(tl.events.find((e) => e.id === "g")?.deadline.state).toBe("ON_TIME");
    });

    it("aberta e atrasada → LATE usando delayDays", () => {
      const tl = buildOsTimeline(
        root({ status: "IN_PROGRESS", deliveredAt: null, isDelayed: true, delayDays: 5 })
      );
      expect(tl.events[0].deadline).toEqual({ state: "LATE", lateDays: 5 });
    });
  });

  it("erro médico conta em medicalError e exibe letra M", () => {
    const tl = buildOsTimeline(
      root({
        reworkOrders: [
          { id: "m", number: 19, status: "DELIVERED", isMedicalError: true, warrantySeq: 1, createdAt: d("2026-05-30T12:00:00Z"), medicalErrorReason: "grau errado" },
        ],
      })
    );
    expect(tl.counts.medicalError).toBe(1);
    const ev = tl.events.find((e) => e.id === "m");
    expect(ev?.displayNumber).toBe("#000015-M");
    expect(ev?.reason).toBe("grau errado");
  });
});
