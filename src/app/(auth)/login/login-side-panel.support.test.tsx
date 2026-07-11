/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { LoginPanelContent } from "./login-panel-content";

const HOJE = "2026-07-11";
const fresh: LoginPanelContent = { releases: [{ date: "2026-07-01", title: "Novo X", items: ["a"] }] };

afterEach(() => vi.resetModules());

describe("LoginSidePanel — guard de suporte", () => {
  it("esconde o link quando WHATSAPP_NUMBER é o placeholder", async () => {
    vi.doMock("@/lib/constants", () => ({
      WHATSAPP_NUMBER: "5585999999999",
      WHATSAPP_URL: "https://wa.me/5585999999999",
    }));
    const { LoginSidePanel } = await import("./login-side-panel");
    render(<LoginSidePanel content={fresh} today={HOJE} />);
    expect(screen.queryByText(/Falar no suporte/)).toBeNull();
  });

  it("mostra o link quando WHATSAPP_NUMBER é um número real", async () => {
    vi.doMock("@/lib/constants", () => ({
      WHATSAPP_NUMBER: "5511988887777",
      WHATSAPP_URL: "https://wa.me/5511988887777",
    }));
    const { LoginSidePanel } = await import("./login-side-panel");
    render(<LoginSidePanel content={fresh} today={HOJE} />);
    expect(screen.getByText(/Falar no suporte/)).toBeTruthy();
  });
});
