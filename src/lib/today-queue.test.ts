import { describe, it, expect } from "vitest";
import {
  buildTodayQueue,
  humanWait,
  severityByWait,
  QUEUE_CAP,
  type TodayQueueItem,
  type TodayQueueKind,
} from "./today-queue";

function item(kind: TodayQueueKind, id: string, waitingHours: number): TodayQueueItem {
  return {
    key: `${kind}:${id}`,
    kind,
    customerName: id,
    phone: "85999999999",
    severity: "yellow",
    headline: `Aja ${id}`,
    subtext: "",
    draftText: "oi",
    waitingHours,
  };
}

describe("humanWait", () => {
  it("< 24h = hoje", () => {
    expect(humanWait(0)).toBe("hoje");
    expect(humanWait(23)).toBe("hoje");
  });
  it("dias no plural/singular", () => {
    expect(humanWait(24)).toBe("há 1 dia");
    expect(humanWait(48)).toBe("há 2 dias");
    expect(humanWait(24 * 6)).toBe("há 6 dias");
  });
});

describe("severityByWait", () => {
  it("🟢 hoje / 🟡 1-4 dias / 🔴 5+ dias", () => {
    expect(severityByWait(1)).toBe("green");
    expect(severityByWait(23)).toBe("green");
    expect(severityByWait(24)).toBe("yellow");
    expect(severityByWait(24 * 4)).toBe("yellow");
    expect(severityByWait(24 * 5)).toBe("red");
  });
});

describe("buildTodayQueue — ordem fixa por urgência + teto", () => {
  it("ordem entre grupos: atenção → responder → OS parada → atrasado", () => {
    const { queue } = buildTodayQueue([
      item("sla_late", "L", 100),
      item("os_ready", "O", 100),
      item("needs_reply", "R", 100),
      item("attention", "A", 1),
    ]);
    expect(queue.map((q) => q.kind)).toEqual([
      "attention",
      "needs_reply",
      "os_ready",
      "sla_late",
    ]);
  });

  it("dentro do grupo, quem espera há mais tempo vem primeiro", () => {
    const { queue } = buildTodayQueue([
      item("needs_reply", "novo", 10),
      item("needs_reply", "antigo", 200),
      item("needs_reply", "medio", 50),
    ]);
    expect(queue.map((q) => q.customerName)).toEqual(["antigo", "medio", "novo"]);
  });

  it("corta no teto e reporta overflow", () => {
    const many = Array.from({ length: QUEUE_CAP + 3 }, (_, i) =>
      item("os_ready", `os${i}`, i),
    );
    const { queue, total, overflow } = buildTodayQueue(many);
    expect(queue.length).toBe(QUEUE_CAP);
    expect(total).toBe(QUEUE_CAP + 3);
    expect(overflow).toBe(3);
  });

  it("cap custom respeitado", () => {
    const many = Array.from({ length: 5 }, (_, i) => item("os_ready", `o${i}`, i));
    const { queue, overflow } = buildTodayQueue(many, 2);
    expect(queue.length).toBe(2);
    expect(overflow).toBe(3);
  });

  it("fila vazia → sem overflow", () => {
    const { queue, total, overflow } = buildTodayQueue([]);
    expect(queue).toEqual([]);
    expect(total).toBe(0);
    expect(overflow).toBe(0);
  });

  it("não muta a entrada", () => {
    const input = [item("sla_late", "L", 1), item("attention", "A", 1)];
    const snapshot = input.map((i) => i.key);
    buildTodayQueue(input);
    expect(input.map((i) => i.key)).toEqual(snapshot);
  });
});
