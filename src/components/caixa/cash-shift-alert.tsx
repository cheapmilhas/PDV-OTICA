"use client";

import { useState, useEffect } from "react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface CashShiftAlertProps {
  /** Se true, não mostra o botão "Fechar Caixa" (já está na tela de caixa) */
  hideAction?: boolean;
}

interface ShiftInfo {
  id: string;
  openedAt: string;
  openedByUser: { name: string };
}

/**
 * Alerta de caixa aberto há muito tempo.
 * - 12h a 24h: amarelo (warning)
 * - > 24h: vermelho (destructive/critical)
 * - < 12h: não exibe
 */
export function CashShiftAlert({ hideAction = false }: CashShiftAlertProps) {
  const [shift, setShift] = useState<ShiftInfo | null>(null);
  const [hoursOpen, setHoursOpen] = useState(0);

  useEffect(() => {
    const fetchShift = async () => {
      try {
        const res = await fetch("/api/cash/shift");
        if (!res.ok) return;
        const data = await res.json();
        if (data.shift && data.shift.status === "OPEN") {
          setShift(data.shift);
          const openedAt = new Date(data.shift.openedAt);
          const diffMs = Date.now() - openedAt.getTime();
          setHoursOpen(diffMs / (1000 * 60 * 60));
        }
      } catch {
        // Silencioso — é apenas um alerta informativo
      }
    };

    fetchShift();

    // Atualizar a cada 5 minutos
    const interval = setInterval(fetchShift, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Não exibir se não há caixa aberto ou aberto há menos de 12h
  if (!shift || hoursOpen < 12) return null;

  const isUrgent = hoursOpen >= 24;
  const openedAt = new Date(shift.openedAt);

  // Formatar tempo decorrido
  const formatElapsed = (hours: number): string => {
    const dias = Math.floor(hours / 24);
    const hrs = Math.floor(hours % 24);
    if (dias > 0) {
      return `${dias} dia${dias > 1 ? "s" : ""} e ${hrs} hora${hrs !== 1 ? "s" : ""}`;
    }
    return `${hrs} hora${hrs !== 1 ? "s" : ""}`;
  };

  return (
    <Alert
      variant={isUrgent ? "destructive" : "default"}
      className={
        isUrgent
          ? "border-red-400 bg-red-50 text-red-900"
          : "border-yellow-400 bg-yellow-50 text-yellow-900"
      }
    >
      <AlertTriangle className={`h-4 w-4 ${isUrgent ? "text-red-600" : "text-yellow-600"}`} />
      <AlertTitle>
        {isUrgent
          ? "ALERTA: Caixa aberto por tempo excessivo!"
          : "Atenção: Caixa aberto há muito tempo"}
      </AlertTitle>
      <AlertDescription>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 mt-1">
          <span>
            {isUrgent ? (
              <>
                Caixa aberto desde{" "}
                <strong>
                  {openedAt.toLocaleDateString("pt-BR")} às{" "}
                  {openedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                </strong>{" "}
                ({formatElapsed(hoursOpen)}). Feche o caixa imediatamente!
              </>
            ) : (
              <>
                Caixa aberto há <strong>{formatElapsed(hoursOpen)}</strong> (desde{" "}
                {openedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}).
                Considere fechar o caixa.
              </>
            )}
          </span>
          {!hideAction && (
            <Link href="/dashboard/caixa" className="sm:ml-auto">
              <Button
                size="sm"
                variant={isUrgent ? "destructive" : "outline"}
                className="whitespace-nowrap"
              >
                Ir para Caixa
              </Button>
            </Link>
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
}
