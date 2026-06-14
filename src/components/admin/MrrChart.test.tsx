/** @vitest-environment jsdom */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { MrrChart } from "./MrrChart";

describe("MrrChart", () => {
  // Recharts in jsdom often renders nothing without fixed dimensions — this is a
  // "doesn't crash" smoke test, not real visual coverage.
  it("renderiza sem crashar com dados", () => {
    const { container } = render(<MrrChart data={[{ month: "Jan", mrr: 100 }, { month: "Fev", mrr: 200 }]} />);
    expect(container).toBeDefined();
  });
  it("renderiza em modo compact sem crashar", () => {
    const { container } = render(<MrrChart compact data={[{ month: "Jan", mrr: 100 }, { month: "Fev", mrr: 200 }]} />);
    expect(container).toBeDefined();
  });
});
