"use client";

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
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
import { Search, Plus, Minus, AlertTriangle, Package, Loader2, History, Printer, Barcode } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { ModalEntradaEstoque } from "@/components/estoque/modal-entrada-estoque";
import { ModalSaidaEstoque } from "@/components/estoque/modal-saida-estoque";
import { HistoricoMovimentacoes } from "@/components/estoque/historico-movimentacoes";
import { LeitorCodigoBarras } from "@/components/estoque/leitor-codigo-barras";
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

function EstoquePage() {
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
      const res = await fetch("/api/products?pageSize=10000&status=ativos");
      if (!res.ok) throw new Error("Erro ao buscar produtos");

      const data = await res.json();
      const productsArray = Array.isArray(data.data) ? data.data : [];
      // Ordena por SKU para facilitar conferência
      const sortedProducts = productsArray.sort((a: any, b: any) => a.sku.localeCompare(b.sku));
      setProducts(sortedProducts);
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

  const handlePrint = () => {
    window.print();
  };

  return (
    <>
      <ModalEntradaEstoque
        open={modalEntradaOpen}
        onOpenChange={setModalEntradaOpen}
        produto={produtoSelecionado}
        onSuccess={() => fetchProducts()}
      />
      <ModalSaidaEstoque
        open={modalSaidaOpen}
        onOpenChange={setModalSaidaOpen}
        produto={produtoSelecionado}
        onSuccess={() => fetchProducts()}
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
            <TabsTrigger value="scanner">
              <Barcode className="mr-2 h-4 w-4" />
              Leitor de Código
            </TabsTrigger>
            <TabsTrigger value="estoque">
              <Package className="mr-2 h-4 w-4" />
              Estoque Atual
            </TabsTrigger>
            <TabsTrigger value="historico">
              <History className="mr-2 h-4 w-4" />
              Histórico de Movimentações
            </TabsTrigger>
            <TabsTrigger value="impressao">
              <Printer className="mr-2 h-4 w-4" />
              Imprimir Estoque
            </TabsTrigger>
          </TabsList>

          {/* Tab Leitor de Código */}
          <TabsContent value="scanner" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Leitor de Código de Barras</CardTitle>
                <CardDescription>
                  Escaneie ou digite o código de barras para buscar o produto rapidamente
                </CardDescription>
              </CardHeader>
              <CardContent>
                <LeitorCodigoBarras
                  onProductFound={(product) => {
                    // Quando encontrar um produto, podemos abrir modal de entrada ou mostrar detalhes
                    setProdutoSelecionado(product);
                  }}
                />
              </CardContent>
            </Card>

            {produtoSelecionado && (
              <Card>
                <CardHeader>
                  <CardTitle>Ações Rápidas</CardTitle>
                  <CardDescription>
                    Produto selecionado: {produtoSelecionado.name}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2">
                    <Button onClick={() => abrirModalEntrada(produtoSelecionado)}>
                      <Plus className="mr-2 h-4 w-4" />
                      Entrada de Estoque
                    </Button>
                    <Button variant="outline" onClick={() => abrirModalSaida(produtoSelecionado)}>
                      <Minus className="mr-2 h-4 w-4" />
                      Saída de Estoque
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

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

          {/* Tab Histórico de Movimentações */}
          <TabsContent value="historico" className="space-y-4">
            <HistoricoMovimentacoes />
          </TabsContent>

          {/* Tab Imprimir Estoque */}
          <TabsContent value="impressao" className="space-y-4">
            <Card className="print:hidden">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Relatório de Estoque para Conferência</CardTitle>
                    <CardDescription>
                      Imprima a lista completa do estoque ({products.length} produtos) para conferência física em loja
                    </CardDescription>
                  </div>
                  <Button onClick={handlePrint}>
                    <Printer className="mr-2 h-4 w-4" />
                    Imprimir
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {/* Instruções (não aparecem na impressão) */}
                <div className="p-4 bg-muted rounded-lg">
                  <h4 className="font-semibold mb-2">Instruções para Conferência:</h4>
                  <ul className="text-sm space-y-1 list-disc list-inside">
                    <li>Clique em "Imprimir" para gerar o relatório completo</li>
                    <li>Leve o relatório impresso para o local onde está o estoque físico</li>
                    <li>Conte cada produto fisicamente e anote na coluna "Estoque Físico"</li>
                    <li>Calcule a diferença entre o estoque do sistema e o físico</li>
                    <li>Anote observações importantes (produtos danificados, vencidos, etc.)</li>
                    <li>Após a conferência, faça os ajustes necessários no sistema</li>
                  </ul>
                </div>

                {/* Preview da Tabela */}
                <div className="mt-4">
                  <p className="text-sm text-muted-foreground mb-2">
                    Preview: Primeiros 10 produtos (total: {products.length})
                  </p>
                  <div className="border rounded-lg overflow-hidden">
                    <Table className="text-xs">
                      <TableHeader>
                        <TableRow>
                          <TableHead>#</TableHead>
                          <TableHead>Código/SKU</TableHead>
                          <TableHead>Produto</TableHead>
                          <TableHead className="text-center">Estoque</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {products.slice(0, 10).map((produto, index) => (
                          <TableRow key={produto.id}>
                            <TableCell>{index + 1}</TableCell>
                            <TableCell className="font-mono">{produto.sku}</TableCell>
                            <TableCell>{produto.name}</TableCell>
                            <TableCell className="text-center font-bold">{produto.stockQty}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Conteúdo para Impressão */}
            <div id="print-content" className="hidden print:block">
              {/* Cabeçalho */}
              <div className="mb-4 text-center">
                <h1 className="text-xl font-bold">RELATÓRIO DE ESTOQUE - CONFERÊNCIA FÍSICA</h1>
                <p className="text-xs mt-1">
                  Data: {new Date().toLocaleDateString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </p>
                <p className="text-xs font-semibold mt-1">
                  Total de Produtos: {products.length} | Total de Itens em Estoque: {totalItens}
                </p>
              </div>

              {/* Tabela */}
              <table className="w-full text-[8px] border-collapse">
                <thead>
                  <tr className="bg-gray-200">
                    <th className="border border-black p-0.5 text-left w-[3%]">#</th>
                    <th className="border border-black p-0.5 text-left w-[10%]">SKU</th>
                    <th className="border border-black p-0.5 text-left w-[35%]">Produto</th>
                    <th className="border border-black p-0.5 text-center w-[8%]">Estoque<br/>Sistema</th>
                    <th className="border border-black p-0.5 text-center w-[10%]">Estoque<br/>Físico</th>
                    <th className="border border-black p-0.5 text-center w-[8%]">Diferença</th>
                    <th className="border border-black p-0.5 text-left w-[26%]">Observações</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((produto, index) => (
                    <tr key={produto.id}>
                      <td className="border border-black p-0.5 text-center">{index + 1}</td>
                      <td className="border border-black p-0.5 font-mono text-[7px]">{produto.sku}</td>
                      <td className="border border-black p-0.5">
                        <div className="font-semibold">{produto.name}</div>
                        {produto.category && (
                          <div className="text-[7px] text-gray-600">{produto.category.name}</div>
                        )}
                      </td>
                      <td className="border border-black p-0.5 text-center font-bold">{produto.stockQty}</td>
                      <td className="border border-black p-0.5 bg-gray-100"></td>
                      <td className="border border-black p-0.5 bg-gray-100"></td>
                      <td className="border border-black p-0.5"></td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Rodapé */}
              <div className="mt-4 text-[9px]">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="font-bold mb-1">Responsável pela Conferência:</p>
                    <p className="border-b border-black pb-0.5">____________________________</p>
                  </div>
                  <div>
                    <p className="font-bold mb-1">Data da Conferência:</p>
                    <p className="border-b border-black pb-0.5">____________________________</p>
                  </div>
                  <div>
                    <p className="font-bold mb-1">Assinatura:</p>
                    <p className="border-b border-black pb-0.5">____________________________</p>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Estilos para Impressão */}
      <style jsx global>{`
        @media print {
          /* Esconde tudo menos o conteúdo de impressão */
          body * {
            visibility: hidden;
          }

          #print-content,
          #print-content * {
            visibility: visible;
          }

          #print-content {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            padding: 10px;
          }

          /* Remove margens e paddings extras */
          @page {
            size: A4;
            margin: 0.5cm;
          }

          /* Garante quebra de página correta */
          table {
            page-break-inside: auto;
          }

          tr {
            page-break-inside: avoid;
            page-break-after: auto;
          }

          /* Remove backgrounds coloridos na impressão */
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>
    </>
  );
}

export default function Page() {
  return (
    <ProtectedRoute permission="stock.access">
      <EstoquePage />
    </ProtectedRoute>
  );
}
