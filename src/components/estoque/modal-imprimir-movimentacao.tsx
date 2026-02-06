"use client";

import { useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, X } from "lucide-react";
import { ComprovanteMovimentacao } from "./comprovante-movimentacao";
import { StockMovementType } from "@prisma/client";

interface ModalImprimirMovimentacaoProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  movement: {
    id: string;
    type: StockMovementType;
    quantity: number;
    createdAt: string;
    invoiceNumber: string | null;
    reason: string | null;
    notes: string | null;
    product: {
      id: string;
      sku: string;
      name: string;
      type: string;
    };
    supplier: {
      id: string;
      name: string;
    } | null;
    sourceBranch: {
      id: string;
      name: string;
      code: string | null;
    } | null;
    targetBranch: {
      id: string;
      name: string;
      code: string | null;
    } | null;
    createdBy: {
      id: string;
      name: string;
      email: string;
    } | null;
  } | null;
}

export function ModalImprimirMovimentacao({ open, onOpenChange, movement }: ModalImprimirMovimentacaoProps) {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    if (!printRef.current) return;

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Comprovante de Movimentação</title>
          <script src="https://cdn.tailwindcss.com"></script>
          <style>
            @media print {
              body {
                margin: 0;
                padding: 0;
              }
              @page {
                size: A4;
                margin: 0;
              }
            }
          </style>
        </head>
        <body>
          ${printRef.current.innerHTML}
        </body>
      </html>
    `);

    printWindow.document.close();

    // Aguardar o carregamento do Tailwind e então imprimir
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 500);
  };

  if (!movement) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Comprovante de Movimentação</span>
            <div className="flex gap-2">
              <Button onClick={handlePrint} size="sm">
                <Printer className="h-4 w-4 mr-2" />
                Imprimir
              </Button>
            </div>
          </DialogTitle>
          <DialogDescription>
            Visualize e imprima o comprovante da movimentação
          </DialogDescription>
        </DialogHeader>

        <div ref={printRef} className="overflow-auto">
          <ComprovanteMovimentacao movement={movement} />
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4 mr-2" />
            Fechar
          </Button>
          <Button onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" />
            Imprimir
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
