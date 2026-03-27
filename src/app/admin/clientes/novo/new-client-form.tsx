"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-400 mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-600 mt-1">{hint}</p>}
    </div>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full px-3.5 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-600 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition-colors ${props.className ?? ""}`}
    />
  );
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement> & { children: React.ReactNode }) {
  return (
    <select
      {...props}
      className={`w-full px-3.5 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition-colors ${props.className ?? ""}`}
    />
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-baseline py-2 border-b border-gray-800/60 last:border-0">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-sm text-white font-medium ml-4 text-right">{value || "—"}</span>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export function NewClientForm({ plans, networks }: Props) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  // Step 1 — Empresa
  const [tradeName, setTradeName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [stateRegistration, setStateRegistration] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [address, setAddress] = useState("");
  const [addressNumber, setAddressNumber] = useState("");
  const [complement, setComplement] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [city, setCity] = useState("");
  const [stateUF, setStateUF] = useState("");

  // Step 2 — Assinatura
  const [planId, setPlanId] = useState(plans[0]?.id || "");
  const [billingCycle, setBillingCycle] = useState<"MONTHLY" | "YEARLY">("MONTHLY");
  const [trialDays, setTrialDays] = useState(14);
  const [discountPercent, setDiscountPercent] = useState(0);

  // Step 3 — Responsável + Admin
  const [ownerName, setOwnerName] = useState("");
  const [ownerCpf, setOwnerCpf] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPhone, setOwnerPhone] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");

  // Step 4 — Rede + Aquisição
  const [isNetwork, setIsNetwork] = useState(false);
  const [networkMode, setNetworkMode] = useState<"new" | "existing">("new");
  const [newNetworkName, setNewNetworkName] = useState("");
  const [existingNetworkId, setExistingNetworkId] = useState("");
  const [acquisitionChannel, setAcquisitionChannel] = useState("");
  const [notes, setNotes] = useState("");
  const [sendInviteEmail, setSendInviteEmail] = useState(true);

  // Busca CEP
  const handleCepBlur = async () => {
    const cep = zipCode.replace(/\D/g, "");
    if (cep.length !== 8) return;
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setAddress(data.logradouro || "");
        setNeighborhood(data.bairro || "");
        setCity(data.localidade || "");
        setStateUF(data.uf || "");
      }
    } catch {}
  };

  // Gerar senha
  function generatePassword() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
    let pwd = "Otica@";
    for (let i = 0; i < 4; i++) pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    setAdminPassword(pwd);
  }

  // Validação por etapa
  function canProceed(): boolean {
    if (currentStep === 1) return !!(tradeName && email && phone && city && stateUF);
    if (currentStep === 2) return !!planId;
    if (currentStep === 3) return !!(ownerName && ownerEmail);
    return true;
  }

  function next() {
    if (!canProceed()) return;
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
                      ? "bg-green-600"
                      : isActive
                      ? "bg-indigo-600 ring-2 ring-indigo-500/30"
                      : "bg-gray-800 border border-gray-700"
                  }`}
                >
                  {isDone ? (
                    <CheckCircle className="h-4 w-4 text-white" />
                  ) : (
                    <Icon className="h-4 w-4 text-white" />
                  )}
                </div>
                <span
                  className={`text-xs font-medium hidden sm:block ${
                    isActive ? "text-white" : "text-gray-500"
                  }`}
                >
                  {step.label}
                </span>
              </div>

              {/* Linha conectora */}
              {idx < STEPS.length - 1 && (
                <div
                  className={`flex-1 h-px mx-3 transition-colors ${
                    currentStep > step.id ? "bg-green-700" : "bg-gray-800"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Erro global */}
      {error && (
        <div className="mb-5 bg-red-900/40 border border-red-800 text-red-300 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* ── STEP 1: Dados da Empresa ────────────────────────────────────── */}
      {currentStep === 1 && (
        <div className="space-y-5">
          <div>
            <h2 className="text-lg font-semibold text-white">Dados da Empresa</h2>
            <p className="text-sm text-gray-500 mt-0.5">Informações básicas da ótica</p>
          </div>

          <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Nome Fantasia *">
                <Input
                  value={tradeName}
                  onChange={(e) => setTradeName(e.target.value)}
                  placeholder="Ótica Visão Clara"
                  required
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
            <Field label="Email da Empresa *">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="contato@oticavisao.com"
                required
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Telefone *">
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(85) 3333-4444"
                  required
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
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <MapPin className="h-4 w-4 text-gray-500" />
              Endereço
            </h3>
            <div className="grid grid-cols-3 gap-4">
              <Field label="CEP">
                <Input
                  value={zipCode}
                  onChange={(e) => setZipCode(e.target.value)}
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
              <Field label="UF *">
                <Select
                  value={stateUF}
                  onChange={(e) => setStateUF(e.target.value)}
                  required
                >
                  <option value="">UF</option>
                  {STATES.map((uf) => (
                    <option key={uf} value={uf}>{uf}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Cidade *">
              <Input
                value={city}
                onChange={(e) => setCity(e.target.value)}
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
            <h2 className="text-lg font-semibold text-white">Assinatura</h2>
            <p className="text-sm text-gray-500 mt-0.5">Plano e condições de faturamento</p>
          </div>

          <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 space-y-5">
            {/* Cards de plano */}
            <Field label="Selecionar Plano *">
              <div className="grid gap-3 mt-1">
                {plans.map((plan) => (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => setPlanId(plan.id)}
                    className={`w-full text-left px-4 py-3.5 rounded-lg border transition-all ${
                      planId === plan.id
                        ? "border-indigo-500 bg-indigo-900/20 ring-1 ring-indigo-500/30"
                        : "border-gray-700 bg-gray-800/50 hover:border-gray-600"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-white">{plan.name}</span>
                      <div className="text-right">
                        <span className="text-sm font-bold text-white">
                          R$ {(plan.priceMonthly / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </span>
                        <span className="text-xs text-gray-500">/mês</span>
                      </div>
                    </div>
                    {billingCycle === "YEARLY" && (
                      <p className="text-xs text-green-400 mt-1">
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
                        ? "border-indigo-500 bg-indigo-900/20 text-indigo-300"
                        : "border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600 hover:text-white"
                    }`}
                  >
                    {cycle === "MONTHLY" ? "Mensal" : "Anual"}
                    {cycle === "YEARLY" && (
                      <span className="ml-1.5 text-xs text-green-400">~20% off</span>
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
            <h2 className="text-lg font-semibold text-white">Acesso</h2>
            <p className="text-sm text-gray-500 mt-0.5">Responsável e credenciais de acesso</p>
          </div>

          {/* Responsável */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <User className="h-4 w-4 text-gray-500" />
              Responsável / Proprietário
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Nome Completo *">
                <Input
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  placeholder="João da Silva"
                  required
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
                hint="Receberá o convite de ativação"
              >
                <Input
                  type="email"
                  value={ownerEmail}
                  onChange={(e) => setOwnerEmail(e.target.value)}
                  placeholder="joao@otica.com"
                  required
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
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-gray-500" />
              Administrador da Ótica
            </h3>
            <p className="text-xs text-gray-500">
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
                  className="flex items-center gap-1.5 px-3 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-gray-300 hover:bg-gray-600 hover:text-white transition-colors text-xs whitespace-nowrap"
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
            <h2 className="text-lg font-semibold text-white">Extras</h2>
            <p className="text-sm text-gray-500 mt-0.5">Rede, aquisição e opções</p>
          </div>

          {/* Rede */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Users className="h-4 w-4 text-gray-500" />
              Rede de Lojas
              <span className="text-xs text-gray-600 font-normal">(opcional)</span>
            </h3>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isNetwork}
                onChange={(e) => setIsNetwork(e.target.checked)}
                className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-indigo-500"
              />
              <span className="text-sm text-white">Esta ótica faz parte de uma rede</span>
            </label>

            {isNetwork && (
              <div className="pl-6 space-y-3 border-l-2 border-gray-700">
                {(["new", "existing"] as const).map((mode) => (
                  <label key={mode} className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="radio"
                      name="networkMode"
                      checked={networkMode === mode}
                      onChange={() => setNetworkMode(mode)}
                      className="text-indigo-500"
                    />
                    <span className="text-sm text-white">
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
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-gray-500" />
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
                className="w-full px-3.5 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-600 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
              />
            </Field>
          </div>

          {/* Opções */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-4">
              <Settings className="h-4 w-4 text-gray-500" />
              Opções
            </h3>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={sendInviteEmail}
                onChange={(e) => setSendInviteEmail(e.target.checked)}
                className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-indigo-500 mt-0.5"
              />
              <div>
                <span className="text-sm text-white">Enviar convite por email imediatamente</span>
                <p className="text-xs text-gray-500 mt-0.5">
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
            <h2 className="text-lg font-semibold text-white">Confirmar Cadastro</h2>
            <p className="text-sm text-gray-500 mt-0.5">Revise os dados antes de criar a empresa</p>
          </div>

          <div className="grid gap-4">
            {/* Empresa */}
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Empresa</h3>
              <SummaryRow label="Nome Fantasia" value={tradeName} />
              <SummaryRow label="Razão Social" value={companyName} />
              <SummaryRow label="CNPJ" value={cnpj} />
              <SummaryRow label="Email" value={email} />
              <SummaryRow label="Telefone" value={phone} />
              <SummaryRow label="Cidade/UF" value={city && stateUF ? `${city}/${stateUF}` : ""} />
            </div>

            {/* Assinatura */}
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Assinatura</h3>
              <SummaryRow label="Plano" value={selectedPlan?.name ?? ""} />
              <SummaryRow label="Ciclo" value={billingCycle === "MONTHLY" ? "Mensal" : "Anual"} />
              <SummaryRow label="Trial" value={trialDays > 0 ? `${trialDays} dias` : "Sem trial"} />
              <SummaryRow label="Desconto" value={discountPercent > 0 ? `${discountPercent}%` : "Nenhum"} />
            </div>

            {/* Acesso */}
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Acesso</h3>
              <SummaryRow label="Responsável" value={ownerName} />
              <SummaryRow label="Email responsável" value={ownerEmail} />
              <SummaryRow label="Admin login" value={adminEmail || ownerEmail} />
              <SummaryRow label="Senha gerada" value={adminPassword ? "Sim" : "Não"} />
              <SummaryRow label="Enviar convite" value={sendInviteEmail ? "Sim" : "Não"} />
            </div>

            {/* Extras */}
            {(isNetwork || acquisitionChannel) && (
              <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Extras</h3>
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
      <div className="flex items-center justify-between mt-8 pt-5 border-t border-gray-800">
        <div>
          {currentStep > 1 ? (
            <button
              type="button"
              onClick={prev}
              className="flex items-center gap-2 px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
              Voltar
            </button>
          ) : (
            <Link
              href="/admin/clientes"
              className="flex items-center gap-2 px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
              Cancelar
            </Link>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-600">
            Etapa {currentStep} de {STEPS.length}
          </span>

          {currentStep < 5 ? (
            <button
              type="button"
              onClick={next}
              disabled={!canProceed()}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Próximo
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isPending}
              className="flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
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
