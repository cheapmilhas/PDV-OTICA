"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Erro capturado:", error);
  }, [error]);

  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center gap-4 p-8">
      <AlertTriangle className="h-16 w-16 text-destructive" />
      <h2 className="text-2xl font-bold">Algo deu errado</h2>
      <p className="text-muted-foreground text-center max-w-md">
        Ocorreu um erro inesperado. Nossa equipe foi notificada.
      </p>
      {error.digest && (
        <p className="text-xs text-muted-foreground">
          Código: {error.digest}
        </p>
      )}
      <div className="flex gap-2">
        <Button onClick={reset} variant="default">
          <RefreshCw className="mr-2 h-4 w-4" />
          Tentar novamente
        </Button>
        <Button variant="outline" asChild>
          <a href="/dashboard">
            <Home className="mr-2 h-4 w-4" />
            Voltar ao início
          </a>
        </Button>
      </div>
    </div>
  );
}
