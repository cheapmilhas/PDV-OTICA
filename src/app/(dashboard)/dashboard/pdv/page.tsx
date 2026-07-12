"use client";

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { useState, useEffect, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useUnsavedChangesWarning } from "@/hooks/use-unsaved-changes-warning";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
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
import { calculateTotals } from "@/lib/sale-totals";
import { ModalFinalizarVenda } from "@/components/pdv/modal-finalizar-venda";
import { ModalNovoCliente } from "@/components/pdv/modal-novo-cliente";
import { ManagerApprovalModal } from "@/components/pdv/manager-approval-modal";
import { useBranchContext } from "@/hooks/use-branch-context";
import { useIsMobile } from "@/hooks/use-media-query";
import toast from "react-hot-toast";
import { track } from "@/lib/analytics";

interface Product {
  id: string;
  sku: string;
  name: string;
  salePrice: number;        // preço EFETIVO de venda (já com promoção aplicada)
  originalSalePrice?: number; // preço cheio antes da promoção (p/ UI riscada)
  onPromotion?: boolean;    // true se salePrice veio de uma promoção válida
  stockQty: number;
  stockControlled: boolean;
  type?: string;  // ProductType (ex.: OPHTHALMIC_LENS, CONTACT_LENS, LENS_SERVICE)
}

