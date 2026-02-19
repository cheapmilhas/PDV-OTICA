"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Loader2,
  Building2,
  User,
  MapPin,
  CreditCard,
  Users,
  BarChart3,
  Settings,
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

export function NewClientForm({ plans, networks }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Dados da empresa
  const [tradeName, setTradeName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [stateRegistration, setStateRegistration] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");

  // Endereço
  const [zipCode, setZipCode] = useState("");
  const [address, setAddress] = useState("");
  const [addressNumber, setAddressNumber] = useState("");
  const [complement, setComplement] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");

  // Responsável
  const [ownerName, setOwnerName] = useState("");
  const [ownerCpf, setOwnerCpf] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPhone, setOwnerPhone] = useState("");

  // Assinatura
  const [planId, setPlanId] = useState(plans[0]?.id || "");
  const [billingCycle, setBillingCycle] = useState<"MONTHLY" | "YEARLY">("MONTHLY");
  const [trialDays, setTrialDays] = useState(14);
  const [discountPercent, setDiscountPercent] = useState(0);

  // Rede de lojas
  const [isNetwork, setIsNetwork] = useState(false);
  const [networkMode, setNetworkMode] = useState<"new" | "existing">("new");
  const [newNetworkName, setNewNetworkName] = useState("");
  const [existingNetworkId, setExistingNetworkId] = useState("");

  // Aquisição
  const [acquisitionChannel, setAcquisitionChannel] = useState("");
  const [notes, setNotes] = useState("");

  // Opções
  const [sendInviteEmail, setSendInviteEmail] = useState(true);

  // Busca CEP
  const handleCepBlur = async () => {
    if (zipCode.length < 8) return;
    const cep = zipCode.replace(/\D/g, "");
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setAddress(data.logradouro || "");
        setNeighborhood(data.bairro || "");
        setCity(data.localidade || "");
        setState(data.uf || "");
      }
    } catch {}
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/admin/clientes/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tradeName,
          companyName,
          cnpj,
          stateRegistration,
          email,
          phone,
          whatsapp,
          zipCode,
          address,
          addressNumber,
          complement,
          neighborhood,
          city,
          state,
          ownerName,
          ownerCpf,
          ownerEmail,
          ownerPhone,
          planId,
          billingCycle,
          trialDays,
          discountPercent,
          isNetwork,
          networkMode,
          newNetworkName,
          existingNetworkId,
          acquisitionChannel,
          notes,
          sendInviteEmail,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Erro ao cadastrar cliente");
      }

      router.push(`/admin/clientes/${data.company.id}?created=true`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const STATES = [
    "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG",
    "PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-4xl">
      {error && (
        <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* DADOS DA EMPRESA */}
      <section className="bg-gray-900 rounded-xl border border-gray-800 p-6">
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Building2 className="w-5 h-5 text-gray-400" />
          Dados da Empresa
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Nome Fantasia *</label>
            <input
              type="text"
              value={tradeName}
              onChange={(e) => setTradeName(e.target.value)}
              required
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
              placeholder="Ótica Visão Clara"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Razão Social</label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
              placeholder="Ótica Visão Clara Ltda"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">CNPJ *</label>
            <input
              type="text"
              value={cnpj}
              onChange={(e) => setCnpj(e.target.value)}
              required
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
              placeholder="12.345.678/0001-90"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Inscrição Estadual</label>
            <input
              type="text"
              value={stateRegistration}
              onChange={(e) => setStateRegistration(e.target.value)}
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Email da Empresa *</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
              placeholder="contato@oticavisao.com"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Telefone *</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                placeholder="(85) 3333-4444"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">WhatsApp</label>
              <input
                type="text"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                placeholder="(85) 99999-8888"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ENDEREÇO */}
      <section className="bg-gray-900 rounded-xl border border-gray-800 p-6">
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <MapPin className="w-5 h-5 text-gray-400" />
          Endereço
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">CEP</label>
            <input
              type="text"
              value={zipCode}
              onChange={(e) => setZipCode(e.target.value)}
              onBlur={handleCepBlur}
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
              placeholder="60000-000"
            />
          </div>
          <div className="md:col-span-3">
            <label className="block text-sm text-gray-400 mb-1">Endereço</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
              placeholder="Av. Santos Dumont"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Número</label>
            <input
              type="text"
              value={addressNumber}
              onChange={(e) => setAddressNumber(e.target.value)}
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Complemento</label>
            <input
              type="text"
              value={complement}
              onChange={(e) => setComplement(e.target.value)}
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
              placeholder="Sala 203"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Bairro</label>
            <input
              type="text"
              value={neighborhood}
              onChange={(e) => setNeighborhood(e.target.value)}
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">UF *</label>
            <select
              value={state}
              onChange={(e) => setState(e.target.value)}
              required
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
            >
              <option value="">Selecione</option>
              {STATES.map((uf) => (
                <option key={uf} value={uf}>{uf}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm text-gray-400 mb-1">Cidade *</label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              required
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
              placeholder="Fortaleza"
            />
          </div>
        </div>
      </section>

      {/* RESPONSÁVEL */}
      <section className="bg-gray-900 rounded-xl border border-gray-800 p-6">
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <User className="w-5 h-5 text-gray-400" />
          Responsável / Proprietário
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Nome Completo *</label>
            <input
              type="text"
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              required
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
              placeholder="João da Silva"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">CPF</label>
            <input
              type="text"
              value={ownerCpf}
              onChange={(e) => setOwnerCpf(e.target.value)}
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
              placeholder="123.456.789-00"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Email do Responsável *</label>
            <input
              type="email"
              value={ownerEmail}
              onChange={(e) => setOwnerEmail(e.target.value)}
              required
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
              placeholder="joao@oticavisao.com"
            />
            <p className="text-xs text-gray-500 mt-1">
              Este email receberá o convite para ativar a conta
            </p>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Telefone do Responsável</label>
            <input
              type="text"
              value={ownerPhone}
              onChange={(e) => setOwnerPhone(e.target.value)}
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
              placeholder="(85) 99999-1234"
            />
          </div>
        </div>
      </section>

      {/* ASSINATURA */}
      <section className="bg-gray-900 rounded-xl border border-gray-800 p-6">
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-gray-400" />
          Assinatura
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Plano *</label>
            <select
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
              required
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
            >
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name} - R$ {(plan.priceMonthly / 100).toLocaleString("pt-BR")}/mês
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Ciclo de Cobrança</label>
            <div className="flex gap-6 mt-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="billingCycle"
                  checked={billingCycle === "MONTHLY"}
                  onChange={() => setBillingCycle("MONTHLY")}
                  className="text-indigo-500"
                />
                <span>Mensal</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="billingCycle"
                  checked={billingCycle === "YEARLY"}
                  onChange={() => setBillingCycle("YEARLY")}
                  className="text-indigo-500"
                />
                <span>Anual</span>
              </label>
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Dias de Trial</label>
            <input
              type="number"
              value={trialDays}
              onChange={(e) => setTrialDays(Number(e.target.value))}
              min={0}
              max={90}
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Desconto (%)</label>
            <input
              type="number"
              value={discountPercent}
              onChange={(e) => setDiscountPercent(Number(e.target.value))}
              min={0}
              max={100}
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>
      </section>

      {/* REDE DE LOJAS */}
      <section className="bg-gray-900 rounded-xl border border-gray-800 p-6">
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Users className="w-5 h-5 text-gray-400" />
          Rede de Lojas (Opcional)
        </h2>
        <label className="flex items-center gap-3 cursor-pointer mb-4">
          <input
            type="checkbox"
            checked={isNetwork}
            onChange={(e) => setIsNetwork(e.target.checked)}
            className="w-5 h-5 rounded border-gray-600 bg-gray-800 text-indigo-500"
          />
          <span>Esta ótica faz parte de uma rede de lojas</span>
        </label>

        {isNetwork && (
          <div className="space-y-4 pl-8 border-l-2 border-gray-700">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="radio"
                name="networkMode"
                checked={networkMode === "new"}
                onChange={() => setNetworkMode("new")}
                className="text-indigo-500"
              />
              <span>Criar nova rede (esta será a MATRIZ)</span>
            </label>

            {networkMode === "new" && (
              <div className="ml-7">
                <label className="block text-sm text-gray-400 mb-1">Nome da Rede *</label>
                <input
                  type="text"
                  value={newNetworkName}
                  onChange={(e) => setNewNetworkName(e.target.value)}
                  className="w-full max-w-md px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                  placeholder="Rede Visão Total"
                />
              </div>
            )}

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="radio"
                name="networkMode"
                checked={networkMode === "existing"}
                onChange={() => setNetworkMode("existing")}
                className="text-indigo-500"
              />
              <span>Vincular a rede existente (será FILIAL)</span>
            </label>

            {networkMode === "existing" && networks.length > 0 && (
              <div className="ml-7">
                <label className="block text-sm text-gray-400 mb-1">Selecione a Rede *</label>
                <select
                  value={existingNetworkId}
                  onChange={(e) => setExistingNetworkId(e.target.value)}
                  className="w-full max-w-md px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="">Selecione...</option>
                  {networks.map((network) => (
                    <option key={network.id} value={network.id}>
                      {network.name} (Matriz: {network.headquarters?.tradeName || "N/A"})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}
      </section>

      {/* AQUISIÇÃO */}
      <section className="bg-gray-900 rounded-xl border border-gray-800 p-6">
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-gray-400" />
          Aquisição
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Canal de Aquisição</label>
            <select
              value={acquisitionChannel}
              onChange={(e) => setAcquisitionChannel(e.target.value)}
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
            >
              <option value="">Selecione...</option>
              <option value="google">Google</option>
              <option value="instagram">Instagram</option>
              <option value="facebook">Facebook</option>
              <option value="indicacao">Indicação</option>
              <option value="parceiro">Parceiro</option>
              <option value="evento">Evento</option>
              <option value="outro">Outro</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Observações</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500 resize-none"
              placeholder="Anotações sobre o cliente..."
            />
          </div>
        </div>
      </section>

      {/* OPÇÕES */}
      <section className="bg-gray-900 rounded-xl border border-gray-800 p-6">
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Settings className="w-5 h-5 text-gray-400" />
          Opções de Envio
        </h2>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={sendInviteEmail}
            onChange={(e) => setSendInviteEmail(e.target.checked)}
            className="w-5 h-5 rounded border-gray-600 bg-gray-800 text-indigo-500"
          />
          <div>
            <span className="text-white">Enviar convite por email imediatamente</span>
            <p className="text-sm text-gray-500">
              O responsável receberá um link para criar a senha e ativar a conta
            </p>
          </div>
        </label>
      </section>

      {/* BOTÕES */}
      <div className="flex justify-end gap-4">
        <Link
          href="/admin/clientes"
          className="px-6 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
        >
          Cancelar
        </Link>
        <button
          type="submit"
          disabled={loading}
          className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          Cadastrar Cliente
        </button>
      </div>
    </form>
  );
}
