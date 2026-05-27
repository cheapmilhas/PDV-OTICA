"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-700"
    >
      Imprimir / Salvar PDF
    </button>
  );
}
