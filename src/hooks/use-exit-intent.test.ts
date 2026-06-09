/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

describe("useExitIntent — resiliência a localStorage", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    window.localStorage.clear();
    vi.stubGlobal("innerWidth", 1024);
  });

  it("não trava (não lança) quando getItem lança", async () => {
    const ls = { getItem: vi.fn(() => { throw new Error("blocked"); }), setItem: vi.fn() };
    vi.stubGlobal("localStorage", ls);
    const { useExitIntent } = await import("./use-exit-intent");
    expect(() => renderHook(() => useExitIntent())).not.toThrow();
  });

  it("não reaparece em loop quando setItem lança (usa fallback em memória)", async () => {
    const store: Record<string, string> = {};
    const ls = { getItem: vi.fn((k: string) => store[k] ?? null), setItem: vi.fn(() => { throw new Error("quota"); }) };
    vi.stubGlobal("localStorage", ls);
    const { useExitIntent, __markShownForTest } = await import("./use-exit-intent");
    __markShownForTest();
    const { result } = renderHook(() => useExitIntent());
    expect(result.current.show).toBe(false);
  });
});
