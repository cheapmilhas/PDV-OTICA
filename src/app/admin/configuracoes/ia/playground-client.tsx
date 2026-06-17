"use client";

import { useState } from "react";
import { PageHeader } from "@/components/admin/PageHeader";

interface Company {
  id: string;
  name: string;
}

/** Forma do resultado por olho que a rota devolve (espelha EyeResult de lens-optics). */
interface EyeResultView {
  index: string[];
  thickness: {
    thicknessMm: { min: number; max: number } | null;
    weight: "mais leve" | "médio" | "mais pesado";
    disclaimer: string;
  };
}

interface AnalysisView {
  valid: boolean;
  od: EyeResultView;
  oe: EyeResultView;
  alerts: string[];
}

interface ContextView {
  docCount: number;
  tokens: number;
  scopes: Record<string, number>;
}

interface PlaygroundResult {
  analysis: AnalysisView;
  context: ContextView;
  advice: string | null;
}

const GLOBAL_SCOPE = "global";

/** "1,25" | "1.25" | "" → número ou NaN. */
function toNum(v: string): number {
  if (v == null || v.trim() === "") return NaN;
  return parseFloat(v.replace(",", "."));
}

/** Constrói o objeto de grau enviado à rota. esf/cil obrigatórios (default 0); eixo/add só se numéricos. */
function buildEye(g: EyeForm): { sph: number; cyl: number; axis?: number; add?: number } {
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

interface EyeForm {
  esf: string;
  cil: string;
  eixo: string;
  add: string;
}

const EMPTY_EYE: EyeForm = { esf: "", cil: "", eixo: "", add: "" };

const inputClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

function EyeFields({
  legend,
  eye,
  onChange,
}: {
  legend: string;
  eye: EyeForm;
  onChange: (next: EyeForm) => void;
}) {
  const set = (field: keyof EyeForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...eye, [field]: e.target.value });

  return (
    <fieldset className="space-y-3 rounded-lg border border-border p-4">
      <legend className="px-1 text-sm font-semibold text-foreground">{legend}</legend>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Esférico</label>
          <input
            type="text"
            inputMode="decimal"
            placeholder="-2,00"
            value={eye.esf}
            onChange={set("esf")}
            className={inputClass}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Cilíndrico</label>
          <input
            type="text"
            inputMode="decimal"
            placeholder="-0,75"
            value={eye.cil}
            onChange={set("cil")}
            className={inputClass}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Eixo</label>
          <input
            type="text"
            inputMode="numeric"
            placeholder="90"
            value={eye.eixo}
            onChange={set("eixo")}
            className={inputClass}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Adição</label>
          <input
            type="text"
            inputMode="decimal"
            placeholder="2,00"
            value={eye.add}
            onChange={set("add")}
            className={inputClass}
          />
        </div>
      </div>
    </fieldset>
  );
}

