"use client";

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Plus,
  Building2,
  Phone,
  Mail,
  Clock,
  Edit,
  Trash2,
  Search,
  Loader2,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import toast from "react-hot-toast";
import { SearchBar } from "@/components/shared/search-bar";

interface Lab {
  id: string;
  companyId: string;
  name: string;
  code: string | null;
  cnpj: string | null;
  phone: string | null;
  email: string | null;
  orderEmail: string | null;
  website: string | null;
  contactPerson: string | null;
  integrationType: string | null;
  apiUrl: string | null;
  apiKey: string | null;
  clientCode: string | null;
  defaultLeadTimeDays: number;
  urgentLeadTimeDays: number;
  paymentTermDays: number;
  defaultDiscount: number;
  qualityRating: number | null;
  totalOrders: number;
  totalReworks: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

interface LabFormData {
  name: string;
  cnpj: string;
  phone: string;
  email: string;
  contactPerson: string;
  defaultLeadTimeDays: number;
  urgentLeadTimeDays: number;
}

const emptyForm: LabFormData = {
  name: "",
  cnpj: "",
  phone: "",
  email: "",
  contactPerson: "",
  defaultLeadTimeDays: 7,
  urgentLeadTimeDays: 3,
};

function LaboratoriosPage() {
  const [labs, setLabs] = useState<Lab[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ativos" | "inativos" | "todos">("ativos");

  // Create modal
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createForm, setCreateForm] = useState<LabFormData>({ ...emptyForm });
  const [creating, setCreating] = useState(false);

  // Edit modal
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editForm, setEditForm] = useState<LabFormData>({ ...emptyForm });
  const [editingLab, setEditingLab] = useState<Lab | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchLabs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        search,
        status: statusFilter,
      });

      const res = await fetch(`/api/laboratories?${params}`);
      if (!res.ok) throw new Error("Erro ao buscar laboratorios");

      const data = await res.json();
      setLabs(data.data || []);
    } catch (error: any) {
      console.error("Erro ao carregar laboratorios:", error);
      toast.error("Erro ao carregar laboratorios");
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    fetchLabs();
  }, [fetchLabs]);

  // --- Create ---
  function handleOpenCreate() {
    setCreateForm({ ...emptyForm });
    setCreateDialogOpen(true);
  }

  async function handleCreate() {
    if (!createForm.name.trim()) {
      toast.error("Nome e obrigatorio");
      return;
    }

    setCreating(true);
    try {
      const res = await fetch("/api/laboratories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createForm.name.trim(),
          cnpj: createForm.cnpj.trim() || null,
          phone: createForm.phone.trim() || null,
          email: createForm.email.trim() || null,
          contactPerson: createForm.contactPerson.trim() || null,
          defaultLeadTimeDays: createForm.defaultLeadTimeDays,
          urgentLeadTimeDays: createForm.urgentLeadTimeDays,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error?.message || "Erro ao criar laboratorio");
      }

      toast.success("Laboratorio criado com sucesso!");
      setCreateDialogOpen(false);
      fetchLabs();
    } catch (error: any) {
      toast.error(error.message || "Erro ao criar laboratorio");
    } finally {
      setCreating(false);
    }
  }

  // --- Edit ---
  function handleOpenEdit(lab: Lab) {
    setEditingLab(lab);
    setEditForm({
      name: lab.name,
      cnpj: lab.cnpj || "",
      phone: lab.phone || "",
      email: lab.email || "",
      contactPerson: lab.contactPerson || "",
      defaultLeadTimeDays: lab.defaultLeadTimeDays,
      urgentLeadTimeDays: lab.urgentLeadTimeDays,
    });
    setEditDialogOpen(true);
  }

  async function handleSaveEdit() {
    if (!editingLab) return;
    if (!editForm.name.trim()) {
      toast.error("Nome e obrigatorio");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/laboratories/${editingLab.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editForm.name.trim(),
          cnpj: editForm.cnpj.trim() || null,
          phone: editForm.phone.trim() || null,
          email: editForm.email.trim() || null,
          contactPerson: editForm.contactPerson.trim() || null,
          defaultLeadTimeDays: editForm.defaultLeadTimeDays,
          urgentLeadTimeDays: editForm.urgentLeadTimeDays,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error?.message || "Erro ao atualizar laboratorio");
      }

      toast.success("Laboratorio atualizado com sucesso!");
      setEditDialogOpen(false);
      setEditingLab(null);
      fetchLabs();
    } catch (error: any) {
      toast.error(error.message || "Erro ao atualizar laboratorio");
    } finally {
      setSaving(false);
    }
  }

  // --- Toggle active ---
  async function handleToggleActive(lab: Lab) {
    try {
      const res = await fetch(`/api/laboratories/${lab.id}`, {
        method: "PATCH",
      });

      if (!res.ok) throw new Error("Erro ao alterar status");

      const result = await res.json();
      toast.success(result.message || "Status alterado com sucesso!");
      fetchLabs();
    } catch (error: any) {
      toast.error(error.message || "Erro ao alterar status");
    }
  }

  // --- Delete (soft) ---
  async function handleDelete(lab: Lab) {
    if (!confirm(`Deseja desativar o laboratorio "${lab.name}"?`)) return;

    try {
      const res = await fetch(`/api/laboratories/${lab.id}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Erro ao desativar laboratorio");

      toast.success("Laboratorio desativado com sucesso!");
      fetchLabs();
    } catch (error: any) {
      toast.error(error.message || "Erro ao desativar laboratorio");
    }
  }

  // --- Stats ---
  const totalLabs = labs.length;
  const activeLabs = labs.filter((l) => l.active).length;
  const totalOrders = labs.reduce((sum, l) => sum + l.totalOrders, 0);
  const totalReworks = labs.reduce((sum, l) => sum + l.totalReworks, 0);
  const avgQuality =
    labs.filter((l) => l.qualityRating !== null).length > 0
      ? (
          labs
            .filter((l) => l.qualityRating !== null)
            .reduce((sum, l) => sum + (l.qualityRating || 0), 0) /
          labs.filter((l) => l.qualityRating !== null).length
        ).toFixed(1)
      : "-";

  function getQualityColor(rating: number | null): string {
    if (rating === null) return "text-muted-foreground";
    if (rating >= 4) return "text-green-600";
    if (rating >= 3) return "text-yellow-600";
    return "text-red-600";
  }

  function getReworkRate(lab: Lab): string {
    if (lab.totalOrders === 0) return "-";
    return ((lab.totalReworks / lab.totalOrders) * 100).toFixed(1) + "%";
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold">Laboratorios</h1>
          <p className="text-muted-foreground">
            Gerencie os laboratorios parceiros
          </p>
        </div>
        <Button onClick={handleOpenCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Novo Laboratorio
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total de Laboratorios
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totalLabs}</p>
            <p className="text-xs text-muted-foreground">
              {activeLabs} ativos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total de Pedidos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totalOrders}</p>
            <p className="text-xs text-muted-foreground">
              Em todos os laboratorios
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total de Retrabalhos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-orange-600">{totalReworks}</p>
            <p className="text-xs text-muted-foreground">
              {totalOrders > 0
                ? ((totalReworks / totalOrders) * 100).toFixed(1) + "% do total"
                : "Sem pedidos"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Qualidade Media
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-blue-600">{avgQuality}</p>
            <p className="text-xs text-muted-foreground">
              Rating medio dos laboratorios
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Buscar Laboratorios</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 md:flex-row">
            <SearchBar
              placeholder="Buscar por nome, CNPJ, email..."
              onSearch={(value) => setSearch(value)}
              className="flex-1"
              clearable
            />
            <div className="flex gap-2">
              <Button
                variant={statusFilter === "ativos" ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter("ativos")}
              >
                Ativos
              </Button>
              <Button
                variant={statusFilter === "inativos" ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter("inativos")}
              >
                Inativos
              </Button>
              <Button
                variant={statusFilter === "todos" ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter("todos")}
              >
                Todos
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty State */}
      {!loading && labs.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold">Nenhum laboratorio encontrado</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {search
                ? `Sem resultados para "${search}"`
                : "Comece adicionando seu primeiro laboratorio"}
            </p>
            {!search && (
              <Button className="mt-4" onClick={handleOpenCreate}>
                <Plus className="mr-2 h-4 w-4" />
                Novo Laboratorio
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Lab Cards */}
      {!loading && labs.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {labs.map((lab) => (
            <Card key={lab.id} className={!lab.active ? "opacity-60" : ""}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                      <Building2 className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="text-base truncate">
                        {lab.name}
                      </CardTitle>
                      {lab.contactPerson && (
                        <p className="text-xs text-muted-foreground truncate">
                          {lab.contactPerson}
                        </p>
                      )}
                    </div>
                  </div>
                  <Badge variant={lab.active ? "default" : "secondary"}>
                    {lab.active ? "Ativo" : "Inativo"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Contact Info */}
                <div className="space-y-1.5">
                  {lab.phone && (
                    <p className="text-sm flex items-center gap-2 text-muted-foreground">
                      <Phone className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{lab.phone}</span>
                    </p>
                  )}
                  {lab.email && (
                    <p className="text-sm flex items-center gap-2 text-muted-foreground">
                      <Mail className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{lab.email}</span>
                    </p>
                  )}
                </div>

                {/* Lead Times */}
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    <span>Normal: {lab.defaultLeadTimeDays}d</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    <span>Urgente: {lab.urgentLeadTimeDays}d</span>
                  </div>
                </div>

                {/* Stats */}
                <div className="flex items-center gap-4 text-sm border-t pt-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Pedidos</p>
                    <p className="font-semibold">{lab.totalOrders}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Retrabalhos</p>
                    <p className="font-semibold text-orange-600">
                      {getReworkRate(lab)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Qualidade</p>
                    <p className={`font-semibold ${getQualityColor(lab.qualityRating)}`}>
                      {lab.qualityRating !== null
                        ? Number(lab.qualityRating).toFixed(1)
                        : "-"}
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 border-t pt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => handleOpenEdit(lab)}
                  >
                    <Edit className="mr-1 h-3.5 w-3.5" />
                    Editar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleToggleActive(lab)}
                    title={lab.active ? "Desativar" : "Ativar"}
                  >
                    {lab.active ? (
                      <ToggleRight className="h-4 w-4 text-green-600" />
                    ) : (
                      <ToggleLeft className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                  {lab.active && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(lab)}
                      title="Desativar laboratorio"
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo Laboratorio</DialogTitle>
            <DialogDescription>
              Preencha os dados do novo laboratorio
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="create-name">Nome *</Label>
              <Input
                id="create-name"
                placeholder="Nome do laboratorio"
                value={createForm.name}
                onChange={(e) =>
                  setCreateForm({ ...createForm, name: e.target.value })
                }
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="create-cnpj">CNPJ</Label>
                <Input
                  id="create-cnpj"
                  placeholder="00.000.000/0000-00"
                  value={createForm.cnpj}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, cnpj: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-phone">Telefone</Label>
                <Input
                  id="create-phone"
                  placeholder="(00) 00000-0000"
                  value={createForm.phone}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, phone: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="create-email">Email</Label>
                <Input
                  id="create-email"
                  type="email"
                  placeholder="contato@lab.com"
                  value={createForm.email}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, email: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-contact">Pessoa de Contato</Label>
                <Input
                  id="create-contact"
                  placeholder="Nome do contato"
                  value={createForm.contactPerson}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      contactPerson: e.target.value,
                    })
                  }
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="create-lead">Prazo Normal (dias)</Label>
                <Input
                  id="create-lead"
                  type="number"
                  min={1}
                  value={createForm.defaultLeadTimeDays}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      defaultLeadTimeDays: parseInt(e.target.value) || 7,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-urgent">Prazo Urgente (dias)</Label>
                <Input
                  id="create-urgent"
                  type="number"
                  min={1}
                  value={createForm.urgentLeadTimeDays}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      urgentLeadTimeDays: parseInt(e.target.value) || 3,
                    })
                  }
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateDialogOpen(false)}
              disabled={creating}
            >
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Criar Laboratorio
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar Laboratorio</DialogTitle>
            <DialogDescription>
              Atualize os dados do laboratorio
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Nome *</Label>
              <Input
                id="edit-name"
                placeholder="Nome do laboratorio"
                value={editForm.name}
                onChange={(e) =>
                  setEditForm({ ...editForm, name: e.target.value })
                }
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit-cnpj">CNPJ</Label>
                <Input
                  id="edit-cnpj"
                  placeholder="00.000.000/0000-00"
                  value={editForm.cnpj}
                  onChange={(e) =>
                    setEditForm({ ...editForm, cnpj: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-phone">Telefone</Label>
                <Input
                  id="edit-phone"
                  placeholder="(00) 00000-0000"
                  value={editForm.phone}
                  onChange={(e) =>
                    setEditForm({ ...editForm, phone: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit-email">Email</Label>
                <Input
                  id="edit-email"
                  type="email"
                  placeholder="contato@lab.com"
                  value={editForm.email}
                  onChange={(e) =>
                    setEditForm({ ...editForm, email: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-contact">Pessoa de Contato</Label>
                <Input
                  id="edit-contact"
                  placeholder="Nome do contato"
                  value={editForm.contactPerson}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      contactPerson: e.target.value,
                    })
                  }
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit-lead">Prazo Normal (dias)</Label>
                <Input
                  id="edit-lead"
                  type="number"
                  min={1}
                  value={editForm.defaultLeadTimeDays}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      defaultLeadTimeDays: parseInt(e.target.value) || 7,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-urgent">Prazo Urgente (dias)</Label>
                <Input
                  id="edit-urgent"
                  type="number"
                  min={1}
                  value={editForm.urgentLeadTimeDays}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      urgentLeadTimeDays: parseInt(e.target.value) || 3,
                    })
                  }
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditDialogOpen(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button onClick={handleSaveEdit} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar Alteracoes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function Page() {
  return (
    <ProtectedRoute permission="suppliers.access">
      <LaboratoriosPage />
    </ProtectedRoute>
  );
}
