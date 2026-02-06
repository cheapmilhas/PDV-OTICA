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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Search, Plus, Minus, AlertTriangle, Package, Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { ModalEntradaEstoque } from "@/components/estoque/modal-entrada-estoque";
import { ModalSaidaEstoque } from "@/components/estoque/modal-saida-estoque";
import { EmptyState } from "@/components/shared/empty-state";
import toast from "react-hot-toast";

interface Product {
  id: string;
  sku: string;
  name: string;
  stockQty: number;
  stockMin: number;
  stockMax: number | null;
  costPrice: number;
  salePrice: number;
  category: {
    id: string;
    name: string;
  } | null;
  supplier: {
    id: string;
    name: string;
  } | null;
  active: boolean;
  updatedAt: string;
}

export default function EstoquePage() {
  const [modalEntradaOpen, setModalEntradaOpen] = useState(false);
  const [modalSaidaOpen, setModalSaidaOpen] = useState(false);
  const [produtoSelecionado, setProdutoSelecionado] = useState<any>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Buscar produtos da API
  useEffect(() => {
    fetchProducts();
  }, []);

  async function fetchProducts() {
    setLoading(true);
    try {
      const res = await fetch("/api/products?pageSize=1000&status=ativos");
      if (!res.ok) throw new Error("Erro ao buscar produtos");

      const data = await res.json();
      const productsArray = Array.isArray(data.data) ? data.data : [];
      setProducts(productsArray);
    } catch (error: any) {
      console.error("Erro ao carregar produtos:", error);
      toast.error("Erro ao carregar produtos");
    } finally {
      setLoading(false);
    }
  }

  const getStatusEstoque = (estoque: number, estoqueMinimo: number) => {
    if (estoque === 0) return { label: "Sem estoque", variant: "destructive" as const, color: "text-red-600" };
    if (estoque <= estoqueMinimo) return { label: "Estoque baixo", variant: "destructive" as const, color: "text-orange-600" };
    return { label: "Estoque OK", variant: "secondary" as const, color: "text-green-600" };
  };

  const calcularProgressoEstoque = (estoque: number, estoqueMaximo: number) => {
    return (estoque / estoqueMaximo) * 100;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString("pt-BR");
  };

  // Filtrar produtos por busca
  const filteredProducts = products.filter((product) => {
    const searchLower = search.toLowerCase();
    return (
      product.name.toLowerCase().includes(searchLower) ||
      product.sku.toLowerCase().includes(searchLower) ||
      product.category?.name.toLowerCase().includes(searchLower) ||
      product.supplier?.name.toLowerCase().includes(searchLower)
    );
  });

  // Cálculos baseados nos produtos filtrados
  const produtosBaixoEstoque = filteredProducts.filter(p => p.stockQty <= p.stockMin);
  const produtosSemEstoque = filteredProducts.filter(p => p.stockQty === 0);
  const valorTotalEstoque = filteredProducts.reduce((acc, p) => acc + (Number(p.costPrice) * p.stockQty), 0);
  const totalItens = filteredProducts.reduce((acc, p) => acc + p.stockQty, 0);

  const abrirModalEntrada = (produto?: any) => {
    setProdutoSelecionado(produto || null);
    setModalEntradaOpen(true);
  };

  const abrirModalSaida = (produto?: any) => {
    setProdutoSelecionado(produto || null);
    setModalSaidaOpen(true);
  };

  return (
    <>
      <ModalEntradaEstoque
        open={modalEntradaOpen}
        onOpenChange={setModalEntradaOpen}
        produto={produtoSelecionado}
      />
      <ModalSaidaEstoque
        open={modalSaidaOpen}
        onOpenChange={setModalSaidaOpen}
        produto={produtoSelecionado}
      />

      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Gestão de Estoque</h1>
            <p className="text-muted-foreground">
              Controle de entrada, saída e inventário
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => abrirModalSaida()}>
              <Minus className="mr-2 h-4 w-4" />
              Saída de Estoque
            </Button>
            <Button onClick={() => abrirModalEntrada()}>
              <Plus className="mr-2 h-4 w-4" />
              Entrada de Estoque
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total de Itens
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{totalItens}</p>
              <p className="text-xs text-muted-foreground">
                {filteredProducts.length} produtos
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Valor em Estoque
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-blue-600">
                {formatCurrency(valorTotalEstoque)}
              </p>
              <p className="text-xs text-muted-foreground">
                Custo total
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Estoque Baixo
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-orange-600">
                {produtosBaixoEstoque.length}
              </p>
              <p className="text-xs text-muted-foreground">
                Produtos com estoque mínimo
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Sem Estoque
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-red-600">
                {produtosSemEstoque.length}
              </p>
              <p className="text-xs text-muted-foreground">
                Produtos zerados
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Alertas de Estoque Baixo */}
        {produtosBaixoEstoque.length > 0 && (
          <Card className="border-orange-200 bg-orange-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-orange-900">
                <AlertTriangle className="h-5 w-5" />
                Alertas de Estoque
              </CardTitle>
              <CardDescription className="text-orange-700">
                {produtosBaixoEstoque.length} produtos com estoque baixo ou zerado
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {produtosBaixoEstoque.map((produto) => (
                  <div key={produto.id} className="flex items-center justify-between rounded-lg border border-orange-200 bg-white p-3">
                    <div className="flex-1">
                      <p className="font-medium">{produto.name}</p>
                      <p className="text-sm text-muted-foreground">
                        Código: {produto.sku} • Estoque: {produto.stockQty} / Mínimo: {produto.stockMin}
                      </p>
                    </div>
                    <Button size="sm" onClick={() => abrirModalEntrada(produto)}>
                      Repor Estoque
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tabs */}
        <Tabs defaultValue="estoque" className="space-y-4">
          <TabsList>
            <TabsTrigger value="estoque">
              <Package className="mr-2 h-4 w-4" />
              Estoque Atual
            </TabsTrigger>
            {/* TODO: Implementar tab de Histórico de Movimentações
            <TabsTrigger value="historico">
              <History className="mr-2 h-4 w-4" />
              Histórico de Movimentações
            </TabsTrigger>
            */}
          </TabsList>

          {/* Tab Estoque Atual */}
          <TabsContent value="estoque" className="space-y-4">
            {/* Filtros */}
            <Card>
              <CardHeader>
                <CardTitle>Filtros</CardTitle>
                <CardDescription>
                  Busque produtos no estoque
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Buscar por código, nome, categoria ou fornecedor..."
                      className="pl-9"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Loading */}
            {loading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            )}

            {/* Empty State */}
            {!loading && filteredProducts.length === 0 && (
              <EmptyState
                icon={<Package className="h-12 w-12" />}
                title="Nenhum produto encontrado"
                description={
                  search
                    ? `Não encontramos resultados para "${search}"`
                    : "Comece adicionando produtos no sistema"
                }
              />
            )}

            {/* Tabela de Produtos */}
            {!loading && filteredProducts.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Produtos em Estoque</CardTitle>
                  <CardDescription>
                    {filteredProducts.length} produtos encontrados
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Produto</TableHead>
                        <TableHead>Categoria</TableHead>
                        <TableHead className="text-center">Estoque</TableHead>
                        <TableHead className="text-center">Status</TableHead>
                        <TableHead>Fornecedor</TableHead>
                        <TableHead className="text-right">Custo Unit.</TableHead>
                        <TableHead className="text-right">Valor Total</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredProducts.map((produto) => {
                        const status = getStatusEstoque(produto.stockQty, produto.stockMin);
                        const progresso = calcularProgressoEstoque(
                          produto.stockQty,
                          produto.stockMax || produto.stockMin * 3
                        );

                        return (
                          <TableRow key={produto.id}>
                            <TableCell>
                              <div>
                                <p className="font-medium">{produto.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  SKU: {produto.sku}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">
                                {produto.category?.name || "Sem categoria"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              <div className="space-y-1">
                                <p className="font-bold">{produto.stockQty}</p>
                                <Progress value={progresso} className="h-1 w-20 mx-auto" />
                                <p className="text-xs text-muted-foreground">
                                  Min: {produto.stockMin}
                                  {produto.stockMax && ` / Max: ${produto.stockMax}`}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant={status.variant} className={status.color}>
                                {status.label}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <p className="text-sm">
                                {produto.supplier?.name || "-"}
                              </p>
                            </TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(Number(produto.costPrice))}
                            </TableCell>
                            <TableCell className="text-right font-semibold">
                              {formatCurrency(Number(produto.costPrice) * produto.stockQty)}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => abrirModalEntrada(produto)}
                                >
                                  <Plus className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => abrirModalSaida(produto)}
                                >
                                  <Minus className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Tab Histórico - TODO: Implementar em versão futura
          <TabsContent value="historico" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Histórico de Movimentações</CardTitle>
                <CardDescription>
                  Registro de todas as entradas e saídas
                </CardDescription>
              </CardHeader>
              <CardContent>
                <EmptyState
                  icon={<History className="h-12 w-12" />}
                  title="Em desenvolvimento"
                  description="O histórico de movimentações será implementado em breve"
                />
              </CardContent>
            </Card>
          </TabsContent>
          */}
        </Tabs>
      </div>
    </>
  );
}
