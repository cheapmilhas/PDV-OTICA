"use client";

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Plus, CheckCircle2, Clock, Edit, Eye, Loader2, Search,
  XCircle, AlertCircle, Printer, Truck, AlertTriangle,
  RotateCcw, Shield, Star,
} from "lucide-react";
import { SearchBar } from "@/components/shared/search-bar";
import { Pagination } from "@/components/shared/pagination";
import { EmptyState } from "@/components/shared/empty-state";
import { useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

// ===== TIPOS =====
interface ServiceOrder {
  id: string;
  number: number;
  status: string;
  priority: string;
  promisedDate?: string;
  isDelayed: boolean;
  delayDays?: number;
  isWarranty: boolean;
  isRework: boolean;
  createdAt: string;
  customer: { id: string; name: string; cpf?: string; phone?: string };
  laboratory?: { id: string; name: string };
  _count: { items: number };
}

// ===== HELPERS =====
const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Rascunho",
  APPROVED: "Aprovado",
  SENT_TO_LAB: "No Lab",
  IN_PROGRESS: "Em Produção",
  READY: "Pronta",
  DELIVERED: "Entregue",
  CANCELED: "Cancelado",
};

const STATUS_COLOR: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700 border-gray-300",
  APPROVED: "bg-blue-100 text-blue-700 border-blue-300",
  SENT_TO_LAB: "bg-purple-100 text-purple-700 border-purple-300",
  IN_PROGRESS: "bg-yellow-100 text-yellow-700 border-yellow-300",
  READY: "bg-green-100 text-green-700 border-green-300",
  DELIVERED: "bg-emerald-100 text-emerald-700 border-emerald-300",
  CANCELED: "bg-red-100 text-red-700 border-red-300",
};

const NEXT_STATUS: Record<string, { value: string; label: string; icon: React.ReactNode }[]> = {
  DRAFT: [{ value: "APPROVED", label: "Aprovar", icon: <CheckCircle2 className="h-3.5 w-3.5" /> }],
  APPROVED: [{ value: "SENT_TO_LAB", label: "Enviar Lab", icon: <Truck className="h-3.5 w-3.5" /> }],
  SENT_TO_LAB: [{ value: "IN_PROGRESS", label: "Em Produção", icon: <Clock className="h-3.5 w-3.5" /> }],
  IN_PROGRESS: [{ value: "READY", label: "Marcar Pronta", icon: <CheckCircle2 className="h-3.5 w-3.5" /> }],
  READY: [], // Entrega via modal especial
};

// Calcula atraso em tempo real (não depende do campo isDelayed do banco)
function isOrderDelayed(order: ServiceOrder): boolean {
  if (!order.promisedDate) return false;
  if (["DELIVERED", "CANCELED"].includes(order.status)) return false;
  return new Date(order.promisedDate) < new Date();
}

