"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Pencil, Trash2, RefreshCw, TrendingDown, CheckCircle, Calendar } from "lucide-react";
import toast from "react-hot-toast";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const CATEGORY_LABELS: Record<string, string> = {
  SUPPLIERS: "Fornecedores",
  RENT: "Aluguel",
  UTILITIES: "Energia/Água",
  PERSONNEL: "Salários",
  TAXES: "Impostos",
  MARKETING: "Marketing",
  MAINTENANCE: "Manutenção",
  EQUIPMENT: "Equipamentos",
  ACCOUNTING: "Contabilidade",
  INTERNET_PHONE: "Internet/Telefone",
  OTHER: "Outros",
};

const FREQUENCY_LABELS: Record<string, string> = {
  MONTHLY: "Mensal",
  BIMONTHLY: "Bimestral",
  QUARTERLY: "Trimestral",
  YEARLY: "Anual",
};

interface RecurringExpense {
  id: string;
  description: string;
  category: string;
  amount: number;
  frequency: string;
  dayOfMonth: number;
  active: boolean;
  notes?: string | null;
  nextDueDate?: string | null;
  supplier?: { id: string; name: string } | null;
}

interface FormData {
  description: string;
  category: string;
  amount: string;
  frequency: string;
  dayOfMonth: string;
  notes: string;
}

const defaultForm: FormData = {
  description: "",
  category: "OTHER",
  amount: "",
  frequency: "MONTHLY",
  dayOfMonth: "10",
  notes: "",
};

export default function DespesasRecorrentesPage() {
  const [items, setItems] = useState<RecurringExpense[]>([]);
  const [totalMonthly, setTotalMonthly] = useState(0);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(defaultForm);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/recurring-expenses?status=all");
      const json = await res.json();
      setItems(json.data ?? []);
      setTotalMonthly(json.totalMonthly ?? 0);
    } catch {
      toast.error("Erro ao carregar despesas fixas");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const activeCount = items.filter((i) => i.active).length;

  const nextDue = items
    .filter((i) => i.active && i.nextDueDate)
    .sort((a, b) => new Date(a.nextDueDate!).getTime() - new Date(b.nextDueDate!).getTime())[0];

  function openCreate() {
    setEditingId(null);
    setForm(defaultForm);
    setModalOpen(true);
  }

  function openEdit(item: RecurringExpense) {
    setEditingId(item.id);
    setForm({
      description: item.description,
      category: item.category,
      amount: String(item.amount),
      frequency: item.frequency,
      dayOfMonth: String(item.dayOfMonth),
      notes: item.notes ?? "",
    });
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.description || !form.amount || !form.dayOfMonth) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        description: form.description,
        category: form.category,
        amount: parseFloat(form.amount),
        frequency: form.frequency,
        dayOfMonth: parseInt(form.dayOfMonth),
        notes: form.notes || undefined,
      };

      const url = editingId ? `/api/recurring-expenses/${editingId}` : "/api/recurring-expenses";
      const method = editingId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Erro ao salvar");

      toast.success(editingId ? "Despesa atualizada!" : "Despesa criada!");
      setModalOpen(false);
      fetchData();
    } catch {
      toast.error("Erro ao salvar despesa");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(id: string) {
    if (!confirm("Desativar esta despesa recorrente?")) return;
    try {
      const res = await fetch(`/api/recurring-expenses/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Despesa desativada");
      fetchData();
    } catch {
      toast.error("Erro ao desativar");
    }
  }

  async function handleReactivate(id: string) {
    try {
      const res = await fetch(`/api/recurring-expenses/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: true }),
      });
      if (!res.ok) throw new Error();
      toast.success("Despesa reativada");
      fetchData();
    } catch {
      toast.error("Erro ao reativar");
    }
  }

  async function handleGenerate() {
    setGenerating(true);
    try {
      const res = await fetch("/api/recurring-expenses/generate", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erro");
      toast.success(json.message);
      fetchData();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao gerar contas");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <ProtectedRoute permission="financial.view">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Despesas Fixas</h1>
            <p className="text-sm text-gray-500">Gerencie despesas recorrentes e gere contas a pagar automaticamente</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleGenerate} disabled={generating}>
              <RefreshCw className={`h-4 w-4 mr-2 ${generating ? "animate-spin" : ""}`} />
              Gerar Contas do Mês
            </Button>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Nova Despesa
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-lg border p-4 flex items-center gap-4">
            <div className="p-3 bg-red-100 rounded-lg">
              <TrendingDown className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Mensal</p>
              <p className="text-xl font-bold text-gray-900">{formatCurrency(totalMonthly)}</p>
            </div>
          </div>

          <div className="bg-white rounded-lg border p-4 flex items-center gap-4">
            <div className="p-3 bg-green-100 rounded-lg">
              <CheckCircle className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Ativas</p>
              <p className="text-xl font-bold text-gray-900">{activeCount}</p>
            </div>
          </div>

          <div className="bg-white rounded-lg border p-4 flex items-center gap-4">
            <div className="p-3 bg-blue-100 rounded-lg">
              <Calendar className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Próximo Vencimento</p>
              <p className="text-xl font-bold text-gray-900">
                {nextDue
                  ? `Dia ${nextDue.dayOfMonth}`
                  : "—"}
              </p>
              {nextDue && (
                <p className="text-xs text-gray-400 truncate max-w-[150px]">{nextDue.description}</p>
              )}
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg border overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-400">Carregando...</div>
          ) : items.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              Nenhuma despesa recorrente cadastrada
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Descrição</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Categoria</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Valor</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Dia</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Frequência</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((item) => (
                  <tr key={item.id} className={`hover:bg-gray-50 ${!item.active ? "opacity-50" : ""}`}>
                    <td className="px-4 py-3 font-medium text-gray-900">{item.description}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {CATEGORY_LABELS[item.category] ?? item.category}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">
                      {formatCurrency(item.amount)}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600">{item.dayOfMonth}</td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant="outline">
                        {FREQUENCY_LABELS[item.frequency] ?? item.frequency}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant={item.active ? "default" : "secondary"}>
                        {item.active ? "Ativa" : "Inativa"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEdit(item)}
                          title="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {item.active ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeactivate(item.id)}
                            title="Desativar"
                            className="text-red-500 hover:text-red-700"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleReactivate(item.id)}
                            title="Reativar"
                            className="text-green-600 hover:text-green-800"
                          >
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Editar Despesa Recorrente" : "Nova Despesa Recorrente"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="description">Descrição *</Label>
              <Input
                id="description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Ex: Aluguel do imóvel"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="category">Categoria *</Label>
                <Select
                  value={form.category}
                  onValueChange={(v) => setForm({ ...form, category: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="amount">Valor (R$) *</Label>
                <Input
                  id="amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  placeholder="0,00"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="frequency">Frequência *</Label>
                <Select
                  value={form.frequency}
                  onValueChange={(v) => setForm({ ...form, frequency: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MONTHLY">Mensal</SelectItem>
                    <SelectItem value="BIMONTHLY">Bimestral</SelectItem>
                    <SelectItem value="QUARTERLY">Trimestral</SelectItem>
                    <SelectItem value="YEARLY">Anual</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="dayOfMonth">Dia do Vencimento *</Label>
                <Input
                  id="dayOfMonth"
                  type="number"
                  min="1"
                  max="28"
                  value={form.dayOfMonth}
                  onChange={(e) => setForm({ ...form, dayOfMonth: e.target.value })}
                  placeholder="10"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="notes">Observações</Label>
              <Textarea
                id="notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Informações adicionais..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Salvando..." : editingId ? "Atualizar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ProtectedRoute>
  );
}
