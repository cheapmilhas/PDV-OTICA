"use client";

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ArrowLeft, Plus, Trash2, Save, ChevronDown, Package, Loader2, Tag } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { calculateTotals } from "@/lib/sale-totals";
import { useRouter, useParams } from "next/navigation";
import toast from "react-hot-toast";
import { ProductSearch } from "@/components/quotes/product-search";

interface Product {
  id: string;
  sku: string;
  name: string;
  salePrice: number;
  stockQty: number;
}

interface QuoteItem {
  id: string;
  productId?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  // Edição por item (mesma mecânica do PDV): preço ajustável + desconto R$/%.
  customPrice?: number;
  discountValue?: number;
  discountType?: "FIXED" | "PERCENTAGE";
  itemType: "PRODUCT" | "SERVICE" | "CUSTOM";
  prescriptionData?: any;
  notes?: string;
  sku?: string;
  stockQty?: number;
}

function EditarOrcamentoPage() {
  const router = useRouter();
  const params = useParams();
  const quoteId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [quoteNumber, setQuoteNumber] = useState("");

  // Cliente
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");

  // Itens
  const [items, setItems] = useState<QuoteItem[]>([]);
  const [showManualItem, setShowManualItem] = useState(false);
  const [newItemDescription, setNewItemDescription] = useState("");
  const [newItemQuantity, setNewItemQuantity] = useState(1);
  const [newItemPrice, setNewItemPrice] = useState(0);
  const [newItemType, setNewItemType] = useState<"PRODUCT" | "SERVICE" | "CUSTOM">("PRODUCT");

  // Receita (Prescrição)
  const [prescriptionData, setPrescriptionData] = useState({
    od: { esf: "", cil: "", eixo: "", dnp: "", altura: "" },
    oe: { esf: "", cil: "", eixo: "", dnp: "", altura: "" },
    adicao: "",
    tipoLente: "",
    material: "",
    tratamentos: [] as string[],
  });

  // Valores
  const [discountPercent, setDiscountPercent] = useState(0);
  const [discountTotal, setDiscountTotal] = useState(0);
  const [notes, setNotes] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [paymentConditions, setPaymentConditions] = useState("");
  const [validDays, setValidDays] = useState(15);
  const [showPrescription, setShowPrescription] = useState(false);

  // Modal de editar preço/desconto por item (portado do PDV).
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editModalMode, setEditModalMode] = useState<"price" | "discount">("price");
  const [editModalItemId, setEditModalItemId] = useState<string>("");
  const [editModalValue, setEditModalValue] = useState("");
  const [editModalDiscountType, setEditModalDiscountType] = useState<"FIXED" | "PERCENTAGE">("FIXED");

  // Carregar dados do orçamento
  useEffect(() => {
    const loadQuote = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/quotes/${quoteId}`);

        if (!res.ok) {
          throw new Error("Erro ao carregar orçamento");
        }

        const data = await res.json();
        const quote = data.data;

        // Preencher dados do cliente
        if (quote.customer) {
          setCustomerId(quote.customer.id);
          setCustomerName(quote.customer.name);
          setCustomerPhone(quote.customer.phone || "");
          setCustomerEmail(quote.customer.email || "");
        } else {
          setCustomerName(quote.customerName || "");
          setCustomerPhone(quote.customerPhone || "");
          setCustomerEmail(quote.customerEmail || "");
        }

        // Preencher itens. O desconto salvo (R$) é remapeado para discountValue
        // FIXED para que continue editável e não se perca ao reabrir a edição.
        const loadedItems = quote.items.map((item: any) => ({
          id: item.id,
          productId: item.productId,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discount: item.discount,
          discountValue: item.discount > 0 ? item.discount : undefined,
          discountType: item.discount > 0 ? ("FIXED" as const) : undefined,
          itemType: item.itemType,
          notes: item.notes,
          sku: item.product?.sku,
          stockQty: item.product?.stockQty,
          prescriptionData: item.prescriptionData,
        }));
        setItems(loadedItems);

        // Preencher dados de prescrição (do primeiro item que tiver)
        const itemWithPrescription = quote.items.find((item: any) => item.prescriptionData);
        if (itemWithPrescription?.prescriptionData) {
          setPrescriptionData(itemWithPrescription.prescriptionData);
          setShowPrescription(true);
        }

        // Preencher valores
        setDiscountPercent(quote.discountPercent || 0);
        setDiscountTotal(quote.discountTotal || 0);
        setNotes(quote.notes || "");
        setInternalNotes(quote.internalNotes || "");
        setPaymentConditions(quote.paymentConditions || "");
        setValidDays(quote.validDays || 15);
        setQuoteNumber(quote.quoteNumber || "");

      } catch (error: any) {
        console.error("Erro ao carregar orçamento:", error);
        toast.error(error.message || "Erro ao carregar orçamento");
        router.push("/dashboard/orcamentos");
      } finally {
        setLoading(false);
      }
    };

    if (quoteId) {
      loadQuote();
    }
  }, [quoteId, router]);

  const addProductFromSearch = (product: Product) => {
    const newItem: QuoteItem = {
      id: Math.random().toString(36).substr(2, 9),
      productId: product.id,
      description: product.name,
      quantity: 1,
      unitPrice: product.salePrice,
      discount: 0,
      itemType: "PRODUCT",
      sku: product.sku,
      stockQty: product.stockQty,
    };

    setItems([...items, newItem]);
    toast.success("Produto adicionado");
  };

  const addManualItem = () => {
    if (!newItemDescription || newItemPrice <= 0) {
      toast.error("Preencha descrição e preço do item");
      return;
    }

    const newItem: QuoteItem = {
      id: Math.random().toString(36).substr(2, 9),
      description: newItemDescription,
      quantity: newItemQuantity,
      unitPrice: newItemPrice,
      discount: 0,
      itemType: newItemType,
    };

    setItems([...items, newItem]);
    setNewItemDescription("");
    setNewItemQuantity(1);
    setNewItemPrice(0);
    setShowManualItem(false);
    toast.success("Item adicionado");
  };

  const updateItemQuantity = (id: string, quantity: number) => {
    if (quantity < 1) return;
    setItems(items.map((item) => (item.id === id ? { ...item, quantity } : item)));
  };

  const removeItem = (id: string) => {
    setItems(items.filter((item) => item.id !== id));
    toast.success("Item removido");
  };

  // Preço efetivo do item: o ajustado pelo usuário (customPrice) ou o original.
  const precoEfetivo = (item: QuoteItem): number => item.customPrice ?? item.unitPrice;

  // Desconto do item em R$ (resolve % vs R$, igual ao PDV).
  const calcularDescontoItem = (item: QuoteItem): number => {
    if (!item.discountValue || item.discountValue <= 0) return 0;
    const preco = precoEfetivo(item);
    if (item.discountType === "PERCENTAGE") {
      return (preco * item.quantity * item.discountValue) / 100;
    }
    return item.discountValue; // FIXED
  };

  const editarPreco = (itemId: string) => {
    const item = items.find((i) => i.id === itemId);
    if (!item) return;
    setEditModalItemId(itemId);
    setEditModalMode("price");
    setEditModalValue(precoEfetivo(item).toString());
    setEditModalOpen(true);
  };

  const editarDesconto = (itemId: string) => {
    const item = items.find((i) => i.id === itemId);
    if (!item) return;
    setEditModalItemId(itemId);
    setEditModalMode("discount");
    setEditModalDiscountType(item.discountType || "FIXED");
    setEditModalValue(item.discountValue ? item.discountValue.toString() : "");
    setEditModalOpen(true);
  };

  const resetarPreco = (itemId: string) => {
    setItems(items.map((i) => (i.id === itemId ? { ...i, customPrice: undefined } : i)));
    toast.success("Preço restaurado");
  };

  const confirmarEdicaoModal = () => {
    const item = items.find((i) => i.id === editModalItemId);
    if (!item) return;

    if (editModalMode === "price") {
      const preco = parseFloat(editModalValue.replace(",", "."));
      if (isNaN(preco) || preco <= 0) {
        toast.error("Preço inválido");
        return;
      }
      setItems(items.map((i) => (i.id === editModalItemId ? { ...i, customPrice: preco } : i)));
      toast.success(`Preço alterado para R$ ${preco.toFixed(2)}`);
    } else {
      if (!editModalValue || editModalValue === "0") {
        setItems(items.map((i) => (i.id === editModalItemId ? { ...i, discountValue: undefined, discountType: undefined } : i)));
        toast.success("Desconto removido");
        setEditModalOpen(false);
        return;
      }

      const valor = parseFloat(editModalValue.replace(",", "."));
      if (isNaN(valor) || valor < 0) {
        toast.error("Valor inválido");
        return;
      }

      const preco = precoEfetivo(item);
      if (editModalDiscountType === "PERCENTAGE" && valor > 100) {
        toast.error("Percentual máximo: 100%");
        return;
      }
      if (editModalDiscountType === "FIXED" && valor > preco * item.quantity) {
        toast.error("Desconto maior que o total do item");
        return;
      }

      setItems(items.map((i) =>
        i.id === editModalItemId
          ? { ...i, discountValue: valor, discountType: editModalDiscountType }
          : i
      ));

      const calc = editModalDiscountType === "PERCENTAGE" ? (preco * item.quantity * valor) / 100 : valor;
      toast.success(`Desconto de ${editModalDiscountType === "PERCENTAGE" ? `${valor}%` : `R$ ${valor.toFixed(2)}`} aplicado (-R$ ${calc.toFixed(2)})`);
    }

    setEditModalOpen(false);
  };

  // TEC-06: usa o helper único (mesma fórmula do backend, decimal.js).
  const calculateSubtotal = () =>
    calculateTotals({
      items: items.map((i) => ({ qty: i.quantity, unitPrice: precoEfetivo(i), discount: calcularDescontoItem(i) })),
    }).subtotal;

  const calculateTotal = () =>
    calculateTotals({
      items: items.map((i) => ({ qty: i.quantity, unitPrice: precoEfetivo(i), discount: calcularDescontoItem(i) })),
      discount: discountTotal,
      discountPercent,
    }).total;

  const handleSave = async () => {
    if (!customerName && !customerId) {
      toast.error("Informe o nome do cliente");
      return;
    }

    if (items.length === 0) {
      toast.error("Adicione pelo menos um item");
      return;
    }

    setSaving(true);

    try {
      // Montar payload
      const payload = {
        customerId: customerId || undefined,
        customerName: !customerId ? customerName : undefined,
        customerPhone: !customerId ? customerPhone : undefined,
        customerEmail: !customerId ? customerEmail : undefined,
        items: items.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          // Persiste o preço efetivo (ajustado) e o desconto já resolvido em R$.
          unitPrice: precoEfetivo(item),
          discount: calcularDescontoItem(item),
          itemType: item.itemType,
          productId: item.productId,
          prescriptionData:
            prescriptionData.od.esf || prescriptionData.oe.esf
              ? prescriptionData
              : undefined,
          notes: item.notes,
        })),
        discountTotal,
        discountPercent,
        notes,
        internalNotes,
        paymentConditions,
        validDays,
      };

      const res = await fetch(`/api/quotes/${quoteId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Erro ao atualizar orçamento");
      }

      toast.success("Orçamento atualizado com sucesso!");
      router.push(`/dashboard/orcamentos/${quoteId}`);
    } catch (error: any) {
      console.error("Erro:", error);
      toast.error(error.message || "Erro ao salvar orçamento");
      setSaving(false);
    }
  };

  const tratamentosOptions = [
    "Antirreflexo",
    "Fotossensível",
    "Blue Light",
    "Anti-risco",
    "Polarizado",
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Carregando orçamento...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-20">
      {/* Modal Editar Preço / Desconto (portado do PDV) */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="max-w-xs p-4">
          {(() => {
            const item = items.find((i) => i.id === editModalItemId);
            if (!item) return null;
            const preco = precoEfetivo(item);
            return (
              <>
                <div className="space-y-1">
                  <p className="font-semibold text-sm truncate">{item.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {editModalMode === "price"
                      ? `Original: R$ ${item.unitPrice.toFixed(2)}`
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

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Editar Orçamento #{quoteNumber}</h1>
            <p className="text-muted-foreground">Altere os dados do orçamento</p>
          </div>
        </div>
      </div>

      {/* Cliente */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            👤 Cliente
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Nome do Cliente *</Label>
              <Input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Digite o nome do cliente"
                disabled={!!customerId}
              />
            </div>
            <div>
              <Label>Telefone</Label>
              <Input
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="(00) 00000-0000"
                disabled={!!customerId}
              />
            </div>
            <div className="md:col-span-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                placeholder="cliente@email.com"
                disabled={!!customerId}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Itens */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            📦 Itens do Orçamento
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Buscar Produto do Estoque */}
          <div className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold flex items-center gap-2">
                <Package className="h-5 w-5" />
                Buscar Produto do Estoque
              </h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowManualItem(!showManualItem)}
              >
                {showManualItem ? "Ocultar" : "Item Manual/Customizado"}
              </Button>
            </div>
            <ProductSearch onSelectProduct={addProductFromSearch} />
          </div>

          {/* Adicionar Item Manual (Opcional) */}
          {showManualItem && (
            <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
              <h3 className="font-semibold text-sm text-muted-foreground">
                Adicionar Item Manual (Serviço/Customizado)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                <div className="md:col-span-2">
                  <Label>Descrição *</Label>
                  <Input
                    value={newItemDescription}
                    onChange={(e) => setNewItemDescription(e.target.value)}
                    placeholder="Ex: Manutenção de Armação"
                  />
                </div>
                <div>
                  <Label>Qtd *</Label>
                  <Input
                    type="number"
                    min="1"
                    value={newItemQuantity}
                    onChange={(e) => setNewItemQuantity(parseInt(e.target.value) || 1)}
                  />
                </div>
                <div>
                  <Label>Preço Unit. *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={newItemPrice}
                    onChange={(e) => setNewItemPrice(parseFloat(e.target.value) || 0)}
                    placeholder="0,00"
                  />
                </div>
                <div>
                  <Label>Tipo</Label>
                  <Select
                    value={newItemType}
                    onValueChange={(v: any) => setNewItemType(v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SERVICE">Serviço</SelectItem>
                      <SelectItem value="CUSTOM">Customizado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button onClick={addManualItem} size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Item Manual
              </Button>
            </div>
          )}

          {/* Lista de Itens */}
          {items.length > 0 && (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left p-2">Descrição</th>
                    <th className="text-left p-2 w-28">SKU</th>
                    <th className="text-center p-2 w-24">Estoque</th>
                    <th className="text-center p-2 w-20">Qtd</th>
                    <th className="text-right p-2 w-32">Preço Unit.</th>
                    <th className="text-right p-2 w-32">Total</th>
                    <th className="w-12"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className="border-t">
                      <td className="p-2">
                        <div>
                          <p className="font-medium">{item.description}</p>
                          {item.itemType !== "PRODUCT" && (
                            <span className="text-xs text-muted-foreground">
                              {item.itemType === "SERVICE" ? "Serviço" : "Customizado"}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-2 text-sm text-muted-foreground">
                        {item.sku || "-"}
                      </td>
                      <td className="text-center p-2 text-sm">
                        {item.stockQty !== undefined ? (
                          <span
                            className={
                              item.stockQty < item.quantity
                                ? "text-red-600 font-semibold"
                                : "text-muted-foreground"
                            }
                          >
                            {item.stockQty}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="text-center p-2">
                        <Input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) =>
                            updateItemQuantity(item.id, parseInt(e.target.value) || 1)
                          }
                          className="w-16 text-center"
                        />
                      </td>
                      <td className="text-right p-2">
                        <div className="flex flex-col items-end gap-0.5">
                          <div className="flex items-center gap-1">
                            {item.customPrice !== undefined && item.customPrice !== item.unitPrice && (
                              <span className="text-xs text-muted-foreground line-through">
                                {formatCurrency(item.unitPrice)}
                              </span>
                            )}
                            <span className="font-medium">{formatCurrency(precoEfetivo(item))}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 px-1 text-xs"
                              onClick={() => editarPreco(item.id)}
                            >
                              Editar
                            </Button>
                            {item.customPrice !== undefined && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-5 px-1 text-xs text-muted-foreground"
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
                        </div>
                      </td>
                      <td className="text-right p-2 font-semibold">
                        <div className="flex flex-col items-end gap-0.5">
                          <span>{formatCurrency(precoEfetivo(item) * item.quantity - calcularDescontoItem(item))}</span>
                          {calcularDescontoItem(item) > 0 && (
                            <span className="text-xs text-green-600">
                              {item.discountType === "PERCENTAGE"
                                ? `-${item.discountValue}%`
                                : `-${formatCurrency(calcularDescontoItem(item))}`}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeItem(item.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Receita (Colapsável) */}
      <Card>
        <CardHeader
          className="cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={() => setShowPrescription(!showPrescription)}
        >
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              👓 Dados da Receita (Opcional)
            </span>
            <ChevronDown
              className={`h-5 w-5 transition-transform ${showPrescription ? "rotate-180" : ""}`}
            />
          </CardTitle>
        </CardHeader>
        {showPrescription && (
          <CardContent className="space-y-6">
            {/* Olho Direito */}
            <div className="space-y-3">
              <h3 className="font-semibold">Olho Direito (OD)</h3>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div>
                  <Label>Esférico</Label>
                  <Input
                    value={prescriptionData.od.esf}
                    onChange={(e) =>
                      setPrescriptionData({
                        ...prescriptionData,
                        od: { ...prescriptionData.od, esf: e.target.value },
                      })
                    }
                    placeholder="+2.00"
                  />
                </div>
                <div>
                  <Label>Cilíndrico</Label>
                  <Input
                    value={prescriptionData.od.cil}
                    onChange={(e) =>
                      setPrescriptionData({
                        ...prescriptionData,
                        od: { ...prescriptionData.od, cil: e.target.value },
                      })
                    }
                    placeholder="-0.50"
                  />
                </div>
                <div>
                  <Label>Eixo</Label>
                  <Input
                    value={prescriptionData.od.eixo}
                    onChange={(e) =>
                      setPrescriptionData({
                        ...prescriptionData,
                        od: { ...prescriptionData.od, eixo: e.target.value },
                      })
                    }
                    placeholder="90°"
                  />
                </div>
                <div>
                  <Label>DNP</Label>
                  <Input
                    value={prescriptionData.od.dnp}
                    onChange={(e) =>
                      setPrescriptionData({
                        ...prescriptionData,
                        od: { ...prescriptionData.od, dnp: e.target.value },
                      })
                    }
                    placeholder="32mm"
                  />
                </div>
                <div>
                  <Label>Altura</Label>
                  <Input
                    value={prescriptionData.od.altura}
                    onChange={(e) =>
                      setPrescriptionData({
                        ...prescriptionData,
                        od: { ...prescriptionData.od, altura: e.target.value },
                      })
                    }
                    placeholder="20mm"
                  />
                </div>
              </div>
            </div>

            {/* Olho Esquerdo */}
            <div className="space-y-3">
              <h3 className="font-semibold">Olho Esquerdo (OE)</h3>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div>
                  <Label>Esférico</Label>
                  <Input
                    value={prescriptionData.oe.esf}
                    onChange={(e) =>
                      setPrescriptionData({
                        ...prescriptionData,
                        oe: { ...prescriptionData.oe, esf: e.target.value },
                      })
                    }
                    placeholder="+1.75"
                  />
                </div>
                <div>
                  <Label>Cilíndrico</Label>
                  <Input
                    value={prescriptionData.oe.cil}
                    onChange={(e) =>
                      setPrescriptionData({
                        ...prescriptionData,
                        oe: { ...prescriptionData.oe, cil: e.target.value },
                      })
                    }
                    placeholder="-0.75"
                  />
                </div>
                <div>
                  <Label>Eixo</Label>
                  <Input
                    value={prescriptionData.oe.eixo}
                    onChange={(e) =>
                      setPrescriptionData({
                        ...prescriptionData,
                        oe: { ...prescriptionData.oe, eixo: e.target.value },
                      })
                    }
                    placeholder="85°"
                  />
                </div>
                <div>
                  <Label>DNP</Label>
                  <Input
                    value={prescriptionData.oe.dnp}
                    onChange={(e) =>
                      setPrescriptionData({
                        ...prescriptionData,
                        oe: { ...prescriptionData.oe, dnp: e.target.value },
                      })
                    }
                    placeholder="31mm"
                  />
                </div>
                <div>
                  <Label>Altura</Label>
                  <Input
                    value={prescriptionData.oe.altura}
                    onChange={(e) =>
                      setPrescriptionData({
                        ...prescriptionData,
                        oe: { ...prescriptionData.oe, altura: e.target.value },
                      })
                    }
                    placeholder="20mm"
                  />
                </div>
              </div>
            </div>

            {/* Dados Adicionais */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>Adição</Label>
                <Input
                  value={prescriptionData.adicao}
                  onChange={(e) =>
                    setPrescriptionData({
                      ...prescriptionData,
                      adicao: e.target.value,
                    })
                  }
                  placeholder="+2.00"
                />
              </div>
              <div>
                <Label>Tipo de Lente</Label>
                <Select
                  value={prescriptionData.tipoLente}
                  onValueChange={(v) =>
                    setPrescriptionData({ ...prescriptionData, tipoLente: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Visão Simples">Visão Simples</SelectItem>
                    <SelectItem value="Bifocal">Bifocal</SelectItem>
                    <SelectItem value="Multifocal">Multifocal</SelectItem>
                    <SelectItem value="Ocupacional">Ocupacional</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Material</Label>
                <Select
                  value={prescriptionData.material}
                  onValueChange={(v) =>
                    setPrescriptionData({ ...prescriptionData, material: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Resina 1.50">Resina 1.50</SelectItem>
                    <SelectItem value="Resina 1.56">Resina 1.56</SelectItem>
                    <SelectItem value="Resina 1.61">Resina 1.61</SelectItem>
                    <SelectItem value="Resina 1.67">Resina 1.67</SelectItem>
                    <SelectItem value="Resina 1.74">Resina 1.74</SelectItem>
                    <SelectItem value="Policarbonato">Policarbonato</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Tratamentos */}
            <div>
              <Label>Tratamentos</Label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-2">
                {tratamentosOptions.map((trat) => (
                  <div key={trat} className="flex items-center space-x-2">
                    <Checkbox
                      id={trat}
                      checked={prescriptionData.tratamentos.includes(trat)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setPrescriptionData({
                            ...prescriptionData,
                            tratamentos: [...prescriptionData.tratamentos, trat],
                          });
                        } else {
                          setPrescriptionData({
                            ...prescriptionData,
                            tratamentos: prescriptionData.tratamentos.filter(
                              (t) => t !== trat
                            ),
                          });
                        }
                      }}
                    />
                    <label
                      htmlFor={trat}
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      {trat}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Valores e Configurações */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            💰 Valores e Condições
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Desconto (%)</Label>
              <Input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={discountPercent}
                onChange={(e) => {
                  setDiscountPercent(parseFloat(e.target.value) || 0);
                  setDiscountTotal(0);
                }}
              />
            </div>
            <div>
              <Label>Desconto (R$)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={discountTotal}
                onChange={(e) => {
                  setDiscountTotal(parseFloat(e.target.value) || 0);
                  setDiscountPercent(0);
                }}
              />
            </div>
            <div>
              <Label>Válido por (dias)</Label>
              <Input
                type="number"
                min="1"
                value={validDays}
                onChange={(e) => setValidDays(parseInt(e.target.value) || 15)}
              />
            </div>
          </div>

          <div>
            <Label>Condições de Pagamento</Label>
            <Textarea
              value={paymentConditions}
              onChange={(e) => setPaymentConditions(e.target.value)}
              placeholder="Ex: 3x sem juros no cartão, 10% desconto à vista"
              rows={2}
            />
          </div>

          <div>
            <Label>Observações (visível no orçamento)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observações que aparecerão no PDF do orçamento"
              rows={3}
            />
          </div>

          <div>
            <Label>Notas Internas (não visível no orçamento)</Label>
            <Textarea
              value={internalNotes}
              onChange={(e) => setInternalNotes(e.target.value)}
              placeholder="Anotações internas, não aparecem no PDF"
              rows={2}
            />
          </div>

          {/* Resumo */}
          <div className="border-t pt-4 space-y-2">
            <div className="flex justify-between text-lg">
              <span>Subtotal:</span>
              <span className="font-semibold">{formatCurrency(calculateSubtotal())}</span>
            </div>
            <div className="flex justify-between text-lg text-red-600">
              <span>Desconto:</span>
              <span className="font-semibold">
                -{" "}
                {formatCurrency(
                  discountPercent > 0
                    ? calculateSubtotal() * (discountPercent / 100)
                    : discountTotal
                )}
              </span>
            </div>
            <div className="flex justify-between text-2xl border-t pt-2">
              <span className="font-bold">TOTAL:</span>
              <span className="font-bold text-primary">
                {formatCurrency(calculateTotal())}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Botões de Ação */}
      <div className="flex gap-4 sticky bottom-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 py-4 border-t">
        <Button variant="outline" onClick={() => router.back()} className="flex-1">
          Cancelar
        </Button>
        <Button onClick={handleSave} disabled={saving} className="flex-1">
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Salvando...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Salvar Alterações
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <ProtectedRoute permission="quotes.edit">
      <EditarOrcamentoPage />
    </ProtectedRoute>
  );
}