function getDelayDays(promisedDate: string): number {
  const diff = new Date().getTime() - new Date(promisedDate).getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

// Formata número da OS: se 0 ou inexistente, mostra ID curto. Sufixo -G para garantia, -R para retrabalho
function osNum(order: ServiceOrder): string {
  const base = order.number && order.number > 0
    ? `#${String(order.number).padStart(6, "0")}`
    : `#${order.id.slice(-6).toUpperCase()}`;
  if (order.isWarranty) return `${base}-G`;
  if (order.isRework) return `${base}-R`;
  return base;
}

function StatusBadge({ status, delayed }: { status: string; delayed: boolean }) {
  if (delayed) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border bg-red-100 text-red-700 border-red-300">
        <AlertTriangle className="h-3 w-3" />
        ATRASADA
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border ${STATUS_COLOR[status] || "bg-gray-100 text-gray-700"}`}>
      {STATUS_LABEL[status] || status}
    </span>
  );
}

// ===== MODAL ENTREGA =====
function ModalEntrega({ order, onClose, onSuccess }: {
  order: ServiceOrder;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState("");
  const [rating, setRating] = useState(0);

  const handleDeliver = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/service-orders/${order.id}/deliver`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deliveryNotes: notes || undefined,
          qualityRating: rating || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || "Erro ao entregar OS");
      }
      toast.success(`OS #${String(order.number).padStart(6, "0")} entregue com sucesso!`);
      onSuccess();
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
        <h2 className="text-xl font-bold mb-1">Confirmar Entrega</h2>
        <p className="text-sm text-muted-foreground mb-4">
          OS #{String(order.number).padStart(6, "0")} — {order.customer.name}
        </p>

        <div className="bg-gray-50 rounded-lg p-3 mb-4 text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Criada em:</span>
            <span className="font-medium">{format(new Date(order.createdAt), "dd/MM/yyyy", { locale: ptBR })}</span>
          </div>
          {order.promisedDate && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Prazo:</span>
              <span className={`font-medium ${order.isDelayed ? "text-red-600" : ""}`}>
                {format(new Date(order.promisedDate), "dd/MM/yyyy", { locale: ptBR })}
                {order.isDelayed && ` (${order.delayDays}d atrasada)`}
              </span>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div>
            <Label className="text-sm">Avaliação do Laboratório</Label>
            <div className="flex gap-1 mt-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} onClick={() => setRating(n)} className="focus:outline-none">
                  <Star
                    className={`h-7 w-7 ${n <= rating ? "text-yellow-400 fill-yellow-400" : "text-gray-300"}`}
                  />
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-sm">Observações da Entrega</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Opcional..."
              rows={2}
              className="mt-1"
            />
          </div>
        </div>

        <div className="flex gap-3 mt-5">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancelar</Button>
          <Button onClick={handleDeliver} disabled={loading} className="flex-1 bg-green-600 hover:bg-green-700">
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
            Confirmar Entrega
          </Button>
        </div>
      </div>
    </div>
  );
}

