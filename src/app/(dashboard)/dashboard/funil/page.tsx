"use client";

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Loader2,
  Filter,
  TrendingUp,
  Trophy,
  ThumbsDown,
  Sparkles,
  Clock,
} from "lucide-react";
import toast from "react-hot-toast";
import { useBranchContext } from "@/hooks/use-branch-context";
import { FunilBoard, type LeadStage } from "@/components/funil/funil-board";
import type { Lead } from "@/components/funil/lead-card";
import {
  NovoLeadModal,
  type Seller,
} from "@/components/funil/novo-lead-modal";
import { Can } from "@/components/permissions/can";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WhatsappInbox } from "@/components/funil/whatsapp-inbox";
import { useWhatsappEnabled } from "@/hooks/useWhatsappEnabled";
import { ACCURACY_MIN_SAMPLE } from "@/lib/intent-accuracy";
import { intentLabel } from "@/lib/contact-intent-label";

interface LeadStats {
  total: number;
  won: number;
  conversionRate: number;
  byLostReason: Record<string, number>;
  bySource: Record<string, number>;
  aiAccuracy?: {
    total: number;
    correct: number;
    rate: number;
    hasEnoughSample: boolean;
  };
  byIntent?: Record<string, number>;
  sla?: {
    totalOpen: number;
    onTime: number;
    warning: number;
    late: number;
    lateLeads: { id: string; hoursWaiting: number }[];
  };
}

const SOURCE_OPTIONS: { value: string; label: string }[] = [
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "INSTAGRAM", label: "Instagram" },
  { value: "GOOGLE", label: "Google" },
  { value: "REFERRAL", label: "Indicação" },
  { value: "WALK_IN", label: "Espontâneo" },
  { value: "OTHER", label: "Outro" },
];

const SOURCE_LABEL: Record<string, string> = Object.fromEntries(
  SOURCE_OPTIONS.map((o) => [o.value, o.label])
);

const ALL = "__all__";

