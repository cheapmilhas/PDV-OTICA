/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";

const signOutMock = vi.fn();
vi.mock("next-auth/react", () => ({ signOut: (...a: unknown[]) => signOutMock(...a) }));

import { doLogout } from "./logout";

describe("doLogout", () => {
  beforeEach(() => signOutMock.mockReset());

  it("faz signOut com callbackUrl no origin atual + /login", () => {
    doLogout();
    expect(signOutMock).toHaveBeenCalledWith({
      callbackUrl: `${window.location.origin}/login`,
    });
  });

  it("não usa URL de domínio hardcoded", () => {
    doLogout();
    const arg = signOutMock.mock.calls[0][0];
    expect(arg.callbackUrl).not.toMatch(/pdvotica|vercel\.app/);
  });
});
