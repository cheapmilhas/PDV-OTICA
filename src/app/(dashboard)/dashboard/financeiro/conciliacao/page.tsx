"use client";

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { useState, useEffect } from "react";
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
  Plus,
  Loader2,
  ArrowLeft,
  Eye,
  CreditCard,
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { EmptyState } from "@/components/shared/empty-state";
import toast from "react-hot-toast";
import { format } from "date-fns";
import Link from "next/link";
import { useRouter } from "next/navigation";

// Types
type BatchStatus = "DRAFT" | "IMPORTED" | "MATCHING" | "REVIEWING" | "CLOSED" | "CANCELED";
type BatchSource = "CARD_ACQUIRER" | "BANK_STATEMENT" | "PIX" | "OTHER";

interface ReconciliationBatch {
  id: string;
  name?: string;
  source: BatchSource;
  acquirerName?: string;
  status: BatchStatus;
  periodStart?: string;
  periodEnd?: string;
  totalItems?: number;
  matchedCount?: number;
  unmatchedCount?: number;
  divergentCount?: number;
  totalExternalAmount?: number;
  totalAmount?: number;
  createdAt: string;
  description?: string;
}

const statusConfig: Record<BatchStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; className: string }> = {
  DRAFT: { label: "Rascunho", variant: "secondary", className: "bg-gray-100 text-gray-700 hover:bg-gray-100" },
  IMPORTED: { label: "Importado", variant: "default", className: "bg-blue-100 text-blue-700 hover:bg-blue-100" },
  MATCHING: { label: "Conciliando", variant: "default", className: "bg-yellow-100 text-yellow-700 hover:bg-yellow-100" },
  REVIEWING: { label: "Em Revisao", variant: "default", className: "bg-orange-100 text-orange-700 hover:bg-orange-100" },
  CLOSED: { label: "Fechado", variant: "default", className: "bg-green-100 text-green-700 hover:bg-green-100" },
  CANCELED: { label: "Cancelado", variant: "destructive", className: "bg-red-100 text-red-700 hover:bg-red-100" },
};

const sourceLabels: Record<BatchSource, string> = {
  CARD_ACQUIRER: "Adquirente de Cartao",
  BANK_STATEMENT: "Extrato Bancario",
  PIX: "PIX",
  OTHER: "Outro",
};

