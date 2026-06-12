/** @vitest-environment jsdom */
// src/components/admin/EmptyState.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Inbox } from "lucide-react";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  it("renderiza mensagem", () => {
    render(<EmptyState icon={Inbox} message="Nenhum cliente" />);
    expect(screen.getByText("Nenhum cliente")).toBeDefined();
  });
});
