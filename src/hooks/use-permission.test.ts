/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const { useSessionMock } = vi.hoisted(() => ({ useSessionMock: vi.fn() }));
vi.mock("next-auth/react", () => ({ useSession: useSessionMock }));

import { usePermission, PERMISSION_LOADING_CAP_MS } from "./use-permission";

describe("usePermission — perf (ADMIN não espera fetch)", () => {
  it("ADMIN: isLoading=false IMEDIATAMENTE (sem rede)", () => {
    useSessionMock.mockReturnValue({
      data: { user: { id: "u1", role: "ADMIN" } },
      status: "authenticated",
    });
    const { result } = renderHook(() => usePermission());
    expect(result.current.isLoading).toBe(false);
    expect(result.current.hasPermission("qualquer.coisa")).toBe(true);
  });

  it("sessão carregando: isLoading=true", () => {
    useSessionMock.mockReturnValue({ data: null, status: "loading" });
    const { result } = renderHook(() => usePermission());
    expect(result.current.isLoading).toBe(true);
  });

  it("não autenticado: isLoading=false (não bloqueia)", () => {
    useSessionMock.mockReturnValue({ data: null, status: "unauthenticated" });
    const { result } = renderHook(() => usePermission());
    expect(result.current.isLoading).toBe(false);
  });
});

describe("usePermission — cap de loading (não trava pra sempre)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("se a sessão fica presa em 'loading' além do cap, destrava (isLoading=false)", async () => {
    useSessionMock.mockReturnValue({ data: null, status: "loading" });
    const { result } = renderHook(() => usePermission());
    expect(result.current.isLoading).toBe(true);

    // Passa o tempo do cap — o hook deve parar de bloquear mesmo sem a sessão resolver.
    await act(async () => {
      vi.advanceTimersByTime(PERMISSION_LOADING_CAP_MS + 50);
    });
    expect(result.current.isLoading).toBe(false);
  });
});