// ===== MODAL REVERTER =====
function ModalReverter({ order, onClose, onSuccess }: {
  order: ServiceOrder;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [targetStatus, setTargetStatus] = useState("");
  const [reason, setReason] = useState("");

  const revertOptions: Record<string, { value: string; label: string }[]> = {
    DELIVERED: [{ value: "READY", label: "Pronta" }],
    READY: [
      { value: "IN_PROGRESS", label: "Em Produção" },
      { value: "SENT_TO_LAB", label: "No Lab" },
    ],
    IN_PROGRESS: [
      { value: "SENT_TO_LAB", label: "No Lab" },
      { value: "APPROVED", label: "Aprovado" },
    ],
    SENT_TO_LAB: [{ value: "APPROVED", label: "Aprovado" }],
  };

  const options = revertOptions[order.status] || [];

  const handleRevert = async () => {
    if (!targetStatus) return toast.error("Selecione o status de destino");
    if (!reason || reason.trim().length < 5) return toast.error("Informe o motivo (mínimo 5 caracteres)");
    setLoading(true);
    try {
      const res = await fetch(`/api/service-orders/${order.id}/revert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetStatus, reason }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || "Erro ao reverter OS");
      }
      toast.success("Status revertido com sucesso!");
      onSuccess();
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
        <h2 className="text-xl font-bold mb-1 flex items-center gap-2">
          <RotateCcw className="h-5 w-5 text-orange-500" />
          Reverter Status
        </h2>
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-4 text-sm text-orange-800">
          <strong>Atenção:</strong> Esta ação requer permissão de ADMIN/GERENTE. A reversão será registrada no histórico.
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          OS #{String(order.number).padStart(6, "0")} — Status atual: <strong>{STATUS_LABEL[order.status]}</strong>
        </p>

        <div className="space-y-3">
          <div>
            <Label>Reverter para</Label>
            <Select value={targetStatus} onValueChange={setTargetStatus}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Selecione o status" />
              </SelectTrigger>
              <SelectContent>
                {options.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Motivo (obrigatório)</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex: Cliente reclamou da lente, precisa refazer..."
              rows={3}
              className="mt-1"
            />
          </div>
        </div>

        <div className="flex gap-3 mt-5">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancelar</Button>
          <Button onClick={handleRevert} disabled={loading} variant="destructive" className="flex-1">
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RotateCcw className="h-4 w-4 mr-2" />}
            Reverter
          </Button>
        </div>
      </div>
    </div>
  );
}

// ===== MODAL GARANTIA =====
function ModalGarantia({ order, onClose, onSuccess }: {
  order: ServiceOrder;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [type, setType] = useState<"warranty" | "rework">("warranty");
  const [reason, setReason] = useState("");
  const [copyData, setCopyData] = useState(true);

  const handleCreate = async () => {
    if (!reason || reason.trim().length < 5) return toast.error("Informe o motivo (mínimo 5 caracteres)");
    setLoading(true);
    try {
      const res = await fetch(`/api/service-orders/${order.id}/warranty`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isWarranty: type === "warranty",
          isRework: type === "rework",
          reason,
          copyData,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || "Erro ao criar OS");
      }
      const data = await res.json();
      toast.success(`Nova OS #${String(data.data?.number || "").padStart(6, "0")} criada!`);
      onSuccess();
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
        <h2 className="text-xl font-bold mb-1 flex items-center gap-2">
          <Shield className="h-5 w-5 text-blue-500" />
          Garantia / Retrabalho
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          Criar nova OS vinculada à OS #{String(order.number).padStart(6, "0")} — {order.customer.name}
        </p>

        <div className="space-y-3">
          <div>
            <Label>Tipo</Label>
            <div className="flex gap-2 mt-1">
              <button
                onClick={() => setType("warranty")}
                className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${type === "warranty" ? "bg-blue-600 text-white border-blue-600" : "border-gray-300 hover:bg-gray-50"}`}
              >
                🛡️ Garantia
              </button>
              <button
                onClick={() => setType("rework")}
                className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${type === "rework" ? "bg-orange-600 text-white border-orange-600" : "border-gray-300 hover:bg-gray-50"}`}
              >
                🔄 Retrabalho
              </button>
            </div>
          </div>
          <div>
            <Label>Motivo (obrigatório)</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex: Lente com bolhas, grau errado, armação quebrada..."
              rows={3}
              className="mt-1"
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={copyData}
              onChange={(e) => setCopyData(e.target.checked)}
              className="h-4 w-4"
            />
            <span className="text-sm">Copiar dados da OS original (cliente, receita, itens)</span>
          </label>
        </div>

        <div className="flex gap-3 mt-5">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancelar</Button>
          <Button onClick={handleCreate} disabled={loading} className="flex-1">
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
            Criar Nova OS
          </Button>
        </div>
      </div>
    </div>
  );
}

// ===== PÁGINA PRINCIPAL =====
function OrdensServicoPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filterParam = searchParams.get("filter") || "";
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("ativos");
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [pagination, setPagination] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Modais
  const [modalEntrega, setModalEntrega] = useState<ServiceOrder | null>(null);
  const [modalReverter, setModalReverter] = useState<ServiceOrder | null>(null);
  const [modalGarantia, setModalGarantia] = useState<ServiceOrder | null>(null);

  const fetchOrders = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({
      search,
      page: page.toString(),
      pageSize: "20",
      status: statusFilter,
    });
    if (filterParam) {
      params.set("filter", filterParam);
    }

    Promise.all([
      fetch(`/api/service-orders?${params}`).then((r) => r.json()),
    ])
      .then(([data]) => {
        setOrders(data.data || []);
        setPagination(data.pagination);
      })
      .catch(() => toast.error("Erro ao carregar ordens de serviço"))
      .finally(() => setLoading(false));
  }, [search, page, statusFilter, filterParam]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Contadores
  useEffect(() => {
    const statusCounts: Record<string, number> = {};
    orders.forEach((o) => {
      statusCounts[o.status] = (statusCounts[o.status] || 0) + 1;
      if (isOrderDelayed(o)) {
        statusCounts.DELAYED = (statusCounts.DELAYED || 0) + 1;
      }
    });
    setCounts(statusCounts);
  }, [orders]);

  const quickStatusChange = async (order: ServiceOrder, newStatus: string) => {
    setActionLoading(order.id + newStatus);
    try {
      const res = await fetch(`/api/service-orders/${order.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || "Erro ao atualizar status");
      }
      toast.success(`Status atualizado: ${STATUS_LABEL[newStatus]}`);
      fetchOrders();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setActionLoading(null);
    }
  };

  const summaryCards = [
    { label: "Total OS", value: pagination?.total || 0, color: "text-gray-800" },
    { label: "No Lab", value: counts.SENT_TO_LAB || 0, color: "text-purple-600" },
    { label: "Em Produção", value: counts.IN_PROGRESS || 0, color: "text-yellow-600" },
    { label: "Prontas", value: counts.READY || 0, color: "text-green-600" },
    { label: "⚠ Atrasadas", value: counts.DELAYED || 0, color: "text-red-600" },
  ];

  return (
    <div className="space-y-6">
      {/* Modais */}
      {modalEntrega && (
        <ModalEntrega
          order={modalEntrega}
          onClose={() => setModalEntrega(null)}
          onSuccess={fetchOrders}
        />
      )}
      {modalReverter && (
        <ModalReverter
          order={modalReverter}
          onClose={() => setModalReverter(null)}
          onSuccess={fetchOrders}
        />
      )}
      {modalGarantia && (
        <ModalGarantia
          order={modalGarantia}
          onClose={() => setModalGarantia(null)}
          onSuccess={fetchOrders}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Ordens de Serviço</h1>
          <p className="text-muted-foreground">Controle completo do fluxo de OS</p>
        </div>
        <Button onClick={() => router.push("/dashboard/ordens-servico/nova")}>
          <Plus className="mr-2 h-4 w-4" />
          Nova OS
        </Button>
      </div>

      {/* Resumo */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
        {summaryCards.map((card) => (
          <Card key={card.label} className="text-center">
            <CardContent className="pt-4 pb-3">
              <p className={`text-2xl font-black ${card.color}`}>{card.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{card.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filtros */}
      <div className="space-y-3">
        <SearchBar
          value={search}
          onSearch={setSearch}
          placeholder="Buscar por cliente, CPF ou telefone..."
          clearable
        />
        <div className="flex gap-2 flex-wrap">
          {[
            { value: "ativos", label: "Ativas" },
            { value: "inativos", label: "Canceladas" },
            { value: "todos", label: "Todas" },
          ].map((f) => (
            <Button
              key={f.value}
              size="sm"
              variant={statusFilter === f.value && !filterParam ? "default" : "outline"}
              onClick={() => { setStatusFilter(f.value); setPage(1); router.push("/dashboard/ordens-servico"); }}
            >
              {f.label}
            </Button>
          ))}
          <Button
            size="sm"
            variant={filterParam === "atrasadas" ? "destructive" : "outline"}
            className={filterParam !== "atrasadas" ? "border-red-300 text-red-700 hover:bg-red-50" : ""}
            onClick={() => { setPage(1); router.push("/dashboard/ordens-servico?filter=atrasadas"); }}
          >
            <AlertTriangle className="h-3.5 w-3.5 mr-1" />
            Atrasadas
          </Button>
          <Button
            size="sm"
            variant={filterParam === "vencendo" ? "default" : "outline"}
            className={filterParam === "vencendo" ? "bg-yellow-600 hover:bg-yellow-700" : "border-yellow-400 text-yellow-700 hover:bg-yellow-50"}
            onClick={() => { setPage(1); router.push("/dashboard/ordens-servico?filter=vencendo"); }}
          >
            <Clock className="h-3.5 w-3.5 mr-1" />
            Vencendo (3 dias)
          </Button>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty */}
      {!loading && orders.length === 0 && (
        <EmptyState
          icon={<Clock className="h-12 w-12" />}
          title="Nenhuma ordem de serviço encontrada"
          description={search ? `Sem resultados para "${search}"` : "Crie sua primeira OS"}
          action={
            !search && (
              <Button onClick={() => router.push("/dashboard/ordens-servico/nova")}>
                <Plus className="mr-2 h-4 w-4" />
                Nova OS
              </Button>
            )
          }
        />
      )}

      {/* Lista */}
      {!loading && orders.length > 0 && (
        <div className="grid gap-3">
          {orders.map((order) => {
            const nextActions = NEXT_STATUS[order.status] || [];
            const canDeliver = order.status === "READY";
            const canRevert = ["DELIVERED", "READY", "IN_PROGRESS", "SENT_TO_LAB"].includes(order.status);
            const canWarranty = ["DELIVERED", "READY"].includes(order.status);

            return (
              <Card key={order.id} className={`transition-shadow hover:shadow-md ${order.isDelayed && !["DELIVERED", "CANCELED"].includes(order.status) ? "border-red-300 bg-red-50/30" : ""}`}>
                <CardContent className="p-4">
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                    {/* Info principal */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-lg font-black text-blue-700">{osNum(order)}</span>
                        <span className="font-semibold text-gray-900 truncate">{order.customer.name}</span>
                        <StatusBadge status={order.status} delayed={isOrderDelayed(order)} />
                        {order.isWarranty && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-bold bg-blue-100 text-blue-700 border border-blue-300">
                            <Shield className="h-3 w-3" /> Garantia
                          </span>
                        )}
                        {order.isRework && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-bold bg-orange-100 text-orange-700 border border-orange-300">
                            <RotateCcw className="h-3 w-3" /> Retrabalho
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        <span>{format(new Date(order.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
                        <span>{order._count.items} {order._count.items === 1 ? "item" : "itens"}</span>
                        {order.laboratory && (
                          <span className="text-purple-600 font-medium">
                            🏭 {order.laboratory.name}
                          </span>
                        )}
                        {order.promisedDate && (
                          <span className={`font-medium ${order.isDelayed && !["DELIVERED", "CANCELED"].includes(order.status) ? "text-red-600" : ""}`}>
                            📅 Prazo: {format(new Date(order.promisedDate), "dd/MM/yyyy", { locale: ptBR })}
                            {order.isDelayed && order.delayDays && !["DELIVERED", "CANCELED"].includes(order.status) && (
                              <span className="ml-1">({order.delayDays}d atrasada)</span>
                            )}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Ações */}
                    <div className="flex flex-wrap gap-2 items-center">
                      {/* Ações rápidas de status */}
                      {nextActions.map((action) => (
                        <Button
                          key={action.value}
                          size="sm"
                          variant="outline"
                          className="border-blue-300 text-blue-700 hover:bg-blue-50"
                          disabled={actionLoading === order.id + action.value}
                          onClick={() => quickStatusChange(order, action.value)}
                        >
                          {actionLoading === order.id + action.value
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                            : action.icon
                          }
                          <span className="ml-1">{action.label}</span>
                        </Button>
                      ))}

                      {/* Entrega */}
                      {canDeliver && (
                        <Button
                          size="sm"
                          className="bg-green-600 hover:bg-green-700 text-white"
                          onClick={() => setModalEntrega(order)}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                          Entregar
                        </Button>
                      )}

                      {/* Reverter */}
                      {canRevert && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-orange-300 text-orange-700 hover:bg-orange-50"
                          onClick={() => setModalReverter(order)}
                        >
                          <RotateCcw className="h-3.5 w-3.5 mr-1" />
                          Reverter
                        </Button>
                      )}

                      {/* Garantia */}
                      {canWarranty && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-blue-300 text-blue-700 hover:bg-blue-50"
                          onClick={() => setModalGarantia(order)}
                        >
                          <Shield className="h-3.5 w-3.5 mr-1" />
                          Garantia
                        </Button>
                      )}

                      {/* Imprimir */}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => window.open(`/dashboard/ordens-servico/${order.id}/imprimir`, "_blank")}
                      >
                        <Printer className="h-3.5 w-3.5 mr-1" />
                        Imprimir
                      </Button>

                      {/* Editar */}
                      {!["DELIVERED", "CANCELED"].includes(order.status) && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => router.push(`/dashboard/ordens-servico/${order.id}/editar`)}
                        >
                          <Edit className="h-3.5 w-3.5 mr-1" />
                          Editar
                        </Button>
                      )}

                      {/* Detalhes */}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => router.push(`/dashboard/ordens-servico/${order.id}/detalhes`)}
                      >
                        <Eye className="h-3.5 w-3.5 mr-1" />
                        Detalhes
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Paginação */}
      {!loading && pagination && pagination.totalPages > 1 && (
        <Pagination
          currentPage={page}
          totalPages={pagination.totalPages}
          onPageChange={setPage}
          showInfo
        />
      )}
    </div>
  );
}

export default function Page() {
  return (
    <ProtectedRoute permission="service_orders.view">
      <OrdensServicoPage />
    </ProtectedRoute>
  );
}
