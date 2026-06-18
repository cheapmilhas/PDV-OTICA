"use client";

import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, AlertTriangle, Glasses } from "lucide-react";
import { type UseLensAdvisor } from "./use-lens-advisor";
import { EyeReport } from "./eye-report";
import { type EyeGrau } from "./eye-power";

/** Um campo de grau (label associada por id único). */
function GrauField({
  id,
  label,
  placeholder,
  value,
  onChange,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input
        id={id}
        inputMode="decimal"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

/** Grupo dos 4 campos de um olho (OD/OE), com ids únicos para as labels. */
function EyeFields({
  legend,
  eye,
  onField,
}: {
  legend: string;
  eye: EyeGrau;
  onField: (field: keyof EyeGrau, value: string) => void;
}) {
  const baseId = useId();
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold text-foreground">{legend}</legend>
      <div className="grid grid-cols-2 gap-2">
        <GrauField
          id={`${baseId}-esf`}
          label="Esférico"
          placeholder="-2,00"
          value={eye.esf}
          onChange={(v) => onField("esf", v)}
        />
        <GrauField
          id={`${baseId}-cil`}
          label="Cilíndrico"
          placeholder="-0,75"
          value={eye.cil}
          onChange={(v) => onField("cil", v)}
        />
        <GrauField
          id={`${baseId}-eixo`}
          label="Eixo"
          placeholder="90"
          value={eye.eixo}
          onChange={(v) => onField("eixo", v)}
        />
        <GrauField
          id={`${baseId}-add`}
          label="Adição"
          placeholder="2,00"
          value={eye.add}
          onChange={(v) => onField("add", v)}
        />
      </div>
    </fieldset>
  );
}

/**
 * Corpo do balão flutuante do Assistente de Lentes. RECEBE o resultado do hook
 * useLensAdvisor (que é dono de TODO o estado da receita) via prop — o hook vive
 * uma única vez no FAB (fonte única), permitindo o expiry de 10 min. Este
 * componente só guarda useId() para associar labels. Renderiza receita OD/OE +
 * armação opcional + resultado do motor óptico determinístico + botão/sugestão da
 * IA + "Nova consulta".
 */
export function LensAdvisorForm({ advisor }: { advisor: UseLensAdvisor }) {
  const a = advisor;
  const widthId = useId();
  const bridgeId = useId();

  return (
    <div className="space-y-4">
      {/* Receita */}
      <EyeFields legend="Olho direito (OD)" eye={a.od} onField={a.setOdField} />
      <EyeFields legend="Olho esquerdo (OE)" eye={a.oe} onField={a.setOeField} />

      {/* Armação opcional (para estimar espessura) */}
      <fieldset className="space-y-2">
        <legend className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Glasses className="h-4 w-4" aria-hidden="true" />
          Armação (opcional)
        </legend>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor={widthId} className="text-xs">
              Largura da lente (mm)
            </Label>
            <Input
              id={widthId}
              inputMode="decimal"
              placeholder="opcional"
              value={a.lensWidthMm}
              onChange={(e) => a.setLensWidthMm(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={bridgeId} className="text-xs">
              Ponte (mm)
            </Label>
            <Input
              id={bridgeId}
              inputMode="decimal"
              placeholder="opcional"
              value={a.bridgeMm}
              onChange={(e) => a.setBridgeMm(e.target.value)}
            />
          </div>
        </div>
      </fieldset>

      {/* Resultado do motor */}
      {!a.anyGrau ? (
        <p className="text-sm text-muted-foreground">
          Informe o grau para ver a recomendação de lente.
        </p>
      ) : a.analysis && !a.analysis.valid ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-950/30">
          <p className="flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            Confira a receita:
          </p>
          <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
            Não consigo recomendar uma lente com estes dados:
          </p>
          <ul className="mt-1 list-inside list-disc space-y-0.5 text-sm text-amber-800 dark:text-amber-300">
            {a.analysis.alerts.map((alert) => (
              <li key={alert}>{alert}</li>
            ))}
          </ul>
        </div>
      ) : (
        a.analysis && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              {a.odHasGrau && (
                <EyeReport label="Olho direito (OD)" result={a.analysis.od} />
              )}
              {a.oeHasGrau && (
                <EyeReport label="Olho esquerdo (OE)" result={a.analysis.oe} />
              )}
            </div>

            {a.disclaimer && (
              <p className="text-xs text-muted-foreground">{a.disclaimer}</p>
            )}

            {a.analysis.alerts.length > 0 && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-950/30">
                <p className="flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                  Atenção:
                </p>
                <ul className="mt-1 list-inside list-disc space-y-0.5 text-sm text-amber-800 dark:text-amber-300">
                  {a.analysis.alerts.map((alert) => (
                    <li key={alert}>{alert}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* IA opcional — incremental; o resultado do motor acima nunca depende disto. */}
            {a.analysis.valid && a.anyGrau && (
              <div className="space-y-2 border-t pt-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={a.aiLoading}
                  onClick={a.explain}
                >
                  {a.aiLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Sparkles className="h-4 w-4" aria-hidden="true" />
                  )}
                  {a.aiLoading ? "Consultando IA…" : "Pedir sugestão da IA"}
                </Button>

                <div aria-live="polite">
                  {a.aiLoading && (
                    <div className="space-y-2 border-t pt-3">
                      <div className="h-3 w-full animate-pulse rounded bg-muted" />
                      <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
                    </div>
                  )}
                  {!a.aiLoading && a.aiText && (
                    <div className="border-t pt-3">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                        Sugestão da IA · apoio à venda
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                        {a.aiText}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Texto gerado por IA — confira sempre os dados acima.
                      </p>
                    </div>
                  )}
                  {!a.aiLoading && a.aiError && (
                    <p className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                      {a.aiError}
                    </p>
                  )}
                </div>
              </div>
            )}
          </>
        )
      )}

      {/* Nova consulta — só faz sentido quando há algo para limpar. */}
      {(a.anyGrau || a.aiText) && (
        <div className="border-t pt-3">
          <Button type="button" variant="ghost" size="sm" onClick={a.reset}>
            Nova consulta
          </Button>
        </div>
      )}
    </div>
  );
}
