/** @vitest-environment jsdom */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { OsHistoryTimeline } from "@/components/ordens-servico/os-history-timeline";

// next/link → âncora simples no ambiente de teste.
import { vi } from "vitest";
vi.mock("next/link", () => ({
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
}));

const baseRoot = {
  id: "os-15",
  number: 15,
  status: "DELIVERED",
  createdAt: "2026-05-05T12:00:00Z",
  promisedDate: "2026-05-12T12:00:00Z",
  deliveredAt: "2026-05-11T12:00:00Z",
};

describe("OsHistoryTimeline", () => {
  it("raiz com 1 retrabalho + 1 garantia: mostra resumo e os 3 eventos", () => {
    render(
      <OsHistoryTimeline
        order={{
          ...baseRoot,
          reworkOrders: [
            { id: "rt", number: 17, status: "DELIVERED", isWarranty: false, isRework: true, warrantySeq: 1, createdAt: "2026-05-18T12:00:00Z", reworkReason: "grau trocado" },
            { id: "g", number: 18, status: "DELIVERED", isWarranty: true, isRework: false, warrantySeq: 1, createdAt: "2026-05-28T12:00:00Z", warrantyReason: "lente descolando" },
          ],
        }}
      />,
    );
    expect(screen.getByText("Histórico desta OS")).toBeDefined();
    // Números-base compartilhados (não pulam).
    expect(screen.getByText("#000015-G")).toBeDefined();
    expect(screen.getByText("#000015-RT")).toBeDefined();
    expect(screen.getByText("#000015")).toBeDefined();
    // Motivos aparecem.
    expect(screen.getByText(/lente descolando/)).toBeDefined();
  });

  it("derivação (tem originalOrder) NÃO renderiza a timeline", () => {
    const { container } = render(
      <OsHistoryTimeline
        order={{ ...baseRoot, id: "g", originalOrder: { id: "os-15" } } as any}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("raiz sem derivações NÃO renderiza (a tela já é a OS original)", () => {
    const { container } = render(
      <OsHistoryTimeline order={{ ...baseRoot, reworkOrders: [] }} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
