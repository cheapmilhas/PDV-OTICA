"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

/**
 * Error boundary do segmento /admin (A2). Antes, qualquer exceção de servidor
 * numa página do admin caía na tela de erro genérica do Next, sem contexto nem
 * ação. Aqui damos uma mensagem clara + "Tentar novamente".
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Registra no console do servidor/cliente para diagnóstico (o digest liga ao log).
    console.error("[admin] erro na página:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="h-6 w-6 text-destructive" />
      </div>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-foreground">Algo deu errado</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          Não foi possível carregar esta página. Tente novamente; se persistir, avise o suporte.
        </p>
        {error.digest && (
          <p className="text-xs text-muted-foreground/70">Código: {error.digest}</p>
        )}
      </div>
      <button
        onClick={reset}
        className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        <RotateCcw className="h-4 w-4" />
        Tentar novamente
      </button>
    </div>
  );
}
