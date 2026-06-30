/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

const { useSessionMock } = vi.hoisted(() => ({ useSessionMock: vi.fn() }));
vi.mock("next-auth/react", () => ({ useSession: useSessionMock }));

import {
  PermissionsProvider,
  useSharedPermissions,
} from "./permissions-provider";
import { usePermission } from "@/hooks/use-permission";
import { usePermissions } from "@/hooks/usePermissions";

const NON_ADMIN = { user: { id: "u9", role: "VENDEDOR" } };

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ effectivePermissions: ["sales.create"] }),
  }) as unknown as typeof fetch;
});

function wrapper({ children }: { children: ReactNode }) {
  return <PermissionsProvider>{children}</PermissionsProvider>;
}

describe("PermissionsProvider — fonte única (1 fetch compartilhado)", () => {
  it("ADMIN: NÃO faz fetch (curto-circuito) e expõe isAdmin", async () => {
    useSessionMock.mockReturnValue({ data: { user: { id: "a1", role: "ADMIN" } }, status: "authenticated" });
    const { result } = renderHook(() => useSharedPermissions(), { wrapper });
    await waitFor(() => expect(result.current.permissions).toEqual(["*"]));
    expect(result.current.isAdmin).toBe(true);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("não-ADMIN: faz UM fetch e compartilha — 3 consumidores → 1 request", async () => {
    useSessionMock.mockReturnValue({ data: NON_ADMIN, status: "authenticated" });
    function ThreeConsumers() {
      usePermission();
      usePermissions();
      useSharedPermissions();
      return null;
    }
    render(
      <PermissionsProvider>
        <ThreeConsumers />
      </PermissionsProvider>,
    );
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
  });

  it("shim singular dentro do provider: lê as permissões compartilhadas", async () => {
    useSessionMock.mockReturnValue({ data: NON_ADMIN, status: "authenticated" });
    const { result } = renderHook(() => usePermission(), { wrapper });
    await waitFor(() => expect(result.current.hasPermission("sales.create")).toBe(true));
    expect(result.current.hasPermission("sales.cancel")).toBe(false);
  });

  it("shim plural dentro do provider: hasPermission + canSeeCanceled", async () => {
    useSessionMock.mockReturnValue({ data: { user: { id: "g1", role: "GERENTE" } }, status: "authenticated" });
    const { result } = renderHook(() => usePermissions(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.canSeeCanceled).toBe(true); // GERENTE
  });

  it("refetch() dispara UM fetch só (sem disparo duplo)", async () => {
    useSessionMock.mockReturnValue({ data: NON_ADMIN, status: "authenticated" });
    const { result } = renderHook(() => useSharedPermissions(), { wrapper });
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1)); // fetch inicial
    (global.fetch as ReturnType<typeof vi.fn>).mockClear();
    result.current.refetch();
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1)); // exatamente 1, não 2
  });
});
