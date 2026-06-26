"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Target, Trophy, Medal, Info } from "lucide-react";

/**
 * Aba "Metas por níveis (mini/meta/mega)" da Configuração de Comissões — Fase 2.
 *
 * Grava/lê em SellerCommissionTier via /api/commission-tiers. Suporta o padrão
 * da loja (userId null) e override por vendedor. NÃO mexe na config legada
 * (base + bônus) nem nos cálculos atuais — alimenta o motor novo (ainda inerte).
 */

interface TierLevelView {
  targetAmount: string;
  percent: string;
}
interface TiersView {
  userId: string | null;
  mini: TierLevelView | null;
  meta: TierLevelView | null;
  mega: TierLevelView | null;
}
interface Seller {
  id: string;
  name: string;
}

type LevelKey = "mini" | "meta" | "mega";

const LEVELS: { key: LevelKey; label: string; icon: typeof Medal; hint: string }[] = [
  { key: "mini", label: "Mini", icon: Medal, hint: "Primeiro nível — a porta de entrada da comissão" },
  { key: "meta", label: "Meta", icon: Target, hint: "Nível principal" },
  { key: "mega", label: "Mega", icon: Trophy, hint: "Nível máximo" },
];

const STORE_SCOPE = "__store__"; // valor do Select para "padrão da loja"

function emptyForm() {
  return {
    mini: { targetAmount: "", percent: "" },
    meta: { targetAmount: "", percent: "" },
    mega: { targetAmount: "", percent: "" },
  };
}

export function CommissionTiersTab() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [scope, setScope] = useState<string>(STORE_SCOPE); // STORE_SCOPE ou userId
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [overrides, setOverrides] = useState<string[]>([]);
  const [form, setForm] = useState(emptyForm());

  const isStore = scope === STORE_SCOPE;
  const userId = isStore ? null : scope;

  // Lista de vendedores (para o seletor de override). Reusa a rota existente.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/goals/sellers");
        const json = await res.json();
        if (json.success) setSellers(json.data.map((s: Seller) => ({ id: s.id, name: s.name })));
      } catch {
        // silencioso — sem vendedores o override fica indisponível
      }
    })();
  }, []);

  const fetchTiers = useCallback(async () => {
    setLoading(true);
    try {
      const qs = userId ? `?userId=${encodeURIComponent(userId)}` : "";
      const res = await fetch(`/api/commission-tiers${qs}`);
      const json = await res.json();
      if (json.success) {
        const t: TiersView = json.data.tiers;
        setForm({
          mini: { targetAmount: t.mini?.targetAmount ?? "", percent: t.mini?.percent ?? "" },
          meta: { targetAmount: t.meta?.targetAmount ?? "", percent: t.meta?.percent ?? "" },
          mega: { targetAmount: t.mega?.targetAmount ?? "", percent: t.mega?.percent ?? "" },
        });
        if (json.data.overrides) setOverrides(json.data.overrides);
      }
    } catch {
      toast({ title: "Erro", description: "Erro ao carregar as metas", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [userId, toast]);

  useEffect(() => {
    fetchTiers();
  }, [fetchTiers]);

  const setField = (level: LevelKey, field: "targetAmount" | "percent", value: string) => {
    setForm((prev) => ({ ...prev, [level]: { ...prev[level], [field]: value } }));
  };

  const handleSave = async () => {
    // validação leve no cliente (o backend revalida com zod)
    const num = (v: string) => (v === "" ? NaN : Number(v));
    for (const { key, label } of LEVELS) {
      if (Number.isNaN(num(form[key].targetAmount)) || Number.isNaN(num(form[key].percent))) {
        toast({ title: "Campos incompletos", description: `Preencha valor e % do nível ${label}.`, variant: "destructive" });
        return;
      }
    }
    setSaving(true);
    try {
      const res = await fetch("/api/commission-tiers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          mini: { targetAmount: num(form.mini.targetAmount), percent: num(form.mini.percent) },
          meta: { targetAmount: num(form.meta.targetAmount), percent: num(form.meta.percent) },
          mega: { targetAmount: num(form.mega.targetAmount), percent: num(form.mega.percent) },
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast({ title: "Sucesso", description: isStore ? "Metas padrão da loja salvas" : "Metas do vendedor salvas" });
        if (!isStore && !overrides.includes(userId!)) setOverrides((o) => [...o, userId!]);
      } else {
        toast({ title: "Erro", description: json.message ?? "Não foi possível salvar", variant: "destructive" });
      }
    } catch {
      toast({ title: "Erro", description: "Erro ao salvar", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveOverride = async () => {
    if (isStore) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/commission-tiers/${encodeURIComponent(userId!)}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) {
        toast({ title: "Removido", description: "Vendedor voltou a usar as metas da loja" });
        setOverrides((o) => o.filter((id) => id !== userId));
        setForm(emptyForm());
        await fetchTiers();
      } else {
        toast({ title: "Erro", description: json.message ?? "Não foi possível remover", variant: "destructive" });
      }
    } catch {
      toast({ title: "Erro", description: "Erro ao remover", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Target className="h-5 w-5" /> Metas por níveis (mini / meta / mega)
          </CardTitle>
          <CardDescription>
            O vendedor recebe o percentual do MAIOR nível atingido, aplicado sobre tudo que
            vendeu no mês. Configure as metas padrão da loja ou metas específicas de um vendedor.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Escopo: loja (padrão) ou um vendedor (override) */}
          <div className="space-y-2 max-w-md">
            <Label>Para quem são estas metas?</Label>
            <Select value={scope} onValueChange={setScope}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={STORE_SCOPE}>Padrão da loja (todos os vendedores)</SelectItem>
                {sellers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                    {overrides.includes(s.id) ? " — metas próprias" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!isStore && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Info className="h-3 w-3" />
                Metas específicas deste vendedor. Se removidas, ele volta a usar o padrão da loja.
              </p>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {LEVELS.map(({ key, label, icon: Icon, hint }) => (
                <Card key={key}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Icon className="h-4 w-4" /> {label}
                    </CardTitle>
                    <CardDescription className="text-xs">{hint}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Valor-alvo (R$)</Label>
                      <Input
                        type="number"
                        min="0"
                        step="100"
                        placeholder="0,00"
                        value={form[key].targetAmount}
                        onChange={(e) => setField(key, "targetAmount", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Percentual (%)</Label>
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        placeholder="0"
                        value={form[key].percent}
                        onChange={(e) => setField(key, "percent", e.target.value)}
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <div className="flex items-center gap-3">
            <Button onClick={handleSave} disabled={saving || loading}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isStore ? "Salvar metas da loja" : "Salvar metas do vendedor"}
            </Button>
            {!isStore && overrides.includes(userId!) && (
              <Button variant="outline" onClick={handleRemoveOverride} disabled={saving || loading}>
                Remover override (voltar ao padrão)
              </Button>
            )}
          </div>

          <p className="text-xs text-muted-foreground border-t pt-3">
            ℹ️ Regra: mini ≤ meta ≤ mega (tanto no valor-alvo quanto no %). Estas metas
            alimentam o novo cálculo de comissão por níveis.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
