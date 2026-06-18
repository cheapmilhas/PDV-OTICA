import { type EyePower } from "@/lib/lens-optics";

/** Forma dos valores de grau que cada olho expõe (strings PT, decimal com vírgula). */
export interface EyeGrau {
  esf: string;
  cil: string;
  eixo: string;
  add: string;
}

/** "1,25" | "1.25" | "" → número ou NaN. */
export function toNum(v: string): number {
  if (v == null || v.trim() === "") return NaN;
  return parseFloat(v.replace(",", "."));
}

/** Mapeia a forma de string PT do olho para EyePower do motor; sph/cyl são obrigatórios. */
export function toEyePower(g: EyeGrau): EyePower {
  const sph = toNum(g.esf);
  const cyl = toNum(g.cil);
  const axis = toNum(g.eixo);
  const add = toNum(g.add);
  return {
    sph: Number.isNaN(sph) ? 0 : sph,
    cyl: Number.isNaN(cyl) ? 0 : cyl,
    ...(Number.isNaN(axis) ? {} : { axis }),
    ...(Number.isNaN(add) ? {} : { add }),
  };
}

/** Um olho tem grau utilizável quando esf OU cil foi informado e é numérico. */
export function hasGrau(g: EyeGrau): boolean {
  return !Number.isNaN(toNum(g.esf)) || !Number.isNaN(toNum(g.cil));
}

/** Olho vazio (estado inicial). */
export const EMPTY_EYE: EyeGrau = { esf: "", cil: "", eixo: "", add: "" };
