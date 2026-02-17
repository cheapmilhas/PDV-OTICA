"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { StockAdjustmentType } from "@prisma/client";
import { createStockAdjustmentSchema } from "@/lib/validations/stock-adjustment.schema";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowDownCircle, ArrowUpCircle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type FormData = z.infer<typeof createStockAdjustmentSchema>;

interface ModalAjusteEstoqueProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  productName: string;
  currentStock: number;
  onSuccess?: () => void;
}

const adjustmentTypes: { value: StockAdjustmentType; label: string }[] = [
  { value: "DAMAGE", label: "Quebra/Avaria" },
  { value: "THEFT", label: "Perda/Roubo" },
  { value: "SUPPLIER_RETURN", label: "Devolução ao Fornecedor" },
  { value: "COUNT_ERROR", label: "Erro de Contagem" },
  { value: "FREE_SAMPLE", label: "Amostra Grátis" },
  { value: "EXPIRATION", label: "Vencimento/Validade" },
  { value: "INTERNAL_USE", label: "Uso Interno" },
  { value: "OTHER", label: "Outros" },
];

export function ModalAjusteEstoque({
  open,
  onOpenChange,
  productId,
  productName,
  currentStock,
  onSuccess,
}: ModalAjusteEstoqueProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [direction, setDirection] = useState<"ENTRY" | "EXIT">("EXIT");
  const [qty, setQty] = useState<number>(1);

  const form = useForm<FormData>({
    resolver: zodResolver(createStockAdjustmentSchema) as any,
    defaultValues: {
      productId,
      type: "DAMAGE",
      quantityChange: -1,
      reason: "",
      attachments: [],
    },
  });

  const newStock = currentStock + (direction === "ENTRY" ? qty : -qty);

  function handleDirectionChange(dir: "ENTRY" | "EXIT") {
    setDirection(dir);
    form.setValue("quantityChange", dir === "ENTRY" ? qty : -qty);
    // Reset type to sensible default when switching direction
    if (dir === "ENTRY") {
      form.setValue("type", "COUNT_ERROR");
    } else {
      form.setValue("type", "DAMAGE");
    }
  }

  function handleQtyChange(value: number) {
    const safeQty = Math.max(1, Math.abs(value) || 1);
    setQty(safeQty);
    form.setValue("quantityChange", direction === "ENTRY" ? safeQty : -safeQty);
  }

  async function onSubmit(data: FormData) {
    if (!data.reason || data.reason.trim().length < 10) {
      form.setError("reason", { message: "Justificativa obrigatória (mínimo 10 caracteres)" });
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/stock-adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error?.message || "Erro ao criar ajuste");
      }

      toast.success(
        result.data.status === "APPROVED" || result.data.status === "AUTO_APPROVED"
          ? "Ajuste criado e aprovado automaticamente"
          : "Ajuste criado e aguardando aprovação"
      );

      form.reset();
      setDirection("EXIT");
      setQty(1);
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao criar ajuste");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Ajuste de Estoque</DialogTitle>
          <DialogDescription>
            Produto: <strong>{productName}</strong> | Estoque Atual: <strong>{currentStock}</strong>
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Direção do ajuste */}
            <div>
              <p className="text-sm font-medium mb-2">Tipo de Movimentação</p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleDirectionChange("ENTRY")}
                  className={cn(
                    "flex flex-col items-center justify-center gap-1 rounded-lg border-2 p-4 transition-all",
                    direction === "ENTRY"
                      ? "border-green-500 bg-green-50 text-green-700"
                      : "border-muted bg-background text-muted-foreground hover:border-green-300 hover:bg-green-50/50"
                  )}
                >
                  <ArrowDownCircle className="h-8 w-8" />
                  <span className="font-semibold text-sm">ENTRADA</span>
                  <span className="text-xs">Adicionar ao estoque</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDirectionChange("EXIT")}
                  className={cn(
                    "flex flex-col items-center justify-center gap-1 rounded-lg border-2 p-4 transition-all",
                    direction === "EXIT"
                      ? "border-red-500 bg-red-50 text-red-700"
                      : "border-muted bg-background text-muted-foreground hover:border-red-300 hover:bg-red-50/50"
                  )}
                >
                  <ArrowUpCircle className="h-8 w-8" />
                  <span className="font-semibold text-sm">SAIDA</span>
                  <span className="text-xs">Remover do estoque</span>
                </button>
              </div>
            </div>

            {/* Quantidade */}
            <div>
              <p className="text-sm font-medium mb-1">Quantidade</p>
              <Input
                type="number"
                min={1}
                value={qty}
                onChange={(e) => handleQtyChange(Number(e.target.value))}
                placeholder="Quantidade"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Estoque após ajuste:{" "}
                <strong className={newStock < 0 ? "text-red-600" : "text-foreground"}>
                  {newStock}
                </strong>
                {newStock < 0 && (
                  <span className="text-red-600 ml-2">(Estoque ficará negativo!)</span>
                )}
              </p>
            </div>

            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Motivo do Ajuste</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o motivo" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {adjustmentTypes.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Justificativa <span className="text-red-500">*</span>
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Descreva o motivo do ajuste em detalhes..."
                      className="min-h-[100px]"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>Obrigatória — mínimo 10 caracteres</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className={direction === "ENTRY" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}
              >
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {direction === "ENTRY" ? "Confirmar Entrada" : "Confirmar Saida"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