function ConciliacaoListPage() {
  const router = useRouter();

  // Batch list state
  const [batches, setBatches] = useState<ReconciliationBatch[]>([]);
  const [loading, setLoading] = useState(true);

  // New batch dialog state
  const [showNewBatchDialog, setShowNewBatchDialog] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newBatchForm, setNewBatchForm] = useState({
    name: "",
    source: "CARD_ACQUIRER" as BatchSource,
    acquirerName: "",
    periodStart: format(new Date(), "yyyy-MM-dd"),
    periodEnd: format(new Date(), "yyyy-MM-dd"),
  });

  // Fetch batches
  useEffect(() => {
    fetchBatches();
  }, []);

  const fetchBatches = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/finance/reconciliation/batches");
      if (!res.ok) throw new Error("Erro ao carregar batches de conciliacao");

      const data = await res.json();
      setBatches(data.data || []);
    } catch (error: any) {
      console.error("Erro ao carregar batches:", error);
      toast.error("Erro ao carregar batches de conciliacao");
    } finally {
      setLoading(false);
    }
  };

  // Create new batch
  const handleCreateBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);

    try {
      if (!newBatchForm.name || !newBatchForm.acquirerName) {
        throw new Error("Preencha todos os campos obrigatorios");
      }

      const res = await fetch("/api/finance/reconciliation/batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newBatchForm.name,
          source: newBatchForm.source,
          acquirerName: newBatchForm.acquirerName,
          periodStart: new Date(newBatchForm.periodStart).toISOString(),
          periodEnd: new Date(newBatchForm.periodEnd).toISOString(),
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        const errMsg = errData?.error?.message || errData?.message || "Erro ao criar batch";
        throw new Error(typeof errMsg === "string" ? errMsg : JSON.stringify(errMsg));
      }

      toast.success("Batch de conciliacao criado com sucesso!");
      setShowNewBatchDialog(false);
      setNewBatchForm({
        name: "",
        source: "CARD_ACQUIRER",
        acquirerName: "",
        periodStart: format(new Date(), "yyyy-MM-dd"),
        periodEnd: format(new Date(), "yyyy-MM-dd"),
      });
      fetchBatches();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setCreating(false);
    }
  };

  const formatPeriod = (start: string, end: string) => {
    return `${formatDate(start)} - ${formatDate(end)}`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/dashboard/financeiro">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-3xl font-bold">Conciliacao Financeira</h1>
          <p className="text-muted-foreground">
            Gerencie a conciliacao de pagamentos com adquirentes
          </p>
        </div>
        <Button onClick={() => setShowNewBatchDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Batch
        </Button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty State */}
      {!loading && batches.length === 0 && (
        <EmptyState
          icon={<CreditCard className="h-12 w-12" />}
          title="Nenhum batch de conciliacao encontrado"
          description="Comece criando seu primeiro batch para conciliar pagamentos"
          action={
            <Button onClick={() => setShowNewBatchDialog(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Novo Batch
            </Button>
          }
        />
      )}

      {/* Batch Table */}
      {!loading && batches.length > 0 && (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Adquirente</TableHead>
                <TableHead>Periodo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Conciliados</TableHead>
                <TableHead className="text-right">Pendentes</TableHead>
                <TableHead className="text-right">Valor Total</TableHead>
                <TableHead className="text-right">Acoes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.map((batch) => {
                const config = statusConfig[batch.status];
                const total = batch.totalItems || 0;
                const matched = batch.matchedCount || 0;
                const pendingCount = total - matched;
                const externalAmount = batch.totalExternalAmount || batch.totalAmount || 0;

                return (
                  <TableRow
                    key={batch.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => router.push(`/dashboard/financeiro/conciliacao/${batch.id}`)}
                  >
                    <TableCell>
                      <div>
                        <p className="font-medium">{batch.acquirerName || batch.name || "-"}</p>
                        <p className="text-xs text-muted-foreground">{batch.description || batch.name || ""}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      {batch.periodStart && batch.periodEnd
                        ? formatPeriod(batch.periodStart, batch.periodEnd)
                        : "-"}
                    </TableCell>
                    <TableCell>
                      <Badge className={config.className}>
                        {config.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="text-green-600 font-medium">
                        {matched}
                      </span>
                      <span className="text-muted-foreground">
                        /{total}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {pendingCount > 0 ? (
                        <span className="text-yellow-600 font-medium">{pendingCount}</span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatCurrency(externalAmount)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/dashboard/financeiro/conciliacao/${batch.id}`);
                        }}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        Ver
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* New Batch Dialog */}
      <Dialog open={showNewBatchDialog} onOpenChange={setShowNewBatchDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo Batch de Conciliacao</DialogTitle>
            <DialogDescription>
              Crie um novo batch para importar e conciliar pagamentos
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateBatch} className="space-y-4">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="batch-name">
                Nome <span className="text-red-500">*</span>
              </Label>
              <Input
                id="batch-name"
                placeholder="Ex: Cielo Fevereiro/2026"
                value={newBatchForm.name}
                onChange={(e) =>
                  setNewBatchForm({ ...newBatchForm, name: e.target.value })
                }
                required
              />
            </div>

            {/* Source */}
            <div className="space-y-2">
              <Label htmlFor="batch-source">
                Origem <span className="text-red-500">*</span>
              </Label>
              <Select
                value={newBatchForm.source}
                onValueChange={(value) =>
                  setNewBatchForm({ ...newBatchForm, source: value as BatchSource })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CARD_ACQUIRER">Adquirente de Cartao</SelectItem>
                  <SelectItem value="BANK_STATEMENT">Extrato Bancario</SelectItem>
                  <SelectItem value="PIX">PIX</SelectItem>
                  <SelectItem value="OTHER">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Acquirer Name */}
            <div className="space-y-2">
              <Label htmlFor="batch-acquirer">
                Nome do Adquirente/Fonte <span className="text-red-500">*</span>
              </Label>
              <Input
                id="batch-acquirer"
                placeholder="Ex: Cielo, Rede, Stone, PagSeguro..."
                value={newBatchForm.acquirerName}
                onChange={(e) =>
                  setNewBatchForm({ ...newBatchForm, acquirerName: e.target.value })
                }
                required
              />
            </div>

            {/* Period */}
            <div className="grid gap-4 grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="batch-period-start">
                  Inicio do Periodo <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="batch-period-start"
                  type="date"
                  value={newBatchForm.periodStart}
                  onChange={(e) =>
                    setNewBatchForm({ ...newBatchForm, periodStart: e.target.value })
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="batch-period-end">
                  Fim do Periodo <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="batch-period-end"
                  type="date"
                  value={newBatchForm.periodEnd}
                  onChange={(e) =>
                    setNewBatchForm({ ...newBatchForm, periodEnd: e.target.value })
                  }
                  required
                />
              </div>
            </div>

            {/* Buttons */}
            <div className="flex gap-3 justify-end pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowNewBatchDialog(false)}
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
                  "Criar Batch"
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
      <ConciliacaoListPage />
    </ProtectedRoute>
  );
}
