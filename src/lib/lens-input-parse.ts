/** Parsers de fronteira para o grau/armação vindos do corpo (não-confiável). Compartilhado pela rota do vendedor e pelo playground. */
import type { EyePower, FrameSize } from "@/lib/lens-optics";

/** Coage um campo numérico do corpo (não confiar no body). NaN/ausente/não-número → fallback. */
function num(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v.replace(",", ".")) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

/** Olho do corpo → EyePower; sph/cyl obrigatórios (default 0); axis/add só se numéricos. */
export function parseEye(raw: unknown): EyePower {
  // Guarda contra primitivos (ex.: od=42 ou "x"): só objetos viram Record; o
  // resto coage a {} → defaults sph:0/cyl:0 (em vez de um cast inseguro).
  const r = raw != null && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const axis = num(r.axis, NaN);
  const add = num(r.add, NaN);
  return {
    sph: num(r.sph, 0),
    cyl: num(r.cyl, 0),
    ...(Number.isFinite(axis) ? { axis } : {}),
    ...(Number.isFinite(add) ? { add } : {}),
  };
}

/** Armação do corpo → FrameSize, só quando AMBAS as medidas são números FINITOS; senão undefined. */
export function parseFrame(raw: unknown): FrameSize | undefined {
  // Number.isFinite (não typeof === "number"): NaN e Infinity são typeof
  // "number" e passariam num guard por typeof — aqui são rejeitados.
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    if (Number.isFinite(r.lensWidthMm) && Number.isFinite(r.bridgeMm)) {
      return { lensWidthMm: r.lensWidthMm as number, bridgeMm: r.bridgeMm as number };
    }
  }
  return undefined;
}
