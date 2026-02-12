"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { format, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";

interface InstallmentConfig {
  count: number;
  firstDueDate: string;
  interval: number;
}

interface ModalConfigurarCrediarioProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  amount: number;
  onConfirm: (config: InstallmentConfig) => void;
}

export function ModalConfigurarCrediario({
  open,
  onOpenChange,
  amount,
  onConfirm,
}: ModalConfigurarCrediarioProps) {
  const [count, setCount] = useState(3);
  const [firstDueDate, setFirstDueDate] = useState(
    format(addDays(new Date(), 30), "yyyy-MM-dd")
  );
  const [interval, setInterval] = useState(30);

  const installmentValue = count > 0 ? (amount / count).toFixed(2) : "0.00";

  const handleConfirm = () => {
    if (count < 2 || count > 24) {
      alert("Número de parcelas deve estar entre 2 e 24");
      return;
    }

    if (!firstDueDate) {
      alert("Data de vencimento é obrigatória");
      return;
    }

    onConfirm({
      count,
      firstDueDate: new Date(firstDueDate).toISOString(),
      interval,
    });

    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Configurar Crediário</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Valor total */}
          <div className="p-4 bg-muted rounded-lg">
            <p className="text-sm text-muted-foreground">Valor Total</p>
            <p className="text-2xl font-bold">
              {new Intl.NumberFormat("pt-BR", {
                style: "currency",
                currency: "BRL",
              }).format(amount)}
            </p>
          </div>

          {/* Número de parcelas */}
          <div className="space-y-2">
            <Label htmlFor="count">Número de Parcelas</Label>
            <Input
              id="count"
              type="number"
              min={2}
              max={24}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
            />
            <p className="text-sm text-muted-foreground">
              Mínimo: 2 | Máximo: 24 parcelas
            </p>
          </div>

          {/* Data da primeira parcela */}
          <div className="space-y-2">
            <Label htmlFor="firstDueDate">Vencimento da 1ª Parcela</Label>
            <div className="relative">
              <Input
                id="firstDueDate"
                type="date"
                value={firstDueDate}
                onChange={(e) => setFirstDueDate(e.target.value)}
                min={format(new Date(), "yyyy-MM-dd")}
              />
              <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            </div>
          </div>

          {/* Intervalo entre parcelas */}
          <div className="space-y-2">
            <Label htmlFor="interval">Intervalo entre Parcelas (dias)</Label>
            <Input
              id="interval"
              type="number"
              min={1}
              max={90}
              value={interval}
              onChange={(e) => setInterval(Number(e.target.value))}
            />
            <p className="text-sm text-muted-foreground">
              Comum: 30 dias (mensal) | 15 dias (quinzenal)
            </p>
          </div>

          {/* Resumo */}
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>Resumo:</strong> {count} parcelas de{" "}
              <strong>
                {new Intl.NumberFormat("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                }).format(Number(installmentValue))}
              </strong>
              , com vencimento a cada {interval} dias
            </AlertDescription>
          </Alert>

          {/* Botões */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button className="flex-1" onClick={handleConfirm}>
              Confirmar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
