"use client";

import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body>
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 bg-background">
          <AlertTriangle className="h-20 w-20 text-destructive" />
          <h1 className="text-3xl font-bold">Erro Crítico</h1>
          <p className="text-muted-foreground text-center max-w-md">
            Ocorreu um erro grave no sistema. Por favor, tente recarregar a página.
          </p>
          <Button onClick={reset} size="lg">
            <RefreshCw className="mr-2 h-5 w-5" />
            Recarregar página
          </Button>
        </div>
      </body>
    </html>
  );
}
