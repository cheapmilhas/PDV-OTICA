/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// --- Mock controlável de permissões -----------------------------------------
const perm = { has: new Set<string>(), isLoading: false };

vi.mock("@/hooks/use-permission", () => ({
  usePermission: () => ({
    hasPermission: (p: string) => perm.has.has(p),
    hasAnyPermission: (ps: string[]) => ps.some((p) => perm.has.has(p)),
    isLoading: perm.isLoading,
  }),
}));

// --- Mock do router (captura replace para asserts de navegação) --------------
const replaceMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => new URLSearchParams(),
}));

// --- Mocks dos filhos: sentinelas simples (H-B: nenhum hook interno roda) ----
vi.mock("../ranking-tab", () => ({
  RankingTab: ({ mode }: { mode: string }) => <div data-testid="ranking">RANKING:{mode}</div>,
}));
vi.mock("../commission-config-tab", () => ({
  CommissionConfigTab: () => <div data-testid="config">CONFIG</div>,
}));
vi.mock("../../relatorios/comissoes/commission-new-view", () => ({
  CommissionNewView: () => <div data-testid="comm-new">NEW_VIEW</div>,
}));
vi.mock("../../relatorios/comissoes/commission-legacy-view", () => ({
  CommissionLegacyView: () => <div data-testid="comm-legacy">LEGACY_VIEW</div>,
}));

import { MetasTabs } from "../metas-tabs";

describe("MetasTabs", () => {
  beforeEach(() => {
    perm.has = new Set<string>();
    perm.isLoading = false;
    replaceMock.mockClear();
  });

  it("só reports.sales → aba Comissões presente, Ranking e Config ausentes", () => {
    perm.has = new Set(["reports.sales"]);
    render(<MetasTabs mode="legacy" initialTab="comissoes" />);

    expect(screen.getByTestId("comm-legacy")).toBeDefined();
    expect(screen.queryByTestId("ranking")).toBeNull();
    expect(screen.queryByTestId("config")).toBeNull();
  });

  it("só settings.edit → aba Config presente, outras ausentes", () => {
    perm.has = new Set(["settings.edit"]);
    render(<MetasTabs mode="legacy" initialTab="config" />);

    expect(screen.getByTestId("config")).toBeDefined();
    expect(screen.queryByTestId("ranking")).toBeNull();
    expect(screen.queryByTestId("comm-legacy")).toBeNull();
    expect(screen.queryByTestId("comm-new")).toBeNull();
  });

  it("só goals.view → Ranking presente e SEM barra de abas (1 aba)", () => {
    perm.has = new Set(["goals.view"]);
    render(<MetasTabs mode="legacy" initialTab="ranking" />);

    expect(screen.getByTestId("ranking")).toBeDefined();
    // 1 aba → nenhuma barra de abas / nenhum trigger
    expect(screen.queryByText("Comissões")).toBeNull();
    expect(screen.queryByText("Configurações")).toBeNull();
    expect(screen.queryByText("Ranking")).toBeNull();
  });

  it("3 permissões → 3 triggers presentes e initialTab respeitado", () => {
    perm.has = new Set(["goals.view", "reports.sales", "settings.edit"]);
    render(<MetasTabs mode="new" initialTab="comissoes" />);

    // Barra com os 3 triggers (>1 aba)
    expect(screen.getByText("Ranking")).toBeDefined();
    expect(screen.getByText("Comissões")).toBeDefined();
    expect(screen.getByText("Configurações")).toBeDefined();

    // initialTab="comissoes" → conteúdo de comissões ativo (mode new)
    expect(screen.getByTestId("comm-new")).toBeDefined();
  });

  it("initialTab não permitido cai para a primeira aba liberada", () => {
    // Só goals.view, mas initialTab pede config → fallback p/ ranking
    perm.has = new Set(["goals.view"]);
    render(<MetasTabs mode="legacy" initialTab="config" />);

    expect(screen.getByTestId("ranking")).toBeDefined();
    expect(screen.queryByTestId("config")).toBeNull();
  });

  it("0 permissões → nenhuma sentinela de aba renderiza", () => {
    perm.has = new Set<string>();
    render(<MetasTabs mode="legacy" initialTab="ranking" />);

    expect(screen.queryByTestId("ranking")).toBeNull();
    expect(screen.queryByTestId("comm-legacy")).toBeNull();
    expect(screen.queryByTestId("comm-new")).toBeNull();
    expect(screen.queryByTestId("config")).toBeNull();
  });

  it("isLoading → spinner e nenhuma sentinela de aba", () => {
    perm.isLoading = true;
    perm.has = new Set(["goals.view", "reports.sales", "settings.edit"]);
    const { container } = render(<MetasTabs mode="legacy" initialTab="ranking" />);

    // Loader2 vira um <svg> com a classe animate-spin
    expect(container.querySelector(".animate-spin")).not.toBeNull();
    expect(screen.queryByTestId("ranking")).toBeNull();
    expect(screen.queryByTestId("comm-legacy")).toBeNull();
    expect(screen.queryByTestId("config")).toBeNull();
  });

  it("mode controla a view de comissões: new → comm-new, legacy → comm-legacy", () => {
    perm.has = new Set(["reports.sales"]);

    const { unmount } = render(<MetasTabs mode="new" initialTab="comissoes" />);
    expect(screen.getByTestId("comm-new")).toBeDefined();
    expect(screen.queryByTestId("comm-legacy")).toBeNull();
    unmount();

    render(<MetasTabs mode="legacy" initialTab="comissoes" />);
    expect(screen.getByTestId("comm-legacy")).toBeDefined();
    expect(screen.queryByTestId("comm-new")).toBeNull();
  });

  it("ativar um trigger navega via router.replace com ?tab=", () => {
    perm.has = new Set(["goals.view", "reports.sales", "settings.edit"]);
    render(<MetasTabs mode="legacy" initialTab="ranking" />);

    // Radix Tabs ativa por teclado de forma confiável no jsdom (click usa
    // pointer events que o jsdom não dispara nativamente).
    const trigger = screen.getByText("Comissões");
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "Enter", code: "Enter" });

    expect(replaceMock).toHaveBeenCalledWith("/dashboard/metas?tab=comissoes");
  });
});
