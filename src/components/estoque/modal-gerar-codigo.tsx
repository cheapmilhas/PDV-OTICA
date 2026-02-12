"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { BarcodeType } from "@prisma/client";
import { createBarcodeSchema } from "@/lib/validations/barcode.schema";
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
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Download, Printer } from "lucide-react";
import { toast } from "sonner";

type FormData = z.infer<typeof createBarcodeSchema>;

interface ModalGerarCodigoProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  onSuccess?: () => void;
}

const barcodeTypes: { value: BarcodeType; label: string; description: string }[] = [
  {
    value: BarcodeType.EAN13,
    label: "EAN-13",
    description: "Código de barras padrão (13 dígitos)",
  },
  {
    value: BarcodeType.CODE128,
    label: "Code-128",
    description: "Código alfanumérico versátil",
  },
  {
    value: BarcodeType.QRCODE,
    label: "QR Code",
    description: "Código bidimensional com informações do produto",
  },
];

export function ModalGerarCodigo({
  open,
  onOpenChange,
  productId,
  onSuccess,
}: ModalGerarCodigoProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [barcodeImage, setBarcodeImage] = useState<string | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(createBarcodeSchema) as any,
    defaultValues: {
      productId,
      type: "EAN13",
      code: undefined,
      isPrimary: false,
    },
  });

  // Gerar imagem do código quando o código for criado
  useEffect(() => {
    if (generatedCode) {
      generateBarcodeImage(generatedCode, form.getValues("type"));
    }
  }, [generatedCode]);

  async function generateBarcodeImage(code: string, type: BarcodeType) {
    setIsGeneratingImage(true);
    try {
      const response = await fetch("/api/barcodes/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, type }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Erro ao gerar imagem");
      }

      setBarcodeImage(result.image);
    } catch (error) {
      console.error("Erro ao gerar imagem:", error);
      toast.error("Erro ao gerar imagem do código");
    } finally {
      setIsGeneratingImage(false);
    }
  }

  async function onSubmit(data: FormData) {
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/products/${productId}/barcodes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error?.message || "Erro ao criar código");
      }

      // Armazenar o código gerado para gerar a imagem
      setGeneratedCode(result.data?.code || result.code);

      toast.success("Código criado com sucesso");
      onSuccess?.();
    } catch (error) {
      console.error("Erro ao criar código:", error);
      toast.error(error instanceof Error ? error.message : "Erro ao criar código");
      setIsSubmitting(false);
    }
  }

  function handleDownloadImage() {
    if (!barcodeImage) return;

    const link = document.createElement("a");
    link.href = barcodeImage;
    link.download = `barcode-${generatedCode}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Imagem baixada com sucesso");
  }

  function handlePrintImage() {
    if (!barcodeImage) return;

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("Não foi possível abrir a janela de impressão");
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Impressão de Código de Barras</title>
          <style>
            body {
              margin: 0;
              padding: 20px;
              display: flex;
              justify-content: center;
              align-items: center;
              min-height: 100vh;
            }
            img {
              max-width: 100%;
              height: auto;
            }
          </style>
        </head>
        <body>
          <img src="${barcodeImage}" alt="Código de Barras" />
          <script>
            window.onload = function() {
              window.print();
              window.onafterprint = function() {
                window.close();
              };
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  }

  function handleClose() {
    form.reset();
    setGeneratedCode(null);
    setBarcodeImage(null);
    setIsSubmitting(false);
    onOpenChange(false);
  }

  const selectedType = form.watch("type");
  const manualCode = form.watch("code");

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Gerar Código de Barras</DialogTitle>
          <DialogDescription>
            {!generatedCode
              ? "Selecione o tipo de código e deixe em branco para gerar automaticamente"
              : "Código gerado com sucesso! Use os botões abaixo para imprimir ou baixar."}
          </DialogDescription>
        </DialogHeader>

        {!generatedCode ? (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de Código</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o tipo" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {barcodeTypes.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          <div>
                            <div className="font-medium">{type.label}</div>
                            <div className="text-xs text-muted-foreground">
                              {type.description}
                            </div>
                          </div>
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
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Código (opcional)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Deixe vazio para gerar automaticamente"
                      {...field}
                      value={field.value || ""}
                    />
                  </FormControl>
                  <FormDescription>
                    {!manualCode
                      ? "Um código será gerado automaticamente"
                      : "Você está inserindo um código manualmente"}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="isPrimary"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>Definir como código primário</FormLabel>
                    <FormDescription>
                      Este será o código padrão usado para este produto
                    </FormDescription>
                  </div>
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={isSubmitting}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Gerar Código
              </Button>
            </DialogFooter>
          </form>
        </Form>
        ) : (
          <div className="space-y-4">
            {/* Preview da imagem */}
            <div className="flex items-center justify-center p-6 bg-white border rounded-lg">
              {isGeneratingImage ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin" />
                  <span>Gerando imagem...</span>
                </div>
              ) : barcodeImage ? (
                <div className="space-y-4">
                  <img
                    src={barcodeImage}
                    alt="Código de Barras"
                    className="max-w-full h-auto"
                  />
                  <div className="text-center text-sm text-muted-foreground">
                    Código: {generatedCode}
                  </div>
                </div>
              ) : (
                <div className="text-muted-foreground">
                  Erro ao gerar imagem
                </div>
              )}
            </div>

            {/* Botões de ação */}
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                className="w-full sm:w-auto"
              >
                Fechar
              </Button>
              <div className="flex gap-2 w-full sm:w-auto">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleDownloadImage}
                  disabled={!barcodeImage || isGeneratingImage}
                  className="flex-1 sm:flex-initial"
                >
                  <Download className="mr-2 h-4 w-4" />
                  Baixar
                </Button>
                <Button
                  type="button"
                  onClick={handlePrintImage}
                  disabled={!barcodeImage || isGeneratingImage}
                  className="flex-1 sm:flex-initial"
                >
                  <Printer className="mr-2 h-4 w-4" />
                  Imprimir
                </Button>
              </div>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
