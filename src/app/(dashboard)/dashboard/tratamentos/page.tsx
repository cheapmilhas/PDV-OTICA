"use client";

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash2, Loader2, Sparkles } from "lucide-react";
import { SearchBar } from "@/components/shared/search-bar";
import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrency } from "@/lib/utils";
import toast from "react-hot-toast";
import { usePermissions } from "@/hooks/usePermissions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

interface LensTreatment {
  id: string;
  name: string;
  description: string | null;
  price: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

function TratamentosPage() {
  const [treatments, setTreatments] = useState<LensTreatment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingTreatment, setEditingTreatment] = useState<LensTreatment | null>(null);
  const [saving, setSaving] = useState(false);
  const { hasPermission } = usePermissions();

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    price: "",
    active: true,
  });

  useEffect(() => {
    loadTreatments();
  }, [search]);

  const loadTreatments = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ search });
      const response = await fetch(`/api/lens-treatments?${params}`);
      const result = await response.json();

      if (result.success) {
        setTreatments(result.data);
      }
    } catch (error) {
      toast.error("Erro ao carregar tratamentos");
    } finally {
      setLoading(false);
    }
  };

  const handleNew = () => {
    setEditingTreatment(null);
    setFormData({
      name: "",
      description: "",
      price: "",
      active: true,
    });
    setShowModal(true);
  };

  const handleEdit = (treatment: LensTreatment) => {
    setEditingTreatment(treatment);
    setFormData({
      name: treatment.name,
      description: treatment.description || "",
      price: treatment.price.toString(),
      active: treatment.active,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }

    if (!formData.price || parseFloat(formData.price) < 0) {
      toast.error("Preço inválido");
      return;
    }

    setSaving(true);
    try {
      const url = editingTreatment
        ? `/api/lens-treatments/${editingTreatment.id}`
        : "/api/lens-treatments";

      const method = editingTreatment ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description || null,
          price: parseFloat(formData.price),
          active: formData.active,
        }),
      });

      const result = await response.json();

      if (result.success) {
        toast.success(result.message || "Salvo com sucesso");
        setShowModal(false);
        loadTreatments();
      } else {
        toast.error(result.error || "Erro ao salvar");
      }
    } catch (error) {
      toast.error("Erro ao salvar tratamento");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Deseja realmente desativar este tratamento?")) return;

    try {
      const response = await fetch(`/api/lens-treatments/${id}`, {
        method: "DELETE",
      });

      const result = await response.json();

      if (result.success) {
        toast.success("Tratamento desativado");
        loadTreatments();
      } else {
        toast.error(result.error || "Erro ao desativar");
      }
    } catch (error) {
      toast.error("Erro ao desativar tratamento");
    }
  };

  const activeTreatments = treatments.filter((t) => t.active);
  const inactiveTreatments = treatments.filter((t) => !t.active);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Tratamentos de Lentes</h1>
          <p className="text-muted-foreground">
            Gerencie os tratamentos disponíveis (anti-reflexo, transitions, etc.)
          </p>
        </div>
        {hasPermission("products.edit") && (
          <Button onClick={handleNew}>
            <Plus className="mr-2 h-4 w-4" />
            Novo Tratamento
          </Button>
        )}
      </div>

      {/* Search */}
      <SearchBar
        value={search}
        onSearch={setSearch}
        placeholder="Buscar tratamento..."
        clearable
      />

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty State */}
      {!loading && treatments.length === 0 && (
        <EmptyState
          icon={<Sparkles className="h-12 w-12" />}
          title="Nenhum tratamento cadastrado"
          description={
            search
              ? `Nenhum resultado para "${search}"`
              : "Comece cadastrando seu primeiro tratamento de lentes"
          }
          action={
            !search && hasPermission("products.edit") && (
              <Button onClick={handleNew}>
                <Plus className="mr-2 h-4 w-4" />
                Novo Tratamento
              </Button>
            )
          }
        />
      )}

      {/* Lista de Ativos */}
      {!loading && activeTreatments.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Tratamentos Ativos</h2>
          <div className="grid gap-3">
            {activeTreatments.map((treatment) => (
              <Card key={treatment.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h3 className="font-semibold text-lg">{treatment.name}</h3>
                        <Badge className="bg-green-100 text-green-800">Ativo</Badge>
                      </div>
                      {treatment.description && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {treatment.description}
                        </p>
                      )}
                      <p className="text-xl font-bold text-primary mt-2">
                        + {formatCurrency(treatment.price)}
                      </p>
                    </div>
                    {hasPermission("products.edit") && (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEdit(treatment)}
                        >
                          <Edit className="h-4 w-4 mr-1" />
                          Editar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDelete(treatment.id)}
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Desativar
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Lista de Inativos */}
      {!loading && inactiveTreatments.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-muted-foreground">Tratamentos Inativos</h2>
          <div className="grid gap-3">
            {inactiveTreatments.map((treatment) => (
              <Card key={treatment.id} className="opacity-60">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h3 className="font-semibold">{treatment.name}</h3>
                        <Badge variant="secondary">Inativo</Badge>
                      </div>
                      {treatment.description && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {treatment.description}
                        </p>
                      )}
                      <p className="text-lg font-bold mt-2">
                        + {formatCurrency(treatment.price)}
                      </p>
                    </div>
                    {hasPermission("products.edit") && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleEdit(treatment)}
                      >
                        <Edit className="h-4 w-4 mr-1" />
                        Editar
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Modal de Cadastro/Edição */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingTreatment ? "Editar Tratamento" : "Novo Tratamento"}
            </DialogTitle>
            <DialogDescription>
              Configure os detalhes do tratamento de lentes
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome *</Label>
              <Input
                id="name"
                placeholder="Ex: Anti-reflexo, Transitions, Blue Light"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="price">Preço Adicional *</Label>
              <Input
                id="price"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descrição</Label>
              <Textarea
                id="description"
                placeholder="Detalhes sobre o tratamento (opcional)"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label htmlFor="active">Ativo</Label>
                <p className="text-sm text-muted-foreground">
                  Tratamento disponível para seleção
                </p>
              </div>
              <Switch
                id="active"
                checked={formData.active}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, active: checked })
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function Page() {
  return (
    <ProtectedRoute permission="products.view">
      <TratamentosPage />
    </ProtectedRoute>
  );
}
