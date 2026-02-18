"use client";

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  ArrowLeft,
  Edit,
  Loader2,
  User,
  Phone,
  Mail,
  MapPin,
  FileText,
  ShoppingCart,
  Wrench,
  TrendingUp,
  Calendar,
  DollarSign,
  Wallet,
  AlertCircle,
  History,
  TrendingDown,
  XCircle,
  Gift,
  Clock,
} from "lucide-react";
import Link from "next/link";
import { formatCurrency } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import toast from "react-hot-toast";

interface Customer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  cpf?: string;
  cnpj?: string;
  type: "INDIVIDUAL" | "BUSINESS";
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  createdAt: string;
}

interface Sale {
  id: string;
  total: number;
  status: string;
  createdAt: string;
  items: Array<{
    qty: number;
    product: { name: string };
  }>;
}

interface Quote {
  id: string;
  total: number;
  status: string;
  validUntil: string;
  createdAt: string;
  _count: { items: number };
}

interface ServiceOrder {
  id: string;
  status: string;
  totalValue: number;
  createdAt: string;
  deliveryDate?: string;
}

interface CashbackInfo {
  balance: number;
  totalEarned: number;
  totalUsed: number;
  totalExpired: number;
  expiringAmount: number;
  expiringCount: number;
  nextExpirationDate: Date | null;
}

interface CashbackMovement {
  id: string;
  type: "CREDIT" | "DEBIT" | "EXPIRED" | "BONUS" | "ADJUSTMENT";
  amount: number;
  expiresAt: string | null;
  expired: boolean;
  description: string | null;
  createdAt: string;
}

interface CustomerStats {
  totalSales: number;
  totalSpent: number;
  averageTicket: number;
  lastPurchase: string | null;
  totalQuotes: number;
  totalServiceOrders: number;
  cashback: CashbackInfo | null;
}

