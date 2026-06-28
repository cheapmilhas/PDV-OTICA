"use client";

import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
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

export default function LivroReceitasPage() {
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission("prescriptions.edit");
  const [prescriptions, setPrescriptions] = useState<PrescriptionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("ALL");
  const [editId, setEditId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<PrescriptionListItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ pageSize: "50" });
      if (search.trim()) params.set("search", search.trim());
      if (status !== "ALL") params.set("status", status);
      const res = await fetch(`/api/prescriptions?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setPrescriptions(data.data || []);
      } else {
        setPrescriptions([]);
      }
    } catch {
      setPrescriptions([]);
    } finally {
      setLoading(false);
    }
  }, [search, status]);

  useEffect(() => {
    const t = setTimeout(load, 300); // debounce da busca
    return () => clearTimeout(t);
  }, [load]);

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
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="text-sm font-medium">Buscar por cliente</label>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nome do cliente..."
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
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Carregando…</p>
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
