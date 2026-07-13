/** @vitest-environment jsdom */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "./button";

describe("Button size=icon — piso de altura tocável no mobile", () => {
  it("variant icon inclui min-h-11 e o remove no desktop (sm:min-h-[auto])", () => {
    const { getByRole } = render(<Button size="icon" aria-label="x" />);
    const cls = getByRole("button").className;
    expect(cls).toContain("min-h-11");
    expect(cls).toContain("sm:min-h-[auto]");
  });

  it("NÃO adiciona min-w (largura fica livre pra não estourar toolbar)", () => {
    const cls = buttonVariants({ size: "icon" });
    expect(cls).not.toContain("min-w-11");
  });

  it("o piso de altura sobrevive a um override h-6 w-6 do consumidor", () => {
    const merged = cn(buttonVariants({ size: "icon" }), "h-6 w-6");
    expect(merged).toContain("min-h-11");
    expect(merged).toContain("h-6");
  });
});
