/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PrescriptionGradeForm } from "./prescription-grade-form";

const emptyValue = { od: {}, oe: {}, adicao: "" };

/**
 * Mocka `window.matchMedia` para controlar o gate `(pointer: coarse)`.
 * O componente agora usa `useMediaQuery("(pointer: coarse)")`; sem matchMedia
 * definido o hook não teria fonte. Nos testes que não são de toque, forçamos
 * `false` (desktop mouse) para preservar o comportamento de `<Input>`.
 */
function mockCoarsePointer(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("pointer: coarse") ? matches : false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

describe("PrescriptionGradeForm", () => {
  // Sem toque por padrão → mantém o comportamento clássico de <Input>.
  beforeEach(() => {
    mockCoarsePointer(false);
  });

  it("renderiza a grade OD/OE com as colunas do grau", () => {
    render(<PrescriptionGradeForm value={emptyValue} onChange={() => {}} />);
    // Dois layouts coexistem no DOM (cartão < md + tabela md+): cada rótulo
    // aparece 2×. jsdom renderiza ambos, então usamos getAllByText.
    expect(screen.getAllByText(/^OD/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/^OE/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Esférico").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Cilíndrico").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Eixo").length).toBeGreaterThan(0);
  });

  it("emite onChange com {od,oe,adicao} ao digitar (preserva vírgula)", () => {
    const onChange = vi.fn();
    render(<PrescriptionGradeForm value={emptyValue} onChange={onChange} />);
    const esfOd = screen.getByTestId("grade-od-esf");
    fireEvent.change(esfOd, { target: { value: "-1,75" } });
    expect(onChange).toHaveBeenCalled();
    const arg = onChange.mock.calls.at(-1)![0];
    expect(arg.od.esf).toBe("-1,75");
    expect(arg).toHaveProperty("oe");
    expect(arg).toHaveProperty("adicao");
  });

  it("desabilita inputs quando disabled", () => {
    render(<PrescriptionGradeForm value={emptyValue} onChange={() => {}} disabled />);
    expect((screen.getByTestId("grade-od-esf") as HTMLInputElement).disabled).toBe(true);
  });
});

describe("PrescriptionGradeForm — toque (pointer: coarse)", () => {
  beforeEach(() => {
    mockCoarsePointer(true);
  });

  it("no toque, tocar no visor do esférico OD abre o keypad", () => {
    render(<PrescriptionGradeForm value={emptyValue} onChange={() => {}} />);
    // Antes de tocar o keypad não está montado/aberto.
    expect(screen.queryByTestId("keypad-display")).not.toBeInTheDocument();
    // No toque, esférico OD é um button-visor (não <input>).
    const visorOd = screen.getByTestId("grade-od-esf");
    expect(visorOd.tagName).toBe("BUTTON");
    fireEvent.click(visorOd);
    // Keypad aberto → visor do keypad presente.
    expect(screen.getByTestId("keypad-display")).toBeInTheDocument();
  });

  it("no toque, emitir do keypad chama onChange com o novo esf sob od", () => {
    const onChange = vi.fn();
    render(<PrescriptionGradeForm value={emptyValue} onChange={onChange} />);
    fireEvent.click(screen.getByTestId("grade-od-esf"));
    // Digita "2" no keypad do esférico OD.
    fireEvent.click(screen.getByTestId("keypad-digit-2"));
    expect(onChange).toHaveBeenCalled();
    const arg = onChange.mock.calls.at(-1)![0];
    expect(arg.od.esf).toBe("2");
    expect(arg).toHaveProperty("oe");
    expect(arg).toHaveProperty("adicao");
  });

  it("no toque, cilíndrico OE também é button-visor e roteia para oe.cil", () => {
    const onChange = vi.fn();
    render(<PrescriptionGradeForm value={emptyValue} onChange={onChange} />);
    const visorCilOe = screen.getByTestId("grade-oe-cil");
    expect(visorCilOe.tagName).toBe("BUTTON");
    fireEvent.click(visorCilOe);
    fireEvent.click(screen.getByTestId("keypad-digit-1"));
    const arg = onChange.mock.calls.at(-1)![0];
    expect(arg.oe.cil).toBe("1");
  });

  it("no toque, adição vira button-visor e roteia para o patch de adição", () => {
    const onChange = vi.fn();
    render(<PrescriptionGradeForm value={emptyValue} onChange={onChange} />);
    const visorAdicao = screen.getByTestId("grade-adicao");
    expect(visorAdicao.tagName).toBe("BUTTON");
    fireEvent.click(visorAdicao);
    // adição não tem sinal (field="adicao") → botão de sinal ausente.
    expect(screen.queryByTestId("keypad-sign")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("keypad-digit-3"));
    const arg = onChange.mock.calls.at(-1)![0];
    expect(arg.adicao).toBe("3");
  });

  it("no toque, eixo/dnp/altura continuam <input> (nunca keypad)", () => {
    render(<PrescriptionGradeForm value={emptyValue} onChange={() => {}} />);
    expect((screen.getByTestId("grade-od-eixo") as HTMLElement).tagName).toBe("INPUT");
    expect((screen.getByTestId("grade-od-dnp") as HTMLElement).tagName).toBe("INPUT");
    expect((screen.getByTestId("grade-od-altura") as HTMLElement).tagName).toBe("INPUT");
  });

  it("no NÃO-toque, esférico OD renderiza <input> (keypad não presente)", () => {
    mockCoarsePointer(false);
    render(<PrescriptionGradeForm value={emptyValue} onChange={() => {}} />);
    expect((screen.getByTestId("grade-od-esf") as HTMLElement).tagName).toBe("INPUT");
    expect(screen.queryByTestId("keypad-display")).not.toBeInTheDocument();
  });
});
