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
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

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

  const form = useForm<FormData>({
    resolver: zodResolver(createStockAdjustmentSchema),
    defaultValues: {
      productId,
      type: "DAMAGE",
      quantityChange: 0,
      reason: "",
      attachments: [],
    },
  });

  const quantityChange = form.watch("quantityChange");
  const newStock = currentStock + (quantityChange || 0);

  async function onSubmit(data: FormData) {
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
          <DialogTitle>Criar Ajuste de Estoque</DialogTitle>
          <DialogDescription>
            Produto: <strong>{productName}</strong> | Estoque Atual: <strong>{currentStock}</strong>
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de Ajuste</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o tipo" />
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
              name="quantityChange"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Quantidade (positivo = entrada, negativo = saída)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      placeholder="Ex: -5 ou +10"
                      {...field}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                    />
                  </FormControl>
                  <FormDescription>
                    Novo estoque após ajuste: <strong>{newStock}</strong>
                    {newStock < 0 && (
                      <span className="text-red-600 ml-2">(Estoque ficará negativo!)</span>
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Justificativa</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Descreva o motivo do ajuste em detalhes..."
                      className="min-h-[100px]"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>Mínimo 10 caracteres, máximo 500</FormDescription>
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
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Criar Ajuste
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
