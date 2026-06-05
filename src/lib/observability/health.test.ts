// src/lib/observability/health.test.ts
import { describe, it, expect } from "vitest";
import { buildHealthReport } from "./health";

describe("buildHealthReport", () => {
  it("status ok quando db responde", () => {
    const r = buildHealthReport({ dbOk: true, dbLatencyMs: 40, uptimeS: 100, version: "abc" });
    expect(r.status).toBe("ok");
    expect(r.db.status).toBe("ok");
  });
  it("status degraded quando db lento", () => {
    const r = buildHealthReport({ dbOk: true, dbLatencyMs: 800, uptimeS: 100, version: "abc" });
    expect(r.status).toBe("degraded");
  });
  it("status down quando db falha", () => {
    const r = buildHealthReport({ dbOk: false, dbLatencyMs: null, uptimeS: 100, version: "abc" });
    expect(r.status).toBe("down");
    expect(r.db.status).toBe("down");
  });
});
