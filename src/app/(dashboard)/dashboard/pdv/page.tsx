"use client";

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { useState, useEffect, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  Tag,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { ModalFinalizarVenda } from "@/components/pdv/modal-finalizar-venda";
import { ModalNovoCliente } from "@/components/pdv/modal-novo-cliente";
import { useBranchContext } from "@/hooks/use-branch-context";
import toast from "react-hot-toast";

interface Product {
  id: string;
  sku: string;
  name: string;
  salePrice: number;
  stockQty: number;
  stockControlled: boolean;
}

interface CartItem extends Product {
  quantity: number;
  customPrice?: number;  // Preço editado pelo vendedor (opcional)
  discountValue?: number;  // Valor do desconto no item
  discountType?: "FIXED" | "PERCENTAGE";  // Tipo do desconto
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
  const searchParams = useSearchParams();
  const { activeBranchId } = useBranchContext();
  const quoteId = searchParams.get("quoteId");
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

  // Vendedor
  const [sellers, setSellers] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedSellerId, setSelectedSellerId] = useState<string>("");

  // Estados para dialog de carnê
  const [showCarneDialog, setShowCarneDialog] = useState(false);
  const [lastSaleId, setLastSaleId] = useState<string | null>(null);

  // Carregar vendedores (filtrados pela branch ativa)
  useEffect(() => {
    const branchParam = activeBranchId !== "ALL" ? `?branchId=${activeBranchId}` : "";
    fetch(`/api/users/sellers${branchParam}`)
      .then((res) => res.json())
      .then((data) => {
        const list = data.data || [];
        setSellers(list);
        // Restaurar vendedor do localStorage
        const saved = localStorage.getItem("pdv-selected-seller");
        if (saved && list.find((s: { id: string }) => s.id === saved)) {
          setSelectedSellerId(saved);
        } else {
          setSelectedSellerId("");
        }
      })
      .catch(console.error);
  }, [activeBranchId]);

  // Refs para atalhos
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Atalhos de teclado globais
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Não ativar atalhos se estiver em input/textarea (exceto F-keys)
      const target = e.target as HTMLElement;
      const isInInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA";

      if (e.key === "F2") {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === "F4") {
        e.preventDefault();
        if (carrinho.length > 0 && !modalVendaOpen) {
          if (sellers.length > 0 && !selectedSellerId) {
            toast.error("Selecione um vendedor antes de finalizar");
            return;
          }
          setModalVendaOpen(true);
        }
      } else if (e.key === "F8") {
        e.preventDefault();
        if (carrinho.length > 0) {
          setCarrinho([]);
          setClienteSelecionado(null);
          setBuscaCliente("");
          setSelectedSellerId("");
          localStorage.removeItem("pdv-selected-seller");
          toast.success("Venda limpa");
        }
      } else if (e.key === "F3") {
        e.preventDefault();
        if (!modalClienteOpen) {
          setModalClienteOpen(true);
        }
      } else if (e.key === "Escape") {
        if (modalVendaOpen) setModalVendaOpen(false);
        if (modalClienteOpen) setModalClienteOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [carrinho.length, modalVendaOpen, modalClienteOpen]);

  // Carregar cliente do orçamento se houver quoteId
  useEffect(() => {
    const loadQuoteCustomer = async () => {
      if (!quoteId) return;

      try {
        const res = await fetch(`/api/quotes/${quoteId}`);
        if (!res.ok) {
          console.error("Erro ao carregar orçamento");
          return;
        }

        const quote = await res.json();

        // Se o orçamento tem cliente, pré-preencher
        if (quote.customer) {
          setClienteSelecionado({
            id: quote.customer.id,
            name: quote.customer.name,
            phone: quote.customer.phone,
            cpf: quote.customer.cpf,
          });
          toast.success(`Cliente ${quote.customer.name} pré-selecionado do orçamento`);
        } else if (quote.customerName) {
          toast(`Orçamento para: ${quote.customerName} (cliente não cadastrado)`, {
            icon: 'ℹ️',
          });
        }
      } catch (error) {
        console.error("Erro ao carregar cliente do orçamento:", error);
      }
    };

    loadQuoteCustomer();
  }, [quoteId]);

  // Carregar produtos disponíveis
  useEffect(() => {
    const loadProducts = async () => {
      setLoadingProducts(true);
      try {
        const params = new URLSearchParams({
          status: "ativos",
          pageSize: "50",
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

  const produtosDisponiveis = products.slice(0, 12);

  const adicionarProduto = (produto: Product) => {
    const itemExistente = carrinho.find((item) => item.id === produto.id);

    if (itemExistente) {
      // Verificar estoque apenas se produto tem controle de estoque
      if (produto.stockControlled && itemExistente.quantity >= produto.stockQty) {
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
      if (produto.stockControlled && produto.stockQty < 1) {
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

          // Verificar estoque (apenas se controlado)
          if (item.stockControlled && novaQuantidade > item.stockQty) {
            toast.error(`Estoque insuficiente. Disponível: ${item.stockQty}`);
            return item;
          }

          return { ...item, quantity: novaQuantidade };
        }
        return item;
      })
    );
  };

  const editarPreco = (produtoId: string) => {
    const item = carrinho.find((i) => i.id === produtoId);
    if (!item) return;

    const precoAtual = item.customPrice || item.salePrice;
    const novoPreco = prompt(`Editar preço unitário de "${item.name}":\n\nPreço original: R$ ${item.salePrice.toFixed(2)}\nPreço atual: R$ ${precoAtual.toFixed(2)}`, precoAtual.toString());

    if (novoPreco === null) return; // Cancelou

    const preco = parseFloat(novoPreco);
    if (isNaN(preco) || preco <= 0) {
      toast.error("Preço inválido");
      return;
    }

    setCarrinho(
      carrinho.map((i) =>
        i.id === produtoId ? { ...i, customPrice: preco } : i
      )
    );

    toast.success(`Preço alterado para R$ ${preco.toFixed(2)}`);
  };

  const resetarPreco = (produtoId: string) => {
    setCarrinho(
      carrinho.map((i) =>
        i.id === produtoId ? { ...i, customPrice: undefined } : i
      )
    );
    toast.success("Preço restaurado");
  };

  const editarDesconto = (produtoId: string) => {
    const item = carrinho.find((i) => i.id === produtoId);
    if (!item) return;

    const preco = item.customPrice || item.salePrice;
    const tipoAtual = item.discountType || "FIXED";
    const valorAtual = item.discountValue || 0;

    const input = prompt(
      `Desconto em "${item.name}":\n\nPreço unitário: R$ ${preco.toFixed(2)} × ${item.quantity} = R$ ${(preco * item.quantity).toFixed(2)}\n\nDigite o valor do desconto:\n- Número sem símbolo = R$ (ex: 10)\n- Número com % = percentual (ex: 10%)\n- 0 para remover desconto\n\nDesconto atual: ${valorAtual > 0 ? (tipoAtual === "PERCENTAGE" ? `${valorAtual}%` : `R$ ${valorAtual.toFixed(2)}`) : "Nenhum"}`,
      valorAtual > 0 ? (tipoAtual === "PERCENTAGE" ? `${valorAtual}%` : valorAtual.toString()) : ""
    );

    if (input === null) return;

    if (input === "" || input === "0") {
      setCarrinho(carrinho.map((i) =>
        i.id === produtoId ? { ...i, discountValue: undefined, discountType: undefined } : i
      ));
      toast.success("Desconto removido");
      return;
    }

    const isPercentage = input.includes("%");
    const valor = parseFloat(input.replace("%", "").replace(",", "."));

    if (isNaN(valor) || valor < 0) {
      toast.error("Valor inválido");
      return;
    }

    if (isPercentage && valor > 100) {
      toast.error("Percentual não pode ser maior que 100%");
      return;
    }

    if (!isPercentage && valor > preco * item.quantity) {
      toast.error("Desconto não pode ser maior que o total do item");
      return;
    }

    setCarrinho(carrinho.map((i) =>
      i.id === produtoId
        ? { ...i, discountValue: valor, discountType: isPercentage ? "PERCENTAGE" : "FIXED" }
        : i
    ));

    const descontoCalculado = isPercentage
      ? (preco * item.quantity * valor) / 100
      : valor;
    toast.success(`Desconto de ${isPercentage ? `${valor}%` : `R$ ${valor.toFixed(2)}`} aplicado (R$ ${descontoCalculado.toFixed(2)})`);
  };

  const calcularDescontoItem = (item: CartItem): number => {
    if (!item.discountValue || item.discountValue <= 0) return 0;
    const preco = item.customPrice || item.salePrice;
    if (item.discountType === "PERCENTAGE") {
      return (preco * item.quantity * item.discountValue) / 100;
    }
    return item.discountValue; // FIXED
  };

  const calcularSubtotal = () => {
    return carrinho.reduce((acc, item) => {
      const preco = item.customPrice || item.salePrice;
      const descontoItem = calcularDescontoItem(item);
      return acc + (preco * item.quantity) - descontoItem;
    }, 0);
  };

  const subtotal = calcularSubtotal();
  const desconto = 0;
  const total = subtotal - desconto;
  const totalItens = carrinho.reduce((acc, item) => acc + item.quantity, 0);

  const handleConfirmarVenda = async (payments: any[], cashbackUsed?: number) => {
    if (carrinho.length === 0) {
      toast.error("Carrinho vazio");
      return;
    }

    setFinalizingVenda(true);

    try {
      // Verificar sessão
      if (!session?.user?.branchId) {
        toast.error("Sessão inválida. Faça login novamente.");
        setFinalizingVenda(false);
        return;
      }

      // Preparar dados da venda
      const saleData = {
        customerId: clienteSelecionado?.id || null,
        branchId: session.user.branchId,
        ...(selectedSellerId && { sellerUserId: selectedSellerId }),
        items: carrinho.map((item) => ({
          productId: item.id,
          qty: item.quantity,
          unitPrice: item.customPrice || item.salePrice,
          discount: calcularDescontoItem(item),
        })),
        payments: payments.map((payment) => ({
          method: payment.method,
          amount: payment.amount,
          installments: payment.installments || 1,
          installmentConfig: payment.installmentConfig,
          ...(payment.cardBrand && { cardBrand: payment.cardBrand }),
          ...(payment.cardLastDigits && { cardLastDigits: payment.cardLastDigits }),
          ...(payment.nsu && { nsu: payment.nsu }),
          ...(payment.authorizationCode && { authorizationCode: payment.authorizationCode }),
          ...(payment.acquirer && { acquirer: payment.acquirer }),
        })),
        discount: desconto,
        cashbackUsed: cashbackUsed || 0,
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

      // Buscar cashback gerado (se cliente foi informado)
      let cashbackGerado = 0;
      if (clienteSelecionado?.id) {
        try {
          const cashbackRes = await fetch(`/api/sales/${vendaId}/cashback`);
          if (cashbackRes.ok) {
            const cashbackData = await cashbackRes.json();
            cashbackGerado = cashbackData.data?.amount || 0;
          }
        } catch (e) {
          console.log("Cashback não disponível");
        }
      }

      // Verificar se tem crediário e mostrar dialog para imprimir carnê
      const hasCrediario = payments.some((p) => p.method === "STORE_CREDIT");
      if (hasCrediario) {
        setShowCarneDialog(true);
        setLastSaleId(vendaId);
        // Não redireciona ainda, espera o usuário decidir sobre o carnê
        return;
      }

      // Toast de sucesso com cashback
      if (cashbackGerado > 0) {
        toast.success(
          `✅ Venda finalizada!\n💰 Cliente ganhou R$ ${cashbackGerado.toFixed(2)} de cashback`,
          { duration: 3000 }
        );
      } else {
        toast.success("✅ Venda finalizada com sucesso!", { duration: 2000 });
      }

      // Redirecionar e RECARREGAR página de vendas
      // Usar window.location para forçar reload completo
      setTimeout(() => {
        window.location.href = "/dashboard/vendas";
      }, 1500);
    } catch (error: any) {
      console.error("Erro ao finalizar venda:", error);

      // Mensagem mais amigável
      const mensagem = error.message || "Erro ao finalizar venda. Tente novamente.";
      toast.error(mensagem, { duration: 5000 });
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
        customerId={clienteSelecionado?.id}
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
    <div className="flex flex-col h-[calc(100vh-3.5rem)] -m-4 md:-m-6">
      {/* Header compacto */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-background flex-shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold">PDV</h1>
          <Badge variant="outline" className="text-xs">
            {products.length} produtos
          </Badge>
        </div>
        <div className="flex gap-1 text-xs">
          <Badge variant="secondary" className="text-xs hidden md:inline-flex">F2 Busca</Badge>
          <Badge variant="secondary" className="text-xs hidden md:inline-flex">F3 Cliente</Badge>
          <Badge variant="secondary" className="text-xs hidden md:inline-flex">F4 Finalizar</Badge>
          <Badge variant="secondary" className="text-xs hidden md:inline-flex">F8 Limpar</Badge>
        </div>
      </div>

      {/* Conteúdo principal — sem scroll na página */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-0 lg:gap-0 overflow-hidden">
        {/* Produtos e Busca - 2 colunas */}
        <div className="lg:col-span-2 flex flex-col border-r overflow-hidden">
          {/* Busca */}
          <div className="p-3 border-b flex-shrink-0">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Barcode className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  ref={searchInputRef}
                  placeholder="SKU ou nome do produto... (F2)"
                  className="pl-9"
                  value={buscaProduto}
                  onChange={(e) => setBuscaProduto(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && produtosDisponiveis.length > 0) {
                      adicionarProduto(produtosDisponiveis[0]);
                      setBuscaProduto("");
                    }
                  }}
                  autoFocus
                />
              </div>
              {buscaProduto && (
                <Button variant="outline" size="sm" onClick={() => setBuscaProduto("")}>
                  Limpar
                </Button>
              )}
            </div>
          </div>

          {/* Grid de produtos — scroll interno */}
          <div className="flex-1 overflow-y-auto p-3">
            {loadingProducts ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : produtosDisponiveis.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                <Package className="mb-2 h-12 w-12 opacity-20" />
                <p>Nenhum produto encontrado</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {produtosDisponiveis.map((produto) => (
                  <Button
                    key={produto.id}
                    variant="outline"
                    className="h-auto flex-col items-start gap-1 p-3"
                    onClick={() => adicionarProduto(produto)}
                    disabled={produto.stockControlled && produto.stockQty === 0}
                  >
                    <div className="flex w-full items-center justify-between">
                      <span className="font-mono text-xs text-muted-foreground">
                        {produto.sku}
                      </span>
                      <Badge variant={produto.stockQty > 10 ? "secondary" : produto.stockQty > 0 ? "outline" : "destructive"} className="text-xs">
                        {produto.stockQty}
                      </Badge>
                    </div>
                    <p className="line-clamp-1 text-left text-sm font-medium">
                      {produto.name}
                    </p>
                    <p className="text-base font-bold">
                      {formatCurrency(produto.salePrice)}
                    </p>
                  </Button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Coluna direita — Cliente + Vendedor + Carrinho + Resumo */}
        <div className="flex flex-col overflow-hidden">
          {/* Cliente + Vendedor — compacto */}
          <div className="p-3 border-b space-y-2 flex-shrink-0">
            {/* Cliente */}
            <div>
              {clienteSelecionado ? (
                <div className="flex items-center justify-between rounded-lg border bg-muted/50 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium">{clienteSelecionado.name}</p>
                    {clienteSelecionado.phone && (
                      <p className="text-xs text-muted-foreground">{clienteSelecionado.phone}</p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => { setClienteSelecionado(null); setBuscaCliente(""); }}
                  >
                    Remover
                  </Button>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Buscar cliente... (F3)"
                      className="pl-9 h-9"
                      value={buscaCliente}
                      onChange={(e) => setBuscaCliente(e.target.value)}
                    />
                  </div>
                  {loadingCustomers && (
                    <div className="flex items-center gap-2 py-1">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span className="text-xs text-muted-foreground">Buscando...</span>
                    </div>
                  )}
                  {!loadingCustomers && customers.length > 0 && (
                    <div className="space-y-0.5 max-h-28 overflow-y-auto border rounded-lg">
                      {customers.map((cliente) => (
                        <Button
                          key={cliente.id}
                          variant="ghost"
                          className="w-full justify-start h-auto py-1.5 px-3"
                          onClick={() => {
                            setClienteSelecionado(cliente);
                            setBuscaCliente("");
                            toast.success(`${cliente.name} selecionado`);
                          }}
                        >
                          <div className="text-left">
                            <p className="font-medium text-xs">{cliente.name}</p>
                            {cliente.phone && <p className="text-xs text-muted-foreground">{cliente.phone}</p>}
                          </div>
                        </Button>
                      ))}
                    </div>
                  )}
                  {buscaCliente.length < 2 && (
                    <Button variant="outline" size="sm" className="w-full h-8 text-xs" onClick={() => setModalClienteOpen(true)}>
                      <Plus className="mr-1 h-3 w-3" />
                      Adicionar Cliente (F3)
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* Seletor de Vendedor (obrigatório quando há vendedores) */}
            {sellers.length > 0 && (
              <div>
                <label className="text-xs text-muted-foreground mb-0.5 block">
                  Vendedor <span className="text-destructive">*</span>
                </label>
                <select
                  value={selectedSellerId}
                  onChange={(e) => {
                    setSelectedSellerId(e.target.value);
                    localStorage.setItem("pdv-selected-seller", e.target.value);
                  }}
                  className={`w-full h-8 text-sm rounded-md border bg-background px-3 focus:outline-none focus:ring-1 focus:ring-ring ${
                    !selectedSellerId ? "border-destructive text-muted-foreground" : "border-input"
                  }`}
                >
                  <option value="" disabled>Selecione o vendedor...</option>
                  {sellers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Carrinho — scroll interno */}
          <div className="flex-1 overflow-y-auto p-3">
            <p className="text-sm font-semibold mb-2 flex items-center gap-1.5">
              <ShoppingCart className="h-4 w-4" />
              Carrinho ({totalItens})
            </p>
            {carrinho.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                <Package className="mb-2 h-10 w-10 opacity-20" />
                <p className="text-sm">Carrinho vazio</p>
              </div>
            ) : (
              <div className="space-y-2">
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
                          <div className="flex items-center gap-2">
                            <p className="text-xs text-muted-foreground">
                              {item.customPrice ? (
                                <>
                                  <span className="line-through">{formatCurrency(item.salePrice)}</span>
                                  {" → "}
                                  <span className="font-semibold text-blue-600">{formatCurrency(item.customPrice)}</span>
                                </>
                              ) : (
                                formatCurrency(item.salePrice)
                              )} cada
                            </p>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 px-1 text-xs"
                              onClick={() => editarPreco(item.id)}
                            >
                              Editar
                            </Button>
                            {item.customPrice && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-5 px-1 text-xs text-orange-600"
                                onClick={() => resetarPreco(item.id)}
                              >
                                Resetar
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 px-1 text-xs text-green-600"
                              onClick={() => editarDesconto(item.id)}
                            >
                              <Tag className="h-3 w-3 mr-0.5" />
                              Desc
                            </Button>
                          </div>
                          {item.discountValue && item.discountValue > 0 && (
                            <p className="text-xs text-green-600 font-medium">
                              Desconto: {item.discountType === "PERCENTAGE" ? `${item.discountValue}%` : formatCurrency(item.discountValue)}
                              {" "}(-{formatCurrency(calcularDescontoItem(item))})
                            </p>
                          )}
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
                              disabled={item.stockControlled && item.quantity >= item.stockQty}
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
                            {formatCurrency((item.customPrice || item.salePrice) * item.quantity - calcularDescontoItem(item))}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
              </div>
            )}
          </div>

          {/* Resumo + Botão Finalizar — fixo no fundo da coluna */}
          <div className="p-3 border-t flex-shrink-0 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal ({totalItens} itens)</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            <Separator />
            <div className="flex justify-between text-lg font-bold">
              <span>Total</span>
              <span>{formatCurrency(total)}</span>
            </div>
            <Button
              className="w-full"
              size="lg"
              disabled={carrinho.length === 0 || (sellers.length > 0 && !selectedSellerId)}
              onClick={() => {
                if (sellers.length > 0 && !selectedSellerId) {
                  toast.error("Selecione um vendedor");
                  return;
                }
                setModalVendaOpen(true);
              }}
            >
              <CreditCard className="mr-2 h-4 w-4" />
              {sellers.length > 0 && !selectedSellerId ? "Selecione o vendedor" : "Finalizar Venda (F4)"}
            </Button>
          </div>
        </div>
      </div>
    </div>

    {/* Dialog para imprimir carnê */}
    <Dialog open={showCarneDialog} onOpenChange={setShowCarneDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Venda no Crediário Realizada!</DialogTitle>
          <DialogDescription>
            A venda foi finalizada com sucesso. Deseja imprimir o carnê de pagamento?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => {
              setShowCarneDialog(false);
              // Redirecionar após fechar
              setTimeout(() => {
                window.location.href = "/dashboard/vendas";
              }, 300);
            }}
          >
            Não
          </Button>
          <Button
            onClick={() => {
              if (lastSaleId) {
                // Abrir carnê em nova aba
                window.open(`/api/sales/${lastSaleId}/carne`, "_blank");
              }
              setShowCarneDialog(false);
              // Redirecionar após abrir carnê
              setTimeout(() => {
                window.location.href = "/dashboard/vendas";
              }, 500);
            }}
          >
            Imprimir Carnê
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
