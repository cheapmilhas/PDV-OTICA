"use client";

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  Loader2,
  ArrowLeft,
  Upload,
  Zap,
  Lock,
  Search,
  FileText,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
} from "lucide-react";
import { KPICard } from "@/components/reports/kpi-card";
import { Pagination } from "@/components/shared/pagination";
import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrency, formatDate } from "@/lib/utils";
import toast from "react-hot-toast";
import Link from "next/link";
import { useParams } from "next/navigation";

// Types
type BatchStatus = "DRAFT" | "IMPORTED" | "MATCHING" | "REVIEWING" | "CLOSED" | "CANCELED";

type ItemStatus =
  | "PENDING"
  | "AUTO_MATCHED"
  | "SUGGESTED_MATCH"
  | "MANUAL_MATCHED"
  | "UNMATCHED"
  | "IGNORED"
  | "RESOLVED"
  | "DISPUTED"
  | "DIVERGENT";

type ResolutionType =
  | "EXACT_MATCH"
  | "ADJUSTED"
  | "FEE_ADJUSTMENT"
  | "PARTIAL_MATCH"
  | "CHARGEBACK"
  | "DUPLICATE"
  | "NOT_FOUND"
  | "OTHER";

interface ReconciliationBatch {
  id: string;
  name?: string;
  source?: string;
  acquirerName?: string;
  status: BatchStatus;
  periodStart?: string;
  periodEnd?: string;
  totalItems?: number;
  matchedCount?: number;
  unmatchedCount?: number;
  divergentCount?: number;
  totalExternalAmount?: number;
  totalInternalAmount?: number;
  totalDifference?: number;
  totalAmount?: number;
  createdAt?: string;
  description?: string;
  _count?: { items: number };
  statusBreakdown?: Record<string, number>;
}

interface ReconciliationItem {
  id: string;
  externalDate: string;
  nsu: string;
  authCode: string | null;
  cardBrand: string | null;
  externalAmount: number;
  internalAmount: number | null;
  difference: number | null;
  status: ItemStatus;
  resolutionType: ResolutionType | null;
  notes: string | null;
  matchedPaymentId: string | null;
}

interface InternalPayment {
  id: string;
  date: string;
  nsu: string | null;
  amount: number;
  method: string;
  customerName: string | null;
  saleId: string | null;
}

// Transform API batch response to match UI interface
function transformBatch(raw: any): ReconciliationBatch {
  const sb = raw.statusBreakdown || {};
  const totalItems = raw.totalItems || raw._count?.items || 0;
  const matchedCount = raw.matchedCount || (sb["AUTO_MATCHED"] || 0) + (sb["MANUAL_MATCHED"] || 0) + (sb["RESOLVED"] || 0);
  const unmatchedCount = raw.unmatchedCount || sb["UNMATCHED"] || 0;
  const divergentCount = raw.divergentCount || sb["DIVERGENT"] || 0;

  return {
    ...raw,
    totalItems,
    matchedCount,
    unmatchedCount,
    divergentCount,
    totalExternalAmount: raw.totalExternalAmount || raw.totalAmount || 0,
    totalInternalAmount: raw.totalInternalAmount || 0,
    totalDifference: raw.totalDifference || 0,
  };
}

// Transform API item to match UI interface
function transformItem(raw: any): ReconciliationItem {
  return {
    id: raw.id,
    externalDate: raw.externalDate || "",
    nsu: raw.nsu || raw.externalId || "",
    authCode: raw.authorizationCode || raw.authCode || raw.externalRef || null,
    cardBrand: raw.cardBrand || null,
    externalAmount: Number(raw.externalAmount || 0),
    internalAmount: raw.internalAmount != null ? Number(raw.internalAmount) : (raw.matchedSalePayment ? Number(raw.matchedSalePayment.amount) : null),
    difference: raw.differenceAmount != null ? Number(raw.differenceAmount) : (raw.difference != null ? Number(raw.difference) : null),
    status: raw.status,
    resolutionType: raw.resolutionType || null,
    notes: raw.resolutionNotes || raw.notes || null,
    matchedPaymentId: raw.matchedSalePaymentId || raw.matchedPaymentId || null,
  };
}

