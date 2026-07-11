/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { LoginFeatureCarousel } from "./login-feature-carousel";
import type { CarouselSlide } from "./login-panel-content";

const slides: CarouselSlide[] = [
  { slug: "leitura-de-receita-ia", name: "Receita IA", blurb: "blurb 1" },
  { slug: "ordem-de-servico-otica", name: "OS", blurb: "blurb 2" },
  { slug: "pdv-para-otica", name: "PDV", blurb: "blurb 3" },
];

function mockReducedMotion(matches: boolean) {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches, media: q, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  }));
}

beforeEach(() => {
  mockReducedMotion(false);
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("LoginFeatureCarousel", () => {
  it("mostra o primeiro slide inicialmente", () => {
    render(<LoginFeatureCarousel slides={slides} />);
    expect(screen.getByText("Receita IA")).toBeTruthy();
  });

  it("auto-avança após o intervalo (wrap-around)", () => {
    render(<LoginFeatureCarousel slides={slides} intervalMs={1000} />);
    expect(screen.getByText("Receita IA")).toBeTruthy();
    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.getByText("OS")).toBeTruthy();
    act(() => { vi.advanceTimersByTime(2000); });
    expect(screen.getByText("Receita IA")).toBeTruthy(); // wrap
  });

  it("pausa o auto-avanço no hover e retoma no leave", () => {
    render(<LoginFeatureCarousel slides={slides} intervalMs={1000} />);
    const group = screen.getByRole("group", { name: "Funcionalidades do Vis" });
    fireEvent.mouseEnter(group);
    act(() => { vi.advanceTimersByTime(3000); });
    expect(screen.getByText("Receita IA")).toBeTruthy(); // não avançou
    fireEvent.mouseLeave(group);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.getByText("OS")).toBeTruthy(); // retomou
  });

  it("setas do teclado navegam e pausam o auto-avanço", () => {
    render(<LoginFeatureCarousel slides={slides} intervalMs={1000} />);
    const group = screen.getByRole("group", { name: "Funcionalidades do Vis" });
    fireEvent.keyDown(group, { key: "ArrowRight" });
    expect(screen.getByText("OS")).toBeTruthy();
    fireEvent.keyDown(group, { key: "ArrowLeft" });
    expect(screen.getByText("Receita IA")).toBeTruthy();
    // pausou: não avança sozinho
    act(() => { vi.advanceTimersByTime(3000); });
    expect(screen.getByText("Receita IA")).toBeTruthy();
  });

  it("pausa manual (clique no dot) NÃO é cancelada por mouseLeave", () => {
    // Regressão do achado do Codex: clicar num dot pausa; mover o mouse pra
    // fora não deve retomar o auto-avanço.
    render(<LoginFeatureCarousel slides={slides} intervalMs={1000} />);
    const group = screen.getByRole("group", { name: "Funcionalidades do Vis" });
    fireEvent.mouseEnter(group);
    fireEvent.click(screen.getAllByRole("tab")[0]); // pausa manual
    fireEvent.mouseLeave(group); // só limpa o hover, não a pausa manual
    act(() => { vi.advanceTimersByTime(3000); });
    expect(screen.getByText("Receita IA")).toBeTruthy(); // continua pausado
  });

  it("dots navegam para o slide certo", () => {
    render(<LoginFeatureCarousel slides={slides} />);
    const dots = screen.getAllByRole("tab");
    expect(dots).toHaveLength(3);
    fireEvent.click(dots[2]);
    expect(screen.getByText("PDV")).toBeTruthy();
  });

  it("reduced-motion: não auto-avança, mas dots continuam funcionais", () => {
    mockReducedMotion(true);
    render(<LoginFeatureCarousel slides={slides} intervalMs={1000} />);
    act(() => { vi.advanceTimersByTime(5000); });
    expect(screen.getByText("Receita IA")).toBeTruthy(); // não avançou
    fireEvent.click(screen.getAllByRole("tab")[1]);
    expect(screen.getByText("OS")).toBeTruthy(); // dot funciona
  });

  it("1 slide: sem dots e sem auto-avanço", () => {
    render(<LoginFeatureCarousel slides={[slides[0]]} intervalMs={1000} />);
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    act(() => { vi.advanceTimersByTime(3000); });
    expect(screen.getByText("Receita IA")).toBeTruthy();
  });

  it("0 slides: não renderiza", () => {
    const { container } = render(<LoginFeatureCarousel slides={[]} />);
    expect(container.querySelector('[aria-roledescription="carrossel"]')).toBeNull();
  });

  it("não faz nenhum fetch (zero Function Invocations)", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    render(<LoginFeatureCarousel slides={slides} intervalMs={500} />);
    act(() => { vi.advanceTimersByTime(3000); });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
