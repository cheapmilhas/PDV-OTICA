/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AgendarExameDialog } from "./agendar-exame-dialog";

// Mock do toast para não poluir o ambiente de teste.
vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

describe("AgendarExameDialog", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renderiza um input de data/hora e um botão Agendar", () => {
    render(
      <AgendarExameDialog leadId="lead-1" open onOpenChange={() => {}} />
    );

    expect(
      document.querySelector('input[type="datetime-local"]')
    ).not.toBeNull();
    expect(screen.getByRole("button", { name: /Agendar/i })).toBeDefined();
  });

  it("envia POST /api/exam-appointments com leadId e scheduledAt ao preencher e clicar em Agendar", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: {} }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      <AgendarExameDialog leadId="lead-1" open onOpenChange={() => {}} />
    );

    const input = document.querySelector(
      'input[type="datetime-local"]'
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "2026-08-01T10:00" } });

    fireEvent.click(screen.getByRole("button", { name: /Agendar/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/exam-appointments");
    expect(options.method).toBe("POST");

    const body = JSON.parse(options.body as string);
    expect(body.leadId).toBe("lead-1");
    expect(typeof body.scheduledAt).toBe("string");
  });
});
