"use client";

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Plus,
  Loader2,
  DollarSign,
  AlertCircle,
  CheckCircle,
  XCircle,
  Calendar,
  Search,
  X,
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Pagination } from "@/components/shared/pagination";
import { EmptyState } from "@/components/shared/empty-state";
import toast from "react-hot-toast";

// Tipos
type AccountPayableStatus = "PENDING" | "PAID" | "OVERDUE" | "CANCELED";
type AccountReceivableStatus = "PENDING" | "RECEIVED" | "OVERDUE" | "CANCELED";
type AccountCategory =
  | "FORNECEDORES"
  | "SALARIOS"
  | "ALUGUEL"
  | "ENERGIA"
  | "INTERNET"
  | "TELEFONE"
  | "IMPOSTOS"
  | "SERVICOS"
  | "OUTROS";

interface AccountPayable {
  id: string;
  description: string;
  category: AccountCategory;
  amount: number;
  dueDate: string;
  status: AccountPayableStatus;
  paidAmount: number | null;
  paidDate: string | null;
  invoiceNumber: string | null;
  supplier: {
    id: string;
    name: string;
    tradeName: string | null;
  } | null;
}

interface AccountReceivable {
  id: string;
  description: string;
  amount: number;
  dueDate: string;
  status: AccountReceivableStatus;
  receivedAmount: number | null;
  receivedDate: string | null;
  installmentNumber: number;
  totalInstallments: number;
  customer: {
    id: string;
    name: string;
  } | null;
}

interface Filters {
  status: string;
  search: string;
  startDate: string;
  endDate: string;
}

