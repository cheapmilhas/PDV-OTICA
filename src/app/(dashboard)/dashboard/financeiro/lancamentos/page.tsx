"use client";

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
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
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Loader2, BookOpen, Search, X } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { Pagination } from "@/components/shared/pagination";
import { EmptyState } from "@/components/shared/empty-state";
import toast from "react-hot-toast";
import { format } from "date-fns";

// Types
type EntryType =
  | "SALE_REVENUE"
  | "COGS"
  | "PAYMENT_RECEIVED"
  | "CARD_FEE"
  | "COMMISSION_EXPENSE"
  | "EXPENSE"
  | "REFUND"
  | "STOCK_ADJUST"
  | "TRANSFER"
  | "OTHER";

type EntrySide = "DEBIT" | "CREDIT";

interface ChartAccount {
  code: string;
  name: string;
}

interface FinanceEntry {
  id: string;
  entryDate: string;
  cashDate: string | null;
  type: EntryType;
  side: EntrySide;
  amount: number;
  description: string | null;
  sourceType: string | null;
  sourceId: string | null;
  debitAccount: ChartAccount | null;
  creditAccount: ChartAccount | null;
  financeAccount: { name: string } | null;
}

interface ChartOfAccountsNode {
  id: string;
  code: string;
  name: string;
  children?: ChartOfAccountsNode[];
}

interface FinanceAccount {
  id: string;
  name: string;
  type: string;
}

// Type badge mapping
const TYPE_CONFIG: Record<
  EntryType,
  { label: string; className: string }
> = {
  SALE_REVENUE: { label: "Receita", className: "bg-green-100 text-green-800" },
  COGS: { label: "CMV", className: "bg-orange-100 text-orange-800" },
  PAYMENT_RECEIVED: {
    label: "Pagamento",
    className: "bg-blue-100 text-blue-800",
  },
  CARD_FEE: {
    label: "Taxa Cartao",
    className: "bg-yellow-100 text-yellow-800",
  },
  COMMISSION_EXPENSE: {
    label: "Comissao",
    className: "bg-purple-100 text-purple-800",
  },
  EXPENSE: { label: "Despesa", className: "bg-red-100 text-red-800" },
  REFUND: { label: "Devolucao", className: "bg-violet-100 text-violet-800" },
  STOCK_ADJUST: {
    label: "Ajuste Estoque",
    className: "bg-teal-100 text-teal-800",
  },
  TRANSFER: {
    label: "Transferencia",
    className: "bg-cyan-100 text-cyan-800",
  },
  OTHER: { label: "Outro", className: "bg-gray-100 text-gray-800" },
};

// Flatten chart of accounts tree into a list
function flattenChartOfAccounts(
  nodes: ChartOfAccountsNode[]
): ChartOfAccountsNode[] {
  const result: ChartOfAccountsNode[] = [];
  for (const node of nodes) {
    result.push(node);
    if (node.children && node.children.length > 0) {
      result.push(...flattenChartOfAccounts(node.children));
    }
  }
  return result;
}

