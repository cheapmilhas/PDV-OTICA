import { describe, it, expect } from "vitest";
import { trialAction } from "./subscription-watch.service";

const day = 24 * 60 * 60 * 1000;
const now = new Date("2026-06-10T12:00:00Z");

describe("trialAction", () => {
  it("trialEndsAt em 3 dias → TRIAL_ENDING", () => {
    expect(trialAction(new Date(now.getTime() + 3 * day), now)).toBe("TRIAL_ENDING");
  });
  it("trialEndsAt em 2 dias → TRIAL_ENDING (<=3)", () => {
    expect(trialAction(new Date(now.getTime() + 2 * day), now)).toBe("TRIAL_ENDING");
  });
  it("trialEndsAt em 10 dias → nenhuma", () => {
    expect(trialAction(new Date(now.getTime() + 10 * day), now)).toBeNull();
  });
  it("trialEndsAt no passado → TRIAL_EXPIRED", () => {
    expect(trialAction(new Date(now.getTime() - 1 * day), now)).toBe("TRIAL_EXPIRED");
  });
  it("trialEndsAt null → nenhuma", () => {
    expect(trialAction(null, now)).toBeNull();
  });
});