function FunilPage() {
  const { activeBranchId } = useBranchContext();
  const { enabled: whatsappEnabled } = useWhatsappEnabled();
  const [activeTab, setActiveTab] = useState("funil");

  const [stages, setStages] = useState<LeadStage[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stats, setStats] = useState<LeadStats | null>(null);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewLead, setShowNewLead] = useState(false);

  // Filtros
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string>(ALL);
  const [sellerFilter, setSellerFilter] = useState<string>(ALL);

  const branchParam = useMemo(
    () => (activeBranchId !== "ALL" ? activeBranchId : null),
    [activeBranchId]
  );

  // Carrega etapas (uma vez por filial).
  useEffect(() => {
    fetch("/api/lead-stages")
      .then((res) => res.json())
      .then((json) => setStages(json.data || []))
      .catch(() => toast.error("Erro ao carregar etapas do funil"));
  }, []);

  // Vendedores para o filtro / modal.
  useEffect(() => {
    const params = new URLSearchParams();
    if (branchParam) params.set("branchId", branchParam);
    fetch(`/api/users/sellers?${params}`)
      .then((res) => res.json())
      .then((json) => setSellers(json.data || []))
      .catch(() => {});
  }, [branchParam]);

  // Estatísticas do funil.
  const fetchStats = useCallback(() => {
    const params = new URLSearchParams();
    if (branchParam) params.set("branchId", branchParam);
    fetch(`/api/leads/stats?${params}`)
      .then((res) => res.json())
      .then((json) => setStats(json.data || null))
      .catch(() => {});
  }, [branchParam]);

  // Leads (board). pageSize alto pois o board agrupa por etapa.
  const fetchLeads = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ pageSize: "200" });
    if (search.trim()) params.set("search", search.trim());
    if (sourceFilter !== ALL) params.set("source", sourceFilter);
    if (sellerFilter !== ALL) params.set("sellerUserId", sellerFilter);
    if (branchParam) params.set("branchId", branchParam);

    fetch(`/api/leads?${params}`)
      .then((res) => res.json())
      .then((json) => setLeads(json.data || []))
      .catch(() => toast.error("Erro ao carregar leads"))
      .finally(() => setLoading(false));
  }, [search, sourceFilter, sellerFilter, branchParam]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleRefresh = useCallback(() => {
    fetchLeads();
    fetchStats();
  }, [fetchLeads, fetchStats]);

  const topLostReasons = useMemo(() => {
    if (!stats) return [];
    return Object.entries(stats.byLostReason)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
  }, [stats]);

  const topSources = useMemo(() => {
    if (!stats) return [];
    return Object.entries(stats.bySource).sort((a, b) => b[1] - a[1]);
  }, [stats]);

  const intentVolume = useMemo(() => {
    if (!stats?.byIntent) return [];
    return Object.entries(stats.byIntent).sort((a, b) => b[1] - a[1]);
  }, [stats]);

  const funilContent = (
    <>
      {/* SLA — a dor nº1: leads aguardando resposta. Só aparece se há atraso/atenção. */}
      {stats?.sla && (stats.sla.late > 0 || stats.sla.warning > 0) && (
        <div
          className={`flex items-center gap-3 rounded-lg border p-3 text-sm ${
            stats.sla.late > 0
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-amber-200 bg-amber-50 text-amber-800"
          }`}
        >
          <Clock className="h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">
              {stats.sla.late > 0
                ? `${stats.sla.late} lead${stats.sla.late > 1 ? "s" : ""} sem resposta há mais de 1 dia`
                : `${stats.sla.warning} lead${stats.sla.warning > 1 ? "s" : ""} aguardando resposta`}
            </p>
            <p className="text-xs opacity-80">
              {[
                stats.sla.onTime > 0 ? `${stats.sla.onTime} no prazo` : null,
                stats.sla.warning > 0 ? `${stats.sla.warning} em atenção` : null,
                stats.sla.late > 0 ? `${stats.sla.late} atrasado${stats.sla.late > 1 ? "s" : ""}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}{" "}
              — de {stats.sla.totalOpen} em aberto
            </p>
          </div>
        </div>
      )}

      {/* Métricas */}
      <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <TrendingUp className="h-4 w-4" />
              Conversão
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-primary">
              {((stats?.conversionRate ?? 0) * 100).toFixed(1)}%
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {stats?.won ?? 0} ganhos de {stats?.total ?? 0} leads
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <ThumbsDown className="h-4 w-4" />
              Por que perdemos
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topLostReasons.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma perda registrada</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {topLostReasons.map(([reason, count]) => (
                  <li key={reason} className="flex justify-between gap-2">
                    <span className="truncate">{reason}</span>
                    <span className="font-medium text-muted-foreground">{count}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Trophy className="h-4 w-4" />
              Origem dos leads
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topSources.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem origem informada</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {topSources.slice(0, 3).map(([source, count]) => (
                  <li key={source} className="flex justify-between gap-2">
                    <span className="truncate">
                      {SOURCE_LABEL[source] ?? source}
                    </span>
                    <span className="font-medium text-muted-foreground">{count}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Sparkles className="h-4 w-4" />
              Precisão da IA
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats?.aiAccuracy?.hasEnoughSample ? (
              <>
                <p className="text-2xl font-bold text-primary">
                  {(stats.aiAccuracy.rate * 100).toFixed(0)}%
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  acertou {stats.aiAccuracy.correct} de {stats.aiAccuracy.total} intenções
                </p>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">Calibrando…</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {stats?.aiAccuracy?.total ?? 0} de {ACCURACY_MIN_SAMPLE} classificações p/ medir
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Volume por intenção (4c): o que os contatos mais pedem. Só com dados. */}
      {intentVolume.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">O que pedem:</span>
          {intentVolume.map(([intent, count]) => {
            const lbl = intentLabel(intent);
            if (!lbl) return null;
            return (
              <span
                key={intent}
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
                  lbl.kind === "venda" ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-800"
                }`}
              >
                {lbl.label}
                <span className="font-semibold">{count}</span>
              </span>
            );
          })}
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Filter className="h-4 w-4" />
        </div>
        <Input
          placeholder="Buscar por nome ou interesse..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:w-64"
        />
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Origem" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas as origens</SelectItem>
            {SOURCE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sellerFilter} onValueChange={setSellerFilter}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Vendedor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os vendedores</SelectItem>
            {sellers.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Board */}
      {loading && stages.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : stages.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Funil não configurado.
          </CardContent>
        </Card>
      ) : (
        <FunilBoard stages={stages} leads={leads} onRefresh={handleRefresh} />
      )}
    </>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">Funil de Leads</h1>
          <p className="hidden text-sm text-muted-foreground sm:block">
            Acompanhe seus interessados do primeiro contato até a venda
          </p>
        </div>
        <Can permission="leads.create">
          <Button onClick={() => setShowNewLead(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Novo Lead
          </Button>
        </Can>
      </div>

      {whatsappEnabled ? (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="funil">Funil</TabsTrigger>
            <TabsTrigger value="conversas">Conversas</TabsTrigger>
          </TabsList>
          <TabsContent value="funil" className="mt-4 space-y-6">
            {funilContent}
          </TabsContent>
          <TabsContent value="conversas" className="mt-4">
            <WhatsappInbox active={activeTab === "conversas"} />
          </TabsContent>
        </Tabs>
      ) : (
        funilContent
      )}

      <NovoLeadModal
        open={showNewLead}
        sellers={sellers}
        onOpenChange={setShowNewLead}
        onCreated={handleRefresh}
      />
    </div>
  );
}

export default function Page() {
  return (
    <ProtectedRoute permission="leads.access">
      <FunilPage />
    </ProtectedRoute>
  );
}
