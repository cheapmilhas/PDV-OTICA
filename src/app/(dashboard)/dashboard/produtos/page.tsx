"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search, Package, Plus, Eye } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { ModalDetalhesProduto } from "@/components/produtos/modal-detalhes-produto";

export default function ProdutosPage() {
  const [produtoSelecionado, setProdutoSelecionado] = useState<any>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [produtos, setProdutos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Buscar produtos da API
  useEffect(() => {
    fetch('/api/products')
      .then(res => res.json())
      .then(data => {
        setProdutos(data.products);
        setLoading(false);
      })
      .catch(err => {
        console.error('Erro ao carregar produtos:', err);
        setLoading(false);
      });
  }, []);

  const visualizarProduto = (produto: any) => {
    setProdutoSelecionado(produto);
    setModalOpen(true);
  };

  // Mock data para compatibilidade (será removido quando API estiver completa)
  const mockProdutos = [
    {
      id: "1",
      codigo: "ARM001",
      nome: "Ray-Ban Aviador Clássico RB3025",
      categoria: "ARMACAO",
      marca: "Ray-Ban",
      preco: 899.90,
      custoProduto: 450.00,
      estoque: 15,
      estoqueMinimo: 5,
      status: "active",
      descricao: "Óculos aviador clássico em metal dourado com lentes de proteção UV400. Design atemporal e confortável para uso diário.",
    },
    {
      id: "2",
      codigo: "ARM002",
      nome: "Oakley Holbrook OO9102",
      categoria: "ARMACAO",
      marca: "Oakley",
      preco: 1249.90,
      custoProduto: 625.00,
      estoque: 8,
      estoqueMinimo: 5,
      status: "active",
      descricao: "Armação esportiva em acetato premium com design moderno. Ideal para atividades ao ar livre com proteção e estilo.",
    },
    {
      id: "3",
      codigo: "LEN001",
      nome: "Lente Transitions Gen 8 1.67",
      categoria: "LENTE",
      marca: "Transitions",
      preco: 580.00,
      custoProduto: 290.00,
      estoque: 2,
      estoqueMinimo: 3,
      status: "active",
      descricao: "Lente fotossensível de última geração que escurece rapidamente ao sol e clareia em ambientes internos. Índice 1.67 para lentes mais finas.",
    },
    {
      id: "4",
      codigo: "LEN002",
      nome: "Lente Zeiss Single Vision 1.74",
      categoria: "LENTE",
      marca: "Zeiss",
      preco: 1200.00,
      estoque: 5,
      estoqueMinimo: 3,
      status: "active",
    },
    {
      id: "5",
      codigo: "ARM003",
      nome: "Armação Infantil Flexível Azul",
      categoria: "ARMACAO",
      marca: "Disney",
      preco: 320.00,
      estoque: 12,
      estoqueMinimo: 8,
      status: "active",
    },
    {
      id: "6",
      codigo: "SOL001",
      nome: "Ray-Ban Wayfarer RB2140",
      categoria: "OCULOS_SOL",
      marca: "Ray-Ban",
      preco: 799.90,
      estoque: 20,
      estoqueMinimo: 10,
      status: "active",
    },
    {
      id: "7",
      codigo: "LEN003",
      nome: "Lente Antirreflexo Premium",
      categoria: "LENTE",
      marca: "Essilor",
      preco: 350.00,
      estoque: 30,
      estoqueMinimo: 15,
      status: "active",
    },
    {
      id: "8",
      codigo: "ARM004",
      nome: "Prada VPR 16M Feminino",
      categoria: "ARMACAO",
      marca: "Prada",
      preco: 1890.00,
      estoque: 4,
      estoqueMinimo: 3,
      status: "active",
    },
    {
      id: "9",
      codigo: "SOL002",
      nome: "Oakley Radar EV Path Esportivo",
      categoria: "OCULOS_SOL",
      marca: "Oakley",
      preco: 1499.90,
      estoque: 6,
      estoqueMinimo: 5,
      status: "active",
    },
    {
      id: "10",
      codigo: "LIQ001",
      nome: "Líquido de Limpeza 50ml",
      categoria: "ACESSORIO",
      marca: "Genérico",
      preco: 25.00,
      estoque: 45,
      estoqueMinimo: 20,
      status: "active",
    },
    {
      id: "11",
      codigo: "EST001",
      nome: "Estojo Rígido Premium",
      categoria: "ACESSORIO",
      marca: "Genérico",
      preco: 35.00,
      estoque: 50,
      estoqueMinimo: 25,
      status: "active",
    },
    {
      id: "12",
      codigo: "ARM005",
      nome: "Tommy Hilfiger TH 1770 Masculino",
      categoria: "ARMACAO",
      marca: "Tommy Hilfiger",
      preco: 650.00,
      estoque: 1,
      estoqueMinimo: 5,
      status: "active",
    },
  ];

  const categoriaLabels: Record<string, string> = {
    ARMACAO: "Armação",
    LENTE: "Lente",
    OCULOS_SOL: "Óculos de Sol",
    ACESSORIO: "Acessório",
  };

  const getCategoriaVariant = (categoria: string) => {
    switch (categoria) {
      case "ARMACAO":
        return "default";
      case "LENTE":
        return "secondary";
      case "OCULOS_SOL":
        return "outline";
      case "ACESSORIO":
        return "secondary";
      default:
        return "default";
    }
  };

  const getEstoqueStatus = (estoque: number, estoqueMinimo: number) => {
    if (estoque === 0) return { variant: "destructive" as const, label: "Esgotado" };
    if (estoque <= estoqueMinimo) return { variant: "destructive" as const, label: "Baixo" };
    if (estoque <= estoqueMinimo * 2) return { variant: "default" as const, label: "Médio" };
    return { variant: "secondary" as const, label: "Normal" };
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Produtos</h1>
          <p className="text-muted-foreground">
            Gerencie o catálogo de produtos da ótica
          </p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Novo Produto
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
          <CardDescription>
            Busque e filtre produtos no catálogo
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, código ou marca..."
                className="pl-9"
              />
            </div>
            <Button variant="outline">
              <Package className="mr-2 h-4 w-4" />
              Todas Categorias
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Products Table */}
      <Card>
        <CardHeader>
          <CardTitle>Catálogo de Produtos</CardTitle>
          <CardDescription>
            {produtos.length} produtos cadastrados
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Marca</TableHead>
                <TableHead className="text-right">Preço</TableHead>
                <TableHead className="text-center">Estoque</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {produtos.map((produto) => {
                const estoqueStatus = getEstoqueStatus(produto.estoque, produto.estoqueMinimo);
                return (
                  <TableRow key={produto.id}>
                    <TableCell className="font-mono text-sm">
                      {produto.codigo}
                    </TableCell>
                    <TableCell className="font-medium">{produto.nome}</TableCell>
                    <TableCell>
                      <Badge variant={getCategoriaVariant(produto.categoria)}>
                        {categoriaLabels[produto.categoria]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {produto.marca}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatCurrency(produto.preco)}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span className="font-medium">{produto.estoque}</span>
                        <span className="text-xs text-muted-foreground">
                          min: {produto.estoqueMinimo}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={estoqueStatus.variant}>
                        {estoqueStatus.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => visualizarProduto(produto)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total de Produtos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{produtos.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Armações
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {produtos.filter((p) => p.categoria === "ARMACAO").length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Lentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {produtos.filter((p) => p.categoria === "LENTE").length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-destructive">
              Estoque Baixo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-destructive">
              {produtos.filter((p) => p.estoque <= p.estoqueMinimo).length}
            </p>
          </CardContent>
        </Card>
      </div>

      <ModalDetalhesProduto
        open={modalOpen}
        onOpenChange={setModalOpen}
        produto={produtoSelecionado}
      />
    </div>
  );
}
