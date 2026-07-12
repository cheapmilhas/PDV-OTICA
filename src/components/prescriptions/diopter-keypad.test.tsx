/** @vitest-environment jsdom */
// src/components/prescriptions/diopter-keypad.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DiopterKeypad } from "./diopter-keypad";

describe("DiopterKeypad", () => {
  it("reflete o value controlado no visor (sem estado-espelho)", () => {
    const { rerender } = render(
      <DiopterKeypad open value="-3,00" field="esf" label="OD · Esférico" onChange={() => {}} onClose={() => {}} />,
    );
    expect(screen.getByTestId("keypad-display")).toHaveTextContent("−3,00 D");
    rerender(
      <DiopterKeypad open value="1,25" field="esf" label="OD · Esférico" onChange={() => {}} onClose={() => {}} />,
    );
    expect(screen.getByTestId("keypad-display")).toHaveTextContent("+1,25 D");
  });

  it("botão ± alterna o sinal e emite string sanitizada", () => {
    const onChange = vi.fn();
    render(
      <DiopterKeypad open value="2,25" field="esf" label="OD · Esférico" onChange={onChange} onClose={() => {}} />,
    );
    fireEvent.click(screen.getByTestId("keypad-sign"));
    expect(onChange).toHaveBeenLastCalledWith("-2,25");
  });

  it("campo adição NÃO mostra o botão ±", () => {
    render(
      <DiopterKeypad open value="" field="adicao" label="Adição" onChange={() => {}} onClose={() => {}} />,
    );
    expect(screen.queryByTestId("keypad-sign")).toBeNull();
  });

  it("dígito e vírgula anexam ao value via onChange", () => {
    const onChange = vi.fn();
    render(
      <DiopterKeypad open value="1" field="esf" label="OD · Esférico" onChange={onChange} onClose={() => {}} />,
    );
    fireEvent.click(screen.getByTestId("keypad-comma"));
    expect(onChange).toHaveBeenLastCalledWith("1,");
  });

  it("vírgula é no-op quando já há vírgula (separador único)", () => {
    const onChange = vi.fn();
    render(
      <DiopterKeypad open value="1,2" field="esf" label="OD · Esférico" onChange={onChange} onClose={() => {}} />,
    );
    fireEvent.click(screen.getByTestId("keypad-comma"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("adição nunca fica negativa pelo stepper −0,25 (clamp em 0)", () => {
    const onChange = vi.fn();
    render(
      <DiopterKeypad open value="" field="adicao" label="Adição" onChange={onChange} onClose={() => {}} />,
    );
    fireEvent.click(screen.getByTestId("keypad-step-down"));
    // de vazio (0), −0,25 em adição deve permanecer não-negativo → "0"
    const emitted = onChange.mock.calls.at(-1)?.[0];
    expect(emitted === "0" || emitted === "").toBe(true);
    expect(emitted?.startsWith("-")).toBeFalsy();
  });

  it("esf/cil AINDA vão negativos pelo stepper (não clampa)", () => {
    const onChange = vi.fn();
    render(
      <DiopterKeypad open value="" field="esf" label="OD · Esférico" onChange={onChange} onClose={() => {}} />,
    );
    fireEvent.click(screen.getByTestId("keypad-step-down"));
    expect(onChange).toHaveBeenLastCalledWith("-0,25");
  });

  it("stepper é no-op quando o valor atual é inválido (não apaga valor legado)", () => {
    const onChange = vi.fn();
    render(
      <DiopterKeypad open value="1,2,3" field="esf" label="OD · Esférico" onChange={onChange} onClose={() => {}} />,
    );
    fireEvent.click(screen.getByTestId("keypad-step-up"));
    expect(onChange).not.toHaveBeenCalled();
  });
});