function ClienteDetalhesPage() {
  const params = useParams();
  const router = useRouter();
  const customerId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [sales, setSales] = useState<Sale[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [serviceOrders, setServiceOrders] = useState<ServiceOrder[]>([]);
  const [stats, setStats] = useState<CustomerStats | null>(null);
  const [cashbackMovements, setCashbackMovements] = useState<CashbackMovement[]>([]);
  const [receivables, setReceivables] = useState<any[]>([]);
  const [receivablesSummary, setReceivablesSummary] = useState<{ totalPending: number; totalReceived: number; count: number } | null>(null);

  useEffect(() => {
    const fetchCustomerData = async () => {
      try {
        setLoading(true);

        // Buscar dados do cliente
        console.log("=== DEBUG: Buscando cliente ID:", customerId);
        const customerRes = await fetch(`/api/customers/${customerId}`);
        if (!customerRes.ok) throw new Error("Cliente não encontrado");
        const customerData = await customerRes.json();
        console.log("=== DEBUG: Customer Data:", JSON.stringify(customerData, null, 2));
        // A API retorna { data: customer }, não customer direto
        const customer = customerData.data || customerData;
        console.log("=== DEBUG: Customer name:", customer?.name);
        setCustomer(customer);

        // Buscar vendas do cliente
        try {
          const salesRes = await fetch(`/api/sales?customerId=${customerId}&pageSize=100`);
          if (salesRes.ok) {
            const salesData = await salesRes.json();
            setSales(salesData.data || []);
          } else {
            console.warn("Erro ao buscar vendas:", await salesRes.text());
            setSales([]);
          }
        } catch (err) {
          console.error("Erro ao buscar vendas:", err);
          setSales([]);
        }

        // Buscar orçamentos do cliente
        try {
          const quotesRes = await fetch(`/api/quotes?customerId=${customerId}&pageSize=100`);
          if (quotesRes.ok) {
            const quotesData = await quotesRes.json();
            setQuotes(quotesData.data || []);
          } else {
            console.warn("Erro ao buscar orçamentos:", await quotesRes.text());
            setQuotes([]);
          }
        } catch (err) {
          console.error("Erro ao buscar orçamentos:", err);
          setQuotes([]);
        }

        // Buscar ordens de serviço do cliente
        try {
          const ordersRes = await fetch(`/api/service-orders?customerId=${customerId}&pageSize=100`);
          if (ordersRes.ok) {
            const ordersData = await ordersRes.json();
            setServiceOrders(ordersData.data || []);
          } else {
            console.warn("Erro ao buscar ordens de serviço:", await ordersRes.text());
            setServiceOrders([]);
          }
        } catch (err) {
          console.error("Erro ao buscar ordens de serviço:", err);
          setServiceOrders([]);
        }

        // Buscar parcelas do cliente
        try {
          const receivablesRes = await fetch(`/api/customers/${customerId}/receivables`);
          if (receivablesRes.ok) {
            const receivablesData = await receivablesRes.json();
            setReceivables(receivablesData.data || []);
            setReceivablesSummary(receivablesData.summary || null);
          }
        } catch (err) {
          console.error("Erro ao buscar parcelas:", err);
        }

        // Buscar cashback do cliente
        try {
          const cashbackRes = await fetch(`/api/cashback/customer/${customerId}`);
          if (cashbackRes.ok) {
            const cashbackData = await cashbackRes.json();
            const data = cashbackData.data;

            // Calcular próximos vencimentos (30 dias)
            const expiringMovements = (data.history || []).filter((m: any) => {
              if (m.type !== 'CREDIT' || m.expired || !m.expiresAt) return false;
              const expiresAt = new Date(m.expiresAt);
              const daysUntilExpiration = Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
              return daysUntilExpiration > 0 && daysUntilExpiration <= 30;
            });

            const expiringAmount = expiringMovements.reduce((sum: number, m: any) => sum + Number(m.amount), 0);
            const nextExpiration = expiringMovements.length > 0
              ? expiringMovements.sort((a: any, b: any) =>
                  new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime()
                )[0].expiresAt
              : null;

            // Pegar movimentos recentes (últimos 20)
            const recentMovements = (data.history || [])
              .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
              .slice(0, 20);

            setCashbackMovements(recentMovements);

            // Atualizar stats com cashback
            setStats((prev) => ({
              ...prev!,
              cashback: {
                balance: Number(data.customerCashback?.balance || 0),
                totalEarned: Number(data.customerCashback?.totalEarned || 0),
                totalUsed: Number(data.customerCashback?.totalUsed || 0),
                totalExpired: Number(data.customerCashback?.totalExpired || 0),
                expiringAmount,
                expiringCount: expiringMovements.length,
                nextExpirationDate: nextExpiration ? new Date(nextExpiration) : null,
              },
            }));
          } else {
            console.warn("Erro ao buscar cashback:", await cashbackRes.text());
          }
        } catch (err) {
          console.error("Erro ao buscar cashback:", err);
        }
      } catch (error: any) {
        console.error("Erro ao carregar dados do cliente:", error);
        toast.error(error.message || "Erro ao carregar dados do cliente");
        router.push("/dashboard/clientes");
      } finally {
        setLoading(false);
      }
    };

    fetchCustomerData();
  }, [customerId, router]);

  // Calcular estatísticas
  useEffect(() => {
    if (sales.length > 0) {
      const completedSales = sales.filter((s) => s.status === "COMPLETED");
      const totalSpent = completedSales.reduce((sum, s) => sum + Number(s.total), 0);
      const averageTicket = completedSales.length > 0 ? totalSpent / completedSales.length : 0;
      const lastSale = completedSales.sort(
        (a, b) => safeDate(b.createdAt).getTime() - safeDate(a.createdAt).getTime()
      )[0];

      setStats((prev) => ({
        totalSales: completedSales.length,
        totalSpent,
        averageTicket,
        lastPurchase: lastSale?.createdAt || null,
        totalQuotes: quotes.length,
        totalServiceOrders: serviceOrders.length,
        cashback: prev?.cashback || null,
      }));
    } else {
      setStats((prev) => ({
        totalSales: 0,
        totalSpent: 0,
        averageTicket: 0,
        lastPurchase: null,
        totalQuotes: quotes.length,
        totalServiceOrders: serviceOrders.length,
        cashback: prev?.cashback || null,
      }));
    }
  }, [sales, quotes, serviceOrders]);

  // Helper para criar Date seguro
  const safeDate = (dateStr: any): Date => {
    try {
      const d = new Date(dateStr);
      return isNaN(d.getTime()) ? new Date() : d;
    } catch {
      return new Date();
    }
  };

  // Helper para label de movimentação de cashback
  const getMovementLabel = (type: string): string => {
    const labels: Record<string, string> = {
      CREDIT: "Crédito de Cashback",
      DEBIT: "Uso de Cashback",
      EXPIRED: "Cashback Expirado",
      BONUS: "Bônus de Cashback",
      ADJUSTMENT: "Ajuste Manual",
    };
    return labels[type] || type;
  };

  const getInitials = (name?: string) => {
    if (!name) return "??";
    const parts = name.split(" ");
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const getStatusBadge = (status: string, type: "sale" | "quote" | "order") => {
    const configs: Record<string, { label: string; variant: any }> = {
      // Vendas
      COMPLETED: { label: "Concluída", variant: "default" },
      CANCELED: { label: "Cancelada", variant: "destructive" },
      // Orçamentos
      OPEN: { label: "Aberto", variant: "secondary" },
      SENT: { label: "Enviado", variant: "default" },
      APPROVED: { label: "Aprovado", variant: "default" },
      CONVERTED: { label: "Convertido", variant: "default" },
      EXPIRED: { label: "Expirado", variant: "secondary" },
      // Ordens de Serviço
      PENDING: { label: "Pendente", variant: "secondary" },
      IN_PROGRESS: { label: "Em Andamento", variant: "default" },
      READY: { label: "Pronto", variant: "default" },
      DELIVERED: { label: "Entregue", variant: "default" },
    };

    const config = configs[status] || { label: status, variant: "secondary" };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!customer) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/dashboard/clientes">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarFallback className="text-xl">{getInitials(customer?.name)}</AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-3xl font-bold">{customer.name}</h1>
              <p className="text-sm text-muted-foreground">
                Cliente desde {format(safeDate(customer.createdAt), "dd/MM/yyyy", { locale: ptBR })}
              </p>
            </div>
          </div>
        </div>

        <Button asChild>
          <Link href={`/dashboard/clientes/${customerId}/editar`}>
            <Edit className="mr-2 h-4 w-4" />
            Editar Cliente
          </Link>
        </Button>
      </div>

      {/* Estatísticas */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-5">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <ShoppingCart className="h-4 w-4" />
                Total de Vendas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{stats.totalSales}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Total Gasto
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-green-600">{formatCurrency(stats.totalSpent)}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Ticket Médio
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-blue-600">{formatCurrency(stats.averageTicket)}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Última Compra
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm font-medium">
                {stats.lastPurchase
                  ? format(safeDate(stats.lastPurchase), "dd/MM/yyyy", { locale: ptBR })
                  : "Nenhuma compra"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Wallet className="h-4 w-4" />
                Cashback Disponível
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-purple-600">
                {formatCurrency(stats.cashback?.balance || 0)}
              </p>
              {stats.cashback && stats.cashback.expiringCount > 0 && (
                <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {formatCurrency(stats.cashback.expiringAmount)} expirando
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="dados" className="w-full">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="dados">Dados Cadastrais</TabsTrigger>
          <TabsTrigger value="vendas">
            Vendas ({sales.length})
          </TabsTrigger>
          <TabsTrigger value="orcamentos">
            Orçamentos ({quotes.length})
          </TabsTrigger>
          <TabsTrigger value="ordens">
            Ordens de Serviço ({serviceOrders.length})
          </TabsTrigger>
          <TabsTrigger value="parcelas">
            Parcelas ({receivables.length})
          </TabsTrigger>
          <TabsTrigger value="cashback" className="flex items-center gap-2">
            Cashback
            {stats?.cashback && stats.cashback.balance > 0 && (
              <Badge variant="secondary" className="ml-1">
                {formatCurrency(stats.cashback.balance)}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Tab: Dados Cadastrais */}
        <TabsContent value="dados">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Informações do Cliente
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-sm text-muted-foreground">Nome Completo</p>
                  <p className="font-medium">{customer.name}</p>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground">Tipo</p>
                  <Badge variant="secondary">
                    {customer.type === "INDIVIDUAL" ? "Pessoa Física" : "Pessoa Jurídica"}
                  </Badge>
                </div>

                {customer.cpf && (
                  <div>
                    <p className="text-sm text-muted-foreground">CPF</p>
                    <p className="font-medium">{customer.cpf}</p>
                  </div>
                )}

                {customer.cnpj && (
                  <div>
                    <p className="text-sm text-muted-foreground">CNPJ</p>
                    <p className="font-medium">{customer.cnpj}</p>
                  </div>
                )}

                {customer.email && (
                  <div>
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      Email
                    </p>
                    <p className="font-medium">{customer.email}</p>
                  </div>
                )}

                {customer.phone && (
                  <div>
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      Telefone
                    </p>
                    <p className="font-medium">{customer.phone}</p>
                  </div>
                )}
              </div>

              {(customer.address || customer.city || customer.state || customer.zipCode) && (
                <>
                  <Separator />
                  <div>
                    <h3 className="font-semibold mb-2 flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      Endereço
                    </h3>
                    <div className="space-y-1 text-sm">
                      {customer.address && <p>{customer.address}</p>}
                      {(customer.city || customer.state || customer.zipCode) && (
                        <p>
                          {customer.city && `${customer.city}`}
                          {customer.state && ` - ${customer.state}`}
                          {customer.zipCode && ` - CEP: ${customer.zipCode}`}
                        </p>
                      )}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Vendas */}
        <TabsContent value="vendas">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5" />
                Histórico de Vendas ({sales.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {sales.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <ShoppingCart className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p>Nenhuma venda registrada</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {sales.map((sale) => (
                    <div key={sale.id} className="flex items-center justify-between border-b pb-4 last:border-0">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-medium">
                            Venda #{(sale.id || "").substring(0, 8)}
                          </p>
                          {getStatusBadge(sale.status, "sale")}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {format(safeDate(sale.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {(sale.items || []).length} {(sale.items || []).length === 1 ? "item" : "itens"}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-green-600">{formatCurrency(sale.total || 0)}</p>
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/dashboard/vendas/${sale.id || ""}/detalhes`}>
                            Ver detalhes
                          </Link>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Orçamentos */}
        <TabsContent value="orcamentos">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Orçamentos ({quotes.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {quotes.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p>Nenhum orçamento registrado</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {quotes.map((quote) => (
                    <div key={quote.id} className="flex items-center justify-between border-b pb-4 last:border-0">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-medium">
                            Orçamento #{(quote.id || "").substring(0, 8)}
                          </p>
                          {getStatusBadge(quote.status, "quote")}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Criado em {format(safeDate(quote.createdAt), "dd/MM/yyyy", { locale: ptBR })}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Válido até {format(safeDate(quote.validUntil), "dd/MM/yyyy", { locale: ptBR })}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {quote._count?.items || 0} {(quote._count?.items || 0) === 1 ? "item" : "itens"}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-blue-600">{formatCurrency(quote.total || 0)}</p>
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/dashboard/orcamentos/${quote.id || ""}`}>
                            Ver detalhes
                          </Link>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Ordens de Serviço */}
        <TabsContent value="ordens">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wrench className="h-5 w-5" />
                Ordens de Serviço ({serviceOrders.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {serviceOrders.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Wrench className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p>Nenhuma ordem de serviço registrada</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {serviceOrders.map((order) => (
                    <div key={order.id} className="flex items-center justify-between border-b pb-4 last:border-0">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-medium">
                            OS #{(order.id || "").substring(0, 8)}
                          </p>
                          {getStatusBadge(order.status, "order")}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Criada em {format(safeDate(order.createdAt), "dd/MM/yyyy", { locale: ptBR })}
                        </p>
                        {order.deliveryDate && (
                          <p className="text-sm text-muted-foreground">
                            Entrega: {format(safeDate(order.deliveryDate), "dd/MM/yyyy", { locale: ptBR })}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/dashboard/ordens-servico/${order.id || ""}/detalhes`}>
                            Ver detalhes
                          </Link>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Cashback */}
        <TabsContent value="cashback">
          <div className="space-y-4">
            {/* Card: Resumo de Cashback */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wallet className="h-5 w-5" />
                  Resumo de Cashback
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!stats?.cashback ? (
                  <p className="text-muted-foreground">Cliente sem cashback cadastrado</p>
                ) : (
                  <div className="grid gap-4 md:grid-cols-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Saldo Disponível</p>
                      <p className="text-2xl font-bold text-green-600">
                        {formatCurrency(stats.cashback.balance)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Total Ganho</p>
                      <p className="text-lg font-semibold">
                        {formatCurrency(stats.cashback.totalEarned)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Total Usado</p>
                      <p className="text-lg font-semibold text-blue-600">
                        {formatCurrency(stats.cashback.totalUsed)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Total Expirado</p>
                      <p className="text-lg font-semibold text-red-600">
                        {formatCurrency(stats.cashback.totalExpired)}
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Card: Alertas de Vencimento */}
            {stats?.cashback && stats.cashback.expiringCount > 0 && (
              <Card className="border-amber-200 bg-amber-50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-amber-700">
                    <AlertCircle className="h-5 w-5" />
                    Cashback Próximo ao Vencimento
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <p className="text-sm">
                      <span className="font-semibold text-amber-700">
                        {formatCurrency(stats.cashback.expiringAmount)}
                      </span>
                      {' '}em {stats.cashback.expiringCount} crédito(s) irá(ão) expirar nos próximos 30 dias
                    </p>
                    {stats.cashback.nextExpirationDate && (
                      <p className="text-sm text-muted-foreground">
                        Próximo vencimento: {format(stats.cashback.nextExpirationDate, "dd/MM/yyyy", { locale: ptBR })}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Card: Histórico de Movimentações */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <History className="h-5 w-5" />
                  Histórico de Movimentações
                </CardTitle>
              </CardHeader>
              <CardContent>
                {cashbackMovements.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Wallet className="h-12 w-12 mx-auto mb-4 opacity-20" />
                    <p>Nenhuma movimentação de cashback</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {cashbackMovements.map((movement) => (
                      <div key={movement.id} className="flex items-center justify-between border-b pb-3 last:border-0">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            {movement.type === 'CREDIT' && <TrendingUp className="h-4 w-4 text-green-600" />}
                            {movement.type === 'DEBIT' && <TrendingDown className="h-4 w-4 text-blue-600" />}
                            {movement.type === 'EXPIRED' && <XCircle className="h-4 w-4 text-red-600" />}
                            {movement.type === 'BONUS' && <Gift className="h-4 w-4 text-purple-600" />}
                            <p className="font-medium">{getMovementLabel(movement.type)}</p>
                          </div>
                          <p className="text-sm text-muted-foreground">{movement.description || 'Sem descrição'}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {format(safeDate(movement.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                          </p>
                          {movement.expiresAt && !movement.expired && (
                            <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              Expira em: {format(safeDate(movement.expiresAt), "dd/MM/yyyy", { locale: ptBR })}
                            </p>
                          )}
                          {movement.expired && (
                            <Badge variant="destructive" className="mt-1 text-xs">Expirado</Badge>
                          )}
                        </div>
                        <div className="text-right">
                          <p className={`text-lg font-bold ${
                            movement.type === 'CREDIT' || movement.type === 'BONUS' ? 'text-green-600' :
                            movement.type === 'DEBIT' ? 'text-blue-600' :
                            'text-red-600'
                          }`}>
                            {movement.type === 'CREDIT' || movement.type === 'BONUS' ? '+' : ''}
                            {formatCurrency(Math.abs(Number(movement.amount)))}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab: Parcelas */}
        <TabsContent value="parcelas">
          <div className="space-y-4">
            {/* Resumo */}
            {receivablesSummary && (
              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-xs text-muted-foreground">Pendente / Vencido</p>
                    <p className="text-xl font-bold text-red-600">{formatCurrency(receivablesSummary.totalPending)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-xs text-muted-foreground">Total Recebido</p>
                    <p className="text-xl font-bold text-green-600">{formatCurrency(receivablesSummary.totalReceived)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-xs text-muted-foreground">Total de Parcelas</p>
                    <p className="text-xl font-bold">{receivablesSummary.count}</p>
                  </CardContent>
                </Card>
              </div>
            )}

            {receivables.length === 0 ? (
              <Card>
                <CardContent className="pt-6 text-center text-muted-foreground">
                  <DollarSign className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p>Nenhuma parcela encontrada</p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {receivables.map((r: any) => {
                      const isOverdue = r.status === "OVERDUE" || (r.status === "PENDING" && new Date(r.dueDate) < new Date());
                      const statusColors: Record<string, string> = {
                        RECEIVED: "bg-green-100 text-green-800",
                        PENDING: isOverdue ? "bg-red-100 text-red-800" : "bg-yellow-100 text-yellow-800",
                        OVERDUE: "bg-red-100 text-red-800",
                        CANCELED: "bg-gray-100 text-gray-600",
                      };
                      const statusLabels: Record<string, string> = {
                        RECEIVED: "Recebido",
                        PENDING: isOverdue ? "Vencido" : "Pendente",
                        OVERDUE: "Vencido",
                        CANCELED: "Cancelado",
                      };
                      return (
                        <div key={r.id} className="flex items-center justify-between p-4">
                          <div>
                            <p className="font-medium text-sm">{r.description}</p>
                            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                              <span>Parcela {r.installmentNumber}/{r.totalInstallments}</span>
                              {r.sale?.id && <span>· Venda {r.sale.id.substring(0, 8).toUpperCase()}</span>}
                              <span>· Venc: {format(new Date(r.dueDate), "dd/MM/yyyy", { locale: ptBR })}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <Badge className={`text-xs ${statusColors[r.status] || ""}`}>
                              {statusLabels[r.status] || r.status}
                            </Badge>
                            <div className="text-right">
                              <p className="font-bold text-sm">{formatCurrency(r.amount)}</p>
                              {r.receivedAmount && r.receivedAmount !== r.amount && (
                                <p className="text-xs text-green-600">Pago: {formatCurrency(r.receivedAmount)}</p>
                              )}
                            </div>
                            {r.status === "RECEIVED" && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => window.open(`/api/accounts-receivable/${r.id}/receipt`, "_blank")}
                                title="Imprimir recibo"
                              >
                                <FileText className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function Page() {
  return (
    <ProtectedRoute permission="customers.view">
      <ClienteDetalhesPage />
    </ProtectedRoute>
  );
}
