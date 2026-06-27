/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PrescriptionGradeDialog } from "./prescription-grade-dialog";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("PrescriptionGradeDialog", () => {
  it("salva chamando PATCH /api/prescriptions/[id]/grau com o payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    vi.stubGlobal("fetch", fetchMock);
    const onSaved = vi.fn();

    render(
      <PrescriptionGradeDialog
        prescriptionId="rx-1"
        open
        onClose={() => {}}
        onSaved={onSaved}
      />
    );

    fireEvent.change(screen.getByTestId("grade-od-esf"), { target: { value: "-1,75" } });
    fireEvent.click(screen.getByRole("button", { name: /salvar/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/prescriptions/rx-1/grau");
    expect(opts.method).toBe("PATCH");
    const body = JSON.parse(opts.body);
    expect(body.od.esf).toBe("-1,75");
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it("marca dependente envia isDependente + patientName", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <PrescriptionGradeDialog prescriptionId="rx-2" open onClose={() => {}} onSaved={() => {}} />
    );

    fireEvent.click(screen.getByTestId("is-dependente"));
    fireEvent.change(screen.getByTestId("patient-name"), { target: { value: "Filho" } });
    fireEvent.click(screen.getByRole("button", { name: /salvar/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.isDependente).toBe(true);
    expect(body.patientName).toBe("Filho");
  });
});
