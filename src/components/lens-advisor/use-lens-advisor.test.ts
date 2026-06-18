/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useLensAdvisor } from "./use-lens-advisor";

const DEGRADATION =
  "Não foi possível gerar a explicação agora. Os dados acima (índice e espessura) continuam válidos.";

function mockFetchOk(data: unknown) {
  return vi.fn(async () => ({
    ok: true,
    json: async () => ({ data }),
  })) as unknown as typeof fetch;
}

describe("useLensAdvisor", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("estado inicial: olhos vazios → analysis null, anyGrau false, lastEditedAt null", () => {
    const { result } = renderHook(() => useLensAdvisor());
    expect(result.current.analysis).toBeNull();
    expect(result.current.anyGrau).toBe(false);
    expect(result.current.odHasGrau).toBe(false);
    expect(result.current.oeHasGrau).toBe(false);
    expect(result.current.lastEditedAt).toBeNull();
    expect(result.current.aiText).toBeNull();
    expect(result.current.aiError).toBeNull();
  });

  it("ao digitar grau no OD: anyGrau true, analysis válido com índice, lastEditedAt numérico", () => {
    const { result } = renderHook(() => useLensAdvisor());
    act(() => result.current.setOdField("esf", "-2"));
    expect(result.current.anyGrau).toBe(true);
    expect(result.current.odHasGrau).toBe(true);
    expect(result.current.analysis).not.toBeNull();
    expect(result.current.analysis?.valid).toBe(true);
    expect(result.current.analysis?.od.index.length).toBeGreaterThan(0);
    expect(typeof result.current.lastEditedAt).toBe("number");
  });

  it("explain() feliz: aiText preenchido, sem loading, sem erro; body tem od/oe e frame", async () => {
    const fetchMock = mockFetchOk({ advice: "texto da ia", aiUnavailable: false });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useLensAdvisor());
    act(() => result.current.setOdField("esf", "-2"));
    act(() => result.current.setOeField("esf", "-1.5"));
    act(() => result.current.setLensWidthMm("52"));
    act(() => result.current.setBridgeMm("18"));

    await act(async () => {
      await result.current.explain();
    });

    expect(result.current.aiText).toBe("texto da ia");
    expect(result.current.aiLoading).toBe(false);
    expect(result.current.aiError).toBeNull();

    const call = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe("/api/company/lens-advisor");
    const body = JSON.parse(call[1].body);
    expect(body.od).toMatchObject({ sph: -2, cyl: 0 });
    expect(body.oe).toMatchObject({ sph: -1.5, cyl: 0 });
    expect(body.frame).toEqual({ lensWidthMm: 52, bridgeMm: 18 });
  });

  it("explain() degradação (aiUnavailable): aiText null, aiError = copy de degradação", async () => {
    vi.stubGlobal("fetch", mockFetchOk({ advice: null, aiUnavailable: true }));

    const { result } = renderHook(() => useLensAdvisor());
    act(() => result.current.setOdField("esf", "-2"));

    await act(async () => {
      await result.current.explain();
    });

    expect(result.current.aiText).toBeNull();
    expect(result.current.aiError).toBe(DEGRADATION);
  });

  it("explain() resposta não-ok: aiError setado, aiText null", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch,
    );

    const { result } = renderHook(() => useLensAdvisor());
    act(() => result.current.setOdField("esf", "-2"));

    await act(async () => {
      await result.current.explain();
    });

    expect(result.current.aiError).toBe(DEGRADATION);
    expect(result.current.aiText).toBeNull();
  });

  it("limpa a IA quando o grau muda", async () => {
    vi.stubGlobal("fetch", mockFetchOk({ advice: "texto da ia", aiUnavailable: false }));

    const { result } = renderHook(() => useLensAdvisor());
    act(() => result.current.setOdField("esf", "-2"));

    await act(async () => {
      await result.current.explain();
    });
    expect(result.current.aiText).toBe("texto da ia");

    act(() => result.current.setOdField("cil", "-1"));
    expect(result.current.aiText).toBeNull();
  });

  it("reset(): zera olhos, medidas, IA e lastEditedAt", () => {
    const { result } = renderHook(() => useLensAdvisor());
    act(() => result.current.setOdField("esf", "-2"));
    act(() => result.current.setLensWidthMm("52"));

    act(() => result.current.reset());

    expect(result.current.od).toEqual({ esf: "", cil: "", eixo: "", add: "" });
    expect(result.current.oe).toEqual({ esf: "", cil: "", eixo: "", add: "" });
    expect(result.current.lensWidthMm).toBe("");
    expect(result.current.bridgeMm).toBe("");
    expect(result.current.aiText).toBeNull();
    expect(result.current.aiError).toBeNull();
    expect(result.current.lastEditedAt).toBeNull();
    expect(result.current.anyGrau).toBe(false);
  });
});
