"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@/lib/utils";
import { Package, Tag, Barcode, TrendingUp, AlertTriangle } from "lucide-react";

interface Produto {
  id: string;
  codigo: string;
  nome: string;
  categoria: string;
  marca: string;
  preco: number;
  estoque: number;
  estoqueMinimo: number;
  status: string;
  descricao?: string;
  custoProduto?: number;
}

interface ModalDetalhesProdutoProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  produto: Produto | null;
}

const categoriaLabels: Record<string, string> = {
  ARMACAO: "Armação",
  LENTE: "Lente",
  OCULOS_SOL: "Óculos de Sol",
  ACESSORIO: "Acessório",
};

export function ModalDetalhesProduto({ open, onOpenChange, produto }: ModalDetalhesProdutoProps) {
  if (!produto) return null;

  const margemLucro = produto.custoProduto
    ? ((produto.preco - produto.custoProduto) / produto.custoProduto * 100).toFixed(1)
    : null;

  const estoqueStatus = produto.estoque <= produto.estoqueMinimo ? "baixo" : "normal";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Detalhes do Produto
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Header do Produto */}
          <div>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="text-lg font-semibold">{produto.nome}</h3>
                <p className="text-sm text-muted-foreground">{produto.marca}</p>
              </div>
              <Badge variant={produto.status === "active" ? "default" : "secondary"}>
                {produto.status === "active" ? "Ativo" : "Inativo"}
              </Badge>
            </div>
          </div>

          <Separator />

          {/* Informações Básicas */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Barcode className="h-4 w-4" />
                <span>Código</span>
              </div>
              <p className="font-mono text-lg font-semibold">{produto.codigo}</p>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Tag className="h-4 w-4" />
                <span>Categoria</span>
              </div>
              <Badge variant="outline" className="text-sm">
                {categoriaLabels[produto.categoria] || produto.categoria}
              </Badge>
            </div>
          </div>

          <Separator />

          {/* Preços */}
          <div className="rounded-lg border bg-muted/50 p-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Preço de Venda</p>
                <p className="text-2xl font-bold text-primary">{formatCurrency(produto.preco)}</p>
              </div>
              {produto.custoProduto && (
                <div>
                  <p className="text-sm text-muted-foreground">Custo</p>
                  <p className="text-xl font-semibold">{formatCurrency(produto.custoProduto)}</p>
                </div>
              )}
            </div>
            {margemLucro && (
              <div className="mt-3 flex items-center gap-2 text-sm">
                <TrendingUp className="h-4 w-4 text-green-600" />
                <span className="text-muted-foreground">Margem de lucro:</span>
                <span className="font-semibold text-green-600">{margemLucro}%</span>
              </div>
            )}
          </div>

          <Separator />

          {/* Estoque */}
          <div className="rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Estoque Atual</p>
                <p className="text-3xl font-bold">
                  {produto.estoque}
                  <span className="ml-2 text-sm font-normal text-muted-foreground">unidades</span>
                </p>
              </div>
              {estoqueStatus === "baixo" && (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Estoque Baixo
                </Badge>
              )}
            </div>
            <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
              <span>Estoque mínimo:</span>
              <span className="font-semibold">{produto.estoqueMinimo} unidades</span>
            </div>

            {/* Barra de progresso visual */}
            <div className="mt-3">
              <div className="h-2 w-full rounded-full bg-muted">
                <div
                  className={`h-2 rounded-full transition-all ${
                    estoqueStatus === "baixo" ? "bg-destructive" : "bg-green-500"
                  }`}
                  style={{
                    width: `${Math.min((produto.estoque / (produto.estoqueMinimo * 3)) * 100, 100)}%`,
                  }}
                />
              </div>
              <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                <span>0</span>
                <span>Mínimo: {produto.estoqueMinimo}</span>
                <span>Ideal: {produto.estoqueMinimo * 3}</span>
              </div>
            </div>
          </div>

          {/* Descrição */}
          {produto.descricao && (
            <>
              <Separator />
              <div>
                <p className="text-sm font-medium">Descrição</p>
                <p className="mt-2 text-sm text-muted-foreground">{produto.descricao}</p>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
