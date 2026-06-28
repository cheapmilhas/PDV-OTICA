"use client";

import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PrescriptionList,
  type PrescriptionListItem,
} from "@/components/prescriptions/prescription-list";
import { PrescriptionGradeDialog } from "@/components/prescriptions/prescription-grade-dialog";
import { PrescriptionDetailDialog } from "@/components/prescriptions/prescription-detail-dialog";
import { usePermissions } from "@/hooks/usePermissions";
import { chipToDateParams, type DateChip } from "@/lib/livro-receitas-filters";

interface BranchOption {
  id: string;
  name: string;
}

const CHIPS: { value: DateChip; label: string }[] = [
  { value: "todas", label: "Todas" },
  { value: "vence30", label: "Vence em 30 dias" },
  { value: "vencidas", label: "Vencidas" },
  { value: "idade1a2", label: "1 a 2 anos" },
  { value: "idade2mais", label: "2+ anos" },
];

export default function LivroReceitasPage() {
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission("prescriptions.edit");
  const [prescriptions, setPrescriptions] = useState<PrescriptionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("ALL");
  const [chip, setChip] = useState<DateChip>("todas");
  const [branchId, setBranchId] = useState<string>("all");
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [emitidaDe, setEmitidaDe] = useState("");
  const [emitidaAte, setEmitidaAte] = useState("");
  const [showPeriodo, setShowPeriodo] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<PrescriptionListItem | null>(null);

  // Carrega filiais uma vez no mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/branches?status=ativos&pageSize=100");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setBranches(data.data || []);
      } catch {
        /* dropdown apenas não aparece */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ pageSize: "50" });
      if (search.trim()) params.set("search", search.trim());
      if (status !== "ALL") params.set("status", status);
      if (branchId !== "all") params.set("branchId", branchId);

      if (chip !== "todas") {
        const dp = chipToDateParams(chip);
        if (dp.validadeDe) params.set("validadeDe", dp.validadeDe.toISOString());
        if (dp.validadeAte) params.set("validadeAte", dp.validadeAte.toISOString());
        if (dp.emitidaDe) params.set("emitidaDe", dp.emitidaDe.toISOString());
        if (dp.emitidaAte) params.set("emitidaAte", dp.emitidaAte.toISOString());
      } else {
        if (emitidaDe) params.set("emitidaDe", new Date(emitidaDe).toISOString());
        if (emitidaAte) params.set("emitidaAte", new Date(emitidaAte).toISOString());
      }

      const res = await fetch(`/api/prescriptions?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setPrescriptions(data.data || []);
        setError(false);
      } else {
        setPrescriptions([]);
        setError(true);
      }
    } catch {
      setPrescriptions([]);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [search, status, chip, branchId, emitidaDe, emitidaAte]);

  useEffect(() => {
    const t = setTimeout(load, 300); // debounce da busca
    return () => clearTimeout(t);
  }, [load]);

  const handleChip = (value: DateChip) => {
    setChip(value);
    // chip e período manual são mutuamente exclusivos
    setEmitidaDe("");
    setEmitidaAte("");
  };

  const hasActiveFilters =
    search.trim() !== "" ||
    status !== "ALL" ||
    chip !== "todas" ||
    branchId !== "all" ||
    emitidaDe !== "" ||
    emitidaAte !== "";

  const clearFilters = () => {
    setSearch("");
    setStatus("ALL");
    setChip("todas");
    setBranchId("all");
    setEmitidaDe("");
    setEmitidaAte("");
    setShowPeriodo(false);
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Livro de Receitas</h1>
        <p className="text-sm text-muted-foreground">
          Todas as receitas oftálmicas da ótica.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="text-sm font-medium">Buscar por cliente</label>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nome, CPF ou telefone..."
              />
            </div>
            <div className="w-full sm:w-56">
              <label className="text-sm font-medium">Status</label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos</SelectItem>
                  <SelectItem value="AGUARDANDO_GRAU">Aguardando grau</SelectItem>
                  <SelectItem value="COMPLETA">Completa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {branches.length > 1 && (
              <div className="w-full sm:w-56">
                <label className="text-sm font-medium">Filial</label>
                <Select value={branchId} onValueChange={setBranchId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as filiais</SelectItem>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {CHIPS.map((c) => (
              <Button
                key={c.value}
                type="button"
                size="sm"
                variant={chip === c.value ? "default" : "outline"}
                onClick={() => handleChip(c.value)}
              >
                {c.label}
              </Button>
            ))}
          </div>

          <div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="px-2"
              onClick={() => setShowPeriodo((v) => !v)}
            >
              {showPeriodo ? "▾" : "▸"} Período de emissão
            </Button>
            {showPeriodo && (
              <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end">
                <div>
                  <label className="text-sm font-medium">De</label>
                  <input
                    type="date"
                    value={emitidaDe}
                    onChange={(e) => {
                      setEmitidaDe(e.target.value);
                      setChip("todas");
                    }}
                    className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Até</label>
                  <input
                    type="date"
                    value={emitidaAte}
                    onChange={(e) => {
                      setEmitidaAte(e.target.value);
                      setChip("todas");
                    }}
                    className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
              </div>
            )}
          </div>

          {hasActiveFilters && (
            <div>
              <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
                Limpar filtros
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Carregando…</p>
          ) : error ? (
            <div className="py-6 text-center">
              <p className="text-sm text-muted-foreground">
                Não foi possível carregar as receitas.
              </p>
              <Button type="button" variant="outline" size="sm" className="mt-3" onClick={load}>
                Tentar de novo
              </Button>
            </div>
          ) : (
            <PrescriptionList
              prescriptions={prescriptions}
              onDigitarGrau={canEdit ? setEditId : undefined}
              onVer={setViewing}
            />
          )}
        </CardContent>
      </Card>

      {viewing && (
        <PrescriptionDetailDialog
          prescription={viewing}
          open={!!viewing}
          onClose={() => setViewing(null)}
          canEdit={canEdit}
          onEdit={(id) => {
            setViewing(null);
            setEditId(id);
          }}
        />
      )}

      {editId && (
        <PrescriptionGradeDialog
          prescriptionId={editId}
          open={!!editId}
          onClose={() => setEditId(null)}
          onSaved={() => {
            setEditId(null);
            load();
          }}
        />
      )}
    </div>
  );
}
