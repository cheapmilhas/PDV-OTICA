"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Loader2, Package, Pencil, Plus, Star, Users, X } from "lucide-react";

interface PlanFeature {
  id: string;
  planId: string;
  key: string;
  value: string;
}

interface Plan {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  priceMonthly: number;
  priceYearly: number;
  maxUsers: number;
  maxBranches: number;
  maxProducts: number;
  maxStorageMB: number;
  trialDays: number;
  isActive: boolean;
  isFeatured: boolean;
  sortOrder: number;
  features: PlanFeature[];
  _count: { subscriptions: number };
}

const AVAILABLE_FEATURES = [
  { key: "crm", label: "CRM" },
  { key: "goals", label: "Metas & Comissões" },
  { key: "campaigns", label: "Campanhas" },
  { key: "cashback", label: "Cashback" },
  { key: "multi_branch", label: "Multi-filial" },
  { key: "reports_advanced", label: "Relatórios Avançados" },
  { key: "api_access", label: "Acesso API" },
];

const emptyForm = {
  name: "",
  slug: "",
  description: "",
  priceMonthly: 0,
  priceYearly: 0,
  maxUsers: 3,
  maxBranches: 1,
  maxProducts: 500,
  maxStorageMB: 1000,
  trialDays: 14,
  isFeatured: false,
  sortOrder: 0,
  features: [] as string[],
};