/** Tipos de produto que caracterizam uma lente (geram OS). */
const LENS_PRODUCT_TYPES = ["OPHTHALMIC_LENS", "CONTACT_LENS", "LENS_SERVICE"];

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
  const serviceOrderId = searchParams.get("serviceOrderId");
  const [carrinho, setCarrinho] = useState<CartItem[]>([]);
  // Aba ativa no layout de phone (< md). No iPad/desktop ambas as colunas
  // aparecem lado a lado e este estado é ignorado.
  const [mobileTab, setMobileTab] = useState<"produtos" | "carrinho">("produtos");
  const isMobile = useIsMobile();
  const [modalVendaOpen, setModalVendaOpen] = useState(false);
  const [modalClienteOpen, setModalClienteOpen] = useState(false);
  const [buscaProduto, setBuscaProduto] = useState("");
  const [buscaCliente, setBuscaCliente] = useState("");
  const [clienteSelecionado, setClienteSelecionado] = useState<Customer | null>(null);
  const [cashbackSelecionado, setCashbackSelecionado] = useState<number | null>(null);
  // Incrementado após uma venda concluída que NÃO sai da página (crediário),
  // para re-buscar o saldo de cashback do cliente que permanece selecionado.
  const [cashbackRefreshKey, setCashbackRefreshKey] = useState(0);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [finalizingVenda, setFinalizingVenda] = useState(false);
  // H11: trava SÍNCRONA contra duplo-submit. setState é assíncrono e no caminho
  // de override o finally liberava finalizingVenda enquanto o modal de gerente
  // abria → 2º clique criava venda duplicada. O ref impede reentrância na hora.
  const submitLockRef = useRef(false);
  // H11: sinaliza reenvio pós-aprovação em andamento. O ManagerApprovalModal
  // chama onApproved() e logo onClose() em sequência — sem este flag o onClose
  // apagaria o spinner no meio da chamada em voo. true = deixa o finally do
  // reenvio cuidar do spinner; false (desistência) = onClose limpa tudo.
  const resubmittingRef = useRef(false);
  // M16: guarda qual serviceOrderId já foi carregado p/ o carrinho (idempotência
  // do /convert no useEffect — evita 2 chamadas para a mesma OS).
  const loadedServiceOrderRef = useRef<string | null>(null);

  // M17: avisa antes de sair com itens no carrinho (F5/fechar aba descartava).
  useUnsavedChangesWarning(carrinho.length > 0);

  // Vendedor
  const [sellers, setSellers] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedSellerId, setSelectedSellerId] = useState<string>("");

  // Estados para dialog de carnê
  const [showCarneDialog, setShowCarneDialog] = useState(false);
  const [lastSaleId, setLastSaleId] = useState<string | null>(null);

  // Override de gerente: quando uma venda é barrada por regra autorizável,
  // guardamos o contexto e abrimos o modal de senha do gerente.
  const [overrideModalOpen, setOverrideModalOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [pendingSale, setPendingSale] = useState<{
    payments: any[];
    cashbackUsed?: number;
    reasons: string[];
  } | null>(null);

  // Modal de editar preço/desconto
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editModalMode, setEditModalMode] = useState<"price" | "discount">("price");
  const [editModalItemId, setEditModalItemId] = useState<string>("");
  const [editModalValue, setEditModalValue] = useState("");
  const [editModalDiscountType, setEditModalDiscountType] = useState<"FIXED" | "PERCENTAGE">("FIXED");

  // Desconto no TOTAL da venda (separado dos descontos por item)
  const [descontoVendaValor, setDescontoVendaValor] = useState("");
  const [descontoVendaTipo, setDescontoVendaTipo] = useState<"FIXED" | "PERCENTAGE">("FIXED");

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

  // Busca o saldo de cashback do cliente selecionado (de qualquer origem:
  // busca, pré-preenchido por orçamento/OS, ou recém-criado no modal).
  useEffect(() => {
    if (!clienteSelecionado?.id) {
      setCashbackSelecionado(null);
      return;
    }
    let ativo = true;
    fetch(`/api/cashback/balance/${clienteSelecionado.id}`)
      .then(async (res) => {
        if (res.status === 403) return null; // plano sem cashback
        if (!res.ok) return null;
        return res.json();
      })
      .then((data) => {
        if (!ativo) return;
        if (data?.success) {
          setCashbackSelecionado(Number(data.data?.balance) || 0);
        } else {
          setCashbackSelecionado(null);
        }
      })
      .catch(() => {
        if (ativo) setCashbackSelecionado(null);
      });
    return () => {
      ativo = false;
    };
  }, [clienteSelecionado?.id, cashbackRefreshKey]);

  // Refs para atalhos
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Ações dos atalhos F2/F3/F4/F8 — extraídas para serem chamadas tanto pelas
  // teclas quanto pelos botões do topo (antes os botões eram só decorativos).
  const acaoF2Busca = useCallback(() => {
    searchInputRef.current?.focus();
  }, []);

  const acaoF3Cliente = useCallback(() => {
    if (!modalClienteOpen) setModalClienteOpen(true);
  }, [modalClienteOpen]);

  const acaoF4Finalizar = useCallback(() => {
    if (carrinho.length === 0 || modalVendaOpen) return;
    if (sellers.length > 0 && !selectedSellerId) {
      toast.error("Selecione um vendedor antes de finalizar");
      setMobileTab("carrinho"); // leva ao campo de correção no layout de phone
      return;
    }
    const temLente = carrinho.some(
      (item) => item.type && LENS_PRODUCT_TYPES.includes(item.type)
    );
    if (temLente && !clienteSelecionado?.id) {
      toast.error("Vendas com lente exigem um cliente vinculado (será gerada uma Ordem de Serviço). Selecione o cliente.", { duration: 6000, icon: "⚠️" });
      setMobileTab("carrinho");
      return;
    }
    setModalVendaOpen(true);
  }, [carrinho, modalVendaOpen, sellers.length, selectedSellerId, clienteSelecionado]);

  const acaoF8Limpar = useCallback(() => {
    if (carrinho.length === 0) return;
    setCarrinho([]);
    setMobileTab("produtos");
    setClienteSelecionado(null);
    setBuscaCliente("");
    setDescontoVendaValor("");
    setDescontoVendaTipo("FIXED");
    // Mantém o vendedor selecionado (e o localStorage) para a próxima venda —
    // numa loja com vendas em sequência, reselecionar a cada limpeza é atrito.
    toast.success("Venda limpa");
  }, [carrinho.length]);

  // Atalhos de teclado globais
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "F2") {
        e.preventDefault();
        acaoF2Busca();
      } else if (e.key === "F4") {
        e.preventDefault();
        acaoF4Finalizar();
      } else if (e.key === "F8") {
        e.preventDefault();
        acaoF8Limpar();
      } else if (e.key === "F3") {
        e.preventDefault();
        acaoF3Cliente();
      } else if (e.key === "Escape") {
        if (modalVendaOpen) setModalVendaOpen(false);
        if (modalClienteOpen) setModalClienteOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [acaoF2Busca, acaoF3Cliente, acaoF4Finalizar, acaoF8Limpar, modalVendaOpen, modalClienteOpen]);

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

  // Carregar dados da OS se houver serviceOrderId (vindo do botão "Gerar Venda")
  useEffect(() => {
    const loadServiceOrderData = async () => {
      if (!serviceOrderId) return;

      // M16: idempotência no front — o useEffect podia disparar 2x (StrictMode/
      // re-render) e chamar /convert duas vezes para a mesma OS. O ref garante
      // uma única carga por serviceOrderId.
      if (loadedServiceOrderRef.current === serviceOrderId) return;
      loadedServiceOrderRef.current = serviceOrderId;

      try {
        // Usa o endpoint de conversão que já retorna itens com dados do produto
        const res = await fetch(`/api/service-orders/${serviceOrderId}/convert`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        if (!res.ok) {
          const err = await res.json();
          toast.error(err.error?.message || "Erro ao carregar OS para venda");
          return;
        }

        const { data: order } = await res.json();

        // Pré-selecionar cliente
        if (order.customer) {
          setClienteSelecionado({
            id: order.customer.id,
            name: order.customer.name,
            phone: order.customer.phone,
            cpf: order.customer.cpf,
          });
        }

        // Mapear itens da OS para o carrinho
        const cartItems: CartItem[] = [];
        for (const item of order.items || []) {
          if (item.productId && item.product) {
            cartItems.push({
              id: item.product.id,
              sku: item.product.sku || "",
              name: item.product.name,
              salePrice: item.product.salePrice,
              stockQty: item.product.stockQty,
              stockControlled: item.product.stockControlled ?? true,
              quantity: item.qty || 1,
              customPrice: item.unitPrice !== item.product.salePrice
                ? item.unitPrice
                : undefined,
            });
          }
        }

        if (cartItems.length > 0) {
          setCarrinho(cartItems);
          toast.success(
            `OS #${String(order.number).padStart(6, "0")} carregada — ${cartItems.length} ${cartItems.length === 1 ? "item" : "itens"} no carrinho`
          );
        } else {
          toast.error("Nenhum produto encontrado na OS para gerar venda");
        }
      } catch (error) {
        toast.error("Erro ao carregar dados da OS");
      }
    };

    loadServiceOrderData();
  }, [serviceOrderId]);

  // Carregar produtos disponíveis
  useEffect(() => {
    // M18: AbortController evita race de busca — uma resposta lenta de uma
    // busca antiga ("ab") chegando depois da nova ("abc") sobrescreveria a
    // lista com resultados errados. O cleanup aborta o fetch em voo.
    const controller = new AbortController();
    const loadProducts = async () => {
      setLoadingProducts(true);
      try {
        const params = new URLSearchParams({
          status: "ativos",
          pageSize: "50",
          sortBy: "name",
          sortOrder: "asc",
        });

        // Passar branchId para obter preços específicos da filial
        if (activeBranchId && activeBranchId !== "ALL") {
          params.set("branchId", activeBranchId);
        }

        if (buscaProduto) {
          // Normaliza acentos para busca sem acento funcionar (ex: "armacao" encontra "Armação")
          const searchNormalized = buscaProduto
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "");
          params.set("search", searchNormalized);
        }

        const res = await fetch(`/api/products?${params}`, { signal: controller.signal });
        if (!res.ok) throw new Error("Erro ao carregar produtos");

        const data = await res.json();
        // H4: resolve o preço EFETIVO considerando promoção por filial.
        // Antes só aplicava branchSalePrice ?? salePrice e IGNORAVA o promoPrice
        // → produto em promoção era vendido pelo preço cheio. Agora: preço de
        // venda da filial = branchSalePrice ?? salePrice; promo da filial =
        // branchPromoPrice ?? promoPrice. Se a promo é válida (> 0 e abaixo do
        // preço de venda), ela vira o salePrice efetivo e guardamos o original
        // para exibir riscado.
        const productsWithBranchPrice = (data.data || []).map((p: any) => {
          const venda = p.branchSalePrice ?? p.salePrice;
          const promo = p.branchPromoPrice ?? p.promoPrice;
          const promoValida =
            promo != null && promo > 0 && promo < venda;
          return {
            ...p,
            salePrice: promoValida ? promo : venda,
            originalSalePrice: venda,
            onPromotion: promoValida,
          };
        });
        setProducts(productsWithBranchPrice);
      } catch (error) {
        // Busca abortada (nova digitação) não é erro — só ignora.
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.error("Erro ao carregar produtos:", error);
        toast.error("Erro ao carregar produtos");
      } finally {
        // Só desliga o loading se não foi abortada (a busca nova cuida do seu).
        if (!controller.signal.aborted) setLoadingProducts(false);
      }
    };

    const debounce = setTimeout(() => {
      loadProducts();
    }, 300);

    return () => {
      clearTimeout(debounce);
      controller.abort();
    };
  }, [buscaProduto, activeBranchId]);

  // Carregar clientes
  useEffect(() => {
    // M18: AbortController contra race de busca (mesma lógica dos produtos).
    const controller = new AbortController();
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

        const res = await fetch(`/api/customers?${params}`, { signal: controller.signal });
        if (!res.ok) throw new Error("Erro ao carregar clientes");

        const data = await res.json();
        setCustomers(data.data || []);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.error("Erro ao carregar clientes:", error);
      } finally {
        if (!controller.signal.aborted) setLoadingCustomers(false);
      }
    };

    const debounce = setTimeout(() => {
      loadCustomers();
    }, 300);

    return () => {
      clearTimeout(debounce);
      controller.abort();
    };
  }, [buscaCliente]);

  const produtosDisponiveis = products.slice(0, 12);

  const adicionarProduto = (produto: Product) => {
    const itemExistente = carrinho.find((item) => item.id === produto.id);

    if (itemExistente) {
      const novaQtd = itemExistente.quantity + 1;

      // Aviso de estoque insuficiente (não bloqueia — permite venda por encomenda)
      if (produto.stockControlled && novaQtd > produto.stockQty) {
        toast(`Estoque: ${produto.stockQty} un. Adicionando ${novaQtd}.`, { icon: "⚠️", duration: 3000 });
      }

      setCarrinho(
        carrinho.map((item) =>
          item.id === produto.id
            ? { ...item, quantity: novaQtd }
            : item
        )
      );
      toast.success(`+1 ${produto.name}`);
    } else {
      // Aviso se estoque zero (não bloqueia)
      if (produto.stockControlled && produto.stockQty < 1) {
        toast(`${produto.name} sem estoque. Adicionando mesmo assim.`, { icon: "⚠️", duration: 3000 });
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

  // Abre modal de editar preço
  const editarPreco = (produtoId: string) => {
    const item = carrinho.find((i) => i.id === produtoId);
    if (!item) return;
    setEditModalItemId(produtoId);
    setEditModalMode("price");
    setEditModalValue((item.customPrice || item.salePrice).toString());
    setEditModalOpen(true);
  };

  // Abre modal de desconto
  const editarDesconto = (produtoId: string) => {
    const item = carrinho.find((i) => i.id === produtoId);
    if (!item) return;
    setEditModalItemId(produtoId);
    setEditModalMode("discount");
    setEditModalDiscountType(item.discountType || "FIXED");
    setEditModalValue(item.discountValue ? item.discountValue.toString() : "");
    setEditModalOpen(true);
  };

  const resetarPreco = (produtoId: string) => {
    setCarrinho(carrinho.map((i) => i.id === produtoId ? { ...i, customPrice: undefined } : i));
    toast.success("Preço restaurado");
  };

  // Confirma a edição do modal
  const confirmarEdicaoModal = () => {
    const item = carrinho.find((i) => i.id === editModalItemId);
    if (!item) return;

    if (editModalMode === "price") {
      const preco = parseFloat(editModalValue.replace(",", "."));
      if (isNaN(preco) || preco <= 0) {
        toast.error("Preço inválido");
        return;
      }
      setCarrinho(carrinho.map((i) => i.id === editModalItemId ? { ...i, customPrice: preco } : i));
      toast.success(`Preço alterado para R$ ${preco.toFixed(2)}`);
    } else {
      // Desconto
      if (!editModalValue || editModalValue === "0") {
        setCarrinho(carrinho.map((i) => i.id === editModalItemId ? { ...i, discountValue: undefined, discountType: undefined } : i));
        toast.success("Desconto removido");
        setEditModalOpen(false);
        return;
      }

      const valor = parseFloat(editModalValue.replace(",", "."));
      if (isNaN(valor) || valor < 0) {
        toast.error("Valor inválido");
        return;
      }

      const preco = item.customPrice || item.salePrice;
      if (editModalDiscountType === "PERCENTAGE" && valor > 100) {
        toast.error("Percentual máximo: 100%");
        return;
      }
      if (editModalDiscountType === "FIXED" && valor > preco * item.quantity) {
        toast.error("Desconto maior que o total do item");
        return;
      }

      setCarrinho(carrinho.map((i) =>
        i.id === editModalItemId
          ? { ...i, discountValue: valor, discountType: editModalDiscountType }
          : i
      ));

      const calc = editModalDiscountType === "PERCENTAGE" ? (preco * item.quantity * valor) / 100 : valor;
      toast.success(`Desconto de ${editModalDiscountType === "PERCENTAGE" ? `${valor}%` : `R$ ${valor.toFixed(2)}`} aplicado (-R$ ${calc.toFixed(2)})`);
    }

    setEditModalOpen(false);
  };

  const calcularDescontoItem = (item: CartItem): number => {
    if (!item.discountValue || item.discountValue <= 0) return 0;
    const preco = item.customPrice || item.salePrice;
    if (item.discountType === "PERCENTAGE") {
      return (preco * item.quantity * item.discountValue) / 100;
    }
    return item.discountValue; // FIXED
  };

  // TEC-06: a soma do subtotal usa o helper único (decimal.js), com o desconto
  // de cada item já resolvido por calcularDescontoItem (que trata % vs R$ — algo
  // específico da UI do PDV). Mantém a feature de % por item e unifica a soma.
  const calcularSubtotal = () =>
    calculateTotals({
      items: carrinho.map((item) => ({
        qty: item.quantity,
        unitPrice: item.customPrice || item.salePrice,
        discount: calcularDescontoItem(item),
      })),
    }).subtotal;

  const subtotal = calcularSubtotal();

  // Desconto no total da venda: aceita R$ ou %. Normaliza vírgula decimal e
  // limita ao intervalo [0, subtotal] para nunca gerar total negativo.
  const calcularDescontoVenda = (): number => {
    // Normaliza pt-BR: remove separador de milhar "." e troca vírgula decimal
    // por ponto. "1.234,50" -> "1234.50". Se houver só vírgula, "50,00" -> "50.00".
    const raw = descontoVendaValor.includes(",")
      ? descontoVendaValor.replace(/\./g, "").replace(",", ".")
      : descontoVendaValor;
    const valor = parseFloat(raw);
    if (!Number.isFinite(valor) || valor <= 0) return 0;
    const bruto = descontoVendaTipo === "PERCENTAGE" ? (subtotal * valor) / 100 : valor;
    const limitado = Math.min(Math.max(bruto, 0), subtotal);
    return Math.round(limitado * 100) / 100;
  };

  const desconto = calcularDescontoVenda();
  // TEC-06: total via helper único (subtotal já é o líquido dos itens; aplica o
  // desconto da venda já resolvido em R$). Mesmo arredondamento decimal do backend.
  const total = calculateTotals({
    items: [{ qty: 1, unitPrice: subtotal }],
    discount: desconto,
  }).total;
  const totalItens = carrinho.reduce((acc, item) => acc + item.quantity, 0);

  // Venda com lente gera Ordem de Serviço — e OS exige cliente vinculado.
  const vendaTemLente = carrinho.some(
    (item) => item.type && LENS_PRODUCT_TYPES.includes(item.type)
  );

  // Guarda + abre o modal de fechamento. Reutilizado pelo botão da coluna
  // (desktop/iPad) e pela barra de ação fixa (phone), sem duplicar validação.
  const abrirFinalizacao = () => {
    if (sellers.length > 0 && !selectedSellerId) {
      toast.error("Selecione um vendedor");
      setMobileTab("carrinho");
      return;
    }
    if (vendaTemLente && !clienteSelecionado?.id) {
      toast.error(
        "Vendas com lente exigem um cliente vinculado (será gerada uma Ordem de Serviço). Selecione o cliente.",
        { duration: 6000, icon: "⚠️" }
      );
      setMobileTab("carrinho");
      return;
    }
    setModalVendaOpen(true);
  };

  const finalizarDisabled =
    carrinho.length === 0 || (sellers.length > 0 && !selectedSellerId);

  const handleConfirmarVenda = async (
    payments: any[],
    cashbackUsed?: number,
    override?: { approvedByUserId: string; reasons: string[] }
  ) => {
    // H11: trava reentrante síncrona — bloqueia 2º submit imediato (duplo
    // clique / Enter repetido) antes do React processar o setState.
    if (submitLockRef.current) return;

    if (carrinho.length === 0) {
      toast.error("Carrinho vazio");
      return;
    }

    // Venda com lente exige cliente (a OS gerada precisa de cliente vinculado).
    if (vendaTemLente && !clienteSelecionado?.id) {
      toast.error("Vendas com lente exigem um cliente vinculado (será gerada uma Ordem de Serviço). Selecione o cliente.", { duration: 6000, icon: "⚠️" });
      return;
    }

    submitLockRef.current = true;
    setFinalizingVenda(true);

    // H11: sinaliza que o fluxo entrou em autorização de gerente — nesse caso o
    // finally NÃO libera a trava (o modal de override continua o controle).
    let enteringOverride = false;

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
        ...(selectedSellerId && { sellerUserId: selectedSellerId }),
        ...(serviceOrderId && { serviceOrderId }),
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
        ...(override && { override }),
      };

      const res = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(saleData),
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        const code: string | undefined = error.error?.code;

        // Monta a mensagem detalhada (suporta { field } e { path }).
        let mensagem = error.error?.message || error.message || `Erro ao finalizar venda (HTTP ${res.status})`;
        if (Array.isArray(error.error?.details) && error.error.details.length > 0) {
          const details = error.error.details
            .map((d: any) => {
              const campo = d.field ?? (Array.isArray(d.path) ? d.path.join(".") : "");
              return campo ? `${campo}: ${d.message}` : d.message;
            })
            .filter(Boolean)
            .join(", ");
          if (details && !error.error?.code) {
            mensagem = `${error.error?.message || "Erro de validação"}: ${details}`;
          }
        }

        const err = new Error(mensagem) as Error & { code?: string };
        err.code = code;
        throw err;
      }

      const data = await res.json();
      const vendaId = data?.data?.id;
      // Defesa: API retornou 200 mas sem corpo esperado — não confiar em sucesso.
      if (!vendaId) {
        throw new Error("A venda foi processada mas não retornou identificador. Verifique em /dashboard/vendas antes de refazer.");
      }

      // OS gerada automaticamente (venda com lente) — avisar o usuário.
      const osGerada = data?.data?.serviceOrder;

      track("first_sale", {
        saleId: vendaId,
        total: data.data.total,
        itemCount: carrinho.length,
        hasCashback: !!clienteSelecionado?.id,
      });

      // Buscar cashback gerado (se cliente foi informado)
      let cashbackGerado = 0;
      if (clienteSelecionado?.id) {
        try {
          const cashbackRes = await fetch(`/api/sales/${vendaId}/cashback`);
          if (cashbackRes.ok) {
            const cashbackData = await cashbackRes.json();
            // Number() defensivo: amount pode vir como string (Decimal serializado).
            cashbackGerado = Number(cashbackData.data?.amount) || 0;
          }
        } catch {
          // Cashback opcional — falha não bloqueia conclusão da venda.
        }
      }

      // Verificar se tem crediário e mostrar dialog para imprimir carnê
      const hasCrediario = payments.some((p) => p.method === "STORE_CREDIT");
      if (hasCrediario) {
        // M17: venda JÁ gravada — limpa o carrinho para remover o aviso de
        // "mudanças não salvas" (beforeunload) antes do dialog do carnê.
        setCarrinho([]);
        setMobileTab("produtos");
        // Limpa o desconto da venda — senão fica pré-preenchido na próxima venda
        // se o usuário não navegar para fora após o dialog do carnê.
        setDescontoVendaValor("");
        setDescontoVendaTipo("FIXED");
        // Venda concluída: fecha o modal de finalizar (dispara o reset interno
        // dele) antes de mostrar o carnê. Sem isso o modal ficaria montado por
        // baixo do dialog do carnê com o pagamento já preenchido — e, no fluxo de
        // crediário com liberação de gerente, dava a impressão de "preencher tudo
        // de novo".
        setModalVendaOpen(false);
        setShowCarneDialog(true);
        setLastSaleId(vendaId);
        // Cliente permanece selecionado neste fluxo (não há redirect) — força
        // re-busca do saldo de cashback, que pode ter mudado com esta venda.
        setCashbackRefreshKey((k) => k + 1);
        // Não redireciona ainda, espera o usuário decidir sobre o carnê
        return;
      }

      // A partir daqui a venda JÁ ESTÁ SALVA (temos vendaId). Nada abaixo pode
      // lançar para o catch principal — senão o usuário vê "erro" numa venda
      // que foi concluída e tende a refazer, gerando duplicidade.
      try {
        // Toast de sucesso com cashback
        if (cashbackGerado > 0) {
          toast.success(
            `✅ Venda finalizada!\n💰 Cliente ganhou R$ ${Number(cashbackGerado).toFixed(2)} de cashback`,
            { duration: 3000 }
          );
        } else {
          toast.success("✅ Venda finalizada com sucesso!", { duration: 2000 });
        }
        // Aviso da OS gerada (venda com lente) — orienta completar a receita.
        if (osGerada?.number != null) {
          const numeroOS = String(osGerada.number).padStart(6, "0");
          toast(`OS #${numeroOS} criada — complete a receita na Ordem de Serviço.`, {
            icon: "📋",
            duration: 5000,
          });
        }
      } catch (postError) {
        console.error("Pós-venda (não crítico):", postError);
        toast.success("✅ Venda finalizada com sucesso!", { duration: 2000 });
      }

      // M17: venda JÁ gravada — limpa o carrinho ANTES do delay do redirect para
      // remover o aviso de "mudanças não salvas" (um F5 nos 1.5s não dispara
      // mais o beforeunload falso, já que a venda foi concluída).
      setCarrinho([]);
      // Fecha o modal de pagamento junto com a limpeza do carrinho — senão ele
      // fica aberto ~1.5s (até o redirect) re-renderizando com Total R$ 0 /
      // "Falta" negativa. Espelha o ramo do crediário, que já fecha o modal.
      setModalVendaOpen(false);

      // Redirecionar via router (Next) em vez de window.location pra preservar
      // state e cache. router.refresh() força re-fetch da lista de vendas.
      setTimeout(() => {
        router.push("/dashboard/vendas");
        router.refresh();
      }, 1500);
    } catch (error: any) {
      console.error("Erro ao finalizar venda:", error);

      const code: string | undefined = error.code;
      const mensagem = error.message || "Erro ao finalizar venda. Tente novamente.";

      const OVERRIDABLE = [
        "CREDIT_LIMIT_EXCEEDED",
        "CUSTOMER_OVERDUE",
        "INSUFFICIENT_STOCK",
        "DISCOUNT_EXCEEDS_LIMIT",
        "PRICE_BELOW_COST",
      ];

      // Negativa autorizável + a venda ainda NÃO tinha override → abrir modal
      // de autorização do gerente em vez de só bloquear.
      if (code && OVERRIDABLE.includes(code) && !override) {
        setPendingSale({ payments, cashbackUsed, reasons: [code] });
        setOverrideReason(mensagem);
        setOverrideModalOpen(true);
        // H11: mantém a trava (não cai no finally que libera). O reenvio pós-
        // autorização (handleManagerApproved) e o cancelamento do modal
        // (onOpenChange=false) é que liberam submitLockRef.
        enteringOverride = true;
        // Não mostra toast de erro — o modal assume.
        return;
      }

      // Alertas específicos por tipo de negativa.
      const titulos: Record<string, string> = {
        CREDIT_LIMIT_EXCEEDED: "🚫 Limite de crédito excedido",
        CUSTOMER_OVERDUE: "🚫 Cliente inadimplente",
        INSUFFICIENT_STOCK: "📦 Estoque insuficiente",
        DISCOUNT_EXCEEDS_LIMIT: "🏷️ Desconto acima do limite",
        PRICE_BELOW_COST: "💸 Preço abaixo do custo",
        UNAUTHORIZED: "🔒 Sessão expirada",
      };

      // Sessão expirada: além do toast, leva para o login (a venda NÃO foi
      // gravada). Antes isto vinha como 500 "Erro interno do servidor" e o
      // operador não entendia que era só refazer o login.
      if (code === "UNAUTHORIZED") {
        toast.error(`🔒 Sessão expirada\n${mensagem}`, { duration: 6000 });
        setTimeout(() => router.push("/login"), 1500);
        return;
      }

      if (code && titulos[code]) {
        toast.error(`${titulos[code]}\n${mensagem}`, { duration: 7000 });
      } else {
        toast.error(mensagem, { duration: 5000 });
      }
    } finally {
      // H11: libera a trava SÓ se não entrou em fluxo de override. No override,
      // handleManagerApproved (reenvio) ou o cancelamento do modal liberam.
      if (!enteringOverride) {
        submitLockRef.current = false;
        resubmittingRef.current = false;
        setFinalizingVenda(false);
      }
    }
  };

  // Gerente autorizou — reenvia a venda pendente com o override.
  // H11: libera a trava antes do reenvio para que handleConfirmarVenda possa
  // readquiri-la (o guard reentrante barraria o reenvio se ainda travado).
  const handleManagerApproved = (approvedByUserId: string) => {
    if (!pendingSale) return;
    const { payments, cashbackUsed, reasons } = pendingSale;
    setPendingSale(null);
    setOverrideReason("");
    // Marca reenvio em andamento ANTES de liberar a trava — o onClose do modal
    // (que dispara logo após este onApproved) verá o flag e não apagará o
    // spinner; o finally do reenvio o limpa ao terminar.
    resubmittingRef.current = true;
    submitLockRef.current = false;
    void handleConfirmarVenda(payments, cashbackUsed, {
      approvedByUserId,
      reasons,
    });
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
      <ManagerApprovalModal
        open={overrideModalOpen}
        onClose={() => {
          // H11: fecha o modal. Se há reenvio pós-aprovação em andamento
          // (resubmittingRef), NÃO mexe na trava/spinner — o finally do reenvio
          // cuida. Caso contrário (desistência), libera tudo senão o botão
          // Finalizar ficaria preso.
          setOverrideModalOpen(false);
          setOverrideReason("");
          if (!resubmittingRef.current) {
            setPendingSale(null);
            submitLockRef.current = false;
            setFinalizingVenda(false);
          }
        }}
        reason={overrideReason}
        currentUserId={session?.user?.id}
        onApproved={handleManagerApproved}
      />
      <ModalNovoCliente
        open={modalClienteOpen}
        onOpenChange={setModalClienteOpen}
        onClienteCriado={(cliente) => {
          setClienteSelecionado(cliente);
          toast.success(`${cliente.name} selecionado`);
        }}
      />
      {/* Modal Editar Preço / Desconto */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="max-w-xs p-4">
          {(() => {
            const item = carrinho.find((i) => i.id === editModalItemId);
            if (!item) return null;
            const preco = item.customPrice || item.salePrice;
            return (
              <>
                <div className="space-y-1">
                  <p className="font-semibold text-sm truncate">{item.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {editModalMode === "price"
                      ? `Original: R$ ${item.salePrice.toFixed(2)}`
                      : `R$ ${preco.toFixed(2)} × ${item.quantity} = R$ ${(preco * item.quantity).toFixed(2)}`}
                  </p>
                </div>

                {editModalMode === "discount" && (
                  <div className="grid grid-cols-2 gap-1.5">
                    <Button
                      variant={editModalDiscountType === "FIXED" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setEditModalDiscountType("FIXED")}
                    >
                      R$ Valor
                    </Button>
                    <Button
                      variant={editModalDiscountType === "PERCENTAGE" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setEditModalDiscountType("PERCENTAGE")}
                    >
                      % Percentual
                    </Button>
                  </div>
                )}

                {(() => {
                  const valor = parseFloat(editModalValue.replace(",", "."));
                  const isDiscountInvalid = editModalMode === "discount" && !isNaN(valor) && valor > 0 && (
                    (editModalDiscountType === "PERCENTAGE" && valor > 100) ||
                    (editModalDiscountType === "FIXED" && valor > preco * item.quantity)
                  );
                  return (
                    <div className="space-y-1">
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0"
                        value={editModalValue}
                        onChange={(e) => setEditModalValue(e.target.value)}
                        autoFocus
                        className={`text-lg h-10 text-center font-semibold ${isDiscountInvalid ? "border-red-500 focus-visible:ring-red-500" : ""}`}
                        onKeyDown={(e) => e.key === "Enter" && confirmarEdicaoModal()}
                      />
                      {isDiscountInvalid && (
                        <p className="text-xs text-red-500 text-center">
                          {editModalDiscountType === "PERCENTAGE"
                            ? "Percentual máximo: 100%"
                            : `Máximo: R$ ${(preco * item.quantity).toFixed(2).replace(".", ",")}`}
                        </p>
                      )}
                    </div>
                  );
                })()}

                <div className="flex gap-2">
                  {editModalMode === "discount" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs text-muted-foreground"
                      onClick={() => { setEditModalValue("0"); confirmarEdicaoModal(); }}
                    >
                      Limpar
                    </Button>
                  )}
                  <div className="flex-1" />
                  <Button variant="outline" size="sm" onClick={() => setEditModalOpen(false)}>
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    onClick={confirmarEdicaoModal}
                    disabled={editModalMode === "discount" && (() => {
                      const valor = parseFloat(editModalValue.replace(",", "."));
                      return !isNaN(valor) && valor > 0 && (
                        (editModalDiscountType === "PERCENTAGE" && valor > 100) ||
                        (editModalDiscountType === "FIXED" && valor > preco * item.quantity)
                      );
                    })()}
                  >
                    OK
                  </Button>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

    {/* Mobile: preenche exatamente o <main> (que já exclui header) via h-full —
        NÃO 100dvh, que transbordaria o main e jogaria a barra de ação para fora
        da dobra. `-mb-20 md:mb-0` cancela o pb-20 do <main> (reserva da bottom-nav
        global, que ocultamos nesta rota). Desktop: altura fixa que o scroll
        interno das colunas exige. */}
    <div className="flex flex-col h-full lg:h-[calc(100vh-3.5rem)] -m-4 -mb-20 md:-m-6">
      {/* Header compacto */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-background flex-shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold">PDV</h1>
          <Badge variant="outline" className="text-xs">
            {products.length} produtos
          </Badge>
        </div>
        <div className="flex gap-1 text-xs">
          <Badge
            variant="secondary"
            role="button"
            tabIndex={0}
            onClick={acaoF2Busca}
            className="text-xs hidden md:inline-flex cursor-pointer hover:bg-secondary/80"
          >
            F2 Busca
          </Badge>
          <Badge
            variant="secondary"
            role="button"
            tabIndex={0}
            onClick={acaoF3Cliente}
            className="text-xs hidden md:inline-flex cursor-pointer hover:bg-secondary/80"
          >
            F3 Cliente
          </Badge>
          <Badge
            variant="secondary"
            role="button"
            tabIndex={0}
            onClick={acaoF4Finalizar}
            className="text-xs hidden md:inline-flex cursor-pointer hover:bg-secondary/80"
          >
            F4 Finalizar
          </Badge>
          <Badge
            variant="secondary"
            role="button"
            tabIndex={0}
            onClick={acaoF8Limpar}
            className="text-xs hidden md:inline-flex cursor-pointer hover:bg-secondary/80"
          >
            F8 Limpar
          </Badge>
        </div>
      </div>

      {/* Abas Produtos/Carrinho — apenas no phone (< tab). No iPad/desktop
          as colunas ficam lado a lado e as abas somem. */}
      <div className="flex tab:hidden border-b flex-shrink-0">
        <button
          type="button"
          onClick={() => setMobileTab("produtos")}
          className={`flex-1 h-11 text-sm font-medium border-b-2 transition-colors ${
            mobileTab === "produtos"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground"
          }`}
        >
          Produtos
        </button>
        <button
          type="button"
          onClick={() => setMobileTab("carrinho")}
          className={`flex-1 h-11 text-sm font-medium border-b-2 transition-colors inline-flex items-center justify-center gap-1.5 ${
            mobileTab === "carrinho"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground"
          }`}
        >
          <ShoppingCart className="h-4 w-4" />
          Carrinho
          {totalItens > 0 && (
            <Badge variant="secondary" className="ml-0.5 h-5 min-w-5 justify-center px-1 text-xs">
              {totalItens}
            </Badge>
          )}
        </button>
      </div>

      {/* Conteúdo principal — sem scroll na página.
          Phone: uma coluna por vez via mobileTab. iPad (tab): lado a lado
          catálogo + carrinho sticky. Desktop (lg): grid 2:1 original. */}
      <div className="flex-1 grid grid-cols-1 tab:grid-cols-[1fr_minmax(340px,380px)] lg:grid-cols-3 gap-0 overflow-hidden">
        {/* Produtos e Busca */}
        <div
          className={`lg:col-span-2 flex-col border-r overflow-hidden ${
            mobileTab === "produtos" ? "flex" : "hidden"
          } tab:flex`}
        >
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
                    // Não bloqueia — aviso é exibido no toast ao adicionar
                  >
                    <div className="flex w-full items-center justify-between">
                      <span className="font-mono text-xs text-muted-foreground">
                        {produto.sku}
                      </span>
                      {produto.stockControlled ? (
                        <Badge variant={produto.stockQty > 10 ? "secondary" : produto.stockQty > 0 ? "outline" : "destructive"} className="text-xs">
                          {produto.stockQty}
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs" title="Sem controle de estoque">
                          ∞
                        </Badge>
                      )}
                    </div>
                    <p className="line-clamp-1 text-left text-sm font-medium">
                      {produto.name}
                    </p>
                    {/* H4: preço promocional destacado + preço cheio riscado */}
                    {produto.onPromotion && produto.originalSalePrice != null ? (
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-xs text-muted-foreground line-through">
                          {formatCurrency(produto.originalSalePrice)}
                        </span>
                        <span className="text-base font-bold text-red-600">
                          {formatCurrency(produto.salePrice)}
                        </span>
                      </div>
                    ) : (
                      <p className="text-base font-bold">
                        {formatCurrency(produto.salePrice)}
                      </p>
                    )}
                  </Button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Coluna direita — Cliente + Vendedor + Carrinho + Resumo.
            Phone: visível quando a aba Carrinho está ativa. iPad/desktop: sempre. */}
        <div
          className={`flex-col overflow-hidden ${
            mobileTab === "carrinho" ? "flex" : "hidden"
          } tab:flex`}
        >
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
                    {cashbackSelecionado != null && cashbackSelecionado > 0 && (
                      <p className="text-xs text-emerald-600 font-medium">
                        Cashback: {formatCurrency(cashbackSelecionado)}
                      </p>
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
                          <p className={`text-xs ${item.stockControlled && item.quantity > item.stockQty ? "text-amber-600 font-medium" : "text-muted-foreground"}`}>
                            {item.stockControlled && item.quantity > item.stockQty
                              ? `⚠️ Estoque: ${item.stockQty} (pedido: ${item.quantity})`
                              : `Estoque: ${item.stockQty}`}
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

            {/* Desconto no total da venda */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground flex-1">Desconto na venda</span>
              <Input
                type="text"
                inputMode="decimal"
                placeholder="0"
                aria-label="Desconto na venda"
                value={descontoVendaValor}
                onChange={(e) => setDescontoVendaValor(e.target.value.replace(/[^\d.,]/g, ""))}
                disabled={carrinho.length === 0}
                className="h-8 w-24 text-sm text-right"
              />
              <div className="flex rounded-md border overflow-hidden">
                <button
                  type="button"
                  onClick={() => setDescontoVendaTipo("FIXED")}
                  className={`px-2 h-8 text-xs ${descontoVendaTipo === "FIXED" ? "bg-primary text-primary-foreground" : "bg-background"}`}
                >
                  R$
                </button>
                <button
                  type="button"
                  onClick={() => setDescontoVendaTipo("PERCENTAGE")}
                  className={`px-2 h-8 text-xs ${descontoVendaTipo === "PERCENTAGE" ? "bg-primary text-primary-foreground" : "bg-background"}`}
                >
                  %
                </button>
              </div>
            </div>
            {desconto > 0 && (
              <div className="flex justify-between text-sm text-orange-600">
                <span>Desconto aplicado</span>
                <span>-{formatCurrency(desconto)}</span>
              </div>
            )}

            <Separator />
            <div className="flex justify-between text-lg font-bold">
              <span>Total</span>
              <span>{formatCurrency(total)}</span>
            </div>
            <Button
              className="w-full hidden tab:flex"
              size="lg"
              disabled={finalizarDisabled}
              onClick={abrirFinalizacao}
            >
              <CreditCard className="mr-2 h-4 w-4" />
              {sellers.length > 0 && !selectedSellerId ? "Selecione o vendedor" : "Finalizar Venda (F4)"}
            </Button>
          </div>
        </div>
      </div>

      {/* Barra de ação fixa — apenas phone (< tab). Mantém Total + Finalizar
          sempre ao alcance do polegar, de qualquer aba, respeitando safe-area. */}
      <div className="tab:hidden flex-shrink-0 border-t bg-background px-4 py-2 pb-safe">
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground">Total ({totalItens} itens)</p>
            <p className="text-lg font-bold leading-tight truncate">{formatCurrency(total)}</p>
          </div>
          <Button
            size="touch"
            className="flex-1"
            disabled={finalizarDisabled}
            onClick={abrirFinalizacao}
          >
            <CreditCard className="mr-2 h-4 w-4" />
            {sellers.length > 0 && !selectedSellerId ? "Vendedor" : "Finalizar"}
          </Button>
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