function LancamentosPage() {
  // Current month defaults
  const now = new Date();
  const firstDayOfMonth = format(
    new Date(now.getFullYear(), now.getMonth(), 1),
    "yyyy-MM-dd"
  );
  const lastDayOfMonth = format(
    new Date(now.getFullYear(), now.getMonth() + 1, 0),
    "yyyy-MM-dd"
  );

  // Entry list state
  const [entries, setEntries] = useState<FinanceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState<{
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  } | null>(null);
  const [page, setPage] = useState(1);

  // Filters
  const [startDate, setStartDate] = useState(firstDayOfMonth);
  const [endDate, setEndDate] = useState(lastDayOfMonth);
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [search, setSearch] = useState("");

  // New entry dialog state
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [creating, setCreating] = useState(false);

  // Data for new entry selects
  const [chartAccounts, setChartAccounts] = useState<ChartOfAccountsNode[]>([]);
  const [financeAccounts, setFinanceAccounts] = useState<FinanceAccount[]>([]);

  // New entry form
  const [newEntry, setNewEntry] = useState({
    type: "EXPENSE" as EntryType,
    description: "",
    amount: "",
    entryDate: format(new Date(), "yyyy-MM-dd"),
    cashDate: "",
    debitAccountCode: "",
    creditAccountCode: "",
    financeAccountId: "",
  });

  // Fetch entries
  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: "20",
      });

      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      if (typeFilter && typeFilter !== "ALL") params.set("type", typeFilter);

      const res = await fetch(`/api/finance/entries?${params}`);
      if (!res.ok) throw new Error("Erro ao carregar lancamentos");

      const data = await res.json();
      setEntries(data.data || []);
      setPagination(data.pagination);
    } catch (error: any) {
      console.error("Erro ao carregar lancamentos:", error);
      toast.error("Erro ao carregar lancamentos");
    } finally {
      setLoading(false);
    }
  }, [page, startDate, endDate, typeFilter]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  // Load chart of accounts and finance accounts when dialog opens
  useEffect(() => {
    if (showNewDialog) {
      const loadData = async () => {
        try {
          const [chartRes, accountsRes] = await Promise.all([
            fetch("/api/finance/chart"),
            fetch("/api/finance/accounts"),
          ]);

          if (chartRes.ok) {
            const chartData = await chartRes.json();
            setChartAccounts(chartData.data || []);
          }

          if (accountsRes.ok) {
            const accountsData = await accountsRes.json();
            setFinanceAccounts(accountsData.data || []);
          }
        } catch (error) {
          console.error("Erro ao carregar dados do formulario:", error);
        }
      };
      loadData();
    }
  }, [showNewDialog]);

  // Create new entry
  const handleCreateEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);

    try {
      if (!newEntry.description || !newEntry.amount) {
        throw new Error("Preencha todos os campos obrigatorios");
      }

      const res = await fetch("/api/finance/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: newEntry.description,
          amount: parseFloat(newEntry.amount),
          debitAccountCode: newEntry.debitAccountCode || undefined,
          creditAccountCode: newEntry.creditAccountCode || undefined,
          financeAccountType: newEntry.financeAccountId || undefined,
          entryDate: newEntry.entryDate
            ? new Date(newEntry.entryDate).toISOString()
            : undefined,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        const details = errData?.error?.details;
        const detailMsg =
          Array.isArray(details) && details.length > 0
            ? details
                .map(
                  (d: any) =>
                    `${d.field ? d.field + ": " : ""}${d.message}`
                )
                .join("; ")
            : null;
        const errMsg =
          detailMsg ||
          errData?.error?.message ||
          errData?.message ||
          "Erro ao criar lancamento";
        throw new Error(
          typeof errMsg === "string" ? errMsg : JSON.stringify(errMsg)
        );
      }

      toast.success("Lancamento criado com sucesso!");
      setShowNewDialog(false);
      setNewEntry({
        type: "EXPENSE",
        description: "",
        amount: "",
        entryDate: format(new Date(), "yyyy-MM-dd"),
        cashDate: "",
        debitAccountCode: "",
        creditAccountCode: "",
        financeAccountId: "",
      });
      fetchEntries();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setCreating(false);
    }
  };

  // Clear filters
  const clearFilters = () => {
    setStartDate(firstDayOfMonth);
    setEndDate(lastDayOfMonth);
    setTypeFilter("ALL");
    setSearch("");
    setPage(1);
  };

  // Format entry date as dd/MM/yyyy
  const formatEntryDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), "dd/MM/yyyy");
    } catch {
      return dateStr;
    }
  };

  // Flatten chart of accounts for select options
  const flatAccounts = flattenChartOfAccounts(chartAccounts);

  // Filter entries by search (client-side, description filter)
  const filteredEntries = search
    ? entries.filter(
        (entry) =>
          entry.description?.toLowerCase().includes(search.toLowerCase()) ||
          entry.debitAccount?.name
            .toLowerCase()
            .includes(search.toLowerCase()) ||
          entry.creditAccount?.name
            .toLowerCase()
            .includes(search.toLowerCase())
      )
    : entries;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Lancamentos Financeiros</h1>
          <p className="text-muted-foreground">
            Visualize e gerencie os lancamentos contabeis
          </p>
        </div>
        <Button onClick={() => setShowNewDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Lancamento
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-5">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                Data Inicial
              </Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                Data Final
              </Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Tipo</Label>
              <Select
                value={typeFilter}
                onValueChange={(value) => {
                  setTypeFilter(value);
                  setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos</SelectItem>
                  <SelectItem value="SALE_REVENUE">Receita</SelectItem>
                  <SelectItem value="COGS">CMV</SelectItem>
                  <SelectItem value="PAYMENT_RECEIVED">Pagamento</SelectItem>
                  <SelectItem value="CARD_FEE">Taxa Cartao</SelectItem>
                  <SelectItem value="COMMISSION_EXPENSE">Comissao</SelectItem>
                  <SelectItem value="EXPENSE">Despesa</SelectItem>
                  <SelectItem value="REFUND">Devolucao</SelectItem>
                  <SelectItem value="OTHER">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Buscar</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Descricao, conta..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="flex items-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="w-full"
              >
                <X className="h-4 w-4 mr-2" />
                Limpar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty State */}
      {!loading && filteredEntries.length === 0 && (
        <EmptyState
          icon={<BookOpen className="h-12 w-12" />}
          title="Nenhum lancamento encontrado"
          description={
            search || typeFilter !== "ALL"
              ? "Tente ajustar os filtros"
              : "Nenhum lancamento no periodo selecionado"
          }
        />
      )}

      {/* Table */}
      {!loading && filteredEntries.length > 0 && (
        <>
          <Card>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Descricao</TableHead>
                    <TableHead>Debito</TableHead>
                    <TableHead>Credito</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEntries.map((entry) => {
                    const typeConfig = TYPE_CONFIG[entry.type] || TYPE_CONFIG.OTHER;
                    return (
                      <TableRow key={entry.id}>
                        <TableCell className="whitespace-nowrap">
                          {formatEntryDate(entry.entryDate)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={typeConfig.className}
                          >
                            {typeConfig.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <p className="font-medium">
                            {entry.description || "-"}
                          </p>
                          {entry.sourceType && (
                            <p className="text-xs text-muted-foreground">
                              Origem: {entry.sourceType}
                            </p>
                          )}
                        </TableCell>
                        <TableCell>
                          {entry.debitAccount ? (
                            <span
                              className="max-w-[150px] truncate block"
                              title={`${entry.debitAccount.code} ${entry.debitAccount.name}`}
                            >
                              {entry.debitAccount.code}{" "}
                              {entry.debitAccount.name}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {entry.creditAccount ? (
                            <span
                              className="max-w-[150px] truncate block"
                              title={`${entry.creditAccount.code} ${entry.creditAccount.name}`}
                            >
                              {entry.creditAccount.code}{" "}
                              {entry.creditAccount.name}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell
                          className={`text-right font-semibold whitespace-nowrap ${
                            entry.side === "DEBIT"
                              ? "text-green-600"
                              : "text-red-600"
                          }`}
                        >
                          {formatCurrency(entry.amount)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <Pagination
              currentPage={page}
              totalPages={pagination.totalPages}
              onPageChange={setPage}
              showInfo
            />
          )}
        </>
      )}

      {/* Dialog: New Entry */}
      <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Novo Lancamento</DialogTitle>
            <DialogDescription>
              Crie um lancamento contabil manual
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateEntry} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              {/* Type */}
              <div className="space-y-2">
                <Label>
                  Tipo <span className="text-red-500">*</span>
                </Label>
                <Select
                  value={newEntry.type}
                  onValueChange={(value) =>
                    setNewEntry({ ...newEntry, type: value as EntryType })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EXPENSE">Despesa</SelectItem>
                    <SelectItem value="TRANSFER">Transferencia</SelectItem>
                    <SelectItem value="OTHER">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Amount */}
              <div className="space-y-2">
                <Label>
                  Valor <span className="text-red-500">*</span>
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={newEntry.amount}
                  onChange={(e) =>
                    setNewEntry({ ...newEntry, amount: e.target.value })
                  }
                  required
                />
              </div>

              {/* Description */}
              <div className="space-y-2 md:col-span-2">
                <Label>
                  Descricao <span className="text-red-500">*</span>
                </Label>
                <Input
                  placeholder="Ex: Pagamento de aluguel"
                  value={newEntry.description}
                  onChange={(e) =>
                    setNewEntry({
                      ...newEntry,
                      description: e.target.value,
                    })
                  }
                  required
                />
              </div>

              {/* Entry Date */}
              <div className="space-y-2">
                <Label>
                  Data Competencia <span className="text-red-500">*</span>
                </Label>
                <Input
                  type="date"
                  value={newEntry.entryDate}
                  onChange={(e) =>
                    setNewEntry({ ...newEntry, entryDate: e.target.value })
                  }
                  required
                />
              </div>

              {/* Cash Date */}
              <div className="space-y-2">
                <Label>Data Caixa (opcional)</Label>
                <Input
                  type="date"
                  value={newEntry.cashDate}
                  onChange={(e) =>
                    setNewEntry({ ...newEntry, cashDate: e.target.value })
                  }
                />
              </div>

              {/* Debit Account */}
              <div className="space-y-2">
                <Label>Conta Debito</Label>
                <Select
                  value={newEntry.debitAccountCode}
                  onValueChange={(value) =>
                    setNewEntry({ ...newEntry, debitAccountCode: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {flatAccounts.map((acc) => (
                      <SelectItem key={acc.id} value={acc.code}>
                        {acc.code} - {acc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Credit Account */}
              <div className="space-y-2">
                <Label>Conta Credito</Label>
                <Select
                  value={newEntry.creditAccountCode}
                  onValueChange={(value) =>
                    setNewEntry({ ...newEntry, creditAccountCode: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {flatAccounts.map((acc) => (
                      <SelectItem key={acc.id} value={acc.code}>
                        {acc.code} - {acc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Finance Account */}
              <div className="space-y-2 md:col-span-2">
                <Label>Conta Financeira (opcional)</Label>
                <Select
                  value={newEntry.financeAccountId}
                  onValueChange={(value) =>
                    setNewEntry({ ...newEntry, financeAccountId: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {financeAccounts.map((acc) => (
                      <SelectItem key={acc.id} value={acc.type}>
                        {acc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Buttons */}
            <div className="flex gap-3 justify-end pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowNewDialog(false)}
                disabled={creating}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={creating}>
                {creating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Criando...
                  </>
                ) : (
                  "Criar Lancamento"
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function Page() {
  return (
    <ProtectedRoute permission="financial.view">
      <LancamentosPage />
    </ProtectedRoute>
  );
}
