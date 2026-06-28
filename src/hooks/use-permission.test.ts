/** @vitest-environment jsdom */
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const { useSessionMock } = vi.hoisted(() => ({ useSessionMock: vi.fn() }));
vi.mock("next-auth/react", () => ({ useSession: useSessionMock }));

import { usePermission } from "./use-permission";

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
