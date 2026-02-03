"use client";

import { useState } from "react";
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
import { Search, Plus, Minus, TrendingUp, TrendingDown, AlertTriangle, Package, History } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { ModalEntradaEstoque } from "@/components/estoque/modal-entrada-estoque";
import { ModalSaidaEstoque } from "@/components/estoque/modal-saida-estoque";

export default function EstoquePage() {
  const [modalEntradaOpen, setModalEntradaOpen] = useState(false);
  const [modalSaidaOpen, setModalSaidaOpen] = useState(false);
  const [produtoSelecionado, setProdutoSelecionado] = useState<any>(null);

  // Mock data - produtos em estoque
  const produtosEstoque = [
    {
      id: "1",
      codigo: "ARM001",
      nome: "Ray-Ban Aviador Clássico RB3025",
      categoria: "Armações",
      estoque: 15,
      estoqueMinimo: 5,
      estoqueMaximo: 30,
      custoUnitario: 450.00,
      precoVenda: 899.90,
      fornecedor: "Ray-Ban do Brasil",
      localizacao: "Prateleira A1",
      ultimaMovimentacao: "2024-01-30",
    },
    {
      id: "2",
      codigo: "ARM002",
      nome: "Oakley Holbrook OO9102",
      categoria: "Armações",
      estoque: 8,
      estoqueMinimo: 5,
      estoqueMaximo: 20,
      custoUnitario: 625.00,
      precoVenda: 1249.90,
      fornecedor: "Oakley Brasil",
      localizacao: "Prateleira A2",
      ultimaMovimentacao: "2024-01-29",
    },
    {
      id: "3",
      codigo: "LEN001",
      nome: "Lente Transitions Gen 8 1.67",
      categoria: "Lentes",
      estoque: 2,
      estoqueMinimo: 3,
      estoqueMaximo: 15,
      custoUnitario: 290.00,
      precoVenda: 580.00,
      fornecedor: "Essilor do Brasil",
      localizacao: "Gaveta L1",
      ultimaMovimentacao: "2024-01-28",
    },
    {
      id: "4",
      codigo: "SOL001",
      nome: "Ray-Ban Wayfarer RB2140",
      categoria: "Óculos de Sol",
      estoque: 20,
      estoqueMinimo: 8,
      estoqueMaximo: 40,
      custoUnitario: 400.00,
      precoVenda: 799.90,
      fornecedor: "Ray-Ban do Brasil",
      localizacao: "Prateleira B1",
      ultimaMovimentacao: "2024-01-31",
    },
    {
      id: "5",
      codigo: "LIQ001",
      nome: "Líquido de Limpeza 50ml",
      categoria: "Acessórios",
      estoque: 45,
      estoqueMinimo: 20,
      estoqueMaximo: 100,
      custoUnitario: 12.50,
      precoVenda: 25.00,
      fornecedor: "Optica Clean",
      localizacao: "Prateleira C3",
      ultimaMovimentacao: "2024-01-30",
    },
    {
      id: "6",
      codigo: "ARM003",
      nome: "Armação Infantil Flexível Azul",
      categoria: "Armações",
      estoque: 12,
      estoqueMinimo: 6,
      estoqueMaximo: 25,
      custoUnitario: 160.00,
      precoVenda: 320.00,
      fornecedor: "Kids Vision",
      localizacao: "Prateleira A3",
      ultimaMovimentacao: "2024-01-27",
    },
    {
      id: "7",
      codigo: "LEN002",
      nome: "Lente Zeiss Single Vision 1.74",
      categoria: "Lentes",
      estoque: 5,
      estoqueMinimo: 3,
      estoqueMaximo: 12,
      custoUnitario: 600.00,
      precoVenda: 1200.00,
      fornecedor: "Zeiss do Brasil",
      localizacao: "Gaveta L2",
      ultimaMovimentacao: "2024-01-29",
    },
    {
      id: "8",
      codigo: "EST001",
      nome: "Estojo Rígido Premium",
      categoria: "Acessórios",
      estoque: 50,
      estoqueMinimo: 25,
      estoqueMaximo: 100,
      custoUnitario: 17.50,
      precoVenda: 35.00,
      fornecedor: "Acessórios Plus",
      localizacao: "Prateleira C1",
      ultimaMovimentacao: "2024-01-30",
    },
    {
      id: "9",
      codigo: "LEN003",
      nome: "Lente Multifocal Varilux",
      categoria: "Lentes",
      estoque: 1,
      estoqueMinimo: 2,
      estoqueMaximo: 10,
      custoUnitario: 450.00,
      precoVenda: 900.00,
      fornecedor: "Essilor do Brasil",
      localizacao: "Gaveta L3",
      ultimaMovimentacao: "2024-01-25",
    },
  ];

  // Histórico de movimentações
  const historicoMovimentacoes = [
    {
      id: "1",
      tipo: "entrada",
      produto: "Ray-Ban Aviador Clássico RB3025",
      codigo: "ARM001",
      quantidade: 10,
      motivo: "Compra de fornecedor",
      usuario: "Carlos Vendedor",
      data: "2024-01-30 14:30",
    },
    {
      id: "2",
      tipo: "saida",
      produto: "Lente Transitions Gen 8 1.67",
      codigo: "LEN001",
      quantidade: 2,
      motivo: "Venda para cliente",
      usuario: "Maria Atendente",
      data: "2024-01-30 11:20",
    },
    {
      id: "3",
      tipo: "entrada",
      produto: "Estojo Rígido Premium",
      codigo: "EST001",
      quantidade: 50,
      motivo: "Reposição de estoque",
      usuario: "João Caixa",
      data: "2024-01-29 16:45",
    },
    {
      id: "4",
      tipo: "saida",
      produto: "Oakley Holbrook OO9102",
      codigo: "ARM002",
      quantidade: 1,
      motivo: "Venda para cliente",
      usuario: "Carlos Vendedor",
      data: "2024-01-29 10:15",
    },
    {
      id: "5",
      tipo: "ajuste",
      produto: "Lente Multifocal Varilux",
      codigo: "LEN003",
      quantidade: -1,
      motivo: "Ajuste de inventário - produto danificado",
      usuario: "Maria Atendente",
      data: "2024-01-28 09:00",
    },
  ];

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

  const produtosBaixoEstoque = produtosEstoque.filter(p => p.estoque <= p.estoqueMinimo);
  const produtosSemEstoque = produtosEstoque.filter(p => p.estoque === 0);
  const valorTotalEstoque = produtosEstoque.reduce((acc, p) => acc + (p.custoUnitario * p.estoque), 0);
  const totalItens = produtosEstoque.reduce((acc, p) => acc + p.estoque, 0);

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
                {produtosEstoque.length} produtos
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
                      <p className="font-medium">{produto.nome}</p>
                      <p className="text-sm text-muted-foreground">
                        Código: {produto.codigo} • Estoque: {produto.estoque} / Mínimo: {produto.estoqueMinimo}
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
            <TabsTrigger value="historico">
              <History className="mr-2 h-4 w-4" />
              Histórico de Movimentações
            </TabsTrigger>
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
                      placeholder="Buscar por código, nome ou categoria..."
                      className="pl-9"
                    />
                  </div>
                  <Button variant="outline">
                    Todas Categorias
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Tabela de Produtos */}
            <Card>
              <CardHeader>
                <CardTitle>Produtos em Estoque</CardTitle>
                <CardDescription>
                  {produtosEstoque.length} produtos cadastrados
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
                      <TableHead>Localização</TableHead>
                      <TableHead className="text-right">Custo Unit.</TableHead>
                      <TableHead className="text-right">Valor Total</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {produtosEstoque.map((produto) => {
                      const status = getStatusEstoque(produto.estoque, produto.estoqueMinimo);
                      const progresso = calcularProgressoEstoque(produto.estoque, produto.estoqueMaximo);

                      return (
                        <TableRow key={produto.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{produto.nome}</p>
                              <p className="text-xs text-muted-foreground">
                                Código: {produto.codigo}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{produto.categoria}</Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="space-y-1">
                              <p className="font-bold">{produto.estoque}</p>
                              <Progress value={progresso} className="h-1 w-20 mx-auto" />
                              <p className="text-xs text-muted-foreground">
                                Min: {produto.estoqueMinimo} / Max: {produto.estoqueMaximo}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant={status.variant} className={status.color}>
                              {status.label}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <p className="text-sm">{produto.localizacao}</p>
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(produto.custoUnitario)}
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {formatCurrency(produto.custoUnitario * produto.estoque)}
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
          </TabsContent>

          {/* Tab Histórico */}
          <TabsContent value="historico" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Histórico de Movimentações</CardTitle>
                <CardDescription>
                  Registro de todas as entradas e saídas
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data/Hora</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Produto</TableHead>
                      <TableHead className="text-center">Quantidade</TableHead>
                      <TableHead>Motivo</TableHead>
                      <TableHead>Usuário</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {historicoMovimentacoes.map((mov) => (
                      <TableRow key={mov.id}>
                        <TableCell>
                          <p className="text-sm font-medium">{formatDate(mov.data)}</p>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              mov.tipo === "entrada"
                                ? "default"
                                : mov.tipo === "saida"
                                ? "secondary"
                                : "outline"
                            }
                          >
                            {mov.tipo === "entrada" && <TrendingUp className="mr-1 h-3 w-3" />}
                            {mov.tipo === "saida" && <TrendingDown className="mr-1 h-3 w-3" />}
                            {mov.tipo === "entrada" ? "Entrada" : mov.tipo === "saida" ? "Saída" : "Ajuste"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{mov.produto}</p>
                            <p className="text-xs text-muted-foreground">
                              Código: {mov.codigo}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={`font-bold ${
                            mov.tipo === "entrada"
                              ? "text-green-600"
                              : mov.quantidade < 0
                              ? "text-red-600"
                              : "text-orange-600"
                          }`}>
                            {mov.tipo === "entrada" && "+"}
                            {mov.quantidade}
                          </span>
                        </TableCell>
                        <TableCell>
                          <p className="text-sm">{mov.motivo}</p>
                        </TableCell>
                        <TableCell>
                          <p className="text-sm">{mov.usuario}</p>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
