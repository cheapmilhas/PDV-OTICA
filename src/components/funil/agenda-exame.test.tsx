/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AgendaExame } from "./agenda-exame";

// Mock do toast para não poluir o ambiente de teste.
vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

const MOCK_ITEMS = [
  {
    id: "a1",
    scheduledAt: "2026-07-15T20:00:00.000Z",
    status: "SCHEDULED",
    note: null,
    lead: { id: "l1", name: "João", phone: "85999" },
    assignedUser: null,
  },
  {
    id: "a2",
    scheduledAt: "2026-07-15T21:00:00.000Z",
    status: "SCHEDULED",
    note: null,
    lead: { id: "l2", name: "Maria", phone: null },
    assignedUser: null,
  },
];

describe("AgendaExame", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lista os agendamentos do dia com botões Compareceu/Faltou", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: MOCK_ITEMS }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<AgendaExame active branchId={null} />);

    await waitFor(() => expect(screen.getByText("João")).toBeDefined());
    expect(screen.getByText("Maria")).toBeDefined();

    const compareceuButtons = screen.getAllByRole("button", { name: /Compareceu/i });
    const faltouButtons = screen.getAllByRole("button", { name: /Faltou/i });
    expect(compareceuButtons.length).toBe(2);
    expect(faltouButtons.length).toBe(2);
  });

  it("clicar em Faltou dispara PATCH /api/exam-appointments/<id> com status NO_SHOW", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: MOCK_ITEMS }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<AgendaExame active branchId={null} />);

    await waitFor(() => expect(screen.getByText("João")).toBeDefined());

    const faltouButtons = screen.getAllByRole("button", { name: /Faltou/i });
    fireEvent.click(faltouButtons[0]);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/exam-appointments/a1",
        expect.objectContaining({ method: "PATCH" })
      )
    );

    const patchCall = fetchMock.mock.calls.find(
      (call) => call[0] === "/api/exam-appointments/a1"
    );
    expect(patchCall).toBeDefined();
    const options = patchCall![1] as RequestInit;
    expect(options.method).toBe("PATCH");
    const body = JSON.parse(options.body as string);
    expect(body).toEqual({ status: "NO_SHOW" });
  });
});
