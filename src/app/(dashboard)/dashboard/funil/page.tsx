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
  AlertTriangle,
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
import { FunilTodayQueue } from "@/components/funil/funil-today-queue";
import { useWhatsappEnabled } from "@/hooks/useWhatsappEnabled";
import { ACCURACY_MIN_SAMPLE } from "@/lib/intent-accuracy";
import { intentLabel } from "@/lib/contact-intent-label";
import { countNeedsAttention, leadNeedsAttention } from "@/lib/lead-needs-attention";
import {
  LEAD_STATS_PERIODS,
  type LeadStatsPeriod,
} from "@/lib/lead-stats-period";

interface LeadStats {
  total: number;
  won: number;
  conversionRate: number;
  byLostReason: Record<string, number>;
  bySource: Record<string, number>;
  // Conversão por origem (Sprint 2, #6): total e ganhos de cada origem.
  bySourceConversion: Record<string, { total: number; won: number }>;
  aiAccuracy?: {
    total: number;
    correct: number;
    rate: number;
    hasEnoughSample: boolean;
  };
  // Gold set (Item 5): acurácia por intenção (das correções humanas reais).
  aiAccuracyByIntent?: {
    intent: string;
    total: number;
    correct: number;
    rate: number;
    hasEnoughSample: boolean;
    topConfusion: { intent: string; count: number } | null;
  }[];
  byIntent?: Record<string, number>;
  sla?: {
    totalOpen: number;
    onTime: number;
    warning: number;
    late: number;
    lateLeads: { id: string; hoursWaiting: number }[];
    // SLA afiado (Item 5): a bola está com a ótica (cliente engajou, sem resposta).
    needsReply: number;
    needsReplyLeads: { id: string; hoursWaiting: number }[];
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
  const [activeTab, setActiveTab] = useState("hoje");

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
  const [attentionOnly, setAttentionOnly] = useState(false);
  // Período do placar (Sprint 2, #6). Padrão 30 dias = mesmo default do servidor.
  const [period, setPeriod] = useState<LeadStatsPeriod>("30d");

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
    params.set("period", period);
    fetch(`/api/leads/stats?${params}`)
      .then((res) => res.json())
      .then((json) => setStats(json.data || null))
      .catch(() => {});
  }, [branchParam, period]);

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

  // Conversão por origem (Sprint 2, #6): total, ganhos e taxa de cada origem,
  // ordenado por volume (a origem que mais traz leads aparece primeiro). Deriva
  // de bySourceConversion (só origens explícitas — sem origem não entra aqui).
  const topSources = useMemo(() => {
    if (!stats?.bySourceConversion) return [];
    return Object.entries(stats.bySourceConversion)
      .map(([source, { total, won }]) => ({
        source,
        total,
        won,
        rate: total ? won / total : 0,
      }))
      .sort((a, b) => b.total - a.total);
  }, [stats]);

  const intentVolume = useMemo(() => {
    if (!stats?.byIntent) return [];
    return Object.entries(stats.byIntent).sort((a, b) => b[1] - a[1]);
  }, [stats]);

  // "Precisa de atenção" (Item 1, read-only): conta sobre TODOS os leads
  // carregados; o board recebe a lista filtrada quando o toggle está ativo.
  const attentionCount = useMemo(() => countNeedsAttention(leads), [leads]);
  const visibleLeads = useMemo(
    () => (attentionOnly ? leads.filter(leadNeedsAttention) : leads),
    [leads, attentionOnly],
  );

  // Evita estado "preso": se o filtro está ativo mas sumiram os leads de atenção
  // (troca de filial/refresh), o botão desapareceria deixando o board vazio sem
  // saída — então desliga o toggle automaticamente.
  useEffect(() => {
    if (attentionOnly && attentionCount === 0) setAttentionOnly(false);
  }, [attentionOnly, attentionCount]);

  const funilContent = (
    <>
      {/* PRECISA RESPONDER (Item 5) — sinal AFIADO: a bola está com a ótica (cliente
          engajou, ninguém respondeu). É a maior alavancagem: diferente do SLA por
          tempo, aqui é "responder agora ou perder o lead". Só aparece se há algum. */}
      {stats?.sla && stats.sla.needsReply > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-orange-300 bg-orange-50 p-3 text-sm text-orange-900">
          <Clock className="h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">
              {stats.sla.needsReply} lead{stats.sla.needsReply > 1 ? "s" : ""} esperando SUA resposta
            </p>
            <p className="text-xs opacity-80">
              O cliente escreveu e a ótica ainda não respondeu — responda p/ não perder a venda.
            </p>
          </div>
        </div>
      )}

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

      {/* Período do placar (Sprint 2, #6): o dono escolhe a janela e o placar
          (conversão, origem, perdas) recalcula. Presets simples, sem digitar data. */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Período:</span>
        <div className="flex flex-wrap gap-1">
          {LEAD_STATS_PERIODS.map((p) => (
            <Button
              key={p.value}
              type="button"
              size="sm"
              variant={period === p.value ? "default" : "outline"}
              onClick={() => setPeriod(p.value)}
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>

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
              Conversão por origem
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topSources.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem origem informada</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {topSources.slice(0, 3).map(({ source, total, won, rate }) => (
                  <li key={source} className="flex items-center justify-between gap-2">
                    <span className="truncate">
                      {SOURCE_LABEL[source] ?? source}
                    </span>
                    <span className="whitespace-nowrap font-medium">
                      <span className="text-primary">{(rate * 100).toFixed(0)}%</span>{" "}
                      <span className="text-xs text-muted-foreground">
                        ({won}/{total})
                      </span>
                    </span>
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
                {/* Gold set (Item 5): onde a IA é mais fraca — só as com amostra e
                    abaixo de 100% (o problema), no máximo 3, das correções reais. */}
                {(() => {
                  const weak = (stats.aiAccuracyByIntent ?? [])
                    .filter((d) => d.hasEnoughSample && d.rate < 1)
                    .slice(0, 3);
                  if (weak.length === 0) return null;
                  return (
                    <div className="mt-2 space-y-1 border-t pt-2">
                      <p className="text-[11px] font-medium text-muted-foreground">Onde mais erra:</p>
                      {weak.map((d) => {
                        const lbl = intentLabel(d.intent)?.label ?? d.intent;
                        const conf = d.topConfusion ? intentLabel(d.topConfusion.intent)?.label ?? d.topConfusion.intent : null;
                        return (
                          <p key={d.intent} className="text-[11px] text-muted-foreground">
                            <span className="font-medium">{lbl}</span> {(d.rate * 100).toFixed(0)}%
                            {conf ? <span className="opacity-70"> · confunde c/ {conf}</span> : null}
                          </p>
                        );
                      })}
                    </div>
                  );
                })()}
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

        {/* Toggle "Precisa de atenção" (Item 1, read-only): filtra reclamação/
            cobrança/garantia/urgente. Só aparece quando há algum. */}
        {attentionCount > 0 && (
          <Button
            type="button"
            variant={attentionOnly ? "default" : "outline"}
            size="sm"
            onClick={() => setAttentionOnly((v) => !v)}
            className={attentionOnly ? "" : "border-amber-300 text-amber-800 hover:bg-amber-50"}
          >
            <AlertTriangle className="mr-1 h-4 w-4" />
            Precisa de atenção ({attentionCount})
          </Button>
        )}
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
        <FunilBoard stages={stages} leads={visibleLeads} onRefresh={handleRefresh} />
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

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="hoje">Fila de Hoje</TabsTrigger>
          <TabsTrigger value="funil">Funil</TabsTrigger>
          {whatsappEnabled && <TabsTrigger value="conversas">Conversas</TabsTrigger>}
        </TabsList>
        <TabsContent value="hoje" className="mt-4">
          <FunilTodayQueue active={activeTab === "hoje"} branchId={branchParam} />
        </TabsContent>
        <TabsContent value="funil" className="mt-4 space-y-6">
          {funilContent}
        </TabsContent>
        {whatsappEnabled && (
          <TabsContent value="conversas" className="mt-4">
            <WhatsappInbox active={activeTab === "conversas"} />
          </TabsContent>
        )}
      </Tabs>

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