export function PlanosClient({ initialPlans }: { initialPlans: Plan[] }) {
  const [plans, setPlans] = useState(initialPlans);
  const [showModal, setShowModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  function openCreate() {
    setEditingPlan(null);
    setForm(emptyForm);
    setError("");
    setShowModal(true);
  }

  function openEdit(plan: Plan) {
    setEditingPlan(plan);
    setForm({
      name: plan.name,
      slug: plan.slug,
      description: plan.description || "",
      priceMonthly: plan.priceMonthly,
      priceYearly: plan.priceYearly,
      maxUsers: plan.maxUsers,
      maxBranches: plan.maxBranches,
      maxProducts: plan.maxProducts,
      maxStorageMB: plan.maxStorageMB,
      trialDays: plan.trialDays,
      isFeatured: plan.isFeatured,
      sortOrder: plan.sortOrder,
      features: plan.features.filter((f) => f.value === "true").map((f) => f.key),
    });
    setError("");
    setShowModal(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const payload = {
      ...form,
      features: AVAILABLE_FEATURES.map((f) => ({
        key: f.key,
        value: form.features.includes(f.key) ? "true" : "false",
      })),
    };

    try {
      const url = editingPlan ? `/api/admin/plans/${editingPlan.id}` : "/api/admin/plans";
      const method = editingPlan ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erro ao salvar plano");
        return;
      }

      setShowModal(false);
      router.refresh();
    } catch {
      setError("Erro ao salvar plano");
    } finally {
      setLoading(false);
    }
  }

  async function handleDeactivate(plan: Plan) {
    if (!confirm(`Desativar o plano "${plan.name}"? Assinaturas existentes não serão afetadas.`)) return;

    try {
      const res = await fetch(`/api/admin/plans/${plan.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Erro ao desativar plano");
        return;
      }
      router.refresh();
    } catch {
      alert("Erro ao desativar plano");
    }
  }

  async function handleReactivate(plan: Plan) {
    try {
      const res = await fetch(`/api/admin/plans/${plan.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: true }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Erro ao reativar plano");
        return;
      }
      router.refresh();
    } catch {
      alert("Erro ao reativar plano");
    }
  }

  function toggleFeature(key: string) {
    setForm((prev) => ({
      ...prev,
      features: prev.features.includes(key)
        ? prev.features.filter((f) => f !== key)
        : [...prev.features, key],
    }));
  }

  return (
    <div className="p-6 text-white">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Planos</h1>
          <p className="text-sm text-gray-400 mt-0.5">Planos de assinatura disponíveis</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Novo Plano
        </button>
      </div>

      {plans.length === 0 ? (
        <div className="text-center py-16 rounded-xl border border-gray-800 bg-gray-900">
          <Package className="h-8 w-8 text-gray-700 mx-auto mb-2" />
          <p className="text-gray-600">Nenhum plano cadastrado</p>
          <button
            onClick={openCreate}
            className="mt-3 px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700"
          >
            Criar primeiro plano
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`relative rounded-xl border bg-gray-900 overflow-hidden ${plan.isFeatured ? "border-indigo-600" : "border-gray-800"} ${!plan.isActive ? "opacity-60" : ""}`}
            >
              {plan.isFeatured && (
                <div className="bg-indigo-600 px-4 py-1.5 text-center">
                  <span className="flex items-center justify-center gap-1.5 text-xs font-semibold text-white">
                    <Star className="h-3.5 w-3.5" />
                    Mais popular
                  </span>
                </div>
              )}

              <div className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h2 className="text-lg font-bold text-white">{plan.name}</h2>
                    {plan.description && <p className="text-xs text-gray-500 mt-0.5">{plan.description}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${plan.isActive ? "bg-green-900/50 text-green-400" : "bg-gray-800 text-gray-500"}`}>
                      {plan.isActive ? "Ativo" : "Inativo"}
                    </span>
                    <button
                      onClick={() => openEdit(plan)}
                      className="p-1 text-gray-500 hover:text-white transition-colors"
                      title="Editar plano"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <div className="mb-4">
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold text-white">
                      R$ {(plan.priceMonthly / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </span>
                    <span className="text-sm text-gray-500">/mês</span>
                  </div>
                  {plan.priceYearly > 0 && (
                    <p className="text-xs text-gray-600 mt-0.5">
                      ou R$ {(plan.priceYearly / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}/ano
                    </p>
                  )}
                </div>

                <div className="space-y-2 mb-4 p-3 rounded-lg bg-gray-800/50">
                  <LimitRow icon={Users} label="Usuários" value={plan.maxUsers} />
                  <LimitRow icon={Building2} label="Filiais" value={plan.maxBranches} />
                  <LimitRow icon={Package} label="Produtos" value={plan.maxProducts} />
                </div>

                <div className="mb-4">
                  <p className="text-xs font-medium text-gray-500 mb-2">Funcionalidades</p>
                  <div className="flex flex-wrap gap-1.5">
                    {plan.features.filter((f) => f.value === "true").map((f) => (
                      <span key={f.id} className="text-xs px-2 py-0.5 rounded bg-gray-800 text-gray-300">
                        {AVAILABLE_FEATURES.find((af) => af.key === f.key)?.label || f.key}
                      </span>
                    ))}
                    {plan.features.filter((f) => f.value === "true").length === 0 && (
                      <span className="text-xs text-gray-600">Nenhuma feature extra</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-gray-800 text-xs">
                  <span className="text-gray-500">
                    {plan._count.subscriptions} assinatura{plan._count.subscriptions !== 1 ? "s" : ""}
                  </span>
                  <div className="flex items-center gap-2">
                    {plan.trialDays > 0 && (
                      <span className="text-indigo-400">{plan.trialDays}d trial</span>
                    )}
                    {plan.isActive ? (
                      <button
                        onClick={() => handleDeactivate(plan)}
                        className="text-red-400 hover:text-red-300 transition-colors"
                      >
                        Desativar
                      </button>
                    ) : (
                      <button
                        onClick={() => handleReactivate(plan)}
                        className="text-green-400 hover:text-green-300 transition-colors"
                      >
                        Reativar
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal de criação/edição */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">
                {editingPlan ? "Editar Plano" : "Novo Plano"}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-900/30 border border-red-800 rounded-lg text-red-400 text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Nome" required>
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:border-indigo-500 focus:outline-none"
                    required
                  />
                </FormField>
                <FormField label="Slug" required>
                  <input
                    value={form.slug}
                    onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:border-indigo-500 focus:outline-none"
                    placeholder="ex: basico"
                    required
                    disabled={!!editingPlan}
                  />
                </FormField>
              </div>

              <FormField label="Descrição">
                <input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:border-indigo-500 focus:outline-none"
                />
              </FormField>

              <div className="grid grid-cols-2 gap-4">
                <FormField label="Preço Mensal (centavos)">
                  <input
                    type="number"
                    value={form.priceMonthly}
                    onChange={(e) => setForm({ ...form, priceMonthly: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:border-indigo-500 focus:outline-none"
                  />
                  <p className="text-xs text-gray-600 mt-1">= R$ {(form.priceMonthly / 100).toFixed(2)}</p>
                </FormField>
                <FormField label="Preço Anual (centavos)">
                  <input
                    type="number"
                    value={form.priceYearly}
                    onChange={(e) => setForm({ ...form, priceYearly: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:border-indigo-500 focus:outline-none"
                  />
                  <p className="text-xs text-gray-600 mt-1">= R$ {(form.priceYearly / 100).toFixed(2)}</p>
                </FormField>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <FormField label="Máx. Usuários">
                  <input
                    type="number"
                    value={form.maxUsers}
                    onChange={(e) => setForm({ ...form, maxUsers: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:border-indigo-500 focus:outline-none"
                  />
                  <p className="text-xs text-gray-600 mt-1">-1 = ilimitado</p>
                </FormField>
                <FormField label="Máx. Filiais">
                  <input
                    type="number"
                    value={form.maxBranches}
                    onChange={(e) => setForm({ ...form, maxBranches: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:border-indigo-500 focus:outline-none"
                  />
                </FormField>
                <FormField label="Máx. Produtos">
                  <input
                    type="number"
                    value={form.maxProducts}
                    onChange={(e) => setForm({ ...form, maxProducts: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:border-indigo-500 focus:outline-none"
                  />
                </FormField>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField label="Dias de Trial">
                  <input
                    type="number"
                    value={form.trialDays}
                    onChange={(e) => setForm({ ...form, trialDays: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:border-indigo-500 focus:outline-none"
                  />
                </FormField>
                <FormField label="Ordem">
                  <input
                    type="number"
                    value={form.sortOrder}
                    onChange={(e) => setForm({ ...form, sortOrder: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:border-indigo-500 focus:outline-none"
                  />
                </FormField>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isFeatured"
                  checked={form.isFeatured}
                  onChange={(e) => setForm({ ...form, isFeatured: e.target.checked })}
                  className="rounded bg-gray-800 border-gray-700 text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor="isFeatured" className="text-sm text-gray-300">Plano destaque (mais popular)</label>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-300 mb-2">Funcionalidades</p>
                <div className="grid grid-cols-2 gap-2">
                  {AVAILABLE_FEATURES.map((feat) => (
                    <label key={feat.key} className="flex items-center gap-2 p-2 rounded-lg bg-gray-800/50 cursor-pointer hover:bg-gray-800">
                      <input
                        type="checkbox"
                        checked={form.features.includes(feat.key)}
                        onChange={() => toggleFeature(feat.key)}
                        className="rounded bg-gray-800 border-gray-700 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-sm text-gray-300">{feat.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-800">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
                >
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  {editingPlan ? "Salvar" : "Criar Plano"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function LimitRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1.5 text-gray-400 text-xs">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <span className="text-xs font-medium text-gray-200">
        {value === -1 ? "Ilimitado" : value.toLocaleString("pt-BR")}
      </span>
    </div>
  );
}

function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-400 mb-1">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}
