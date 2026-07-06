"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  MapPin,
  Plus,
  Pencil,
  Power,
  PowerOff,
  Loader2,
  X,
  Store,
  Users,
  ShoppingCart,
  Wrench,
} from "lucide-react";
import { EmptyState } from "@/components/admin/EmptyState";
import { Button } from "@/components/ui/button";
import { ResponsiveTable } from "@/components/ui/responsive-table";
import { TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Branch {
  id: string;
  name: string;
  code: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  phone: string | null;
  nfeSeries: number | null;
  active: boolean;
  createdAt: string;
  _count: {
    sales: number;
    serviceOrders: number;
    userBranches: number;
  };
}

interface CompanyBranchesProps {
  companyId: string;
  maxBranches: number;
}

const ESTADOS = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG",
  "PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
];

export function CompanyBranches({ companyId, maxBranches }: CompanyBranchesProps) {
  const router = useRouter();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [saving, setSaving] = useState(false);
  const [togglingBranch, setTogglingBranch] = useState<Branch | null>(null);

  // Form state
  const [form, setForm] = useState({
    name: "",
    code: "",
    address: "",
    city: "",
    state: "",
    zipCode: "",
    phone: "",
    nfeSeries: "",
  });

  const fetchBranches = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/companies/${companyId}/branches`);
      const data = await res.json();
      if (data.success) setBranches(data.data);
    } catch (e) {
      console.error("Erro ao buscar filiais:", e);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    fetchBranches();
  }, [fetchBranches]);

  function resetForm() {
    setForm({ name: "", code: "", address: "", city: "", state: "", zipCode: "", phone: "", nfeSeries: "" });
    setEditingBranch(null);
    setShowForm(false);
  }

  function openEditForm(branch: Branch) {
    setForm({
      name: branch.name,
      code: branch.code || "",
      address: branch.address || "",
      city: branch.city || "",
      state: branch.state || "",
      zipCode: branch.zipCode || "",
      phone: branch.phone || "",
      nfeSeries: branch.nfeSeries?.toString() || "",
    });
    setEditingBranch(branch);
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }
    setSaving(true);

    try {
      const url = editingBranch
        ? `/api/admin/companies/${companyId}/branches/${editingBranch.id}`
        : `/api/admin/companies/${companyId}/branches`;

      const res = await fetch(url, {
        method: editingBranch ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Erro ao salvar filial");
        return;
      }

      resetForm();
      fetchBranches();
      router.refresh();
    } catch {
      toast.error("Erro ao salvar filial");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(branch: Branch) {
    const action = branch.active ? "desativar" : "reativar";

    try {
      const res = await fetch(`/api/admin/companies/${companyId}/branches/${branch.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !branch.active }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || `Erro ao ${action} filial`);
        return;
      }

      fetchBranches();
      router.refresh();
    } catch {
      toast.error(`Erro ao ${action} filial`);
    } finally {
      setTogglingBranch(null);
    }
  }

  const activeBranches = branches.filter((b) => b.active).length;
  const limitReached = maxBranches !== -1 && activeBranches >= maxBranches;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            Filiais ({activeBranches} de {maxBranches === -1 ? "ilimitado" : maxBranches})
          </h2>
          {limitReached && (
            <p className="text-xs text-warning mt-1">
              Limite do plano atingido. Faça upgrade para adicionar mais filiais.
            </p>
          )}
        </div>
        {!showForm && (
          <Button
            size="sm"
            onClick={() => { resetForm(); setShowForm(true); }}
            disabled={limitReached}
          >
            <Plus className="h-3.5 w-3.5" />
            Adicionar Filial
          </Button>
        )}
      </div>

      {/* Form */}
      {showForm && (
        <div className="rounded-xl border border-border bg-muted p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground">
              {editingBranch ? `Editar: ${editingBranch.name}` : "Nova Filial"}
            </h3>
            <button
              onClick={resetForm}
              aria-label="Fechar formulário"
              className="p-1 rounded hover:bg-muted text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Nome da Filial *</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm text-foreground focus:outline-none focus:border-primary"
                  placeholder="Ex: Filial Eusébio"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Código (interno)</label>
                <input
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm text-foreground focus:outline-none focus:border-primary"
                  placeholder="Ex: 002"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Telefone</label>
                <input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm text-foreground focus:outline-none focus:border-primary"
                  placeholder="(85) 3456-7890"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Série NF-e</label>
                <input
                  value={form.nfeSeries}
                  onChange={(e) => setForm({ ...form, nfeSeries: e.target.value })}
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm text-foreground focus:outline-none focus:border-primary"
                  placeholder="1"
                  type="number"
                />
              </div>
            </div>
            <div className="border-t border-border pt-4">
              <p className="text-xs text-muted-foreground mb-3">Endereço</p>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">CEP</label>
                  <input
                    value={form.zipCode}
                    onChange={(e) => setForm({ ...form, zipCode: e.target.value })}
                    className="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm text-foreground focus:outline-none focus:border-primary"
                    placeholder="60000-000"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-muted-foreground mb-1">Endereço</label>
                  <input
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    className="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm text-foreground focus:outline-none focus:border-primary"
                    placeholder="Rua..."
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 mt-3">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Cidade</label>
                  <input
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                    className="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm text-foreground focus:outline-none focus:border-primary"
                    placeholder="Fortaleza"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Estado</label>
                  <select
                    value={form.state}
                    onChange={(e) => setForm({ ...form, state: e.target.value })}
                    className="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm text-foreground focus:outline-none focus:border-primary"
                  >
                    <option value="">Selecione...</option>
                    {ESTADOS.map((uf) => (
                      <option key={uf} value={uf}>{uf}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="ghost" onClick={resetForm}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {editingBranch ? "Salvar Alterações" : "Criar Filial"}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Branches List */}
      {branches.length === 0 ? (
        <div className="rounded-xl border border-border bg-card">
          <EmptyState icon={Store} message="Nenhuma filial cadastrada" />
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <ResponsiveTable minWidth={860}>
            <TableHeader>
              <TableRow>
                <TableHead>Filial</TableHead>
                <TableHead>Código</TableHead>
                <TableHead>Cidade</TableHead>
                <TableHead className="text-center">Usuários</TableHead>
                <TableHead className="text-center">Vendas</TableHead>
                <TableHead className="text-center">OS</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {branches.map((branch) => (
                <TableRow
                  key={branch.id}
                  className={!branch.active ? "opacity-50" : undefined}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <span className="font-medium text-foreground">{branch.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs">
                    {branch.code || "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {branch.city ? `${branch.city}/${branch.state}` : "—"}
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <Users className="h-3 w-3" />
                      {branch._count.userBranches}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <ShoppingCart className="h-3 w-3" />
                      {branch._count.sales}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <Wrench className="h-3 w-3" />
                      {branch._count.serviceOrders}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                        branch.active
                          ? "bg-success/10 text-success"
                          : "bg-destructive/10 text-destructive"
                      }`}
                    >
                      {branch.active ? "Ativa" : "Inativa"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openEditForm(branch)}
                        aria-label={`Editar ${branch.name}`}
                        className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        title="Editar"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setTogglingBranch(branch)}
                        aria-label={branch.active ? `Desativar ${branch.name}` : `Reativar ${branch.name}`}
                        className={`p-1.5 rounded hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                          branch.active
                            ? "text-warning hover:text-warning"
                            : "text-success hover:text-success"
                        }`}
                        title={branch.active ? "Desativar" : "Reativar"}
                      >
                        {branch.active ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </ResponsiveTable>
        </div>
      )}

      <AlertDialog open={togglingBranch !== null} onOpenChange={(o) => !o && setTogglingBranch(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {togglingBranch?.active ? "Desativar filial?" : "Reativar filial?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {togglingBranch?.active
                ? `A filial "${togglingBranch?.name}" ficará inativa e não poderá ser usada até ser reativada.`
                : `A filial "${togglingBranch?.name}" voltará a ficar ativa.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className={
                togglingBranch?.active
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : undefined
              }
              onClick={() => {
                if (togglingBranch) toggleActive(togglingBranch);
              }}
            >
              {togglingBranch?.active ? "Desativar" : "Reativar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
