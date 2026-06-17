import { describe, it, expect } from "vitest";
import { parseEye, parseFrame } from "./lens-input-parse";

describe("parseEye", () => {
  it("coage strings numéricas e vírgula decimal → números", () => {
    expect(parseEye({ sph: "-2,5", cyl: "-1.25" })).toEqual({ sph: -2.5, cyl: -1.25 });
  });

  it("sph/cyl ausentes → default 0", () => {
    expect(parseEye({})).toEqual({ sph: 0, cyl: 0 });
    expect(parseEye({ sph: -2 })).toEqual({ sph: -2, cyl: 0 });
    expect(parseEye({ cyl: -1 })).toEqual({ sph: 0, cyl: -1 });
  });

  it("entrada primitiva (number/string/null/undefined) → { sph: 0, cyl: 0 }", () => {
    expect(parseEye(42)).toEqual({ sph: 0, cyl: 0 });
    expect(parseEye("x")).toEqual({ sph: 0, cyl: 0 });
    expect(parseEye(null)).toEqual({ sph: 0, cyl: 0 });
    expect(parseEye(undefined)).toEqual({ sph: 0, cyl: 0 });
  });

  it("axis/add incluídos apenas quando finitos", () => {
    expect(parseEye({ sph: -2, cyl: -1, axis: 90, add: 2 })).toEqual({
      sph: -2,
      cyl: -1,
      axis: 90,
      add: 2,
    });
  });

  it("axis/add NaN/Infinity/ausentes → omitidos", () => {
    expect(parseEye({ sph: -2, cyl: -1 })).toEqual({ sph: -2, cyl: -1 });
    expect(parseEye({ sph: -2, cyl: -1, axis: "abc" })).toEqual({ sph: -2, cyl: -1 });
    expect(parseEye({ sph: -2, cyl: -1, add: Infinity })).toEqual({ sph: -2, cyl: -1 });
    expect(parseEye({ sph: -2, cyl: -1, axis: NaN, add: NaN })).toEqual({ sph: -2, cyl: -1 });
  });
});

describe("parseFrame", () => {
  it("ambas as medidas finitas → { lensWidthMm, bridgeMm }", () => {
    expect(parseFrame({ lensWidthMm: 52, bridgeMm: 18 })).toEqual({ lensWidthMm: 52, bridgeMm: 18 });
  });

  it("uma medida ausente → undefined", () => {
    expect(parseFrame({ lensWidthMm: 52 })).toBeUndefined();
    expect(parseFrame({ bridgeMm: 18 })).toBeUndefined();
    expect(parseFrame({})).toBeUndefined();
  });

  it("HARDENING: NaN ou Infinity → undefined", () => {
    expect(parseFrame({ lensWidthMm: NaN, bridgeMm: 18 })).toBeUndefined();
    expect(parseFrame({ lensWidthMm: 52, bridgeMm: NaN })).toBeUndefined();
    expect(parseFrame({ lensWidthMm: Infinity, bridgeMm: 18 })).toBeUndefined();
    expect(parseFrame({ lensWidthMm: 52, bridgeMm: Infinity })).toBeUndefined();
  });

  it("entrada primitiva/null → undefined", () => {
    expect(parseFrame(42)).toBeUndefined();
    expect(parseFrame("x")).toBeUndefined();
    expect(parseFrame(null)).toBeUndefined();
    expect(parseFrame(undefined)).toBeUndefined();
  });
});
