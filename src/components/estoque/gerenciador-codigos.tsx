"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { BarcodeType } from "@prisma/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Star, Trash2, Loader2, Sparkles, Eye } from "lucide-react";
import { toast } from "sonner";
import { ModalGerarCodigo } from "./modal-gerar-codigo";

interface Barcode {
  id: string;
  type: BarcodeType;
  code: string;
  isPrimary: boolean;
  createdAt: string;
  createdBy?: {
    name: string;
  };
}

interface GerenciadorCodigosProps {
  productId: string;
}

const barcodeTypeLabels: Record<BarcodeType, string> = {
  EAN13: "EAN-13",
  CODE128: "Code-128",
  QRCODE: "QR Code",
};

export function GerenciadorCodigos({ productId }: GerenciadorCodigosProps) {
  const [barcodes, setBarcodes] = useState<Barcode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [viewBarcode, setViewBarcode] = useState<Barcode | null>(null);
  const [barcodeImage, setBarcodeImage] = useState<string | null>(null);
  const [isLoadingImage, setIsLoadingImage] = useState(false);

  async function loadBarcodes() {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/products/${productId}/barcodes`);
      const result = await response.json();

      if (response.ok) {
        setBarcodes(result.data || []);
      } else {
        toast.error("Erro ao carregar códigos");
      }
    } catch (error) {
      toast.error("Erro ao carregar códigos");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadBarcodes();
  }, [productId]);

  async function handleSetPrimary(barcodeId: string) {
    try {
      const response = await fetch(`/api/products/${productId}/barcodes/${barcodeId}`, {
        method: "PATCH",
      });

      const result = await response.json();

      if (response.ok) {
        toast.success("Código primário definido");
        loadBarcodes();
      } else {
        toast.error(result.error?.message || "Erro ao definir código primário");
      }
    } catch (error) {
      toast.error("Erro ao definir código primário");
    }
  }

  async function handleDelete() {
    if (!deleteId) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/products/${productId}/barcodes/${deleteId}`, {
        method: "DELETE",
      });

      const result = await response.json();

      if (response.ok) {
        toast.success("Código removido");
        loadBarcodes();
      } else {
        toast.error(result.error?.message || "Erro ao remover código");
      }
    } catch (error) {
      toast.error("Erro ao remover código");
    } finally {
      setIsDeleting(false);
      setDeleteId(null);
    }
  }

  async function handleGenerateAll() {
    try {
      const response = await fetch(`/api/products/${productId}/barcodes/generate-all`, {
        method: "POST",
      });

      const result = await response.json();

      if (response.ok) {
        toast.success(result.data.message);
        loadBarcodes();
      } else {
        toast.error(result.error?.message || "Erro ao gerar códigos");
      }
    } catch (error) {
      toast.error("Erro ao gerar códigos");
    }
  }

  async function handleViewBarcode(barcode: Barcode) {
    setViewBarcode(barcode);
    setIsLoadingImage(true);
    setBarcodeImage(null);

    try {
      const response = await fetch("/api/barcodes/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: barcode.code, type: barcode.type }),
      });

      const result = await response.json();

      if (response.ok) {
        setBarcodeImage(result.image);
      } else {
        toast.error("Erro ao gerar imagem do código");
      }
    } catch (error) {
      toast.error("Erro ao gerar imagem do código");
    } finally {
      setIsLoadingImage(false);
    }
  }

  function formatCodeDisplay(code: string, type: BarcodeType): string {
    if (type === BarcodeType.QRCODE) {
      try {
        const data = JSON.parse(code);
        return `SKU: ${data.sku || data.id}`;
      } catch {
        return code.length > 20 ? `${code.substring(0, 20)}...` : code;
      }
    }
    return code;
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Códigos de Barras</CardTitle>
              <CardDescription>
                Gerencie os códigos de barras e QR codes deste produto
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleGenerateAll}>
                <Sparkles className="mr-2 h-4 w-4" />
                Gerar Todos
              </Button>
              <Button size="sm" onClick={() => setModalOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Adicionar Código
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : barcodes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>Nenhum código cadastrado</p>
              <p className="text-sm mt-2">
                Clique em "Adicionar Código" ou "Gerar Todos" para começar
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Código</TableHead>
                    <TableHead>Criado em</TableHead>
                    <TableHead>Criado por</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {barcodes.map((barcode) => (
                    <TableRow key={barcode.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {barcodeTypeLabels[barcode.type]}
                          {barcode.isPrimary && (
                            <Badge variant="default" className="text-xs">
                              <Star className="h-3 w-3 mr-1" />
                              Primário
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono max-w-xs truncate">
                        {formatCodeDisplay(barcode.code, barcode.type)}
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {format(new Date(barcode.createdAt), "dd/MM/yyyy", {
                          locale: ptBR,
                        })}
                      </TableCell>
                      <TableCell className="text-sm">
                        {barcode.createdBy?.name || "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewBarcode(barcode)}
                            title="Ver código"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {!barcode.isPrimary && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleSetPrimary(barcode.id)}
                              title="Definir como primário"
                            >
                              <Star className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteId(barcode.id)}
                            title="Remover"
                          >
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <ModalGerarCodigo
        open={modalOpen}
        onOpenChange={setModalOpen}
        productId={productId}
        onSuccess={loadBarcodes}
      />

      <Dialog open={!!viewBarcode} onOpenChange={() => setViewBarcode(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Visualizar Código</DialogTitle>
            <DialogDescription>
              {viewBarcode && barcodeTypeLabels[viewBarcode.type]}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Imagem do código */}
            <div className="flex items-center justify-center p-6 bg-white border rounded-lg min-h-[200px]">
              {isLoadingImage ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin" />
                  <span>Gerando imagem...</span>
                </div>
              ) : barcodeImage ? (
                <img
                  src={barcodeImage}
                  alt="Código de Barras"
                  className="max-w-full h-auto"
                />
              ) : (
                <div className="text-muted-foreground">
                  Erro ao gerar imagem
                </div>
              )}
            </div>

            {/* Código em texto */}
            <div className="space-y-2">
              <div className="text-sm font-medium">Código:</div>
              <div className="p-3 bg-muted rounded-md font-mono text-sm break-all">
                {viewBarcode?.code}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover código?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O código será permanentemente removido.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isDeleting}>
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