// Transform API payment to match UI interface
function transformPayment(raw: any): InternalPayment {
  return {
    id: raw.id,
    date: raw.receivedAt || raw.date || "",
    nsu: raw.nsu || null,
    amount: Number(raw.amount || 0),
    method: raw.method || "",
    customerName: raw.sale?.customer?.name || raw.customerName || null,
    saleId: raw.sale?.id || raw.saleId || null,
  };
}

type FilterTab = "ALL" | "PENDING" | "MATCHED" | "UNMATCHED" | "SUGGESTED";

const batchStatusConfig: Record<BatchStatus, { label: string; className: string }> = {
  DRAFT: { label: "Rascunho", className: "bg-gray-100 text-gray-700 hover:bg-gray-100" },
  IMPORTED: { label: "Importado", className: "bg-blue-100 text-blue-700 hover:bg-blue-100" },
  MATCHING: { label: "Conciliando", className: "bg-yellow-100 text-yellow-700 hover:bg-yellow-100" },
  REVIEWING: { label: "Em Revisao", className: "bg-orange-100 text-orange-700 hover:bg-orange-100" },
  CLOSED: { label: "Fechado", className: "bg-green-100 text-green-700 hover:bg-green-100" },
  CANCELED: { label: "Cancelado", className: "bg-red-100 text-red-700 hover:bg-red-100" },
};

const itemStatusConfig: Record<ItemStatus, { label: string; className: string }> = {
  PENDING: { label: "Pendente", className: "bg-yellow-100 text-yellow-700 hover:bg-yellow-100" },
  AUTO_MATCHED: { label: "Auto Match", className: "bg-green-100 text-green-700 hover:bg-green-100" },
  SUGGESTED_MATCH: { label: "Sugerido", className: "bg-blue-100 text-blue-700 hover:bg-blue-100" },
  MANUAL_MATCHED: { label: "Manual", className: "bg-green-100 text-green-700 hover:bg-green-100" },
  UNMATCHED: { label: "Sem Match", className: "bg-red-100 text-red-700 hover:bg-red-100" },
  IGNORED: { label: "Ignorado", className: "bg-gray-100 text-gray-700 hover:bg-gray-100" },
  RESOLVED: { label: "Resolvido", className: "bg-green-100 text-green-700 hover:bg-green-100" },
  DISPUTED: { label: "Disputado", className: "bg-orange-100 text-orange-700 hover:bg-orange-100" },
  DIVERGENT: { label: "Divergente", className: "bg-orange-100 text-orange-700 hover:bg-orange-100" },
};

const resolutionTypeLabels: Record<ResolutionType, string> = {
  EXACT_MATCH: "Match Exato",
  ADJUSTED: "Ajustado",
  FEE_ADJUSTMENT: "Ajuste de Taxa",
  PARTIAL_MATCH: "Match Parcial",
  CHARGEBACK: "Chargeback",
  DUPLICATE: "Duplicidade",
  NOT_FOUND: "Nao Encontrado",
  OTHER: "Outro",
};

const finalStatuses: ItemStatus[] = ["AUTO_MATCHED", "MANUAL_MATCHED", "RESOLVED", "IGNORED"];

