"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRightLeft, Ban, CheckCircle, CreditCard, Eye, Loader2, MoreVertical, RefreshCw, RotateCcw, Trash2, XCircle } from "lucide-react";
import { brl } from "@/lib/format-brl";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmReasonDialog } from "@/components/ui/confirm-reason-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface CompanyActionsProps {
  companyId: string;
  companyName: string;
  isBlocked: boolean;
  subscriptionStatus: string | null;
  billingCycle: string | null;
  currentPlanId: string | null;
}

interface Plan {
  id: string;
  name: string;
  priceMonthly: number;
  isActive: boolean;
}

export function CompanyActions({ companyId, companyName, isBlocked, subscriptionStatus, billingCycle, currentPlanId }: CompanyActionsProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // Estado dos diálogos (substituem prompt/confirm nativos — A4/A5).
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [impersonateOpen, setImpersonateOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);

  const hasActiveSubscription = subscriptionStatus && ["TRIAL", "ACTIVE", "PAST_DUE"].includes(subscriptionStatus);

  async function handleAction(action: string, extra?: Record<string, string>) {
    setLoading(true);
    setOpen(false);
    try {
      const res = await fetch(`/api/admin/clientes/${companyId}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "Erro ao executar ação"); return; }
      toast.success(data.message || "Ação executada com sucesso");
      router.refresh();
    } catch { toast.error("Erro ao executar ação"); }
    finally { setLoading(false); }
  }

  async function confirmImpersonate(reason: string) {
    setLoading(true);
    setImpersonateOpen(false);
    try {
      const res = await fetch("/api/admin/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, reason }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "Erro ao iniciar impersonação"); return; }
      const url = `/impersonate?token=${data.data.token}&sessionId=${data.data.sessionId}`;
      window.open(url, "_blank");
    } catch { toast.error("Erro ao iniciar impersonação"); }
    finally { setLoading(false); }
  }

  async function openChangePlan() {
    setOpen(false);
    try {
      const res = await fetch("/api/admin/plans");
      const data = await res.json();
      if (!res.ok) { toast.error("Erro ao buscar planos"); return; }
      const available: Plan[] = (data.data || []).filter((p: Plan) => p.isActive && p.id !== currentPlanId);
      if (available.length === 0) { toast.error("Nenhum plano alternativo disponível"); return; }
      setPlans(available);
      setSelectedPlanId(available[0].id);
      setPlanOpen(true);
    } catch { toast.error("Erro ao buscar planos"); }
  }

  async function confirmChangePlan() {
    if (!selectedPlanId) return;
    setPlanOpen(false);
    await handleAction("change_plan", { planId: selectedPlanId });
  }

  async function confirmCancel(reason: string) {
    setCancelOpen(false);
    await handleAction("cancel_subscription", { reason });
  }

  function handleChangeBillingCycle() {
    setOpen(false);
    const newCycle = billingCycle === "MONTHLY" ? "YEARLY" : "MONTHLY";
    void handleAction("change_billing_cycle", { cycle: newCycle });
  }

  async function handleResync() {
    setOpen(false);
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/companies/${companyId}/resync`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "Erro ao re-sincronizar"); return; }
      const c = data.data?.created || {};
      toast.success(
        `Setup re-sincronizado. Criados: ${c.chartOfAccounts ?? 0} contas contábeis, ${c.financeAccounts ?? 0} financeiras, ${c.reconciliationTemplates ?? 0} templates.`
      );
      router.refresh();
    } catch { toast.error("Erro ao re-sincronizar"); }
    finally { setLoading(false); }
  }

  async function confirmDelete() {
    setDeleteOpen(false);
    setDeleteConfirmText("");
    await handleAction("delete");
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        disabled={loading}
        className="flex items-center gap-2 px-3 py-2 bg-muted border border-border text-foreground text-sm rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreVertical className="h-4 w-4" />}
        Ações
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 z-20 w-56 bg-card border border-border rounded-xl shadow-xl py-1 overflow-hidden">
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
                <div className="my-1 border-t border-border" />
                <ActionBtn icon={ArrowRightLeft} label="Trocar plano" color="blue" onClick={openChangePlan} />
                <ActionBtn icon={RefreshCw} label={`Ciclo → ${billingCycle === "MONTHLY" ? "Anual" : "Mensal"}`} color="blue" onClick={handleChangeBillingCycle} />
                <ActionBtn icon={XCircle} label="Cancelar assinatura" color="red" onClick={() => { setOpen(false); setCancelOpen(true); }} />
              </>
            )}
            <div className="my-1 border-t border-border" />
            <ActionBtn icon={Eye} label="Acessar como empresa" color="blue" onClick={() => { setOpen(false); setImpersonateOpen(true); }} />
            <ActionBtn icon={RotateCcw} label="Re-sincronizar setup" color="blue" onClick={handleResync} />
            <div className="my-1 border-t border-border" />
            <ActionBtn icon={Trash2} label="Excluir empresa" color="red" onClick={() => { setOpen(false); setDeleteOpen(true); }} />
          </div>
        </>
      )}

      {/* Impersonação — motivo obrigatório (era window.prompt) */}
      <ConfirmReasonDialog
        open={impersonateOpen}
        onOpenChange={setImpersonateOpen}
        title="Acessar como empresa"
        description={`Você entrará no sistema como ${companyName}. A sessão expira em 30 minutos e fica auditada.`}
        reasonLabel="Motivo da impersonação"
        reasonPlaceholder="Ex.: suporte ao cliente, verificar bug relatado…"
        reasonRequired
        confirmLabel="Acessar"
        confirmVariant="default"
        loading={loading}
        onConfirm={confirmImpersonate}
      />

      {/* Cancelamento — motivo obrigatório (era window.prompt + confirm) */}
      <ConfirmReasonDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title={`Cancelar assinatura de ${companyName}?`}
        description="A assinatura é cancelada aqui e no gateway de cobrança (Asaas). O cliente deixa de ser cobrado."
        reasonLabel="Motivo do cancelamento"
        reasonRequired
        confirmLabel="Cancelar assinatura"
        loading={loading}
        onConfirm={confirmCancel}
      />

      {/* Troca de plano — radio-list (era prompt numérico) */}
      <Dialog open={planOpen} onOpenChange={(o) => !loading && setPlanOpen(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Trocar plano</DialogTitle>
            <DialogDescription>Selecione o novo plano para {companyName}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            {plans.map((p) => (
              <label
                key={p.id}
                className={`flex cursor-pointer items-center justify-between rounded-lg border p-3 text-sm transition-colors ${
                  selectedPlanId === p.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted"
                }`}
              >
                <span className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="plan"
                    checked={selectedPlanId === p.id}
                    onChange={() => setSelectedPlanId(p.id)}
                  />
                  <span className="font-medium text-foreground">{p.name}</span>
                </span>
                <span className="text-muted-foreground">{brl(p.priceMonthly)}/mês</span>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPlanOpen(false)} disabled={loading}>Voltar</Button>
            <Button onClick={confirmChangePlan} disabled={loading || !selectedPlanId}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Trocar plano
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Exclusão — confirmação forte: digitar o nome da empresa (era confirm genérico) */}
      <AlertDialog open={deleteOpen} onOpenChange={(o) => { if (!loading) { setDeleteOpen(o); if (!o) setDeleteConfirmText(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {companyName}?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é <strong>irreversível</strong> e remove a empresa e seus dados associados.
              Para confirmar, digite o nome exato da empresa abaixo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
            placeholder={companyName}
            autoFocus
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                // Impede o fechamento automático quando o nome não confere.
                if (deleteConfirmText.trim() !== companyName) { e.preventDefault(); return; }
                void confirmDelete();
              }}
              disabled={loading || deleteConfirmText.trim() !== companyName}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Excluir empresa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ActionBtn({ icon: Icon, label, color, onClick }: { icon: React.ElementType; label: string; color: "red" | "green" | "blue"; onClick: () => void }) {
  const colors = { red: "text-rose-600 hover:bg-rose-50", green: "text-emerald-600 hover:bg-emerald-50", blue: "text-blue-600 hover:bg-blue-50" };
  return (
    <button onClick={onClick} className={`flex items-center gap-2.5 w-full px-4 py-2.5 text-sm transition-colors ${colors[color]}`}>
      <Icon className="h-4 w-4 flex-shrink-0" />
      {label}
    </button>
  );
}
