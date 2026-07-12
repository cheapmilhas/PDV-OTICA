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
});
