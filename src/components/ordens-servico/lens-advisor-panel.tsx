"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronDown, Eye, AlertTriangle } from "lucide-react";
import {
  analyzeLens,
  type EyePower,
  type EyeResult,
  type FrameSize,
} from "@/lib/lens-optics";

/** Forma dos valores de grau que cada olho expõe nas telas de OS (strings PT, decimal com vírgula). */
export interface EyeGrau {
  esf: string;
  cil: string;
  eixo: string;
  add: string;
}

interface LensAdvisorPanelProps {
  od: EyeGrau;
  oe: EyeGrau;
  /** medidas iniciais opcionais da armação (ex.: pré-preenchidas de uma FrameMeasurement existente) */
  initialFrame?: { lensWidthMm?: number; bridgeMm?: number };
}

/** "1,25" | "1.25" | "" → número ou NaN. */
function toNum(v: string): number {
  if (v == null || v.trim() === "") return NaN;
  return parseFloat(v.replace(",", "."));
}

/** Mapeia a forma de string PT do olho para EyePower do motor; sph/cyl são obrigatórios. */
function toEyePower(g: EyeGrau): EyePower {
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
function hasGrau(g: EyeGrau): boolean {
  return !Number.isNaN(toNum(g.esf)) || !Number.isNaN(toNum(g.cil));
}

function EyeReport({ label, result }: { label: string; result: EyeResult }) {
  const { index, thickness } = result;
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="text-sm font-semibold text-foreground">{label}</div>
      {index.length > 0 ? (
        <p className="mt-1 text-sm text-foreground">
          Índice recomendado:{" "}
          <span className="font-medium">{index.join(" / ")}</span>
        </p>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">
          Sem recomendação para este grau.
        </p>
      )}
      {thickness.thicknessMm && (
        <p className="mt-1 text-sm text-foreground">
          Espessura estimada:{" "}
          <span className="font-medium">
            {thickness.thicknessMm.min}–{thickness.thicknessMm.max} mm
          </span>{" "}
          · peso: <span className="font-medium">{thickness.weight}</span>
        </p>
      )}
    </div>
  );
}

export function LensAdvisorPanel({ od, oe, initialFrame }: LensAdvisorPanelProps) {
  const [open, setOpen] = useState(true);
  const [lensWidthMm, setLensWidthMm] = useState(
    initialFrame?.lensWidthMm != null ? String(initialFrame.lensWidthMm) : ""
  );
  const [bridgeMm, setBridgeMm] = useState(
    initialFrame?.bridgeMm != null ? String(initialFrame.bridgeMm) : ""
  );

  // Sincroniza com initialFrame que chega async, sem sobrescrever o que o usuário já digitou.
  useEffect(() => {
    if (initialFrame?.lensWidthMm != null)
      setLensWidthMm((cur) => (cur === "" ? String(initialFrame.lensWidthMm) : cur));
    if (initialFrame?.bridgeMm != null)
      setBridgeMm((cur) => (cur === "" ? String(initialFrame.bridgeMm) : cur));
  }, [initialFrame]);

  const odHasGrau = hasGrau(od);
  const oeHasGrau = hasGrau(oe);
  const anyGrau = odHasGrau || oeHasGrau;

  const analysis = useMemo(() => {
    if (!anyGrau) return null;
    const lw = toNum(lensWidthMm);
    const br = toNum(bridgeMm);
    const frame: FrameSize | undefined =
      !Number.isNaN(lw) && !Number.isNaN(br)
        ? { lensWidthMm: lw, bridgeMm: br }
        : undefined;
    // Se um olho não tiver grau, usa 0/0 (não invalida; o motor trata 0 como sem espessura).
    return analyzeLens(
      {
        od: odHasGrau ? toEyePower(od) : { sph: 0, cyl: 0 },
        oe: oeHasGrau ? toEyePower(oe) : { sph: 0, cyl: 0 },
      },
      frame
    );
  }, [anyGrau, odHasGrau, oeHasGrau, od, oe, lensWidthMm, bridgeMm]);

  // disclaimer é uma string constante; basta pegar a do primeiro olho que tiver espessura.
  const disclaimer =
    analysis?.od.thickness.thicknessMm
      ? analysis.od.thickness.disclaimer
      : analysis?.oe.thickness.thicknessMm
        ? analysis.oe.thickness.disclaimer
        : null;

  return (
    <Card className="mb-6">
      <CardHeader
        className="cursor-pointer"
        role="button"
        aria-expanded={open}
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
      >
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Eye className="h-4 w-4" />
            Assistente de Lentes
          </span>
          <ChevronDown
            className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </CardTitle>
      </CardHeader>

      {open && (
        <CardContent className="space-y-4">
          {!anyGrau ? (
            <p className="text-sm text-muted-foreground">
              Informe o grau para ver a recomendação de lente.
            </p>
          ) : (
            <>
              {/* Medidas opcionais da armação (para estimar espessura) */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="lens-advisor-width" className="text-xs">
                    Largura da lente (mm)
                  </Label>
                  <Input
                    id="lens-advisor-width"
                    type="number"
                    inputMode="decimal"
                    placeholder="opcional"
                    value={lensWidthMm}
                    onChange={(e) => setLensWidthMm(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="lens-advisor-bridge" className="text-xs">
                    Ponte (mm)
                  </Label>
                  <Input
                    id="lens-advisor-bridge"
                    type="number"
                    inputMode="decimal"
                    placeholder="opcional"
                    value={bridgeMm}
                    onChange={(e) => setBridgeMm(e.target.value)}
                  />
                </div>
              </div>

              {analysis && !analysis.valid ? (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-950/30">
                  <p className="flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-300">
                    <AlertTriangle className="h-4 w-4" />
                    Confira a receita:
                  </p>
                  <ul className="mt-1 list-inside list-disc space-y-0.5 text-sm text-amber-800 dark:text-amber-300">
                    {analysis.alerts.map((a) => (
                      <li key={a}>{a}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                analysis && (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {odHasGrau && <EyeReport label="Olho direito (OD)" result={analysis.od} />}
                      {oeHasGrau && <EyeReport label="Olho esquerdo (OE)" result={analysis.oe} />}
                    </div>

                    {disclaimer && (
                      <p className="text-xs text-muted-foreground">{disclaimer}</p>
                    )}

                    {analysis.alerts.length > 0 && (
                      <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-950/30">
                        <p className="flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-300">
                          <AlertTriangle className="h-4 w-4" />
                          Atenção:
                        </p>
                        <ul className="mt-1 list-inside list-disc space-y-0.5 text-sm text-amber-800 dark:text-amber-300">
                          {analysis.alerts.map((a) => (
                            <li key={a}>{a}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                )
              )}
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}
