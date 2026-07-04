"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Loader2, Package, Pencil, Plus, Star, Users, X } from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import { EmptyState } from "@/components/admin/EmptyState";
import { FEATURES, FEATURE_REGISTRY } from "@/lib/plan-feature-catalog";
import { brl } from "@/lib/format-brl";
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
  status: string;
  highlightFeatures: string[] | null;
  features: PlanFeature[];
  _count: { subscriptions: number };
}

// FONTE ÚNICA: deriva do catálogo real (plan-feature-catalog). Antes esta lista
// era hardcoded com 6 keys que NÃO batiam com o catálogo (crm/multi_branch/
// reports_advanced nem existem; faltavam 11 reais). Como o salvar do plano faz
// deleteMany+createMany SÓ com estas keys, salvar zerava as 15 features reais e
// quebrava os planos pagos (DRE/lotes/refunds passavam a "não disponível"). Ao
// derivar do FEATURE_REGISTRY, a tela passa a cobrir exatamente as 15 keys reais.
const AVAILABLE_FEATURES = Object.values(FEATURES).map((key) => ({
  key,
  label: FEATURE_REGISTRY[key].label,
}));

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
  status: "ACTIVE",
  highlightFeatures: "",
  features: [] as string[],
};

export function PlanosClient({ initialPlans }: { initialPlans: Plan[] }) {
  const [plans, setPlans] = useState(initialPlans);
  const [showModal, setShowModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [deactivatingPlan, setDeactivatingPlan] = useState<Plan | null>(null);
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
      status: plan.status,
      highlightFeatures: (plan.highlightFeatures ?? []).join("\n"),
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
      status: form.status,
      highlightFeatures: form.highlightFeatures
        .split("\n").map((s) => s.trim()).filter(Boolean),
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
    try {
      const res = await fetch(`/api/admin/plans/${plan.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Erro ao desativar plano");
        return;
      }
      router.refresh();
    } catch {
      toast.error("Erro ao desativar plano");
    } finally {
      setDeactivatingPlan(null);
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
        toast.error(data.error || "Erro ao reativar plano");
        return;
      }
      router.refresh();
    } catch {
      toast.error("Erro ao reativar plano");
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
    <div className="p-6 text-foreground">
      <PageHeader
        title="Planos"
        subtitle="Planos de assinatura disponíveis"
        actions={
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Novo Plano
          </button>
        }
      />

      {plans.length === 0 ? (
        <div className="rounded-xl border border-border bg-card">
          <EmptyState
            icon={Package}
            message="Nenhum plano cadastrado"
            action={
              <button
                onClick={openCreate}
                className="mt-1 px-4 py-2 bg-primary text-primary-foreground text-sm rounded-lg hover:bg-primary/90"
              >
                Criar primeiro plano
              </button>
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`relative rounded-xl border bg-card overflow-hidden ${plan.isFeatured ? "border-primary" : "border-border"} ${!plan.isActive ? "opacity-60" : ""}`}
            >
              {plan.isFeatured && (
                <div className="bg-primary px-4 py-1.5 text-center">
                  <span className="flex items-center justify-center gap-1.5 text-xs font-semibold text-primary-foreground">
                    <Star className="h-3.5 w-3.5" />
                    Mais popular
                  </span>
                </div>
              )}

              <div className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h2 className="text-lg font-bold text-foreground">{plan.name}</h2>
                    {plan.description && <p className="text-xs text-muted-foreground mt-0.5">{plan.description}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${plan.isActive ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
                      {plan.isActive ? "Ativo" : "Inativo"}
                    </span>
                    <button
                      onClick={() => openEdit(plan)}
                      className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                      title="Editar plano"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <div className="mb-4">
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold text-foreground">
                      {brl(plan.priceMonthly)}
                    </span>
                    <span className="text-sm text-muted-foreground">/mês</span>
                  </div>
                  {plan.priceYearly > 0 && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      ou {brl(plan.priceYearly)}/ano
                    </p>
                  )}
                </div>

                <div className="space-y-2 mb-4 p-3 rounded-lg bg-muted">
                  <LimitRow icon={Users} label="Usuários" value={plan.maxUsers} />
                  <LimitRow icon={Building2} label="Filiais" value={plan.maxBranches} />
                  <LimitRow icon={Package} label="Produtos" value={plan.maxProducts} />
                </div>

                <div className="mb-4">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Funcionalidades</p>
                  <div className="flex flex-wrap gap-1.5">
                    {plan.features.filter((f) => f.value === "true").map((f) => (
                      <span key={f.id} className="text-xs px-2 py-0.5 rounded bg-muted text-foreground">
                        {AVAILABLE_FEATURES.find((af) => af.key === f.key)?.label || f.key}
                      </span>
                    ))}
                    {plan.features.filter((f) => f.value === "true").length === 0 && (
                      <span className="text-xs text-muted-foreground">Nenhuma feature extra</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-border text-xs">
                  <span className="text-muted-foreground">
                    {plan._count.subscriptions} assinatura{plan._count.subscriptions !== 1 ? "s" : ""}
                  </span>
                  <div className="flex items-center gap-2">
                    {plan.trialDays > 0 && (
                      <span className="text-primary">{plan.trialDays}d trial</span>
                    )}
                    {plan.isActive ? (
                      <button
                        onClick={() => setDeactivatingPlan(plan)}
                        className="text-rose-600 hover:text-rose-700 transition-colors"
                      >
                        Desativar
                      </button>
                    ) : (
                      <button
                        onClick={() => handleReactivate(plan)}
                        className="text-emerald-600 hover:text-emerald-700 transition-colors"
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
          <div className="bg-card border border-border rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-foreground">
                {editingPlan ? "Editar Plano" : "Novo Plano"}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-600 text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Nome" required>
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:border-primary focus:outline-none"
                    required
                  />
                </FormField>
                <FormField label="Slug" required>
                  <input
                    value={form.slug}
                    onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })}
                    className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:border-primary focus:outline-none"
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
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:border-primary focus:outline-none"
                />
              </FormField>

              <div className="grid grid-cols-2 gap-4">
                <FormField label="Preço Mensal (R$)">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.priceMonthly / 100}
                    onChange={(e) => setForm({ ...form, priceMonthly: Math.round(parseFloat(e.target.value) * 100) || 0 })}
                    className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:border-primary focus:outline-none"
                  />
                </FormField>
                <FormField label="Preço Anual (R$)">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.priceYearly / 100}
                    onChange={(e) => setForm({ ...form, priceYearly: Math.round(parseFloat(e.target.value) * 100) || 0 })}
                    className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:border-primary focus:outline-none"
                  />
                </FormField>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <FormField label="Máx. Usuários">
                  <input
                    type="number"
                    value={form.maxUsers}
                    onChange={(e) => setForm({ ...form, maxUsers: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:border-primary focus:outline-none"
                  />
                  <p className="text-xs text-muted-foreground mt-1">-1 = ilimitado</p>
                </FormField>
                <FormField label="Máx. Filiais">
                  <input
                    type="number"
                    value={form.maxBranches}
                    onChange={(e) => setForm({ ...form, maxBranches: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:border-primary focus:outline-none"
                  />
                </FormField>
                <FormField label="Máx. Produtos">
                  <input
                    type="number"
                    value={form.maxProducts}
                    onChange={(e) => setForm({ ...form, maxProducts: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:border-primary focus:outline-none"
                  />
                </FormField>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField label="Dias de Trial">
                  <input
                    type="number"
                    value={form.trialDays}
                    onChange={(e) => setForm({ ...form, trialDays: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:border-primary focus:outline-none"
                  />
                </FormField>
                <FormField label="Ordem">
                  <input
                    type="number"
                    value={form.sortOrder}
                    onChange={(e) => setForm({ ...form, sortOrder: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:border-primary focus:outline-none"
                  />
                </FormField>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isFeatured"
                  checked={form.isFeatured}
                  onChange={(e) => setForm({ ...form, isFeatured: e.target.checked })}
                  className="rounded bg-background border-input text-primary focus:ring-ring"
                />
                <label htmlFor="isFeatured" className="text-sm text-foreground">Plano destaque (mais popular)</label>
              </div>

              <FormField label="Status">
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:border-primary focus:outline-none"
                >
                  <option value="ACTIVE">Ativo (comprável)</option>
                  <option value="COMING_SOON">Em breve</option>
                </select>
              </FormField>

              <FormField label="Benefícios em destaque (copy)">
                <textarea
                  value={form.highlightFeatures}
                  onChange={(e) => setForm({ ...form, highlightFeatures: e.target.value })}
                  rows={4}
                  placeholder="Um benefício por linha"
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:border-primary focus:outline-none"
                />
              </FormField>

              <div>
                <p className="text-sm font-medium text-foreground mb-2">Funcionalidades</p>
                <div className="grid grid-cols-2 gap-2">
                  {AVAILABLE_FEATURES.map((feat) => (
                    <label key={feat.key} className="flex items-center gap-2 p-2 rounded-lg bg-muted cursor-pointer hover:bg-muted">
                      <input
                        type="checkbox"
                        checked={form.features.includes(feat.key)}
                        onChange={() => toggleFeature(feat.key)}
                        className="rounded bg-background border-input text-primary focus:ring-ring"
                      />
                      <span className="text-sm text-foreground">{feat.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  {editingPlan ? "Salvar" : "Criar Plano"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <AlertDialog open={deactivatingPlan !== null} onOpenChange={(o) => !o && setDeactivatingPlan(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desativar o plano &quot;{deactivatingPlan?.name}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              O plano deixará de ser comercializável. Assinaturas existentes não serão afetadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deactivatingPlan) handleDeactivate(deactivatingPlan);
              }}
            >
              Desativar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function LimitRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <span className="text-xs font-medium text-foreground">
        {value === -1 ? "Ilimitado" : value.toLocaleString("pt-BR")}
      </span>
    </div>
  );
}

function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1">
        {label}{required && <span className="text-rose-600 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}
