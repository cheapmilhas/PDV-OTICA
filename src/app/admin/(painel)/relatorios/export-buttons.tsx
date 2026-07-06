"use client";

import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

export function ExportButtons() {
  const [loading, setLoading] = useState<string | null>(null);

  const handleExport = async (type: string) => {
    setLoading(type);

    try {
      const res = await fetch(`/api/admin/export/${type}`);

      if (!res.ok) {
        toast.error("Erro ao gerar CSV");
        return;
      }

      // Baixar CSV
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${type}_${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast.success("CSV baixado com sucesso!");
    } catch (error) {
      toast.error("Erro ao gerar CSV");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Button
        variant="outline"
        onClick={() => handleExport("clientes")}
        disabled={loading !== null}
      >
        {loading === "clientes" ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Download className="h-4 w-4 mr-2" />
        )}
        Clientes
      </Button>

      <Button
        variant="outline"
        onClick={() => handleExport("assinaturas")}
        disabled={loading !== null}
      >
        {loading === "assinaturas" ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Download className="h-4 w-4 mr-2" />
        )}
        Assinaturas
      </Button>

      <Button
        variant="outline"
        onClick={() => handleExport("faturas")}
        disabled={loading !== null}
      >
        {loading === "faturas" ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Download className="h-4 w-4 mr-2" />
        )}
        Faturas
      </Button>

      <Button
        variant="outline"
        onClick={() => handleExport("tickets")}
        disabled={loading !== null}
      >
        {loading === "tickets" ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Download className="h-4 w-4 mr-2" />
        )}
        Tickets
      </Button>
    </div>
  );
}
