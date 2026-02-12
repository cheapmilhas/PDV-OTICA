"use client";

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
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
  Loader2,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { ModalFinalizarVenda } from "@/components/pdv/modal-finalizar-venda";
import { ModalNovoCliente } from "@/components/pdv/modal-novo-cliente";
import toast from "react-hot-toast";

interface Product {
  id: string;
  sku: string;
  name: string;
  salePrice: number;
  stockQty: number;
}

interface CartItem extends Product {
  quantity: number;
}

interface Customer {
  id: string;
  name: string;
  phone?: string;
  cpf?: string;
}

function PDVPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [carrinho, setCarrinho] = useState<CartItem[]>([]);
  const [modalVendaOpen, setModalVendaOpen] = useState(false);
  const [modalClienteOpen, setModalClienteOpen] = useState(false);
  const [buscaProduto, setBuscaProduto] = useState("");
  const [buscaCliente, setBuscaCliente] = useState("");
  const [clienteSelecionado, setClienteSelecionado] = useState<Customer | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [finalizingVenda, setFinalizingVenda] = useState(false);

  // Carregar produtos disponíveis
  useEffect(() => {
    const loadProducts = async () => {
      setLoadingProducts(true);
      try {
        const params = new URLSearchParams({
          status: "ativos",
          pageSize: "50",
          inStock: "true",
        });

        if (buscaProduto) {
          params.set("search", buscaProduto);
        }

        const res = await fetch(`/api/products?${params}`);
        if (!res.ok) throw new Error("Erro ao carregar produtos");

        const data = await res.json();
        setProducts(data.data || []);
      } catch (error) {
        console.error("Erro ao carregar produtos:", error);
        toast.error("Erro ao carregar produtos");
      } finally {
        setLoadingProducts(false);
      }
    };

    const debounce = setTimeout(() => {
      loadProducts();
    }, 300);

    return () => clearTimeout(debounce);
  }, [buscaProduto]);

  // Carregar clientes
  useEffect(() => {
    const loadCustomers = async () => {
      if (!buscaCliente || buscaCliente.length < 2) {
        setCustomers([]);
        return;
      }

      setLoadingCustomers(true);
      try {
        const params = new URLSearchParams({
          search: buscaCliente,
          pageSize: "5",
        });

        const res = await fetch(`/api/customers?${params}`);
        if (!res.ok) throw new Error("Erro ao carregar clientes");

        const data = await res.json();
        setCustomers(data.data || []);
      } catch (error) {
        console.error("Erro ao carregar clientes:", error);
      } finally {
        setLoadingCustomers(false);
      }
    };

    const debounce = setTimeout(() => {
      loadCustomers();
    }, 300);

    return () => clearTimeout(debounce);
  }, [buscaCliente]);

  const produtosDisponiveis = products.slice(0, 6);

  const adicionarProduto = (produto: Product) => {
    const itemExistente = carrinho.find((item) => item.id === produto.id);

    if (itemExistente) {
      // Verificar se tem estoque disponível
      if (itemExistente.quantity >= produto.stockQty) {
        toast.error(`Estoque insuficiente. Disponível: ${produto.stockQty}`);
        return;
      }

      setCarrinho(
        carrinho.map((item) =>
          item.id === produto.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      );
      toast.success(`+1 ${produto.name}`);
    } else {
      if (produto.stockQty < 1) {
        toast.error("Produto sem estoque");
        return;
      }

      setCarrinho([...carrinho, { ...produto, quantity: 1 }]);
      toast.success(`${produto.name} adicionado ao carrinho`);
    }
  };

  const removerProduto = (produtoId: string) => {
    const produto = carrinho.find((item) => item.id === produtoId);
    setCarrinho(carrinho.filter((item) => item.id !== produtoId));
    if (produto) {
      toast.success(`${produto.name} removido`);
    }
  };

  const alterarQuantidade = (produtoId: string, delta: number) => {
    setCarrinho(
      carrinho.map((item) => {
        if (item.id === produtoId) {
          const novaQuantidade = Math.max(1, item.quantity + delta);

          // Verificar estoque
          if (novaQuantidade > item.stockQty) {
            toast.error(`Estoque insuficiente. Disponível: ${item.stockQty}`);
            return item;
          }

          return { ...item, quantity: novaQuantidade };
        }
        return item;
      })
    );
  };

  const calcularSubtotal = () => {
    return carrinho.reduce((acc, item) => acc + item.salePrice * item.quantity, 0);
  };

  const subtotal = calcularSubtotal();
  const desconto = 0;
  const total = subtotal - desconto;
  const totalItens = carrinho.reduce((acc, item) => acc + item.quantity, 0);

  const handleConfirmarVenda = async (payments: any[]) => {
    if (carrinho.length === 0) {
      toast.error("Carrinho vazio");
      return;
    }

    setFinalizingVenda(true);

    try {
      // Verificar sessão
      if (!session?.user?.branchId) {
        toast.error("Sessão inválida. Faça login novamente.");
        return;
      }

      // Preparar dados da venda
      const saleData = {
        customerId: clienteSelecionado?.id || null,
        branchId: session.user.branchId,
        items: carrinho.map((item) => ({
          productId: item.id,
          qty: item.quantity,
          unitPrice: item.salePrice,
          discount: 0,
        })),
        payments: payments.map((payment) => ({
          method: payment.method,
          amount: payment.amount,
          installments: payment.installments || 1,
          installmentConfig: payment.installmentConfig,
        })),
        discount: desconto,
        notes: clienteSelecionado ? `Cliente: ${clienteSelecionado.name}` : "Venda sem cliente",
      };

      console.log("Dados enviados para API:", JSON.stringify(saleData, null, 2));

      const res = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(saleData),
      });

      if (!res.ok) {
        const error = await res.json();
        console.error("Erro detalhado:", error);

        // Se houver detalhes de validação, mostra
        if (error.error?.details) {
          const details = error.error.details.map((d: any) => `${d.path.join(".")}: ${d.message}`).join(", ");
          throw new Error(`Erro de validação: ${details}`);
        }

        throw new Error(error.error?.message || error.message || "Erro ao finalizar venda");
      }

      const data = await res.json();
      const vendaId = data.data.id;

      // Verificar se tem crediário e oferecer download do carnê
      const hasCrediario = payments.some((p) => p.method === "STORE_CREDIT");
      if (hasCrediario) {
        const downloadCarne = confirm("Venda parcelada! Deseja baixar o carnê de pagamento?");
        if (downloadCarne) {
          try {
            const carneRes = await fetch(`/api/sales/${vendaId}/carne`);
            if (carneRes.ok) {
              const carneBlob = await carneRes.blob();
              const url = window.URL.createObjectURL(carneBlob);
              const link = document.createElement("a");
              link.href = url;
              link.download = `carne_venda_${vendaId.substring(0, 8)}.pdf`;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              window.URL.revokeObjectURL(url);
              toast.success("Carnê baixado com sucesso!");
            } else {
              toast.error("Erro ao gerar carnê. Você pode baixá-lo depois na tela de vendas.");
            }
          } catch (err) {
            console.error("Erro ao baixar carnê:", err);
            toast.error("Erro ao baixar carnê. Você pode baixá-lo depois na tela de vendas.");
          }
        }
      }

      // Limpar carrinho e fechar modal
      setCarrinho([]);
      setClienteSelecionado(null);
      setModalVendaOpen(false);

      // Redirecionar para detalhes da venda
      toast.success("Venda finalizada com sucesso! Redirecionando...");
      router.push(`/dashboard/vendas/${vendaId}/detalhes`);
    } catch (error: any) {
      console.error("Erro ao finalizar venda:", error);
      toast.error(error.message || "Erro ao finalizar venda");
    } finally {
      setFinalizingVenda(false);
    }
  };

  return (
    <>
      <ModalFinalizarVenda
        open={modalVendaOpen}
        onOpenChange={setModalVendaOpen}
        total={total}
        onConfirm={handleConfirmarVenda}
        loading={finalizingVenda}
      />
      <ModalNovoCliente
        open={modalClienteOpen}
        onOpenChange={setModalClienteOpen}
        onClienteCriado={(cliente) => {
          setClienteSelecionado(cliente);
          toast.success(`${cliente.name} selecionado`);
        }}
      />
    <div className="h-[calc(100vh-120px)] space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">PDV - Ponto de Venda</h1>
          <p className="text-muted-foreground">
            Finalize vendas de forma rápida e eficiente
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline" className="text-lg px-4 py-2">
            {products.length} produtos
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
                Digite o SKU, nome ou passe o leitor de código de barras
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Barcode className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="SKU ou nome do produto..."
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
              {loadingProducts && (
                <div className="flex items-center gap-2 mt-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm text-muted-foreground">Buscando produtos...</span>
                </div>
              )}
              {!loadingProducts && buscaProduto && produtosDisponiveis.length === 0 && (
                <p className="mt-2 text-sm text-muted-foreground">
                  Nenhum produto encontrado
                </p>
              )}
            </CardContent>
          </Card>

          {/* Produtos Rápidos */}
          <Card>
            <CardHeader>
              <CardTitle>
                {buscaProduto ? "Resultados da Busca" : "Produtos Disponíveis"}
              </CardTitle>
              <CardDescription>
                Clique para adicionar ao carrinho
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingProducts ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : produtosDisponiveis.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                  <Package className="mb-2 h-12 w-12 opacity-20" />
                  <p>Nenhum produto disponível</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {produtosDisponiveis.map((produto) => (
                    <Button
                      key={produto.id}
                      variant="outline"
                      className="h-auto flex-col items-start gap-2 p-4"
                      onClick={() => adicionarProduto(produto)}
                      disabled={produto.stockQty === 0}
                    >
                      <div className="flex w-full items-center justify-between">
                        <span className="font-mono text-xs text-muted-foreground">
                          {produto.sku}
                        </span>
                        <Badge variant={produto.stockQty > 10 ? "secondary" : produto.stockQty > 0 ? "outline" : "destructive"}>
                          {produto.stockQty}
                        </Badge>
                      </div>
                      <p className="line-clamp-2 text-left text-sm font-medium">
                        {produto.name}
                      </p>
                      <p className="text-lg font-bold">
                        {formatCurrency(produto.salePrice)}
                      </p>
                    </Button>
                  ))}
                </div>
              )}
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
                    <p className="font-medium">{clienteSelecionado.name}</p>
                    {clienteSelecionado.phone && (
                      <p className="text-sm text-muted-foreground">{clienteSelecionado.phone}</p>
                    )}
                    {clienteSelecionado.cpf && (
                      <p className="text-sm text-muted-foreground">CPF: {clienteSelecionado.cpf}</p>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      setClienteSelecionado(null);
                      setBuscaCliente("");
                    }}
                  >
                    Remover Cliente
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Buscar cliente..."
                      className="pl-9"
                      value={buscaCliente}
                      onChange={(e) => setBuscaCliente(e.target.value)}
                    />
                  </div>

                  {loadingCustomers && (
                    <div className="flex items-center gap-2 py-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm text-muted-foreground">Buscando...</span>
                    </div>
                  )}

                  {!loadingCustomers && customers.length > 0 && (
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {customers.map((cliente) => (
                        <Button
                          key={cliente.id}
                          variant="ghost"
                          className="w-full justify-start h-auto py-2"
                          onClick={() => {
                            setClienteSelecionado(cliente);
                            setBuscaCliente("");
                            toast.success(`${cliente.name} selecionado`);
                          }}
                        >
                          <div className="text-left">
                            <p className="font-medium text-sm">{cliente.name}</p>
                            {cliente.phone && (
                              <p className="text-xs text-muted-foreground">{cliente.phone}</p>
                            )}
                          </div>
                        </Button>
                      ))}
                    </div>
                  )}

                  {!loadingCustomers && buscaCliente.length >= 2 && customers.length === 0 && (
                    <div className="text-center py-3 text-sm text-muted-foreground">
                      <p className="mb-2">Cliente não encontrado</p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setModalClienteOpen(true)}
                      >
                        <Plus className="mr-2 h-3 w-3" />
                        Cadastrar Novo Cliente
                      </Button>
                    </div>
                  )}

                  {buscaCliente.length < 2 && (
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => setModalClienteOpen(true)}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Adicionar Cliente (F3)
                    </Button>
                  )}
                </div>
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
                            {item.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatCurrency(item.salePrice)} cada
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Estoque: {item.stockQty}
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
                              {item.quantity}
                            </span>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => alterarQuantidade(item.id, 1)}
                              disabled={item.quantity >= item.stockQty}
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
                            {formatCurrency(item.salePrice * item.quantity)}
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
                  Finalizar Venda (F12)
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

export default function Page() {
  return (
    <ProtectedRoute permission="sales.create">
      <PDVPage />
    </ProtectedRoute>
  );
}
