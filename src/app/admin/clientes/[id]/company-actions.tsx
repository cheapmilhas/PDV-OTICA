"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, Ban, CheckCircle, CreditCard, Eye, Loader2, MoreVertical, RefreshCw, Trash2, XCircle } from "lucide-react";

interface CompanyActionsProps {
  companyId: string;
  companyName: string;
  isBlocked: boolean;
  subscriptionStatus: string | null;
  billingCycle: string | null;
  currentPlanId: string | null;
}

export function CompanyActions({ companyId, companyName, isBlocked, subscriptionStatus, billingCycle, currentPlanId }: CompanyActionsProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const hasActiveSubscription = subscriptionStatus && ["TRIAL", "ACTIVE", "PAST_DUE"].includes(subscriptionStatus);

  async function handleAction(action: string, extra?: Record<string, string>) {
    if (action === "delete" && !confirm(`Excluir "${companyName}"? Esta ação não pode ser desfeita.`)) return;
    setLoading(true);
    setOpen(false);
    try {
      const res = await fetch(`/api/admin/clientes/${companyId}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || "Erro ao executar ação"); return; }
      alert(data.message || "Ação executada com sucesso");
      router.refresh();
    } catch { alert("Erro ao executar ação"); }
    finally { setLoading(false); }
  }

  async function handleImpersonate() {
    const reason = prompt("Motivo da impersonação (obrigatório):");
    if (!reason) return;
    setLoading(true);
    setOpen(false);
    try {
      const res = await fetch("/api/admin/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, reason }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || "Erro ao iniciar impersonação"); return; }
      const url = `/impersonate?token=${data.data.token}&sessionId=${data.data.sessionId}`;
      window.open(url, "_blank");
    } catch { alert("Erro ao iniciar impersonação"); }
    finally { setLoading(false); }
  }

  async function handleChangePlan() {
    setOpen(false);
    try {
      const res = await fetch("/api/admin/plans");
      const data = await res.json();
      if (!res.ok) { alert("Erro ao buscar planos"); return; }

      const plans = (data.data || []).filter((p: { id: string; isActive: boolean }) => p.isActive && p.id !== currentPlanId);
      if (plans.length === 0) { alert("Nenhum plano alternativo disponível"); return; }

      const options = plans.map((p: { name: string; priceMonthly: number }, i: number) =>
        `${i + 1}. ${p.name} (R$ ${(p.priceMonthly / 100).toFixed(2)}/mês)`
      ).join("\n");

      const choice = prompt(`Selecione o novo plano:\n${options}\n\nDigite o número:`);
      if (!choice) return;

      const index = parseInt(choice, 10) - 1;
      if (isNaN(index) || index < 0 || index >= plans.length) { alert("Opção inválida"); return; }

      const selectedPlan = plans[index];
      if (!confirm(`Trocar para o plano "${selectedPlan.name}"?`)) return;

      await handleAction("change_plan", { planId: selectedPlan.id });
    } catch { alert("Erro ao trocar plano"); }
  }

  async function handleCancelSubscription() {
    setOpen(false);
    const reason = prompt("Motivo do cancelamento (obrigatório):");
    if (!reason) return;
    if (!confirm(`Cancelar assinatura de "${companyName}"? Motivo: ${reason}`)) return;
    await handleAction("cancel_subscription", { reason });
  }

  async function handleChangeBillingCycle() {
    setOpen(false);
    const newCycle = billingCycle === "MONTHLY" ? "YEARLY" : "MONTHLY";
    const label = newCycle === "MONTHLY" ? "Mensal" : "Anual";
    if (!confirm(`Alterar ciclo de cobrança para ${label}?`)) return;
    await handleAction("change_billing_cycle", { cycle: newCycle });
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        disabled={loading}
        className="flex items-center gap-2 px-3 py-2 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreVertical className="h-4 w-4" />}
        Ações
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 z-20 w-56 bg-gray-800 border border-gray-700 rounded-xl shadow-xl py-1 overflow-hidden">
            {isBlocked ? (
              <ActionBtn icon={CheckCircle} label="Desbloquear empresa" color="green" onClick={() => handleAction("unblock")} />
            ) : (
              <ActionBtn icon={Ban} label="Bloquear empresa" color="red" onClick={() => handleAction("block")} />
            )}
            {subscriptionStatus === "SUSPENDED" && (
              <ActionBtn icon={RefreshCw} label="Reativar assinatura" color="blue" onClick={() => handleAction("reactivate")} />
            )}
            {subscriptionStatus === "TRIAL" && (
              <ActionBtn icon={CreditCard} label="Estender trial (+7 dias)" color="blue" onClick={() => handleAction("extend_trial")} />
            )}
            {hasActiveSubscription && (
              <>
                <div className="my-1 border-t border-gray-700" />
                <ActionBtn icon={ArrowRightLeft} label="Trocar plano" color="blue" onClick={handleChangePlan} />
                <ActionBtn icon={RefreshCw} label={`Ciclo → ${billingCycle === "MONTHLY" ? "Anual" : "Mensal"}`} color="blue" onClick={handleChangeBillingCycle} />
                <ActionBtn icon={XCircle} label="Cancelar assinatura" color="red" onClick={handleCancelSubscription} />
              </>
            )}
            <div className="my-1 border-t border-gray-700" />
            <ActionBtn icon={Eye} label="Acessar como empresa" color="blue" onClick={handleImpersonate} />
            <div className="my-1 border-t border-gray-700" />
            <ActionBtn icon={Trash2} label="Excluir empresa" color="red" onClick={() => handleAction("delete")} />
          </div>
        </>
      )}
    </div>
  );
}

function ActionBtn({ icon: Icon, label, color, onClick }: { icon: React.ElementType; label: string; color: "red" | "green" | "blue"; onClick: () => void }) {
  const colors = { red: "text-red-400 hover:bg-red-900/30", green: "text-green-400 hover:bg-green-900/30", blue: "text-blue-400 hover:bg-blue-900/30" };
  return (
    <button onClick={onClick} className={`flex items-center gap-2.5 w-full px-4 py-2.5 text-sm transition-colors ${colors[color]}`}>
      <Icon className="h-4 w-4 flex-shrink-0" />
      {label}
    </button>
  );
}