function EyeReport({ label, result }: { label: string; result: EyeResultView }) {
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

export function PlaygroundClient({ companies }: { companies: Company[] }) {
  const [od, setOd] = useState<EyeForm>(EMPTY_EYE);
  const [oe, setOe] = useState<EyeForm>(EMPTY_EYE);
  const [lensWidthMm, setLensWidthMm] = useState("");
  const [bridgeMm, setBridgeMm] = useState("");
  const [scope, setScope] = useState<string>(GLOBAL_SCOPE);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<PlaygroundResult | null>(null);

  async function handleTest(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const lw = toNum(lensWidthMm);
      const br = toNum(bridgeMm);
      const frame =
        !Number.isNaN(lw) && !Number.isNaN(br)
          ? { lensWidthMm: lw, bridgeMm: br }
          : undefined;

      const res = await fetch("/api/admin/ai-playground", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          od: buildEye(od),
          oe: buildEye(oe),
          ...(frame ? { frame } : {}),
          ...(scope === GLOBAL_SCOPE ? {} : { companyId: scope }),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError((data as { error?: string }).error || "Erro ao testar o motor de lentes");
        return;
      }
      const data = (await res.json()) as { data: PlaygroundResult };
      setResult(data.data);
    } catch {
      setError("Erro de rede ao testar o motor de lentes");
    } finally {
      setLoading(false);
    }
  }

  const analysis = result?.analysis;
  const context = result?.context;
  const advice = result?.advice;
  const disclaimer = analysis?.od.thickness.thicknessMm
    ? analysis.od.thickness.disclaimer
    : analysis?.oe.thickness.thicknessMm
      ? analysis.oe.thickness.disclaimer
      : null;
  const scopeLabel =
    scope === GLOBAL_SCOPE
      ? "Global"
      : companies.find((c) => c.id === scope)?.name ?? "(ótica desconhecida)";

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <PageHeader
        title="Playground"
        subtitle="Teste o motor de recomendação de lentes e veja o contexto que seria enviado à IA."
      />

      <div className="rounded-lg border border-sky-200 bg-sky-50 p-3">
        <p className="text-sm text-sky-800">
          Testa o motor + o contexto + a resposta da IA. O playground usa a chave e o
          modelo configurados e NÃO consome a cota de nenhuma ótica.
        </p>
      </div>

      <form onSubmit={handleTest} className="space-y-4 rounded-lg border border-border bg-muted p-5">
        <EyeFields legend="Olho direito (OD)" eye={od} onChange={setOd} />
        <EyeFields legend="Olho esquerdo (OE)" eye={oe} onChange={setOe} />

        <fieldset className="space-y-3 rounded-lg border border-border p-4">
          <legend className="px-1 text-sm font-semibold text-foreground">
            Armação (opcional)
          </legend>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Largura da lente (mm)
              </label>
              <input
                type="text"
                inputMode="decimal"
                placeholder="opcional"
                value={lensWidthMm}
                onChange={(e) => setLensWidthMm(e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Ponte (mm)</label>
              <input
                type="text"
                inputMode="decimal"
                placeholder="opcional"
                value={bridgeMm}
                onChange={(e) => setBridgeMm(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>
        </fieldset>

        <div className="space-y-1.5">
          <label htmlFor="pg-scope" className="text-sm font-medium text-foreground">
            Contexto
          </label>
          <select
            id="pg-scope"
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            className={inputClass}
          >
            <option value={GLOBAL_SCOPE}>Global (todas as óticas)</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
            <p className="text-sm text-rose-700">{error}</p>
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? "Testando…" : "Testar"}
          </button>
        </div>
      </form>

      {analysis && (
        <div className="space-y-4 rounded-lg border border-border bg-muted p-5">
          <p className="font-semibold text-foreground">Resultado</p>

          {!analysis.valid ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
              <p className="text-sm font-semibold text-amber-800">Confira a receita:</p>
              <ul className="mt-1 list-inside list-disc space-y-0.5 text-sm text-amber-800">
                {analysis.alerts.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <EyeReport label="Olho direito (OD)" result={analysis.od} />
                <EyeReport label="Olho esquerdo (OE)" result={analysis.oe} />
              </div>

              {disclaimer && <p className="text-xs text-muted-foreground">{disclaimer}</p>}

              {analysis.alerts.length > 0 && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
                  <p className="text-sm font-semibold text-amber-800">Atenção:</p>
                  <ul className="mt-1 list-inside list-disc space-y-0.5 text-sm text-amber-800">
                    {analysis.alerts.map((a) => (
                      <li key={a}>{a}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}

          {context && (
            <div className="rounded-md border border-border bg-background p-3">
              <p className="text-xs text-muted-foreground">
                Contexto ({scopeLabel}): {context.docCount}{" "}
                {context.docCount === 1 ? "documento" : "documentos"}, ~
                {context.tokens.toLocaleString("pt-BR")} tokens
                {Object.keys(context.scopes).length > 0 && (
                  <>
                    {" "}
                    (escopos:{" "}
                    {Object.entries(context.scopes)
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(", ")}
                    )
                  </>
                )}
              </p>
            </div>
          )}

          {advice && advice.trim() !== "" ? (
            <div
              aria-live="polite"
              className="rounded-lg border border-border bg-background p-3"
            >
              <p className="text-sm font-semibold text-foreground">Resposta da IA</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{advice}</p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              IA não respondeu (sem chave da Anthropic cadastrada ou erro na API).
            </p>
          )}
        </div>
      )}
    </div>
  );
}
