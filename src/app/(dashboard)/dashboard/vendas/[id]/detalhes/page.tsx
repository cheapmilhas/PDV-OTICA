"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import toast from "react-hot-toast";
import { ArrowLeft, Loader2, User, ShoppingCart, DollarSign, Calendar, AlertTriangle, Printer, Edit } from "lucide-react";
import Link from "next/link";
import { formatCurrency } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

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

  const [sale, setSale] = useState<SaleDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [canceling, setCanceling] = useState(false);
  const [editSellerOpen, setEditSellerOpen] = useState(false);
  const [users, setUsers] = useState<Array<{ id: string; name: string; email: string }>>([]);
  const [selectedSellerId, setSelectedSellerId] = useState("");
  const [updatingSeller, setUpdatingSeller] = useState(false);

  useEffect(() => {
    const fetchSale = async () => {
      try {
        const res = await fetch(`/api/sales/${id}`);
        if (!res.ok) throw new Error("Erro ao carregar venda");

        const { data } = await res.json();
        setSale(data);
      } catch (error: any) {
        toast.error(error.message);
        router.push("/dashboard/vendas");
      } finally {
        setLoading(false);
      }
    };

    fetchSale();
  }, [id, router]);

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
    return null;
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
          <Link href="/dashboard/vendas">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar
            </Button>
          </Link>
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
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(`/dashboard/vendas/${id}/imprimir`)}
              >
                <Printer className="h-4 w-4 mr-2" />
                Imprimir
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleCancel}
                disabled={canceling}
              >
                {canceling ? "Cancelando..." : "Cancelar Venda"}
              </Button>
            </>
          ) : (
            <Badge variant="destructive">Cancelada</Badge>
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
              {sale.status !== "CANCELED" && sale.status !== "REFUNDED" && (
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
