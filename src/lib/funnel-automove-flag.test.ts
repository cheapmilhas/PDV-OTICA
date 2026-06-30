import { describe, it, expect, afterEach } from "vitest";
import { isFunnelAutoMoveOn } from "./funnel-automove-flag";

const ORIG = process.env.FUNNEL_AUTOMOVE_COMPANIES;
afterEach(() => { process.env.FUNNEL_AUTOMOVE_COMPANIES = ORIG; });

describe("isFunnelAutoMoveOn — kill-switch por ótica", () => {
  it("OFF por padrão (env ausente) — fail-safe", () => {
    delete process.env.FUNNEL_AUTOMOVE_COMPANIES;
    expect(isFunnelAutoMoveOn("co_1")).toBe(false);
  });

  it("ON só p/ óticas na lista", () => {
    process.env.FUNNEL_AUTOMOVE_COMPANIES = "co_1, co_2";
    expect(isFunnelAutoMoveOn("co_1")).toBe(true);
    expect(isFunnelAutoMoveOn("co_2")).toBe(true);
    expect(isFunnelAutoMoveOn("co_3")).toBe(false);
  });

  it("companyId ausente → false", () => {
    process.env.FUNNEL_AUTOMOVE_COMPANIES = "co_1";
    expect(isFunnelAutoMoveOn(undefined)).toBe(false);
    expect(isFunnelAutoMoveOn(null)).toBe(false);
    expect(isFunnelAutoMoveOn("")).toBe(false);
  });

  it("tolera espaços e vírgulas vazias na lista", () => {
    process.env.FUNNEL_AUTOMOVE_COMPANIES = " co_1 ,, co_2 ,";
    expect(isFunnelAutoMoveOn("co_1")).toBe(true);
    expect(isFunnelAutoMoveOn("co_2")).toBe(true);
  });
});
