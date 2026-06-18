import { type EyeResult } from "@/lib/lens-optics";

/** Resultado por olho do motor (índice recomendado + espessura/peso). */
export function EyeReport({ label, result }: { label: string; result: EyeResult }) {
  const { index, thickness } = result;
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="text-sm font-semibold text-foreground">{label}</div>
      {index.length > 0 ? (
        <p className="mt-1 text-sm text-foreground">
          Índice recomendado:{" "}
          <span className="font-medium tabular-nums">{index.join(" / ")}</span>
        </p>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">
          Sem recomendação para este grau.
        </p>
      )}
      {thickness.thicknessMm && (
        <p className="mt-1 text-sm text-foreground">
          Espessura estimada:{" "}
          <span className="font-medium tabular-nums">
            {thickness.thicknessMm.min}–{thickness.thicknessMm.max} mm
          </span>{" "}
          · peso: <span className="font-medium">{thickness.weight}</span>
        </p>
      )}
    </div>
  );
}
