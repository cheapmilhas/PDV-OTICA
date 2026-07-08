"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useDraftState, useClearDraft } from "./use-draft-state";
import Link from "next/link";
import {
  Loader2, Building2, User, CreditCard, Users, BarChart3,
  KeyRound, RefreshCw, CheckCircle, ChevronRight, ChevronLeft,
  MapPin, Settings,
} from "lucide-react";

interface Plan {
  id: string;
  name: string;
  priceMonthly: number;
  priceYearly: number;
}

interface Network {
  id: string;
  name: string;
  headquarters: { tradeName: string | null } | null;
}

interface Props {
  plans: Plan[];
  networks: Network[];
}

// ── Etapas ────────────────────────────────────────────────────────────────────

const STEPS = [
  { id: 1, label: "Empresa",     icon: Building2  },
  { id: 2, label: "Assinatura",  icon: CreditCard },
  { id: 3, label: "Acesso",      icon: KeyRound   },
  { id: 4, label: "Extras",      icon: Users      },
  { id: 5, label: "Confirmar",   icon: CheckCircle },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATES = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG",
  "PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
];

function Field({ label, children, hint, error }: { label: string; children: React.ReactNode; hint?: string; error?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1.5">{label}</label>
      {children}
      {error && <p className="text-xs text-destructive mt-1">{error}</p>}
      {!error && hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full px-3.5 py-2.5 bg-background border border-input rounded-lg text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:ring-1 focus:ring-ring focus:border-primary transition-colors ${props.className ?? ""}`}
    />
  );
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement> & { children: React.ReactNode }) {
  return (
    <select
      {...props}
      className={`w-full px-3.5 py-2.5 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-ring focus:border-primary transition-colors ${props.className ?? ""}`}
    />
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-baseline py-2 border-b border-border last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground font-medium ml-4 text-right">{value || "—"}</span>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export function NewClientForm({ plans, networks }: Props) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Campos do wizard — persistidos em sessionStorage (useDraftState) para não
  // perder o preenchimento ao sair/recarregar. EXCEÇÃO: adminPassword (credencial)
  // usa useState normal e nunca é persistido.

  // Step 1 — Empresa
  const [tradeName, setTradeName] = useDraftState("tradeName", "");
  const [companyName, setCompanyName] = useDraftState("companyName", "");
  const [cnpj, setCnpj] = useDraftState("cnpj", "");
  const [stateRegistration, setStateRegistration] = useDraftState("stateRegistration", "");
  const [email, setEmail] = useDraftState("email", "");
  const [phone, setPhone] = useDraftState("phone", "");
  const [whatsapp, setWhatsapp] = useDraftState("whatsapp", "");
  const [zipCode, setZipCode] = useDraftState("zipCode", "");
  const [address, setAddress] = useDraftState("address", "");
  const [addressNumber, setAddressNumber] = useDraftState("addressNumber", "");
  const [complement, setComplement] = useDraftState("complement", "");
  const [neighborhood, setNeighborhood] = useDraftState("neighborhood", "");
  const [city, setCity] = useDraftState("city", "");
  const [stateUF, setStateUF] = useDraftState("stateUF", "");

  // Step 2 — Assinatura
  const [planId, setPlanId] = useDraftState("planId", plans[0]?.id || "");
  const [billingCycle, setBillingCycle] = useDraftState<"MONTHLY" | "YEARLY">("billingCycle", "MONTHLY");
  const [trialDays, setTrialDays] = useDraftState("trialDays", 14);
  const [discountPercent, setDiscountPercent] = useDraftState("discountPercent", 0);

  // Step 3 — Responsável + Admin
  const [ownerName, setOwnerName] = useDraftState("ownerName", "");
  const [ownerCpf, setOwnerCpf] = useDraftState("ownerCpf", "");
  const [ownerEmail, setOwnerEmail] = useDraftState("ownerEmail", "");
  const [ownerPhone, setOwnerPhone] = useDraftState("ownerPhone", "");
  const [adminName, setAdminName] = useDraftState("adminName", "");
  const [adminEmail, setAdminEmail] = useDraftState("adminEmail", "");
  const [adminPassword, setAdminPassword] = useState(""); // credencial — NÃO persistir

  // Step 4 — Rede + Aquisição
  const [isNetwork, setIsNetwork] = useDraftState("isNetwork", false);
  const [networkMode, setNetworkMode] = useDraftState<"new" | "existing">("networkMode", "new");
  const [newNetworkName, setNewNetworkName] = useDraftState("newNetworkName", "");
  const [existingNetworkId, setExistingNetworkId] = useDraftState("existingNetworkId", "");
  const [acquisitionChannel, setAcquisitionChannel] = useDraftState("acquisitionChannel", "");
  const [notes, setNotes] = useDraftState("notes", "");
  const [sendInviteEmail, setSendInviteEmail] = useDraftState("sendInviteEmail", true);

  // Todas as chaves de rascunho — para limpar o sessionStorage após cadastrar.
  const clearDraft = useClearDraft([
    "tradeName", "companyName", "cnpj", "stateRegistration", "email", "phone",
    "whatsapp", "zipCode", "address", "addressNumber", "complement",
    "neighborhood", "city", "stateUF", "planId", "billingCycle", "trialDays",
    "discountPercent", "ownerName", "ownerCpf", "ownerEmail", "ownerPhone",
    "adminName", "adminEmail", "isNetwork", "networkMode", "newNetworkName",
    "existingNetworkId", "acquisitionChannel", "notes", "sendInviteEmail",
  ]);

  // Havia rascunho salvo ao abrir a tela? (campos-chave já preenchidos.)
  // Detecção lazy na 1ª renderização — mostra o aviso "rascunho restaurado".
  const [draftRestored, setDraftRestored] = useState(
    () => Boolean(tradeName || companyName || email || ownerName),
  );

  function discardDraft() {
    clearDraft();
    setDraftRestored(false);
    // Zera os campos persistidos (senha não é persistida, mas limpamos por higiene).
    setTradeName(""); setCompanyName(""); setCnpj(""); setStateRegistration("");
    setEmail(""); setPhone(""); setWhatsapp(""); setZipCode(""); setAddress("");
    setAddressNumber(""); setComplement(""); setNeighborhood(""); setCity("");
    setStateUF(""); setPlanId(plans[0]?.id || ""); setBillingCycle("MONTHLY");
    setTrialDays(14); setDiscountPercent(0); setOwnerName(""); setOwnerCpf("");
    setOwnerEmail(""); setOwnerPhone(""); setAdminName(""); setAdminEmail("");
    setAdminPassword(""); setIsNetwork(false); setNetworkMode("new");
    setNewNetworkName(""); setExistingNetworkId(""); setAcquisitionChannel("");
    setNotes(""); setSendInviteEmail(true); setCurrentStep(1);
  }

  // Busca CEP — com feedback (antes o erro/CEP-inexistente falhava em silêncio).
  const [cepStatus, setCepStatus] = useState<
    { kind: "idle" | "loading" | "found" } | { kind: "error"; message: string }
  >({ kind: "idle" });

  const handleCepBlur = async () => {
    const cep = zipCode.replace(/\D/g, "");
    if (cep.length === 0) {
      setCepStatus({ kind: "idle" });
      return;
    }
    if (cep.length !== 8) {
      setCepStatus({ kind: "error", message: "CEP deve ter 8 dígitos" });
      return;
    }
    setCepStatus({ kind: "loading" });
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = await res.json();
      if (data.erro) {
        setCepStatus({ kind: "error", message: "CEP não encontrado. Preencha o endereço manualmente." });
        return;
      }
      setAddress(data.logradouro || "");
      setNeighborhood(data.bairro || "");
      setCity(data.localidade || "");
      setStateUF(data.uf || "");
      setCepStatus({ kind: "found" });
    } catch {
      setCepStatus({ kind: "error", message: "Não foi possível buscar o CEP. Preencha o endereço manualmente." });
    }
  };

  // Gerar senha
  function generatePassword() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
    let pwd = "Otica@";
    for (let i = 0; i < 4; i++) pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    setAdminPassword(pwd);
  }

  // Validação por etapa
  function validateStep(): Record<string, string> {
    const errs: Record<string, string> = {};
    if (currentStep === 1) {
      if (!tradeName.trim()) errs.tradeName = "Nome Fantasia é obrigatório";
      if (!email.trim()) errs.email = "Email é obrigatório";
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = "Email inválido";
      if (!phone.trim()) errs.phone = "Telefone é obrigatório";
      if (!city.trim()) errs.city = "Cidade é obrigatória";
      if (!stateUF) errs.stateUF = "UF é obrigatória";
    }
    if (currentStep === 2) {
      if (!planId) errs.planId = "Selecione um plano";
    }
    if (currentStep === 3) {
      if (!ownerName.trim()) errs.ownerName = "Nome do responsável é obrigatório";
      if (!ownerEmail.trim()) errs.ownerEmail = "Email do responsável é obrigatório";
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) errs.ownerEmail = "Email inválido";
    }
    return errs;
  }

  function next() {
    const errs = validateStep();
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }
    setFieldErrors({});
    setCurrentStep((s) => Math.min(s + 1, 5));
  }

  function prev() {
    setCurrentStep((s) => Math.max(s - 1, 1));
  }

  // Submit final
  function handleSubmit() {
    setError("");
    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/clientes/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tradeName, companyName, cnpj, stateRegistration,
            email, phone, whatsapp,
            zipCode, address, addressNumber, complement, neighborhood,
            city, state: stateUF,
            ownerName, ownerCpf, ownerEmail, ownerPhone,
            planId, billingCycle, trialDays, discountPercent,
            isNetwork, networkMode, newNetworkName, existingNetworkId,
            acquisitionChannel, notes, sendInviteEmail,
            adminName: adminName || ownerName,
            adminEmail: adminEmail || ownerEmail,
            adminPassword,
          }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Erro ao cadastrar cliente");
        clearDraft(); // cadastro concluído — descarta o rascunho.
        router.push(`/admin/clientes/${data.company.id}?created=true`);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Erro inesperado");
      }
    });
  }

  const selectedPlan = plans.find((p) => p.id === planId);

  return (
    <div className="max-w-2xl">
      {/* Stepper */}
      <div className="flex items-center mb-8">
        {STEPS.map((step, idx) => {
          const isDone = currentStep > step.id;
          const isActive = currentStep === step.id;
          const Icon = step.icon;

          return (
            <div key={step.id} className="flex items-center flex-1 last:flex-none">
              {/* Círculo */}
              <div
                className={`flex items-center gap-2 cursor-default ${
                  isDone || isActive ? "opacity-100" : "opacity-40"
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
                    isDone
                      ? "bg-success"
                      : isActive
                      ? "bg-primary ring-2 ring-ring/30"
                      : "bg-muted border border-border"
                  }`}
                >
                  {isDone ? (
                    <CheckCircle className="h-4 w-4 text-success-foreground" />
                  ) : (
                    <Icon className={`h-4 w-4 ${isActive ? "text-primary-foreground" : "text-muted-foreground"}`} />
                  )}
                </div>
                <span
                  className={`text-xs font-medium hidden sm:block ${
                    isActive ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {step.label}
                </span>
              </div>

              {/* Linha conectora */}
              {idx < STEPS.length - 1 && (
                <div
                  className={`flex-1 h-px mx-3 transition-colors ${
                    currentStep > step.id ? "bg-success" : "bg-border"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Aviso de rascunho restaurado — deixa o usuário recomeçar do zero. */}
      {draftRestored && (
        <div className="mb-5 flex items-center justify-between gap-3 bg-primary/5 border border-primary/20 text-foreground px-4 py-3 rounded-lg text-sm">
          <span className="flex items-center gap-2 text-muted-foreground">
            <RefreshCw className="h-4 w-4 text-primary flex-shrink-0" />
            Recuperamos um cadastro em andamento. Continue de onde parou.
          </span>
          <button
            type="button"
            onClick={discardDraft}
            className="text-xs font-medium text-primary hover:underline flex-shrink-0"
          >
            Começar do zero
          </button>
        </div>
      )}

      {/* Erro global */}
      {error && (
        <div className="mb-5 bg-destructive/10 border border-destructive/25 text-destructive px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* ── STEP 1: Dados da Empresa ────────────────────────────────────── */}
      {currentStep === 1 && (
        <div className="space-y-5">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Dados da Empresa</h2>
            <p className="text-sm text-muted-foreground mt-0.5">Informações básicas da ótica</p>
          </div>

          <div className="bg-card rounded-xl border border-border p-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Nome Fantasia *" error={fieldErrors.tradeName}>
                <Input
                  value={tradeName}
                  onChange={(e) => { setTradeName(e.target.value); setFieldErrors((p) => ({ ...p, tradeName: "" })); }}
                  placeholder="Ótica Visão Clara"
                  className={fieldErrors.tradeName ? "border-destructive" : ""}
                />
              </Field>
              <Field label="Razão Social">
                <Input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Ótica Visão Clara Ltda"
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="CNPJ">
                <Input
                  value={cnpj}
                  onChange={(e) => setCnpj(e.target.value)}
                  placeholder="12.345.678/0001-90"
                />
              </Field>
              <Field label="Inscrição Estadual">
                <Input
                  value={stateRegistration}
                  onChange={(e) => setStateRegistration(e.target.value)}
                />
              </Field>
            </div>
            <Field label="Email da Empresa *" error={fieldErrors.email}>
              <Input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setFieldErrors((p) => ({ ...p, email: "" })); }}
                placeholder="contato@oticavisao.com"
                className={fieldErrors.email ? "border-destructive" : ""}
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Telefone *" error={fieldErrors.phone}>
                <Input
                  value={phone}
                  onChange={(e) => { setPhone(e.target.value); setFieldErrors((p) => ({ ...p, phone: "" })); }}
                  placeholder="(85) 3333-4444"
                  className={fieldErrors.phone ? "border-destructive" : ""}
                />
              </Field>
              <Field label="WhatsApp">
                <Input
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  placeholder="(85) 99999-8888"
                />
              </Field>
            </div>
          </div>

          {/* Endereço */}
          <div className="bg-card rounded-xl border border-border p-5 space-y-4">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              Endereço
            </h3>
            <div className="grid grid-cols-3 gap-4">
              <Field
                label="CEP"
                error={cepStatus.kind === "error" ? cepStatus.message : undefined}
                hint={
                  cepStatus.kind === "loading"
                    ? "Buscando endereço…"
                    : cepStatus.kind === "found"
                      ? "Endereço preenchido pelo CEP."
                      : undefined
                }
              >
                <Input
                  value={zipCode}
                  onChange={(e) => {
                    setZipCode(e.target.value);
                    if (cepStatus.kind !== "idle") setCepStatus({ kind: "idle" });
                  }}
                  onBlur={handleCepBlur}
                  placeholder="60000-000"
                />
              </Field>
              <div className="col-span-2">
                <Field label="Logradouro">
                  <Input
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Av. Santos Dumont"
                  />
                </Field>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-4">
              <Field label="Número">
                <Input
                  value={addressNumber}
                  onChange={(e) => setAddressNumber(e.target.value)}
                />
              </Field>
              <Field label="Complemento">
                <Input
                  value={complement}
                  onChange={(e) => setComplement(e.target.value)}
                  placeholder="Sala 1"
                />
              </Field>
              <Field label="Bairro">
                <Input
                  value={neighborhood}
                  onChange={(e) => setNeighborhood(e.target.value)}
                />
              </Field>
              <Field label="UF *" error={fieldErrors.stateUF}>
                <Select
                  value={stateUF}
                  onChange={(e) => { setStateUF(e.target.value); setFieldErrors((p) => ({ ...p, stateUF: "" })); }}
                  className={fieldErrors.stateUF ? "border-destructive" : ""}
                >
                  <option value="">UF</option>
                  {STATES.map((uf) => (
                    <option key={uf} value={uf}>{uf}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Cidade *" error={fieldErrors.city}>
              <Input
                value={city}
                onChange={(e) => { setCity(e.target.value); setFieldErrors((p) => ({ ...p, city: "" })); }}
                className={fieldErrors.city ? "border-destructive" : ""}
                placeholder="Fortaleza"
                required
              />
            </Field>
          </div>
        </div>
      )}

      {/* ── STEP 2: Assinatura ───────────────────────────────────────────── */}
      {currentStep === 2 && (
        <div className="space-y-5">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Assinatura</h2>
            <p className="text-sm text-muted-foreground mt-0.5">Plano e condições de faturamento</p>
          </div>

          <div className="bg-card rounded-xl border border-border p-5 space-y-5">
            {/* Cards de plano */}
            <Field label="Selecionar Plano *" error={fieldErrors.planId}>
              <div className="grid gap-3 mt-1">
                {plans.map((plan) => (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => { setPlanId(plan.id); setFieldErrors((p) => ({ ...p, planId: "" })); }}
                    className={`w-full text-left px-4 py-3.5 rounded-lg border transition-all ${
                      planId === plan.id
                        ? "border-primary bg-primary/10 ring-1 ring-ring/30"
                        : "border-border bg-muted hover:border-muted-foreground/30"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">{plan.name}</span>
                      <div className="text-right">
                        <span className="text-sm font-bold text-foreground" suppressHydrationWarning>
                          R$ {(plan.priceMonthly / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </span>
                        <span className="text-xs text-muted-foreground">/mês</span>
                      </div>
                    </div>
                    {billingCycle === "YEARLY" && (
                      <p className="text-xs text-success mt-1">
                        R$ {(plan.priceYearly / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}/ano
                      </p>
                    )}
                  </button>
                ))}
              </div>
            </Field>

            {/* Ciclo */}
            <Field label="Ciclo de Cobrança">
              <div className="flex gap-3 mt-1">
                {(["MONTHLY", "YEARLY"] as const).map((cycle) => (
                  <button
                    key={cycle}
                    type="button"
                    onClick={() => setBillingCycle(cycle)}
                    className={`flex-1 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                      billingCycle === cycle
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground"
                    }`}
                  >
                    {cycle === "MONTHLY" ? "Mensal" : "Anual"}
                    {cycle === "YEARLY" && (
                      <span className="ml-1.5 text-xs text-success">~20% off</span>
                    )}
                  </button>
                ))}
              </div>
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Dias de Trial" hint="0 para sem trial">
                <Input
                  type="number"
                  value={trialDays}
                  onChange={(e) => setTrialDays(Number(e.target.value))}
                  min={0}
                  max={90}
                />
              </Field>
              <Field label="Desconto (%)">
                <Input
                  type="number"
                  value={discountPercent}
                  onChange={(e) => setDiscountPercent(Number(e.target.value))}
                  min={0}
                  max={100}
                />
              </Field>
            </div>
          </div>
        </div>
      )}

      {/* ── STEP 3: Responsável + Admin ──────────────────────────────────── */}
      {currentStep === 3 && (
        <div className="space-y-5">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Acesso</h2>
            <p className="text-sm text-muted-foreground mt-0.5">Responsável e credenciais de acesso</p>
          </div>

          {/* Responsável */}
          <div className="bg-card rounded-xl border border-border p-5 space-y-4">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              Responsável / Proprietário
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Nome Completo *" error={fieldErrors.ownerName}>
                <Input
                  value={ownerName}
                  onChange={(e) => { setOwnerName(e.target.value); setFieldErrors((p) => ({ ...p, ownerName: "" })); }}
                  placeholder="João da Silva"
                  className={fieldErrors.ownerName ? "border-destructive" : ""}
                />
              </Field>
              <Field label="CPF">
                <Input
                  value={ownerCpf}
                  onChange={(e) => setOwnerCpf(e.target.value)}
                  placeholder="123.456.789-00"
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field
                label="Email do Responsável *"
                hint={fieldErrors.ownerEmail ? undefined : "Receberá o convite de ativação"}
                error={fieldErrors.ownerEmail}
              >
                <Input
                  type="email"
                  value={ownerEmail}
                  onChange={(e) => { setOwnerEmail(e.target.value); setFieldErrors((p) => ({ ...p, ownerEmail: "" })); }}
                  placeholder="joao@otica.com"
                  className={fieldErrors.ownerEmail ? "border-destructive" : ""}
                />
              </Field>
              <Field label="Telefone">
                <Input
                  value={ownerPhone}
                  onChange={(e) => setOwnerPhone(e.target.value)}
                  placeholder="(85) 99999-1234"
                />
              </Field>
            </div>
          </div>

          {/* Admin da ótica */}
          <div className="bg-card rounded-xl border border-border p-5 space-y-4">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-muted-foreground" />
              Administrador da Ótica
            </h3>
            <p className="text-xs text-muted-foreground">
              Se preenchido, cria o usuário admin com acesso imediato. Caso contrário, a empresa ativa via convite por email.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Nome" hint="Padrão: nome do responsável">
                <Input
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  placeholder={ownerName || "Nome do admin"}
                />
              </Field>
              <Field label="Email (login)" hint="Padrão: email do responsável">
                <Input
                  type="email"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  placeholder={ownerEmail || "admin@otica.com"}
                />
              </Field>
            </div>
            <Field label="Senha" hint="O admin pode alterar no primeiro login">
              <div className="flex gap-2">
                <Input
                  type="text"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  className="flex-1"
                />
                <button
                  type="button"
                  onClick={generatePassword}
                  className="flex items-center gap-1.5 px-3 py-2.5 bg-muted border border-border rounded-lg text-foreground hover:bg-muted hover:text-foreground transition-colors text-xs whitespace-nowrap"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Gerar
                </button>
              </div>
            </Field>
          </div>
        </div>
      )}

      {/* ── STEP 4: Extras ───────────────────────────────────────────────── */}
      {currentStep === 4 && (
        <div className="space-y-5">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Extras</h2>
            <p className="text-sm text-muted-foreground mt-0.5">Rede, aquisição e opções</p>
          </div>

          {/* Rede */}
          <div className="bg-card rounded-xl border border-border p-5 space-y-4">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              Rede de Lojas
              <span className="text-xs text-muted-foreground font-normal">(opcional)</span>
            </h3>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isNetwork}
                onChange={(e) => setIsNetwork(e.target.checked)}
                className="w-4 h-4 rounded border-input bg-background text-primary"
              />
              <span className="text-sm text-foreground">Esta ótica faz parte de uma rede</span>
            </label>

            {isNetwork && (
              <div className="pl-6 space-y-3 border-l-2 border-border">
                {(["new", "existing"] as const).map((mode) => (
                  <label key={mode} className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="radio"
                      name="networkMode"
                      checked={networkMode === mode}
                      onChange={() => setNetworkMode(mode)}
                      className="text-primary"
                    />
                    <span className="text-sm text-foreground">
                      {mode === "new" ? "Criar nova rede (será a MATRIZ)" : "Vincular a rede existente (será FILIAL)"}
                    </span>
                  </label>
                ))}

                {networkMode === "new" && (
                  <Field label="Nome da Rede">
                    <Input
                      value={newNetworkName}
                      onChange={(e) => setNewNetworkName(e.target.value)}
                      placeholder="Rede Visão Total"
                      className="max-w-sm"
                    />
                  </Field>
                )}

                {networkMode === "existing" && networks.length > 0 && (
                  <Field label="Selecionar Rede">
                    <Select
                      value={existingNetworkId}
                      onChange={(e) => setExistingNetworkId(e.target.value)}
                      className="max-w-sm"
                    >
                      <option value="">Selecione...</option>
                      {networks.map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.name} — {n.headquarters?.tradeName || "Sem matriz"}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )}
              </div>
            )}
          </div>

          {/* Aquisição */}
          <div className="bg-card rounded-xl border border-border p-5 space-y-4">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              Aquisição
            </h3>
            <Field label="Canal de Aquisição">
              <Select
                value={acquisitionChannel}
                onChange={(e) => setAcquisitionChannel(e.target.value)}
              >
                <option value="">Selecione...</option>
                <option value="google">Google</option>
                <option value="instagram">Instagram</option>
                <option value="facebook">Facebook</option>
                <option value="indicacao">Indicação</option>
                <option value="parceiro">Parceiro</option>
                <option value="evento">Evento</option>
                <option value="outro">Outro</option>
              </Select>
            </Field>
            <Field label="Observações">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Anotações sobre o cliente..."
                className="w-full px-3.5 py-2.5 bg-background border border-input rounded-lg text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:ring-1 focus:ring-ring focus:border-primary resize-none"
              />
            </Field>
          </div>

          {/* Opções */}
          <div className="bg-card rounded-xl border border-border p-5">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-4">
              <Settings className="h-4 w-4 text-muted-foreground" />
              Opções
            </h3>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={sendInviteEmail}
                onChange={(e) => setSendInviteEmail(e.target.checked)}
                className="w-4 h-4 rounded border-input bg-background text-primary mt-0.5"
              />
              <div>
                <span className="text-sm text-foreground">Enviar convite por email imediatamente</span>
                <p className="text-xs text-muted-foreground mt-0.5">
                  O responsável receberá um link para criar senha e ativar a conta
                </p>
              </div>
            </label>
          </div>
        </div>
      )}

      {/* ── STEP 5: Confirmação ──────────────────────────────────────────── */}
      {currentStep === 5 && (
        <div className="space-y-5">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Confirmar Cadastro</h2>
            <p className="text-sm text-muted-foreground mt-0.5">Revise os dados antes de criar a empresa</p>
          </div>

          <div className="grid gap-4">
            {/* Empresa */}
            <div className="bg-card rounded-xl border border-border p-5">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Empresa</h3>
              <SummaryRow label="Nome Fantasia" value={tradeName} />
              <SummaryRow label="Razão Social" value={companyName} />
              <SummaryRow label="CNPJ" value={cnpj} />
              <SummaryRow label="Email" value={email} />
              <SummaryRow label="Telefone" value={phone} />
              <SummaryRow label="Cidade/UF" value={city && stateUF ? `${city}/${stateUF}` : ""} />
            </div>

            {/* Assinatura */}
            <div className="bg-card rounded-xl border border-border p-5">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Assinatura</h3>
              <SummaryRow label="Plano" value={selectedPlan?.name ?? ""} />
              <SummaryRow label="Ciclo" value={billingCycle === "MONTHLY" ? "Mensal" : "Anual"} />
              <SummaryRow label="Trial" value={trialDays > 0 ? `${trialDays} dias` : "Sem trial"} />
              <SummaryRow label="Desconto" value={discountPercent > 0 ? `${discountPercent}%` : "Nenhum"} />
            </div>

            {/* Acesso */}
            <div className="bg-card rounded-xl border border-border p-5">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Acesso</h3>
              <SummaryRow label="Responsável" value={ownerName} />
              <SummaryRow label="Email responsável" value={ownerEmail} />
              <SummaryRow label="Admin login" value={adminEmail || ownerEmail} />
              <SummaryRow label="Senha gerada" value={adminPassword ? "Sim" : "Não"} />
              <SummaryRow label="Enviar convite" value={sendInviteEmail ? "Sim" : "Não"} />
            </div>

            {/* Extras */}
            {(isNetwork || acquisitionChannel) && (
              <div className="bg-card rounded-xl border border-border p-5">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Extras</h3>
                {isNetwork && (
                  <SummaryRow
                    label="Rede"
                    value={networkMode === "new" ? `Nova: ${newNetworkName}` : "Vincular existente"}
                  />
                )}
                {acquisitionChannel && (
                  <SummaryRow label="Canal" value={acquisitionChannel} />
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Navegação ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mt-8 pt-5 border-t border-border">
        <div>
          {currentStep > 1 ? (
            <button
              type="button"
              onClick={prev}
              className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
              Voltar
            </button>
          ) : (
            <Link
              href="/admin/clientes"
              className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
              Cancelar
            </Link>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            Etapa {currentStep} de {STEPS.length}
          </span>

          {currentStep < 5 ? (
            <button
              type="button"
              onClick={next}
              className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium rounded-lg transition-colors"
            >
              Próximo
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isPending}
              className="flex items-center gap-2 px-5 py-2.5 bg-success hover:bg-success/90 text-success-foreground text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle className="h-4 w-4" />
              )}
              {isPending ? "Criando..." : "Criar Empresa"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