function ConciliacaoDetailPage() {
  const params = useParams();
  const id = params.id as string;

  // Batch state
  const [batch, setBatch] = useState<ReconciliationBatch | null>(null);
  const [batchLoading, setBatchLoading] = useState(true);

  // Items state
  const [items, setItems] = useState<ReconciliationItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [activeTab, setActiveTab] = useState<FilterTab>("ALL");

  // Import CSV dialog
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [templates, setTemplates] = useState<{ id: string; name: string; acquirerName: string }[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");

  // Close batch dialog
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [closing, setClosing] = useState(false);

  // Auto-match
  const [autoMatching, setAutoMatching] = useState(false);

  // Resolve sheet
  const [showResolveSheet, setShowResolveSheet] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ReconciliationItem | null>(null);
  const [searchPayments, setSearchPayments] = useState<InternalPayment[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedPaymentId, setSelectedPaymentId] = useState<string>("");
  const [resolutionType, setResolutionType] = useState<ResolutionType>("EXACT_MATCH");
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [resolving, setResolving] = useState(false);
  const [searchForm, setSearchForm] = useState({
    amount: "",
    date: "",
    nsu: "",
  });

  // Fetch batch details
  const fetchBatch = useCallback(async () => {
    setBatchLoading(true);
    try {
      const res = await fetch(`/api/finance/reconciliation/batches/${id}`);
      if (!res.ok) throw new Error("Erro ao carregar batch");

      const data = await res.json();
      setBatch(transformBatch(data.data || data));
    } catch (error: any) {
      console.error("Erro ao carregar batch:", error);
      toast.error("Erro ao carregar detalhes do batch");
    } finally {
      setBatchLoading(false);
    }
  }, [id]);

  // Fetch items
  const fetchItems = useCallback(async () => {
    setItemsLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "20",
      });

      // Map filter tabs to API status params
      if (activeTab === "PENDING") {
        params.set("status", "PENDING");
      } else if (activeTab === "MATCHED") {
        params.set("status", "AUTO_MATCHED,MANUAL_MATCHED,RESOLVED");
      } else if (activeTab === "UNMATCHED") {
        params.set("status", "UNMATCHED");
      } else if (activeTab === "SUGGESTED") {
        params.set("status", "SUGGESTED_MATCH");
      }

      const res = await fetch(`/api/finance/reconciliation/batches/${id}/items?${params}`);
      if (!res.ok) throw new Error("Erro ao carregar itens");

      const data = await res.json();
      setItems((data.data || []).map(transformItem));
      setTotalPages(data.pagination?.totalPages || 1);
    } catch (error: any) {
      console.error("Erro ao carregar itens:", error);
      toast.error("Erro ao carregar itens do batch");
    } finally {
      setItemsLoading(false);
    }
  }, [id, page, activeTab]);

  useEffect(() => {
    fetchBatch();
  }, [fetchBatch]);

  useEffect(() => {
    if (id) {
      fetchItems();
    }
  }, [fetchItems, id]);

  // Reset page when tab changes
  useEffect(() => {
    setPage(1);
  }, [activeTab]);

  // Fetch templates when import dialog opens
  useEffect(() => {
    if (showImportDialog && templates.length === 0) {
      fetch("/api/finance/reconciliation/templates")
        .then((res) => res.ok ? res.json() : null)
        .then((json) => {
          const list = json?.data || json || [];
          setTemplates(Array.isArray(list) ? list : []);
          if (Array.isArray(list) && list.length > 0 && !selectedTemplateId) {
            setSelectedTemplateId(list[0].id);
          }
        })
        .catch(() => {});
    }
  }, [showImportDialog]);

  // Import CSV
  const handleImportCSV = async () => {
    if (!importFile) {
      toast.error("Selecione um arquivo CSV");
      return;
    }
    if (!selectedTemplateId) {
      toast.error("Selecione um template de mapeamento");
      return;
    }

    setImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", importFile);
      formData.append("templateId", selectedTemplateId);

      const res = await fetch(`/api/finance/reconciliation/batches/${id}/import`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData?.error?.message || "Erro ao importar CSV");
      }

      const json = await res.json();
      const result = json.data || json;
      toast.success(`CSV importado: ${result.imported || 0} itens`);
      setShowImportDialog(false);
      setImportFile(null);
      setSelectedTemplateId("");
      fetchBatch();
      fetchItems();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setImporting(false);
    }
  };

  // Auto-match
  const handleAutoMatch = async () => {
    setAutoMatching(true);
    try {
      const res = await fetch(`/api/finance/reconciliation/batches/${id}/auto-match`, {
        method: "POST",
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData?.error?.message || "Erro no auto-match");
      }

      const data = await res.json();
      toast.success(
        data.message || `Auto-match concluido: ${data.matchedCount || 0} itens conciliados`
      );
      fetchBatch();
      fetchItems();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setAutoMatching(false);
    }
  };

  // Close batch
  const handleCloseBatch = async () => {
    setClosing(true);
    try {
      const res = await fetch(`/api/finance/reconciliation/batches/${id}/close`, {
        method: "POST",
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData?.error?.message || "Erro ao fechar batch");
      }

      toast.success("Batch fechado com sucesso!");
      setShowCloseDialog(false);
      fetchBatch();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setClosing(false);
    }
  };

  // Open resolve sheet
  const handleOpenResolve = (item: ReconciliationItem) => {
    setSelectedItem(item);
    setSearchPayments([]);
    setSelectedPaymentId("");
    setResolutionType("EXACT_MATCH");
    setResolutionNotes("");
    setSearchForm({
      amount: item.externalAmount ? String(item.externalAmount) : "",
      date: item.externalDate ? item.externalDate.slice(0, 10) : "",
      nsu: item.nsu || "",
    });
    setShowResolveSheet(true);
  };

  // Search internal payments
  const handleSearchPayments = async () => {
    setSearchLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchForm.nsu) params.set("nsu", searchForm.nsu);
      if (searchForm.amount) params.set("amount", searchForm.amount);
      if (searchForm.date) {
        params.set("startDate", searchForm.date);
        params.set("endDate", searchForm.date);
      }

      const res = await fetch(`/api/finance/reconciliation/search-payments?${params}`);
      if (!res.ok) throw new Error("Erro ao buscar pagamentos");

      const data = await res.json();
      const payments = (data.data || []).map(transformPayment);
      setSearchPayments(payments);

      if (payments.length === 0) {
        toast("Nenhum pagamento encontrado com esses filtros", { icon: "i" });
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSearchLoading(false);
    }
  };

  // Resolve item (link payment)
  const handleResolveItem = async () => {
    if (!selectedItem) return;

    if (!selectedPaymentId) {
      toast.error("Selecione um pagamento para vincular");
      return;
    }

    setResolving(true);
    try {
      const res = await fetch(
        `/api/finance/reconciliation/batches/${id}/items/${selectedItem.id}/resolve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            matchedSalePaymentId: selectedPaymentId,
            resolutionType,
            resolutionNotes: resolutionNotes || undefined,
          }),
        }
      );

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData?.error?.message || "Erro ao resolver item");
      }

      toast.success("Item resolvido com sucesso!");
      setShowResolveSheet(false);
      setSelectedItem(null);
      fetchBatch();
      fetchItems();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setResolving(false);
    }
  };

  // Ignore item
  const handleIgnoreItem = async () => {
    if (!selectedItem) return;

    setResolving(true);
    try {
      const res = await fetch(
        `/api/finance/reconciliation/batches/${id}/items/${selectedItem.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: "IGNORED",
            notes: resolutionNotes || "Ignorado manualmente",
          }),
        }
      );

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData?.error?.message || "Erro ao ignorar item");
      }

      toast.success("Item ignorado com sucesso!");
      setShowResolveSheet(false);
      setSelectedItem(null);
      fetchBatch();
      fetchItems();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setResolving(false);
    }
  };

  // Loading state
  if (batchLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!batch) {
    return (
      <EmptyState
        icon={<FileText className="h-12 w-12" />}
        title="Batch nao encontrado"
        description="O batch de conciliacao solicitado nao foi encontrado"
        action={
          <Link href="/dashboard/financeiro/conciliacao">
            <Button>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar
            </Button>
          </Link>
        }
      />
    );
  }

  const batchConfig = batchStatusConfig[batch.status] || { label: batch.status, className: "bg-gray-100 text-gray-700" };
  const isClosed = batch.status === "CLOSED" || batch.status === "CANCELED";
  const pendingCount = (batch.totalItems || 0) - (batch.matchedCount || 0);

  const filterTabs: { key: FilterTab; label: string }[] = [
    { key: "ALL", label: "Todos" },
    { key: "PENDING", label: "Pendentes" },
    { key: "MATCHED", label: "Matched" },
    { key: "UNMATCHED", label: "Unmatched" },
    { key: "SUGGESTED", label: "Sugeridos" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/dashboard/financeiro/conciliacao">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">{batch.name}</h1>
            <Badge className={batchConfig.className}>{batchConfig.label}</Badge>
          </div>
          <p className="text-muted-foreground">
            {batch.acquirerName || ""} {batch.periodStart ? `- ${formatDate(batch.periodStart)} a ${formatDate(batch.periodEnd || "")}` : ""}
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <KPICard
          title="Total Itens"
          value={String(batch.totalItems || 0)}
          icon={FileText}
          subtitle="Itens no batch"
          className="border-l-4 border-l-blue-500"
        />
        <KPICard
          title="Conciliados"
          value={String(batch.matchedCount || 0)}
          icon={CheckCircle2}
          subtitle={
            (batch.totalItems || 0) > 0
              ? `${Math.round(((batch.matchedCount || 0) / (batch.totalItems || 1)) * 100)}% do total`
              : "0% do total"
          }
          className="border-l-4 border-l-green-500"
        />
        <KPICard
          title="Pendentes"
          value={String(pendingCount)}
          icon={Clock}
          subtitle="Aguardando resolucao"
          className="border-l-4 border-l-yellow-500"
        />
        <KPICard
          title="Diferenca Total"
          value={formatCurrency(batch.totalDifference || 0)}
          icon={AlertTriangle}
          subtitle="Divergencia acumulada"
          className="border-l-4 border-l-orange-500"
        />
      </div>

      {/* Action Buttons */}
      {!isClosed && (
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            onClick={() => setShowImportDialog(true)}
          >
            <Upload className="h-4 w-4 mr-2" />
            Importar CSV
          </Button>
          <Button
            variant="outline"
            onClick={handleAutoMatch}
            disabled={autoMatching}
          >
            {autoMatching ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Zap className="h-4 w-4 mr-2" />
            )}
            Auto-Match
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowCloseDialog(true)}
          >
            <Lock className="h-4 w-4 mr-2" />
            Fechar Batch
          </Button>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-2">
        {filterTabs.map((tab) => (
          <Button
            key={tab.key}
            size="sm"
            variant={activeTab === tab.key ? "default" : "outline"}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {/* Items Loading */}
      {itemsLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Items Empty */}
      {!itemsLoading && items.length === 0 && (
        <EmptyState
          icon={<FileText className="h-12 w-12" />}
          title="Nenhum item encontrado"
          description={
            activeTab !== "ALL"
              ? "Nenhum item encontrado com este filtro. Tente outro filtro."
              : "Importe um CSV para adicionar itens ao batch."
          }
          action={
            activeTab === "ALL" && !isClosed ? (
              <Button onClick={() => setShowImportDialog(true)}>
                <Upload className="mr-2 h-4 w-4" />
                Importar CSV
              </Button>
            ) : undefined
          }
        />
      )}

      {/* Items Table */}
      {!itemsLoading && items.length > 0 && (
        <>
          <Card>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>NSU</TableHead>
                    <TableHead>Bandeira</TableHead>
                    <TableHead className="text-right">Valor Externo</TableHead>
                    <TableHead className="text-right">Valor Interno</TableHead>
                    <TableHead className="text-right">Diferenca</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Acoes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => {
                    const config = itemStatusConfig[item.status];
                    const isFinal = finalStatuses.includes(item.status);
                    const diff = item.difference ?? 0;

                    return (
                      <TableRow key={item.id}>
                        <TableCell>{formatDate(item.externalDate)}</TableCell>
                        <TableCell>
                          <span className="font-mono text-sm">{item.nsu}</span>
                        </TableCell>
                        <TableCell>{item.cardBrand || "-"}</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(item.externalAmount)}
                        </TableCell>
                        <TableCell className="text-right">
                          {item.internalAmount != null
                            ? formatCurrency(item.internalAmount)
                            : "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          {diff !== 0 ? (
                            <span
                              className={
                                diff > 0 ? "text-green-600" : "text-red-600"
                              }
                            >
                              {formatCurrency(diff)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge className={config.className}>
                            {config.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {!isFinal && !isClosed && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleOpenResolve(item)}
                            >
                              Resolver
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>

          {/* Pagination */}
          {totalPages > 1 && (
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              onPageChange={setPage}
              showInfo
            />
          )}
        </>
      )}

      {/* Import CSV Dialog */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Importar CSV</DialogTitle>
            <DialogDescription>
              Selecione o arquivo CSV do adquirente para importar os registros de pagamento.
              O arquivo deve conter colunas como data, NSU, valor, bandeira.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="csv-file">Arquivo CSV</Label>
              <Input
                id="csv-file"
                type="file"
                accept=".csv,.txt"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  setImportFile(file);
                }}
              />
              {importFile && (
                <p className="text-xs text-muted-foreground">
                  Arquivo selecionado: {importFile.name} ({(importFile.size / 1024).toFixed(1)} KB)
                </p>
              )}
            </div>

            {/* Template select */}
            <div className="space-y-2">
              <Label>Template de Mapeamento</Label>
              <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o template..." />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((tpl) => (
                    <SelectItem key={tpl.id} value={tpl.id}>
                      {tpl.name || tpl.acquirerName || tpl.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {templates.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Nenhum template disponivel. Cadastre um template de mapeamento primeiro.
                </p>
              )}
            </div>

            <div className="p-3 rounded-md bg-muted">
              <p className="text-xs font-medium mb-1">Formato esperado:</p>
              <p className="text-xs text-muted-foreground">
                O CSV deve conter as colunas: data, NSU, codigo_autorizacao, bandeira, valor.
                Separador: ponto-e-virgula (;) ou virgula (,).
              </p>
            </div>

            <div className="flex gap-3 justify-end pt-2 border-t">
              <Button
                variant="outline"
                onClick={() => {
                  setShowImportDialog(false);
                  setImportFile(null);
                }}
                disabled={importing}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleImportCSV}
                disabled={!importFile || importing}
              >
                {importing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Importando...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Importar
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Close Batch Dialog */}
      <Dialog open={showCloseDialog} onOpenChange={setShowCloseDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Fechar Batch de Conciliacao</DialogTitle>
            <DialogDescription>
              Ao fechar o batch, nenhuma alteracao adicional podera ser feita.
              Certifique-se de que todos os itens foram revisados.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="p-3 rounded-md bg-muted">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-muted-foreground">Total de itens:</p>
                  <p className="font-medium">{batch.totalItems || 0}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Conciliados:</p>
                  <p className="font-medium text-green-600">{batch.matchedCount || 0}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Pendentes:</p>
                  <p className="font-medium text-yellow-600">{pendingCount}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Divergentes:</p>
                  <p className="font-medium text-orange-600">{batch.divergentCount || 0}</p>
                </div>
              </div>
            </div>

            {pendingCount > 0 && (
              <div className="flex items-start gap-2 p-3 rounded-md bg-yellow-50 border border-yellow-200">
                <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-yellow-700">
                  Existem {pendingCount} itens pendentes. Eles serao marcados como nao conciliados ao fechar o batch.
                </p>
              </div>
            )}

            <div className="flex gap-3 justify-end pt-2 border-t">
              <Button
                variant="outline"
                onClick={() => setShowCloseDialog(false)}
                disabled={closing}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleCloseBatch}
                disabled={closing}
              >
                {closing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Fechando...
                  </>
                ) : (
                  <>
                    <Lock className="mr-2 h-4 w-4" />
                    Confirmar Fechamento
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Resolve Item Sheet */}
      <Sheet open={showResolveSheet} onOpenChange={setShowResolveSheet}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Resolver Item</SheetTitle>
          </SheetHeader>

          {selectedItem && (
            <div className="mt-6 space-y-6">
              {/* External Data */}
              <div>
                <h3 className="text-sm font-semibold mb-3">Dados do Adquirente</h3>
                <div className="grid grid-cols-2 gap-3 p-3 rounded-md bg-muted">
                  <div>
                    <p className="text-xs text-muted-foreground">Data</p>
                    <p className="text-sm font-medium">{formatDate(selectedItem.externalDate)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">NSU</p>
                    <p className="text-sm font-mono font-medium">{selectedItem.nsu}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Cod. Autorizacao</p>
                    <p className="text-sm font-medium">{selectedItem.authCode || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Bandeira</p>
                    <p className="text-sm font-medium">{selectedItem.cardBrand || "-"}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground">Valor</p>
                    <p className="text-lg font-bold">{formatCurrency(selectedItem.externalAmount)}</p>
                  </div>
                </div>
              </div>

              {/* Search Section */}
              <div>
                <h3 className="text-sm font-semibold mb-3">Buscar Pagamento Interno</h3>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Valor</Label>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={searchForm.amount}
                        onChange={(e) =>
                          setSearchForm({ ...searchForm, amount: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Data</Label>
                      <Input
                        type="date"
                        value={searchForm.date}
                        onChange={(e) =>
                          setSearchForm({ ...searchForm, date: e.target.value })
                        }
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">NSU</Label>
                    <Input
                      placeholder="NSU do pagamento"
                      value={searchForm.nsu}
                      onChange={(e) =>
                        setSearchForm({ ...searchForm, nsu: e.target.value })
                      }
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    onClick={handleSearchPayments}
                    disabled={searchLoading}
                  >
                    {searchLoading ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4 mr-2" />
                    )}
                    Buscar
                  </Button>
                </div>
              </div>

              {/* Search Results */}
              {searchPayments.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-3">
                    Pagamentos Encontrados ({searchPayments.length})
                  </h3>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {searchPayments.map((payment) => (
                      <label
                        key={payment.id}
                        className={`flex items-start gap-3 p-3 rounded-md border cursor-pointer transition-colors ${
                          selectedPaymentId === payment.id
                            ? "border-primary bg-primary/5"
                            : "border-border hover:bg-muted/50"
                        }`}
                      >
                        <input
                          type="radio"
                          name="payment"
                          value={payment.id}
                          checked={selectedPaymentId === payment.id}
                          onChange={() => setSelectedPaymentId(payment.id)}
                          className="mt-1"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-start">
                            <p className="text-sm font-medium">
                              {formatCurrency(payment.amount)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatDate(payment.date)}
                            </p>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {payment.method}
                            {payment.nsu && ` - NSU: ${payment.nsu}`}
                          </p>
                          {payment.customerName && (
                            <p className="text-xs text-muted-foreground">
                              Cliente: {payment.customerName}
                            </p>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Resolution Type */}
              <div className="space-y-2">
                <Label className="text-sm">Tipo de Resolucao</Label>
                <Select
                  value={resolutionType}
                  onValueChange={(v) => setResolutionType(v as ResolutionType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(resolutionTypeLabels).map(([key, label]) => (
                      <SelectItem key={key} value={key}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label className="text-sm">Observacoes</Label>
                <Textarea
                  placeholder="Informacoes adicionais sobre a resolucao..."
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  rows={3}
                />
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col gap-2 pt-4 border-t">
                <Button
                  onClick={handleResolveItem}
                  disabled={resolving || !selectedPaymentId}
                  className="w-full"
                >
                  {resolving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                  )}
                  Vincular
                </Button>
                <Button
                  variant="outline"
                  onClick={handleIgnoreItem}
                  disabled={resolving}
                  className="w-full"
                >
                  <XCircle className="mr-2 h-4 w-4" />
                  Ignorar
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setShowResolveSheet(false);
                    setSelectedItem(null);
                  }}
                  disabled={resolving}
                  className="w-full"
                >
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

export default function Page() {
  return (
    <ProtectedRoute permission="financial.view">
      <ConciliacaoDetailPage />
    </ProtectedRoute>
  );
}
