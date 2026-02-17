"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import toast from "react-hot-toast";
import { ArrowLeft, Loader2, User, ShoppingCart, DollarSign, Calendar, AlertTriangle, Printer, Edit, MessageCircle, Gift, Clock, FileText } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { hasPermission, Permission } from "@/lib/permissions";
import { replaceMessageVariables, openWhatsAppWithMessage } from "@/lib/default-messages";

interface SaleDetails {
  id: string;
  createdAt: string;
  subtotal: number;
  discountTotal: number;
  total: number;
  notes?: string;
  status: string;
  customer: {
    id: string;
    name: string;
    cpf?: string;
    phone?: string;
  };
  sellerUser: {
    id: string;
    name: string;
    email: string;
  };
  branch?: {
    id: string;
    name: string;
  };
  items: Array<{
    id: string;
    qty: number;
    unitPrice: number;
    discount: number;
    lineTotal: number;
    product: {
      id: string;
      name: string;
      sku: string;
      barcode?: string;
    };
  }>;
  payments: Array<{
    id: string;
    method: string;
    amount: number;
    installments: number;
  }>;
}

export default function DetalhesVendaPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const { data: session } = useSession();

  const [sale, setSale] = useState<SaleDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [canceling, setCanceling] = useState(false);
  const [reactivating, setReactivating] = useState(false);
  const [editSellerOpen, setEditSellerOpen] = useState(false);
  const [users, setUsers] = useState<Array<{ id: string; name: string; email: string }>>([]);
  const [selectedSellerId, setSelectedSellerId] = useState("");
  const [updatingSeller, setUpdatingSeller] = useState(false);
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false);
  const [cashbackInfo, setCashbackInfo] = useState<{ amount: number; expiresAt: string | null } | null>(null);

  // Verifica permissões do usuário
  const canCancelSale = hasPermission(session?.user?.role || "", Permission.SALES_CANCEL);
  const canEditSeller = hasPermission(session?.user?.role || "", Permission.SALES_EDIT_SELLER);

  useEffect(() => {
    const fetchSale = async () => {
      try {
        const res = await fetch(`/api/sales/${id}`);
        if (!res.ok) throw new Error("Erro ao carregar venda");

        const { data } = await res.json();
        setSale(data);
      } catch (error: any) {
        toast.error(error.message);
        // Não redireciona em caso de erro, apenas mostra o erro
        setLoading(false);
      } finally {
        setLoading(false);
      }
    };

    fetchSale();
  }, [id]);

  // Buscar cashback da venda
  useEffect(() => {
    const fetchCashback = async () => {
      if (!sale?.id) {
        console.log("⚠️ Sale ID não disponível para buscar cashback");
        return;
      }
      console.log("🔍 Buscando cashback para venda:", sale.id);
      try {
        const res = await fetch(`/api/sales/${sale.id}/cashback`);
        console.log("📡 Resposta da API cashback:", res.status);
        if (res.ok) {
          const data = await res.json();
          console.log("💰 Dados de cashback recebidos:", data);
          setCashbackInfo(data.data);
        } else {
          console.log("❌ Erro na API de cashback:", res.status, await res.text());
        }
      } catch (e) {
        console.log("❌ Erro ao buscar cashback:", e);
      }
    };
    fetchCashback();
  }, [sale?.id]);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await fetch("/api/users?pageSize=100");
        if (!res.ok) throw new Error("Erro ao carregar usuários");

        const { data } = await res.json();
        setUsers(data || []);
      } catch (error: any) {
        console.error("Erro ao carregar usuários:", error);
        toast.error("Erro ao carregar lista de usuários");
      }
    };

    if (editSellerOpen) {
      fetchUsers();
    }
  }, [editSellerOpen]);

  const handleCancel = async () => {
    if (!confirm("Tem certeza que deseja cancelar esta venda? O estoque será estornado.")) {
      return;
    }

    const reason = prompt("Motivo do cancelamento (opcional):");

    setCanceling(true);
    try {
      const res = await fetch(`/api/sales/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error?.message || "Erro ao cancelar venda");
      }

      toast.success("Venda cancelada com sucesso!");
      router.push("/dashboard/vendas");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setCanceling(false);
    }
  };

  const handleUpdateSeller = async () => {
    if (!selectedSellerId) {
      toast.error("Selecione um vendedor");
      return;
    }

    setUpdatingSeller(true);
    try {
      const res = await fetch(`/api/sales/${id}/seller`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sellerId: selectedSellerId }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error?.message || "Erro ao atualizar vendedor");
      }

      const { data } = await res.json();
      setSale(data);
      setEditSellerOpen(false);
      toast.success("Vendedor atualizado com sucesso!");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setUpdatingSeller(false);
    }
  };

  const handleReactivate = async () => {
    if (!confirm("Tem certeza que deseja reativar esta venda? O estoque será decrementado e os pagamentos serão registrados no caixa atual.")) {
      return;
    }

    setReactivating(true);
    try {
      const res = await fetch(`/api/sales/${id}/reactivate`, {
        method: "POST",
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error?.message || "Erro ao reativar venda");
      }

      toast.success("Venda reativada com sucesso!");
      router.push("/dashboard/vendas");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setReactivating(false);
    }
  };

  const handleThankYouWhatsApp = async () => {
    // Verificar se cliente tem telefone e salvar em variável local
    const customerPhone = sale?.customer?.phone;
    if (!customerPhone) {
      toast.error("Cliente não possui telefone cadastrado");
      return;
    }

    setSendingWhatsApp(true);
    try {
      // Buscar configurações da empresa
      const res = await fetch("/api/settings");
      if (!res.ok) throw new Error("Erro ao carregar configurações");

      const { data: settings } = await res.json();

      // Pegar mensagem de agradecimento
      const messageTemplate = settings?.messageThankYou;
      if (!messageTemplate) {
        setSendingWhatsApp(false);
        toast.error("Mensagem de agradecimento não configurada. Acesse Configurações.");
        return;
      }

      // Substituir variáveis na mensagem
      const message = replaceMessageVariables(messageTemplate, {
        cliente: sale?.customer?.name || "Cliente",
        valor: formatCurrency(Number(sale?.total || 0)),
        otica: settings?.displayName || "Ótica",
        data: format(new Date(sale?.createdAt || new Date()), "dd/MM/yyyy", { locale: ptBR }),
        vendedor: sale?.sellerUser?.name || "Vendedor",
      });

      // 1. Baixar PDF em background (não bloqueia a UI)
      window.open(`/dashboard/vendas/${id}/imprimir?autoprint=true`, "_blank");

      // 2. Abrir WhatsApp imediatamente (não aguarda PDF)
      openWhatsAppWithMessage(customerPhone, message);

      toast.success("WhatsApp aberto! Anexe o PDF quando terminar de baixar.");
    } catch (error: any) {
      console.error("Erro ao enviar WhatsApp:", error);
      toast.error(error.message || "Erro ao processar");
    } finally {
      setSendingWhatsApp(false);
    }
  };

  const getPaymentMethodLabel = (method: string) => {
    const labels: Record<string, string> = {
      CASH: "Dinheiro",
      DEBIT_CARD: "Débito",
      CREDIT_CARD: "Crédito",
      PIX: "PIX",
      BANK_SLIP: "Boleto",
      STORE_CREDIT: "Crédito Loja",
    };
    return labels[method] || method;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!sale) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <p className="text-muted-foreground">Venda não encontrada</p>
      </div>
    );
  }

  return (
    <>
      {/* Modal Editar Vendedor */}
      <Dialog open={editSellerOpen} onOpenChange={setEditSellerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alterar Vendedor</DialogTitle>
            <DialogDescription>
              Selecione o novo vendedor responsável por esta venda. Esta alteração não afeta o caixa.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="seller">Vendedor</Label>
              <Select value={selectedSellerId} onValueChange={setSelectedSellerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o vendedor" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name} ({user.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setEditSellerOpen(false)}
                disabled={updatingSeller}
              >
                Cancelar
              </Button>
              <Button
                className="flex-1"
                onClick={handleUpdateSeller}
                disabled={updatingSeller || !selectedSellerId}
              >
                {updatingSeller ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  "Salvar"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.back()}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Detalhes da Venda</h1>
            <p className="text-muted-foreground">
              {format(new Date(sale.createdAt), "dd/MM/yyyy 'às' HH:mm", {
                locale: ptBR,
              })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {sale.status !== "CANCELED" && sale.status !== "REFUNDED" ? (
            <>
              <Badge variant="default">Ativa</Badge>
              {sale.customer?.phone && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleThankYouWhatsApp}
                  disabled={sendingWhatsApp}
                  className="border-green-600 text-green-600 hover:bg-green-50"
                >
                  <MessageCircle className="h-4 w-4 mr-2" />
                  {sendingWhatsApp ? "Enviando..." : "Agradecer pelo WhatsApp"}
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(`/dashboard/vendas/${id}/imprimir`)}
              >
                <Printer className="h-4 w-4 mr-2" />
                Imprimir
              </Button>
              {sale.payments.some((p) => p.method === "STORE_CREDIT") && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(`/api/sales/${id}/carne`, "_blank")}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Imprimir Carnê
                </Button>
              )}
              {canCancelSale && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleCancel}
                  disabled={canceling}
                >
                  {canceling ? "Cancelando..." : "Cancelar Venda"}
                </Button>
              )}
            </>
          ) : (
            <>
              <Badge variant="destructive">Cancelada</Badge>
              {canCancelSale && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleReactivate}
                  disabled={reactivating}
                >
                  {reactivating ? "Reativando..." : "Reativar Venda"}
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Venda Cancelada Alert */}
      {(sale.status === "CANCELED" || sale.status === "REFUNDED") && (
        <Card className="border-destructive bg-destructive/10">
          <CardContent className="flex items-center gap-2 p-4">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <p className="text-sm text-destructive">
              Esta venda foi cancelada e o estoque foi estornado.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Subtotal
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {formatCurrency(Number(sale.subtotal))}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Desconto
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-orange-600">
              {formatCurrency(Number(sale.discountTotal))}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-primary">
              {formatCurrency(Number(sale.total))}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Cliente */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Cliente
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>
              <p className="text-sm text-muted-foreground">Nome</p>
              <p className="font-semibold">{sale.customer.name}</p>
            </div>
            {sale.customer.cpf && (
              <div>
                <p className="text-sm text-muted-foreground">CPF</p>
                <p>{sale.customer.cpf}</p>
              </div>
            )}
            {sale.customer.phone && (
              <div>
                <p className="text-sm text-muted-foreground">Telefone</p>
                <p>{sale.customer.phone}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Informações da Venda */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Informações
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">Vendedor</p>
                <p className="font-semibold">{sale.sellerUser.name}</p>
              </div>
              {canEditSeller && sale.status !== "CANCELED" && sale.status !== "REFUNDED" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedSellerId(sale.sellerUser.id);
                    setEditSellerOpen(true);
                  }}
                >
                  <Edit className="h-4 w-4" />
                </Button>
              )}
            </div>
            {sale.branch && (
              <div>
                <p className="text-sm text-muted-foreground">Filial</p>
                <p>{sale.branch.name}</p>
              </div>
            )}
            <div>
              <p className="text-sm text-muted-foreground">Data/Hora</p>
              <p>
                {format(new Date(sale.createdAt), "dd/MM/yyyy 'às' HH:mm", {
                  locale: ptBR,
                })}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Itens da Venda */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            Itens ({sale.items.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {sale.items.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between border-b pb-3 last:border-0"
              >
                <div className="flex-1">
                  <p className="font-semibold">{item.product.name}</p>
                  <p className="text-sm text-muted-foreground">
                    SKU: {item.product.sku}
                    {item.product.barcode && ` • Código: ${item.product.barcode}`}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {item.qty} x {formatCurrency(Number(item.unitPrice))}
                    {item.discount > 0 && (
                      <span className="text-orange-600">
                        {" "}
                        - {formatCurrency(Number(item.discount))} desconto
                      </span>
                    )}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-lg">
                    {formatCurrency(Number(item.lineTotal))}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Pagamentos */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Formas de Pagamento
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {sale.payments.map((payment) => (
              <div
                key={payment.id}
                className="flex items-center justify-between border-b pb-3 last:border-0"
              >
                <div>
                  <Badge variant="outline">
                    {getPaymentMethodLabel(payment.method)}
                  </Badge>
                  {payment.installments > 1 && (
                    <span className="text-sm text-muted-foreground ml-2">
                      {payment.installments}x
                    </span>
                  )}
                </div>
                <p className="font-bold text-lg">
                  {formatCurrency(Number(payment.amount))}
                </p>
              </div>
            ))}
            <div className="flex items-center justify-between pt-3 border-t-2">
              <p className="font-bold">Total Pago</p>
              <p className="font-bold text-xl text-primary">
                {formatCurrency(Number(sale.total))}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cashback Gerado */}
      {(() => {
        console.log("🔍 DEBUG cashbackInfo:", cashbackInfo);
        console.log("🔍 DEBUG amount:", cashbackInfo?.amount);
        return null;
      })()}
      {cashbackInfo && Number(cashbackInfo.amount) > 0 ? (
        <Card className="border-purple-200 bg-purple-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-purple-700">
              <Gift className="h-5 w-5" />
              Cashback Gerado
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-sm text-muted-foreground">Valor Creditado</p>
                <p className="text-2xl font-bold text-purple-600">
                  {formatCurrency(Number(cashbackInfo.amount))}
                </p>
              </div>
              {cashbackInfo.expiresAt && (
                <div>
                  <p className="text-sm text-muted-foreground">Válido até</p>
                  <p className="font-medium flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    {format(new Date(cashbackInfo.expiresAt), "dd/MM/yyyy", { locale: ptBR })}
                  </p>
                </div>
              )}
            </div>
            {sale?.customer && (
              <p className="text-sm text-muted-foreground border-t pt-3">
                💰 Cashback creditado para {sale.customer.name}
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="border-gray-200 bg-gray-50">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">
              {cashbackInfo === null
                ? "⏳ Carregando informações de cashback..."
                : "ℹ️ Nenhum cashback gerado nesta venda"}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Observações */}
      {sale.notes && (
        <Card>
          <CardHeader>
            <CardTitle>Observações</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground whitespace-pre-wrap">{sale.notes}</p>
          </CardContent>
        </Card>
      )}
      </div>
    </>
  );
}