function FinanceiroPage() {
  // Estados para Contas a Pagar
  const [accountsPayable, setAccountsPayable] = useState<AccountPayable[]>([]);
  const [payableLoading, setPayableLoading] = useState(true);
  const [payablePagination, setPayablePagination] = useState<any>(null);
  const [payablePage, setPayablePage] = useState(1);
  const [payableFilters, setPayableFilters] = useState<Filters>({
    status: "ALL",
    search: "",
    startDate: "",
    endDate: "",
  });

  // Estados para Contas a Receber
  const [accountsReceivable, setAccountsReceivable] = useState<
    AccountReceivable[]
  >([]);
  const [receivableLoading, setReceivableLoading] = useState(true);
  const [receivablePagination, setReceivablePagination] = useState<any>(null);
  const [receivablePage, setReceivablePage] = useState(1);
  const [receivableFilters, setReceivableFilters] = useState<Filters>({
    status: "ALL",
    search: "",
    startDate: "",
    endDate: "",
  });

  // Buscar Contas a Pagar
  useEffect(() => {
    fetchAccountsPayable();
  }, [payablePage, payableFilters]);

  // Buscar Contas a Receber
  useEffect(() => {
    fetchAccountsReceivable();
  }, [receivablePage, receivableFilters]);

  const fetchAccountsPayable = async () => {
    setPayableLoading(true);
    try {
      const params = new URLSearchParams({
        page: payablePage.toString(),
        pageSize: "20",
        status: payableFilters.status,
      });

      if (payableFilters.search) params.set("search", payableFilters.search);
      if (payableFilters.startDate)
        params.set("startDate", payableFilters.startDate);
      if (payableFilters.endDate) params.set("endDate", payableFilters.endDate);

      const res = await fetch(`/api/accounts-payable?${params}`);
      if (!res.ok) throw new Error("Erro ao carregar contas a pagar");

      const data = await res.json();
      setAccountsPayable(data.data || []);
      setPayablePagination(data.pagination);
    } catch (error: any) {
      console.error("Erro ao carregar contas a pagar:", error);
      toast.error("Erro ao carregar contas a pagar");
    } finally {
      setPayableLoading(false);
    }
  };

  const fetchAccountsReceivable = async () => {
    setReceivableLoading(true);
    try {
      const params = new URLSearchParams({
        page: receivablePage.toString(),
        pageSize: "20",
        status: receivableFilters.status,
      });

      if (receivableFilters.search)
        params.set("search", receivableFilters.search);
      if (receivableFilters.startDate)
        params.set("startDate", receivableFilters.startDate);
      if (receivableFilters.endDate)
        params.set("endDate", receivableFilters.endDate);

      const res = await fetch(`/api/accounts-receivable?${params}`);
      if (!res.ok) throw new Error("Erro ao carregar contas a receber");

      const data = await res.json();
      setAccountsReceivable(data.data || []);
      setReceivablePagination(data.pagination);
    } catch (error: any) {
      console.error("Erro ao carregar contas a receber:", error);
      toast.error("Erro ao carregar contas a receber");
    } finally {
      setReceivableLoading(false);
    }
  };

  // Marcar como pago
  const handleMarkAsPaid = async (id: string) => {
    if (!confirm("Deseja marcar esta conta como paga?")) return;

    try {
      const res = await fetch("/api/accounts-payable", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          status: "PAID",
          paidDate: new Date().toISOString(),
        }),
      });

      if (!res.ok) throw new Error("Erro ao marcar como paga");

      toast.success("Conta marcada como paga!");
      fetchAccountsPayable();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  // Marcar como recebido
  const handleMarkAsReceived = async (id: string) => {
    if (!confirm("Deseja marcar esta conta como recebida?")) return;

    try {
      const res = await fetch("/api/accounts-receivable", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          status: "RECEIVED",
          receivedDate: new Date().toISOString(),
        }),
      });

      if (!res.ok) throw new Error("Erro ao marcar como recebida");

      toast.success("Conta marcada como recebida!");
      fetchAccountsReceivable();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  // Cancelar conta a pagar
  const handleCancelPayable = async (id: string) => {
    if (!confirm("Deseja cancelar esta conta?")) return;

    try {
      const res = await fetch("/api/accounts-payable", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });

      if (!res.ok) throw new Error("Erro ao cancelar conta");

      toast.success("Conta cancelada!");
      fetchAccountsPayable();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  // Cancelar conta a receber
  const handleCancelReceivable = async (id: string) => {
    if (!confirm("Deseja cancelar esta conta?")) return;

    try {
      const res = await fetch("/api/accounts-receivable", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });

      if (!res.ok) throw new Error("Erro ao cancelar conta");

      toast.success("Conta cancelada!");
      fetchAccountsReceivable();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  // Calcular resumos Contas a Pagar
  const payableSummary = {
    totalPending: accountsPayable
      .filter((a) => a.status === "PENDING")
      .reduce((sum, a) => sum + a.amount, 0),
    totalOverdue: accountsPayable
      .filter((a) => a.status === "OVERDUE")
      .reduce((sum, a) => sum + a.amount, 0),
    totalPaidThisMonth: accountsPayable
      .filter((a) => {
        if (a.status !== "PAID" || !a.paidDate) return false;
        const paidDate = new Date(a.paidDate);
        const now = new Date();
        return (
          paidDate.getMonth() === now.getMonth() &&
          paidDate.getFullYear() === now.getFullYear()
        );
      })
      .reduce((sum, a) => sum + (a.paidAmount || a.amount), 0),
    countPending: accountsPayable.filter((a) => a.status === "PENDING").length,
  };

  // Calcular resumos Contas a Receber
  const receivableSummary = {
    totalPending: accountsReceivable
      .filter((a) => a.status === "PENDING")
      .reduce((sum, a) => sum + a.amount, 0),
    totalOverdue: accountsReceivable
      .filter((a) => a.status === "OVERDUE")
      .reduce((sum, a) => sum + a.amount, 0),
    totalReceivedThisMonth: accountsReceivable
      .filter((a) => {
        if (a.status !== "RECEIVED" || !a.receivedDate) return false;
        const receivedDate = new Date(a.receivedDate);
        const now = new Date();
        return (
          receivedDate.getMonth() === now.getMonth() &&
          receivedDate.getFullYear() === now.getFullYear()
        );
      })
      .reduce((sum, a) => sum + (a.receivedAmount || a.amount), 0),
    countPending: accountsReceivable.filter((a) => a.status === "PENDING")
      .length,
  };

  // Traduzir status
  const translatePayableStatus = (status: AccountPayableStatus) => {
    const translations = {
      PENDING: "Pendente",
      PAID: "Pago",
      OVERDUE: "Vencido",
      CANCELED: "Cancelado",
    };
    return translations[status] || status;
  };

  const translateReceivableStatus = (status: AccountReceivableStatus) => {
    const translations = {
      PENDING: "Pendente",
      RECEIVED: "Recebido",
      OVERDUE: "Vencido",
      CANCELED: "Cancelado",
    };
    return translations[status] || status;
  };

  // Traduzir categoria
  const translateCategory = (category: AccountCategory) => {
    const translations = {
      FORNECEDORES: "Fornecedores",
      SALARIOS: "Salários",
      ALUGUEL: "Aluguel",
      ENERGIA: "Energia",
      INTERNET: "Internet",
      TELEFONE: "Telefone",
      IMPOSTOS: "Impostos",
      SERVICOS: "Serviços",
      OUTROS: "Outros",
    };
    return translations[category] || category;
  };

  // Variante do Badge por status
  const getPayableStatusVariant = (status: AccountPayableStatus) => {
    switch (status) {
      case "PENDING":
        return "secondary";
      case "PAID":
        return "default";
      case "OVERDUE":
        return "destructive";
      case "CANCELED":
        return "outline";
      default:
        return "outline";
    }
  };

  const getReceivableStatusVariant = (status: AccountReceivableStatus) => {
    switch (status) {
      case "PENDING":
        return "secondary";
      case "RECEIVED":
        return "default";
      case "OVERDUE":
        return "destructive";
      case "CANCELED":
        return "outline";
      default:
        return "outline";
    }
  };

  // Limpar filtros
  const clearPayableFilters = () => {
    setPayableFilters({
      status: "ALL",
      search: "",
      startDate: "",
      endDate: "",
    });
    setPayablePage(1);
  };

  const clearReceivableFilters = () => {
    setReceivableFilters({
      status: "ALL",
      search: "",
      startDate: "",
      endDate: "",
    });
    setReceivablePage(1);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Financeiro</h1>
        <p className="text-muted-foreground">
          Gerencie contas a pagar e receber
        </p>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="payable" className="space-y-6">
        <TabsList>
          <TabsTrigger value="payable">Contas a Pagar</TabsTrigger>
          <TabsTrigger value="receivable">Contas a Receber</TabsTrigger>
        </TabsList>

        {/* TAB: Contas a Pagar */}
        <TabsContent value="payable" className="space-y-6">
          {/* Summary Cards */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Pendente
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-yellow-600">
                  {formatCurrency(payableSummary.totalPending)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Vencido
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-destructive">
                  {formatCurrency(payableSummary.totalOverdue)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Pago este mês
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-green-600">
                  {formatCurrency(payableSummary.totalPaidThisMonth)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Contas Pendentes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {payableSummary.countPending}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Filtros */}
          <Card>
            <CardContent className="pt-6">
              <div className="grid gap-4 md:grid-cols-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por descrição..."
                    value={payableFilters.search}
                    onChange={(e) =>
                      setPayableFilters({
                        ...payableFilters,
                        search: e.target.value,
                      })
                    }
                    className="pl-9"
                  />
                </div>
                <Select
                  value={payableFilters.status}
                  onValueChange={(value) =>
                    setPayableFilters({ ...payableFilters, status: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Todos</SelectItem>
                    <SelectItem value="PENDING">Pendente</SelectItem>
                    <SelectItem value="PAID">Pago</SelectItem>
                    <SelectItem value="OVERDUE">Vencido</SelectItem>
                    <SelectItem value="CANCELED">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="date"
                  placeholder="Data inicial"
                  value={payableFilters.startDate}
                  onChange={(e) =>
                    setPayableFilters({
                      ...payableFilters,
                      startDate: e.target.value,
                    })
                  }
                />
                <Input
                  type="date"
                  placeholder="Data final"
                  value={payableFilters.endDate}
                  onChange={(e) =>
                    setPayableFilters({
                      ...payableFilters,
                      endDate: e.target.value,
                    })
                  }
                />
              </div>
              <div className="flex justify-between mt-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearPayableFilters}
                >
                  <X className="h-4 w-4 mr-2" />
                  Limpar Filtros
                </Button>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Nova Conta a Pagar
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Loading */}
          {payableLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* Empty State */}
          {!payableLoading && accountsPayable.length === 0 && (
            <EmptyState
              icon={<DollarSign className="h-12 w-12" />}
              title="Nenhuma conta a pagar encontrada"
              description={
                payableFilters.search || payableFilters.status !== "ALL"
                  ? "Tente ajustar os filtros"
                  : "Comece adicionando sua primeira conta a pagar"
              }
              action={
                !payableFilters.search &&
                payableFilters.status === "ALL" && (
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Nova Conta a Pagar
                  </Button>
                )
              }
            />
          )}

          {/* Tabela */}
          {!payableLoading && accountsPayable.length > 0 && (
            <>
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vencimento</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Fornecedor</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {accountsPayable.map((account) => (
                      <TableRow key={account.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            {formatDate(account.dueDate)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{account.description}</p>
                            {account.invoiceNumber && (
                              <p className="text-xs text-muted-foreground">
                                NF: {account.invoiceNumber}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {account.supplier?.tradeName ||
                            account.supplier?.name ||
                            "-"}
                        </TableCell>
                        <TableCell>
                          {translateCategory(account.category)}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatCurrency(account.amount)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={getPayableStatusVariant(account.status)}
                          >
                            {translatePayableStatus(account.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {account.status === "PENDING" && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleMarkAsPaid(account.id)}
                                >
                                  <CheckCircle className="h-4 w-4 mr-1" />
                                  Pagar
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() =>
                                    handleCancelPayable(account.id)
                                  }
                                >
                                  <XCircle className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                            {account.status === "OVERDUE" && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleMarkAsPaid(account.id)}
                                >
                                  <CheckCircle className="h-4 w-4 mr-1" />
                                  Pagar
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() =>
                                    handleCancelPayable(account.id)
                                  }
                                >
                                  <XCircle className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>

              {/* Paginação */}
              {payablePagination && payablePagination.totalPages > 1 && (
                <Pagination
                  currentPage={payablePage}
                  totalPages={payablePagination.totalPages}
                  onPageChange={setPayablePage}
                  showInfo
                />
              )}
            </>
          )}
        </TabsContent>

        {/* TAB: Contas a Receber */}
        <TabsContent value="receivable" className="space-y-6">
          {/* Summary Cards */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Pendente
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-yellow-600">
                  {formatCurrency(receivableSummary.totalPending)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Vencido
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-destructive">
                  {formatCurrency(receivableSummary.totalOverdue)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Recebido este mês
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-green-600">
                  {formatCurrency(receivableSummary.totalReceivedThisMonth)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Contas Pendentes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {receivableSummary.countPending}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Filtros */}
          <Card>
            <CardContent className="pt-6">
              <div className="grid gap-4 md:grid-cols-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por descrição ou cliente..."
                    value={receivableFilters.search}
                    onChange={(e) =>
                      setReceivableFilters({
                        ...receivableFilters,
                        search: e.target.value,
                      })
                    }
                    className="pl-9"
                  />
                </div>
                <Select
                  value={receivableFilters.status}
                  onValueChange={(value) =>
                    setReceivableFilters({
                      ...receivableFilters,
                      status: value,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Todos</SelectItem>
                    <SelectItem value="PENDING">Pendente</SelectItem>
                    <SelectItem value="RECEIVED">Recebido</SelectItem>
                    <SelectItem value="OVERDUE">Vencido</SelectItem>
                    <SelectItem value="CANCELED">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="date"
                  placeholder="Data inicial"
                  value={receivableFilters.startDate}
                  onChange={(e) =>
                    setReceivableFilters({
                      ...receivableFilters,
                      startDate: e.target.value,
                    })
                  }
                />
                <Input
                  type="date"
                  placeholder="Data final"
                  value={receivableFilters.endDate}
                  onChange={(e) =>
                    setReceivableFilters({
                      ...receivableFilters,
                      endDate: e.target.value,
                    })
                  }
                />
              </div>
              <div className="flex justify-between mt-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearReceivableFilters}
                >
                  <X className="h-4 w-4 mr-2" />
                  Limpar Filtros
                </Button>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Nova Conta a Receber
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Loading */}
          {receivableLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* Empty State */}
          {!receivableLoading && accountsReceivable.length === 0 && (
            <EmptyState
              icon={<DollarSign className="h-12 w-12" />}
              title="Nenhuma conta a receber encontrada"
              description={
                receivableFilters.search || receivableFilters.status !== "ALL"
                  ? "Tente ajustar os filtros"
                  : "Comece adicionando sua primeira conta a receber"
              }
              action={
                !receivableFilters.search &&
                receivableFilters.status === "ALL" && (
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Nova Conta a Receber
                  </Button>
                )
              }
            />
          )}

          {/* Tabela */}
          {!receivableLoading && accountsReceivable.length > 0 && (
            <>
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vencimento</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Parcela</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {accountsReceivable.map((account) => (
                      <TableRow key={account.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            {formatDate(account.dueDate)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <p className="font-medium">{account.description}</p>
                        </TableCell>
                        <TableCell>{account.customer?.name || "-"}</TableCell>
                        <TableCell>
                          {account.installmentNumber}/{account.totalInstallments}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatCurrency(account.amount)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={getReceivableStatusVariant(
                              account.status
                            )}
                          >
                            {translateReceivableStatus(account.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {account.status === "PENDING" && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    handleMarkAsReceived(account.id)
                                  }
                                >
                                  <CheckCircle className="h-4 w-4 mr-1" />
                                  Receber
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() =>
                                    handleCancelReceivable(account.id)
                                  }
                                >
                                  <XCircle className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                            {account.status === "OVERDUE" && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    handleMarkAsReceived(account.id)
                                  }
                                >
                                  <CheckCircle className="h-4 w-4 mr-1" />
                                  Receber
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() =>
                                    handleCancelReceivable(account.id)
                                  }
                                >
                                  <XCircle className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>

              {/* Paginação */}
              {receivablePagination && receivablePagination.totalPages > 1 && (
                <Pagination
                  currentPage={receivablePage}
                  totalPages={receivablePagination.totalPages}
                  onPageChange={setReceivablePage}
                  showInfo
                />
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function Page() {
  return (
    <ProtectedRoute permission="financial.access">
      <FinanceiroPage />
    </ProtectedRoute>
  );
}
