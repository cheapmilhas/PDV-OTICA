"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, Ban, CheckCircle, CreditCard, Eye, Loader2, MoreVertical, RefreshCw, Trash2, XCircle } from "lucide-react";
import { ActionModal, type BlueprintDescriptor } from "../../monitoramento/action-modal";

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
  const [blueprints, setBlueprints] = useState<Record<string, BlueprintDescriptor>>({});
  const [blueprintsError, setBlueprintsError] = useState<string | null>(null);
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const router = useRouter();

  const hasActiveSubscription = subscriptionStatus && ["TRIAL", "ACTIVE", "PAST_DUE"].includes(subscriptionStatus);

  // Carrega os descritores de blueprint (campos/confirm/risco) uma vez — o modal
  // é gerado a partir deles. Filtrados por role pelo endpoint.
  // Não engole erro: se a lista falhar (401/500), guarda a mensagem para que
  // openModal possa avisar em vez de não fazer nada (falha silenciosa).
  useEffect(() => {
    let alive = true;
    fetch("/api/admin/actions", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.error?.message || `Falha ao carregar ações (HTTP ${r.status})`);
        }
        return r.json();
      })
      .then((json) => {
        if (!alive) return;
        const map: Record<string, BlueprintDescriptor> = {};
        for (const bp of json.data ?? []) map[bp.id] = bp;
        setBlueprints(map);
        setBlueprintsError(null);
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setBlueprintsError(err instanceof Error ? err.message : "Falha ao carregar ações");
      });
    return () => {
      alive = false;
    };
  }, []);

  // Executa uma ação via rota de blueprints com o input dado (companyId é sempre
  // incluído). Base para runSimple e para o atalho de 1-clique do ciclo.
  async function runWithInput(actionId: string, extraInput: Record<string, unknown> = {}) {
    setOpen(false);
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/actions/${actionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: { companyId, ...extraInput } }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { alert(data.error?.message || "Erro ao executar ação"); return; }
      if (data.data?.ok === false) { alert(data.data?.message || "Ação não realizada"); return; }
      router.refresh();
    } catch { alert("Erro ao executar ação"); }
    finally { setLoading(false); }
  }

  // Ações sem nenhum input/confirmação extra (só companyId): executa direto.
  function runSimple(actionId: string) {
    return runWithInput(actionId);
  }

  // "Ciclo → Anual/Mensal" é uma ação de 1 clique: alterna para o ciclo OPOSTO
  // do atual. Sem <select> cru — o alvo é determinado aqui e confirmado.
  function handleToggleCycle() {
    setOpen(false);
    const target = billingCycle === "MONTHLY" ? "YEARLY" : "MONTHLY";
    const targetLabel = target === "YEARLY" ? "Anual" : "Mensal";
    if (!confirm(`Alterar o ciclo de cobrança para ${targetLabel}?`)) return;
    return runWithInput("change_billing_cycle", { cycle: target });
  }

  // Abre o modal gerado por schema para ações com campos/motivo/confirmação.
  // Se o descritor não chegou (lista falhou ou role sem permissão), avisa em vez
  // de não fazer nada — o modal só renderiza se blueprints[actionId] existir.
  function openModal(actionId: string) {
    setOpen(false);
    if (!blueprints[actionId]) {
      alert(blueprintsError ?? "Esta ação não está disponível para o seu perfil.");
      return;
    }
    setActiveModal(actionId);
  }

  // change_plan precisa de opções dinâmicas (lista de planos) que o schema genérico
  // não carrega — mantém o picker dedicado, mas executa pela rota de blueprints.
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

      setLoading(true);
      const exec = await fetch("/api/admin/actions/change_plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: { companyId, planId: selectedPlan.id } }),
      });
      const execData = await exec.json().catch(() => ({}));
      if (!exec.ok) { alert(execData.error?.message || "Erro ao trocar plano"); return; }
      if (execData.data?.ok === false) { alert(execData.data?.message || "Ação não realizada"); return; }
      router.refresh();
    } catch { alert("Erro ao trocar plano"); }
    finally { setLoading(false); }
  }

  async function handleImpersonate() {
    // Impersonate é especial: fluxo de token+redirect, FORA do registry/ActionModal.
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

  const activeBp = activeModal ? blueprints[activeModal] : null;

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
              <ActionBtn icon={CheckCircle} label="Desbloquear empresa" color="green" onClick={() => runSimple("unblock")} />
            ) : (
              <ActionBtn icon={Ban} label="Bloquear empresa" color="red" onClick={() => openModal("block")} />
            )}
            {subscriptionStatus === "SUSPENDED" && (
              <ActionBtn icon={RefreshCw} label="Reativar assinatura" color="blue" onClick={() => runSimple("reactivate")} />
            )}
            {subscriptionStatus === "TRIAL" && (
              <ActionBtn icon={CreditCard} label="Estender trial (+7 dias)" color="blue" onClick={() => runSimple("extend_trial")} />
            )}
            {hasActiveSubscription && (
              <>
                <div className="my-1 border-t border-gray-700" />
                <ActionBtn icon={ArrowRightLeft} label="Trocar plano" color="blue" onClick={handleChangePlan} />
                <ActionBtn icon={RefreshCw} label={`Ciclo → ${billingCycle === "MONTHLY" ? "Anual" : "Mensal"}`} color="blue" onClick={handleToggleCycle} />
                <ActionBtn icon={XCircle} label="Cancelar assinatura" color="red" onClick={() => openModal("cancel_subscription")} />
              </>
            )}
            <div className="my-1 border-t border-gray-700" />
            <ActionBtn icon={Eye} label="Acessar como empresa" color="blue" onClick={handleImpersonate} />
            <div className="my-1 border-t border-gray-700" />
            <ActionBtn icon={Trash2} label="Excluir empresa" color="red" onClick={() => openModal("delete")} />
          </div>
        </>
      )}

      {activeBp && (
        <ActionModal
          blueprint={activeBp}
          companyId={companyId}
          companyName={companyName}
          onClose={() => setActiveModal(null)}
          onDone={() => router.refresh()}
        />
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
