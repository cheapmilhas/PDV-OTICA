"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, RefreshCw, PartyPopper } from "lucide-react";
import toast from "react-hot-toast";
import { WhatsAppButton } from "@/components/whatsapp/whatsapp-button";
import { buildWaMeUrl } from "@/lib/whatsapp-deeplink";
import { LEAD_STATS_PERIODS, type LeadStatsPeriod } from "@/lib/lead-stats-period";
import { LOST_REASON_OPTIONS, lostReasonLabel } from "@/lib/lost-reason-label";

interface FunilRecuperarProps {
  active: boolean;
  branchId: string | null;
}

interface ColdLeadRow {
  id: string;
  name: string;
  phone: string | null;
  source: string | null;
  status: "lost" | "cold";
  lostReasonCategory: string | null;
  lostReason: string | null;
  coldFor: string;
  draftText: string;
}

const ALL = "__all__";

const SOURCE_LABEL: Record<string, string> = {
  WHATSAPP: "WhatsApp",
  INSTAGRAM: "Instagram",
  GOOGLE: "Google",
  REFERRAL: "Indicação",
  WALK_IN: "Espontâneo",
  OTHER: "Outro",
};

/**
 * "Recuperar" (Sprint 3, #7): a lista de quem NÃO comprou, pra puxar de volta
 * com promoção. Perdidos + abertos que esfriaram, sem venda vinculada. Filtros
 * de origem e período; botão que abre o WhatsApp com o texto de reoferta pronto.
 * Read-only — o envio é sempre manual (a atendente cola e manda do celular).
 */
export function FunilRecuperar({ active, branchId }: FunilRecuperarProps) {
  const [rows, setRows] = useState<ColdLeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<string>(ALL);
  // Motivo ESTRUTURADO (#8): filtra a recuperação por categoria da perda —
  // "todos que perderam por preço" viram uma campanha de reoferta.
  const [motive, setMotive] = useState<string>(ALL);
  // Padrão "Tudo": recuperação olha o backlog inteiro (perdido meses atrás ainda vale).
  const [period, setPeriod] = useState<LeadStatsPeriod>("all");

  const fetchRows = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (branchId) params.set("branchId", branchId);
    if (source !== ALL) params.set("source", source);
    if (motive !== ALL) params.set("lostReasonCategory", motive);
    params.set("period", period);
    fetch(`/api/leads/cold?${params}`)
      .then((res) => res.json())
      .then((json) => setRows(json.data?.rows ?? []))
      .catch(() => toast.error("Erro ao carregar a lista de recuperação"))
      .finally(() => setLoading(false));
  }, [branchId, source, motive, period]);

  useEffect(() => {
    if (active) fetchRows();
  }, [active, fetchRows]);

  const total = rows.length;
  const sourceOptions = useMemo(() => Object.entries(SOURCE_LABEL), []);

  if (loading && rows.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-2xl font-bold">
            {total > 0
              ? `${total} ${total === 1 ? "cliente pra recuperar" : "clientes pra recuperar"}`
              : "Nenhum cliente esfriando"}
          </p>
          <p className="text-sm text-muted-foreground">
            Quem não comprou ainda. Ofereça uma condição e traga de volta.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchRows} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {/* Filtros: origem + motivo + período */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={source} onValueChange={setSource}>
          <SelectTrigger className="w-[170px]">
            <SelectValue placeholder="Todas as origens" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas as origens</SelectItem>
            {sourceOptions.map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={motive} onValueChange={setMotive}>
          <SelectTrigger className="w-[190px]">
            <SelectValue placeholder="Todos os motivos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os motivos</SelectItem>
            {LOST_REASON_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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

      {total === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <PartyPopper className="h-10 w-10 text-green-500" />
            <p className="font-medium">Ninguém esfriando 🎉</p>
            <p className="text-sm text-muted-foreground">
              Todo mundo comprou ou ainda está em atendimento. Ótimo sinal!
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id}>
              <Card>
                <CardContent className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{r.name}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {[
                        r.source ? (SOURCE_LABEL[r.source] ?? r.source) : null,
                        r.status === "lost"
                          ? // Mostra a CATEGORIA estruturada (#8); cai no detalhe
                            // livre, e por fim só "perdido" se não houver nenhum.
                            `perdido: ${lostReasonLabel(r.lostReasonCategory) || r.lostReason || "motivo não informado"}`
                          : `esfriou ${r.coldFor}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  {buildWaMeUrl(r.phone) ? (
                    <WhatsAppButton phone={r.phone} draftText={r.draftText} label="Reofertar" />
                  ) : (
                    <span className="text-xs text-muted-foreground">Sem telefone</span>
                  )}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
