"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Search,
  Barcode,
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  CreditCard,
  DollarSign,
  User,
  Package,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { ModalFinalizarVenda } from "@/components/pdv/modal-finalizar-venda";
import { ModalNovoCliente } from "@/components/pdv/modal-novo-cliente";
import { useToast } from "@/hooks/use-toast";

export default function PDVPage() {
  const [carrinho, setCarrinho] = useState<any[]>([]);
  const [modalVendaOpen, setModalVendaOpen] = useState(false);
  const [modalClienteOpen, setModalClienteOpen] = useState(false);
  const [buscaProduto, setBuscaProduto] = useState("");
  const [clienteSelecionado, setClienteSelecionado] = useState<any>(null);
  const { toast } = useToast();

  // Mock produtos disponíveis - lista completa
  const todosOsProdutos = [
    {
      id: "1",
      codigo: "ARM001",
      nome: "Ray-Ban Aviador Clássico RB3025",
      preco: 899.90,
      estoque: 15,
    },
    {
      id: "2",
      codigo: "ARM002",
      nome: "Oakley Holbrook OO9102",
      preco: 1249.90,
      estoque: 8,
    },
    {
      id: "3",
      codigo: "LEN001",
      nome: "Lente Transitions Gen 8 1.67",
      preco: 580.00,
      estoque: 2,
    },
    {
      id: "4",
      codigo: "SOL001",
      nome: "Ray-Ban Wayfarer RB2140",
      preco: 799.90,
      estoque: 20,
    },
    {
      id: "5",
      codigo: "LIQ001",
      nome: "Líquido de Limpeza 50ml",
      preco: 25.00,
      estoque: 45,
    },
    {
      id: "6",
      codigo: "ARM003",
      nome: "Armação Infantil Flexível Azul",
      preco: 320.00,
      estoque: 12,
    },
    {
      id: "7",
      codigo: "LEN002",
      nome: "Lente Zeiss Single Vision 1.74",
      preco: 1200.00,
      estoque: 5,
    },
    {
      id: "8",
      codigo: "EST001",
      nome: "Estojo Rígido Premium",
      preco: 35.00,
      estoque: 50,
    },
  ];

  // Filtrar produtos com base na busca
  const produtosDisponiveis = buscaProduto
    ? todosOsProdutos.filter(
        (p) =>
          p.codigo.toLowerCase().includes(buscaProduto.toLowerCase()) ||
          p.nome.toLowerCase().includes(buscaProduto.toLowerCase())
      ).slice(0, 6)
    : todosOsProdutos.slice(0, 5);

  const adicionarProduto = (produto: any) => {
    const itemExistente = carrinho.find((item) => item.id === produto.id);

    if (itemExistente) {
      setCarrinho(
        carrinho.map((item) =>
          item.id === produto.id
            ? { ...item, quantidade: item.quantidade + 1 }
            : item
        )
      );
    } else {
      setCarrinho([...carrinho, { ...produto, quantidade: 1 }]);
    }
  };

  const removerProduto = (produtoId: string) => {
    setCarrinho(carrinho.filter((item) => item.id !== produtoId));
  };

  const alterarQuantidade = (produtoId: string, delta: number) => {
    setCarrinho(
      carrinho.map((item) => {
        if (item.id === produtoId) {
          const novaQuantidade = Math.max(1, item.quantidade + delta);
          return { ...item, quantidade: novaQuantidade };
        }
        return item;
      })
    );
  };

  const calcularSubtotal = () => {
    return carrinho.reduce((acc, item) => acc + item.preco * item.quantidade, 0);
  };

  const subtotal = calcularSubtotal();
  const desconto = 0;
  const total = subtotal - desconto;
  const totalItens = carrinho.reduce((acc, item) => acc + item.quantidade, 0);

  const handleConfirmarVenda = (payments: any[]) => {
    // Aqui seria a integração com o backend
    toast({
      title: "Venda Finalizada!",
      description: `Venda de ${formatCurrency(total)} finalizada com sucesso.`,
    });

    setCarrinho([]);
    setModalVendaOpen(false);
  };

  return (
    <>
      <ModalFinalizarVenda
        open={modalVendaOpen}
        onOpenChange={setModalVendaOpen}
        total={total}
        onConfirm={handleConfirmarVenda}
      />
      <ModalNovoCliente
        open={modalClienteOpen}
        onOpenChange={setModalClienteOpen}
        onClienteCriado={(cliente) => {
          setClienteSelecionado(cliente);
          toast({
            title: "Cliente selecionado!",
            description: `${cliente.nome} foi adicionado à venda.`,
          });
        }}
      />
    <div className="h-[calc(100vh-120px)] space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">PDV - Ponto de Venda</h1>
          <p className="text-muted-foreground">
            Finalize vendas e gere ordens de serviço
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline" className="text-lg px-4 py-2">
            Caixa Aberto
          </Badge>
          <Badge variant="secondary" className="text-lg px-4 py-2">
            F2 - Atalho
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Produtos e Busca - 2 colunas */}
        <div className="space-y-4 lg:col-span-2">
          {/* Busca de Produtos */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5" />
                Buscar Produto
              </CardTitle>
              <CardDescription>
                Digite o código, nome ou passe o leitor de código de barras
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Barcode className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Código ou nome do produto..."
                    className="pl-9"
                    value={buscaProduto}
                    onChange={(e) => setBuscaProduto(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && produtosDisponiveis.length > 0) {
                        adicionarProduto(produtosDisponiveis[0]);
                        setBuscaProduto("");
                      }
                    }}
                  />
                </div>
                {buscaProduto && (
                  <Button variant="outline" onClick={() => setBuscaProduto("")}>
                    Limpar
                  </Button>
                )}
              </div>
              {buscaProduto && produtosDisponiveis.length === 0 && (
                <p className="mt-2 text-sm text-muted-foreground">
                  Nenhum produto encontrado
                </p>
              )}
            </CardContent>
          </Card>

          {/* Produtos Rápidos */}
          <Card>
            <CardHeader>
              <CardTitle>Produtos Rápidos</CardTitle>
              <CardDescription>
                Clique para adicionar ao carrinho
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2">
                {produtosDisponiveis.map((produto) => (
                  <Button
                    key={produto.id}
                    variant="outline"
                    className="h-auto flex-col items-start gap-2 p-4"
                    onClick={() => adicionarProduto(produto)}
                  >
                    <div className="flex w-full items-center justify-between">
                      <span className="font-mono text-xs text-muted-foreground">
                        {produto.codigo}
                      </span>
                      <Badge variant="secondary">{produto.estoque}</Badge>
                    </div>
                    <p className="line-clamp-2 text-left text-sm font-medium">
                      {produto.nome}
                    </p>
                    <p className="text-lg font-bold">
                      {formatCurrency(produto.preco)}
                    </p>
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Carrinho - 1 coluna */}
        <div className="space-y-4">
          {/* Informações do Cliente */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <User className="h-4 w-4" />
                Cliente
              </CardTitle>
            </CardHeader>
            <CardContent>
              {clienteSelecionado ? (
                <div className="space-y-2">
                  <div className="rounded-lg border bg-muted/50 p-3">
                    <p className="font-medium">{clienteSelecionado.nome}</p>
                    <p className="text-sm text-muted-foreground">{clienteSelecionado.telefone}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => setClienteSelecionado(null)}
                  >
                    Remover Cliente
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setModalClienteOpen(true)}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Adicionar Cliente (F3)
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Carrinho */}
          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5" />
                Carrinho ({totalItens})
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1">
              {carrinho.length === 0 ? (
                <div className="flex h-40 flex-col items-center justify-center text-center text-muted-foreground">
                  <Package className="mb-2 h-12 w-12 opacity-20" />
                  <p>Carrinho vazio</p>
                  <p className="text-sm">Adicione produtos para iniciar a venda</p>
                </div>
              ) : (
                <ScrollArea className="h-64">
                  <div className="space-y-3">
                    {carrinho.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-start gap-2 rounded-lg border p-3"
                      >
                        <div className="flex-1">
                          <p className="text-sm font-medium line-clamp-2">
                            {item.nome}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatCurrency(item.preco)} cada
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <div className="flex items-center gap-1">
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => alterarQuantidade(item.id, -1)}
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                            <span className="w-8 text-center text-sm font-medium">
                              {item.quantidade}
                            </span>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => alterarQuantidade(item.id, 1)}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-destructive"
                              onClick={() => removerProduto(item.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                          <p className="text-sm font-bold">
                            {formatCurrency(item.preco * item.quantidade)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>

          {/* Resumo e Finalização */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Resumo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatCurrency(subtotal)}</span>
                </div>
                {desconto > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Desconto</span>
                    <span className="text-green-600">
                      -{formatCurrency(desconto)}
                    </span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between text-lg font-bold">
                  <span>Total</span>
                  <span>{formatCurrency(total)}</span>
                </div>
              </div>

              <div className="space-y-2">
                <Button
                  className="w-full"
                  size="lg"
                  disabled={carrinho.length === 0}
                  onClick={() => setModalVendaOpen(true)}
                >
                  <CreditCard className="mr-2 h-4 w-4" />
                  Finalizar Venda
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={carrinho.length === 0}
                >
                  <DollarSign className="mr-2 h-4 w-4" />
                  Gerar Orçamento
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
    </>
  );
}
